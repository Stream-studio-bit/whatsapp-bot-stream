import makeWASocket, { 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  BufferJSON,
  initAuthCreds,
  proto,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { MongoClient } from 'mongodb';
import NodeCache from 'node-cache';
import pino from 'pino';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import dotenv from 'dotenv';
import readline from 'readline';
import express from 'express';
import keepAlive from './keep-alive.js';
import { validateGroqConfig } from './config/groq.js';
import { log } from './utils/helpers.js';
import { printStats, cleanExpiredBlocks } from './services/database.js';
import { processMessage } from './controllers/messageHandler.js';
import { showStats, listBlockedUsers, listAllUsers } from './controllers/commandHandler.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_ID = process.env.SESSION_ID || 'stream-studio-bot';
const BOT_NAME = process.env.BOT_NAME || 'Assistente Stream Studio';
const OWNER_NAME = process.env.OWNER_NAME || 'Roberto';
const PORT = process.env.PORT || 3000;

const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 5;
const INITIAL_RECONNECT_DELAY = parseInt(process.env.INITIAL_RECONNECT_DELAY) || 5000;
const MAX_RECONNECT_DELAY = parseInt(process.env.MAX_RECONNECT_DELAY) || 300000;
const RECONNECT_RESET_TIME = parseInt(process.env.RECONNECT_RESET_TIME) || 900000;

const CONNECT_TIMEOUT = parseInt(process.env.CONNECT_TIMEOUT) || 120000;
const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT) || 120000;
const KEEPALIVE_INTERVAL = parseInt(process.env.KEEPALIVE_INTERVAL) || 60000;
const MAX_440_BEFORE_CLEAR = 3;
const FETCH_VERSION_TIMEOUT = 10000;

// 🔥 Timestamp de inicialização do bot
const BOT_START_TIME = Date.now();

// 🔥 Armazenamento do QR Code
let currentQRCode = null;
let qrCodeTimestamp = null;
const QR_CODE_TIMEOUT = 60000; // 60 segundos

let mongoClient = null;
let globalSock = null;
let reconnectAttempts = 0;
let consecutive440Errors = 0;
let isConnecting = false;
let isInitialized = false;
let httpServer = null;
let lastReconnectTime = 0;
let totalReconnectAttempts = 0;

// 📊 Contadores para diagnóstico
let totalMessagesReceived = 0;
let totalMessagesProcessed = 0;
let lastStatsLog = 0;

const msgRetryCounterCache = new NodeCache();
const processedMessages = new Set();
const MESSAGE_CACHE_LIMIT = 1000;

let cleanupInterval = null;

// =========================================
// FUNÇÕES AUXILIARES
// =========================================

function getReconnectDelay(attempt) {
  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, attempt),
    MAX_RECONNECT_DELAY
  );
  return delay + Math.random() * 1000;
}

function scheduleReconnectReset() {
  setTimeout(() => {
    if (globalSock && globalSock.user) {
      reconnectAttempts = 0;
      consecutive440Errors = 0;
      log('INFO', '🔄 Contadores resetados (bot estável)');
    }
  }, RECONNECT_RESET_TIME);
}

function showBanner() {
  console.clear();
  console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════════════════════════════╗');
  console.log('\x1b[36m%s\x1b[0m', '║           🤖  CHAT BOT WHATSAPP - STREAM STUDIO  🤖          ║');
  console.log('\x1b[36m%s\x1b[0m', '║                    Bot Multi-tarefas com IA                  ║');
  console.log('\x1b[36m%s\x1b[0m', '╚══════════════════════════════════════════════════════╝\n');
  console.log('\x1b[33m%s\x1b[0m', `📱 Bot: ${BOT_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `👤 Owner: ${OWNER_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `🌐 Platform: ${process.env.RENDER ? 'Render' : process.env.FLY_APP_NAME ? 'Fly.io' : 'Local'}\n`);
}

// 🔥 FUNÇÃO CRÍTICA: Destruir socket
function destroySocket() {
  if (globalSock) {
    try {
      globalSock.ev.removeAllListeners();
      globalSock.ws.close();
    } catch (e) {
      // Ignora erros na destruição
    }
    globalSock = null;
  }
}

// 🔥 FUNÇÃO: Buscar versão do Baileys com timeout
async function fetchBaileysVersionWithTimeout() {
  return Promise.race([
    fetchLatestBaileysVersion(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout ao buscar versão')), FETCH_VERSION_TIMEOUT)
    )
  ]);
}
// =========================================
// AUTENTICAÇÃO MONGODB
// =========================================

async function useMongoDBAuthState(collection) {
  const writeData = async (data, id) => {
    try {
      await collection.replaceOne(
        { _id: id },
        JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
        { upsert: true }
      );
    } catch (error) {
      log('ERROR', `❌ Erro ao salvar dado ${id}: ${error.message}`);
    }
  };

  const readData = async (id) => {
    try {
      const data = await collection.findOne({ _id: id });
      if (!data) return null;
      return JSON.parse(JSON.stringify(data), BufferJSON.reviver);
    } catch (error) {
      log('ERROR', `❌ Erro ao ler dado ${id}: ${error.message}`);
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      await collection.deleteOne({ _id: id });
    } catch (error) {
      log('ERROR', `❌ Erro ao remover dado ${id}: ${error.message}`);
    }
  };

  const clearAll = async () => {
    try {
      await collection.deleteMany({});
      log('SUCCESS', '✅ Todas as credenciais foram limpas');
    } catch (error) {
      log('ERROR', `❌ Erro ao limpar credenciais: ${error.message}`);
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();
  
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, 'creds'),
    clearAll
  };
}

// =========================================
// GERENCIAMENTO DE MENSAGENS
// =========================================

async function getMessageFromDB(key) {
  if (!mongoClient) return null;
  try {
    const db = mongoClient.db('baileys_auth');
    const messagesCollection = db.collection('messages');
    const message = await messagesCollection.findOne({ 
      'key.id': key.id,
      'key.remoteJid': key.remoteJid 
    });
    return message || null;
  } catch (error) {
    log('ERROR', `❌ Erro ao buscar mensagem: ${error.message}`);
    return null;
  }
}

async function saveMessageToDB(message) {
  if (!mongoClient) return;
  try {
    const db = mongoClient.db('baileys_auth');
    const messagesCollection = db.collection('messages');
    await messagesCollection.updateOne(
      { 'key.id': message.key.id },
      { $set: message },
      { upsert: true }
    );
  } catch (error) {
    log('ERROR', `❌ Erro ao salvar mensagem: ${error.message}`);
  }
}

function isRealUserMessage(message) {
  if (!message || !message.key) return false;
  
  // Ignora mensagens do próprio bot
  if (message.key.fromMe) return false;
  
  // Ignora status/broadcasts
  if (message.key.remoteJid === 'status@broadcast') return false;
  
  // Ignora mensagens de sistema
  if (message.messageStubType) return false;
  
  // Ignora se não tem conteúdo
  if (!message.message) return false;
  
  // Ignora reações
  if (message.message.reactionMessage) return false;
  
  // Ignora mensagens de protocolo
  if (message.message.protocolMessage) return false;
  
  return true;
}

function isRecentMessage(message) {
  const msgTimestamp = (message.messageTimestamp || 0) * 1000;
  return msgTimestamp >= BOT_START_TIME;
}

function logMessageStats() {
  const now = Date.now();
  if (now - lastStatsLog < 60000) return; // Log a cada 1 minuto
  
  lastStatsLog = now;
  const filtered = totalMessagesReceived - totalMessagesProcessed;
  const filterRate = totalMessagesReceived > 0 
    ? ((filtered / totalMessagesReceived) * 100).toFixed(1)
    : 0;
  
  log('INFO', `📊 Stats: ${totalMessagesProcessed} processadas | ${filtered} filtradas (${filterRate}%) | Cache: ${processedMessages.size}`);
}

// =========================================
// TAREFAS PERIÓDICAS
// =========================================

function startPeriodicTasks() {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    // Limpa cache de mensagens processadas
    if (processedMessages.size > MESSAGE_CACHE_LIMIT) {
      const toDelete = processedMessages.size - MESSAGE_CACHE_LIMIT;
      const iterator = processedMessages.values();
      for (let i = 0; i < toDelete; i++) {
        const value = iterator.next().value;
        processedMessages.delete(value);
      }
      log('INFO', `🧹 Cache limpo: ${toDelete} mensagens removidas`);
    }
    
    // Limpa bloqueios expirados
    cleanExpiredBlocks().catch(err => {
      log('ERROR', `❌ Erro ao limpar bloqueios: ${err.message}`);
    });
    
  }, 300000); // A cada 5 minutos
}
// =========================================
// SERVIDOR HTTP E QR CODE
// =========================================

function setupHealthServer() {
  if (httpServer) return httpServer;

  const app = express();
  
  // 🔥 Endpoint para exibir QR Code
  app.get('/qr', async (req, res) => {
    try {
      // Verifica se bot já está conectado
      if (globalSock && globalSock.user) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${BOT_NAME} - QR Code</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 500px;
              }
              h1 { color: #25D366; margin-bottom: 20px; }
              .success { font-size: 60px; margin: 20px 0; }
              p { color: #666; font-size: 18px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✅ Bot Conectado!</h1>
              <div class="success">🎉</div>
              <p>O WhatsApp já está autenticado e funcionando.</p>
              <p><strong>Número:</strong> ${globalSock.user.id.split(':')[0]}</p>
            </div>
          </body>
          </html>
        `);
      }

      // Verifica se QR Code existe e não expirou
      const now = Date.now();
      if (!currentQRCode || !qrCodeTimestamp || (now - qrCodeTimestamp > QR_CODE_TIMEOUT)) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${BOT_NAME} - QR Code</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 500px;
              }
              h1 { color: #ff6b6b; margin-bottom: 20px; }
              .icon { font-size: 60px; margin: 20px 0; }
              p { color: #666; font-size: 16px; line-height: 1.6; }
              .refresh-btn {
                margin-top: 20px;
                padding: 12px 30px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
              }
              .refresh-btn:hover { background: #5568d3; }
            </style>
            <script>
              setTimeout(() => location.reload(), 5000);
            </script>
          </head>
          <body>
            <div class="container">
              <h1>⏳ Aguardando QR Code</h1>
              <div class="icon">📱</div>
              <p>O bot está iniciando a conexão com o WhatsApp...</p>
              <p><small>Esta página será atualizada automaticamente a cada 5 segundos.</small></p>
              <button class="refresh-btn" onclick="location.reload()">🔄 Atualizar Agora</button>
            </div>
          </body>
          </html>
        `);
      }

      // Gera imagem PNG do QR Code
      const qrImage = await QRCode.toDataURL(currentQRCode, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Exibe QR Code
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${BOT_NAME} - QR Code</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 500px;
            }
            h1 { color: #25D366; margin-bottom: 10px; }
            .subtitle { color: #666; margin-bottom: 30px; }
            img { 
              border: 3px solid #25D366;
              border-radius: 15px;
              margin: 20px 0;
            }
            .instructions {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 10px;
              margin-top: 20px;
              text-align: left;
            }
            .instructions ol {
              margin: 10px 0;
              padding-left: 20px;
            }
            .instructions li {
              margin: 8px 0;
              color: #444;
            }
            .timer {
              color: #ff6b6b;
              font-weight: bold;
              font-size: 18px;
              margin-top: 15px;
            }
          </style>
          <script>
            let timeLeft = 60;
            setInterval(() => {
              timeLeft--;
              if (timeLeft <= 0) {
                location.reload();
              }
              document.getElementById('timer').textContent = timeLeft;
            }, 1000);
            
            // Auto-refresh para detectar conexão
            setInterval(() => location.reload(), 5000);
          </script>
        </head>
        <body>
          <div class="container">
            <h1>📱 Escaneie o QR Code</h1>
            <p class="subtitle">${BOT_NAME}</p>
            
            <img src="${qrImage}" alt="QR Code WhatsApp" />
            
            <div class="instructions">
              <strong>📋 Como conectar:</strong>
              <ol>
                <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                <li>Toque em <strong>Menu (⋮)</strong> > <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Aponte a câmera para este QR Code</li>
              </ol>
            </div>
            
            <p class="timer">⏱️ Expira em: <span id="timer">60</span> segundos</p>
            <p style="color: #999; font-size: 12px; margin-top: 15px;">
              Página atualiza automaticamente a cada 5 segundos
            </p>
          </div>
        </body>
        </html>
      `);

    } catch (error) {
      log('ERROR', `❌ Erro no endpoint /qr: ${error.message}`);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Erro</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error {
              background: white;
              padding: 40px;
              border-radius: 10px;
              text-align: center;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            h1 { color: #ff6b6b; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>❌ Erro</h1>
            <p>Não foi possível gerar o QR Code.</p>
            <p><small>${error.message}</small></p>
          </div>
        </body>
        </html>
      `);
    }
  });
  
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'online',
      whatsapp: { 
        connected: !!(globalSock && globalSock.user),
        authenticated: !!(globalSock && globalSock.user),
        consecutive440: consecutive440Errors,
        qrCodeAvailable: !!currentQRCode
      },
      uptime: Math.floor(process.uptime()),
      messages: {
        received: totalMessagesReceived,
        processed: totalMessagesProcessed,
        cached: processedMessages.size
      }
    });
  });
  
  app.get('/', (req, res) => {
    const status = globalSock && globalSock.user ? '✅ Online' : '🔴 Offline';
    const qrLink = (!globalSock || !globalSock.user) ? '<br><a href="/qr" style="color: #25D366; text-decoration: none; font-weight: bold;">📱 Ver QR Code</a>' : '';
    res.send(`<h1>${BOT_NAME}</h1><p>Status: ${status}</p>${qrLink}`);
  });
  
  httpServer = app.listen(PORT, '0.0.0.0', () => {
    log('SUCCESS', `🌐 Servidor na porta ${PORT}`);
    log('INFO', `📱 QR Code disponível em: http://localhost:${PORT}/qr`);
  });
  
  return httpServer;
}

function initializeOnce() {
  if (isInitialized) return;
  
  showBanner();
  setupHealthServer();
  keepAlive();
  
  if (!validateGroqConfig() || !MONGODB_URI) {
    console.error('\n❌ Configure GROQ_API_KEY e MONGODB_URI no .env!\n');
    process.exit(1);
  }
  
  setupConsoleCommands();
  isInitialized = true;
}
// =========================================
// CONEXÃO WHATSAPP
// =========================================

async function connectWhatsApp() {
  if (isConnecting) {
    log('WARNING', '⚠️ Conexão em andamento...');
    return null;
  }
  
  if (globalSock && globalSock.user) {
    log('WARNING', '⚠️ Socket já autenticado e estável');
    return globalSock;
  }
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('ERROR', `❌ Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas`);
    log('INFO', `⏳ Aguarde ${RECONNECT_RESET_TIME / 60000} minutos`);
    
    setTimeout(() => {
      reconnectAttempts = 0;
      consecutive440Errors = 0;
      log('INFO', '🔄 Contadores resetados');
    }, RECONNECT_RESET_TIME);
    
    return null;
  }

  isConnecting = true;
  reconnectAttempts++;
  totalReconnectAttempts++;
  lastReconnectTime = Date.now();

  try {
    log('INFO', `🔄 Conectando... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) [440: ${consecutive440Errors}/${MAX_440_BEFORE_CLEAR}]`);

    destroySocket();

    if (!mongoClient) {
      log('INFO', '🔗 Conectando MongoDB...');
      mongoClient = new MongoClient(MONGODB_URI);
      await mongoClient.connect();
      log('SUCCESS', '✅ MongoDB conectado');
    }

    const version = await fetchBaileysVersionWithTimeout();
    log('INFO', `📦 Usando versão Baileys: ${version.join('.')}`);

    const db = mongoClient.db('baileys_auth');
    const collection = db.collection(SESSION_ID);
    
    const { state, saveCreds, clearAll } = await useMongoDBAuthState(collection);

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser: ['Stream Studio Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      getMessage: getMessageFromDB,
      msgRetryCounterCache,
      
      syncFullHistory: true,
      shouldSyncHistoryMessage: (msg) => {
        const msgTime = (msg.messageTimestamp || 0) * 1000;
        return msgTime >= BOT_START_TIME;
      },
      
      connectTimeoutMs: CONNECT_TIMEOUT,
      defaultQueryTimeoutMs: QUERY_TIMEOUT,
      keepAliveIntervalMs: KEEPALIVE_INTERVAL,
      emitOwnEvents: true,
      retryRequestDelayMs: 2000,
      fireInitQueries: true,
      printQRInTerminal: false
    });

    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log('INFO', '📱 QR Code recebido!');
        consecutive440Errors = 0;
        
        // 🔥 SALVA QR Code para endpoint
        currentQRCode = qr;
        qrCodeTimestamp = Date.now();
        
        console.log('\n📱 ┌────────────────────────────────────────────┐');
        console.log('📱 │ QR CODE DISPONÍVEL NO NAVEGADOR           │');
        console.log('📱 └────────────────────────────────────────────┘\n');
        console.log(`🌐 Acesse: http://localhost:${PORT}/qr`);
        console.log(`🌐 Ou: https://whatsapp-bot-stream.onrender.com/qr\n`);
        console.log('⏱️  Expira em 60 segundos');
        console.log('🔄 Página atualiza automaticamente\n');
        console.log('📱 └────────────────────────────────────────────┘\n');
        
        return;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : null;

        const shouldLogout = statusCode === DisconnectReason.loggedOut;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;
        const isLoginTimeout = statusCode === 440;
        const isCredentialsInvalid = statusCode === 405;

        if (isRestartRequired) {
          log('INFO', '🔄 WhatsApp solicitou restart - Reconectando...');
          isConnecting = false;
          
          setTimeout(() => {
            connectWhatsApp();
          }, 1000);
          return;
        }

        if (shouldLogout) {
          log('ERROR', '❌ Logout detectado');
          try {
            await clearAll();
          } catch (e) {
            log('ERROR', `❌ Erro: ${e.message}`);
          }
          
          if (cleanupInterval) clearInterval(cleanupInterval);
          if (mongoClient) {
            await mongoClient.close();
            mongoClient = null;
          }
          
          log('INFO', '⏳ Necessário re-autenticar');
          process.exit(0);
          return;
        }

        if (isCredentialsInvalid) {
          log('ERROR', '❌ ERRO 405: Credenciais inválidas ou versão incompatível');
          log('INFO', '🧹 Limpando sessão para gerar novo QR Code...');
          
          try {
            await clearAll();
            consecutive440Errors = 0;
            reconnectAttempts = 0;
            log('SUCCESS', '✅ Sessão limpa com sucesso!');
          } catch (e) {
            log('ERROR', `❌ Erro ao limpar sessão: ${e.message}`);
          }
          
          destroySocket();
          isConnecting = false;
          
          log('INFO', '⏸️ Bot pausado. Reinicie manualmente para gerar novo QR Code.');
          log('INFO', '💡 Dica: Certifique-se de que a versão do Baileys está atualizada');
          
          return;
        }

        if (isLoginTimeout) {
          consecutive440Errors++;
          log('INFO', `📲 Erro 440 (${consecutive440Errors}/${MAX_440_BEFORE_CLEAR})`);
          
          if (consecutive440Errors >= MAX_440_BEFORE_CLEAR) {
            log('ERROR', '❌ Múltiplos erros 440 - Limpando sessão...');
            try {
              await clearAll();
              consecutive440Errors = 0;
              reconnectAttempts = 0;
              log('SUCCESS', '✅ Sessão limpa! Escaneie novo QR Code.');
            } catch (e) {
              log('ERROR', `❌ Erro ao limpar: ${e.message}`);
            }
            
            destroySocket();
            isConnecting = false;
            
            setTimeout(() => {
              connectWhatsApp();
            }, 3000);
            return;
          }
          
          isConnecting = false;
          const delay = consecutive440Errors <= 2 ? 5000 : getReconnectDelay(reconnectAttempts - 1);
          log('INFO', `⏳ Aguardando ${Math.round(delay / 1000)}s...`);
          
          setTimeout(() => {
            connectWhatsApp();
          }, delay);
          return;
        }

        log('WARNING', `⚠️ Conexão fechada (${statusCode || 'desconhecido'})`);
        isConnecting = false;
        
        const delay = getReconnectDelay(reconnectAttempts - 1);
        setTimeout(() => {
          connectWhatsApp();
        }, delay);
        
        return;
      }

      if (connection === 'open') {
        isConnecting = false;
        
        // 🔥 LIMPA QR Code após conexão bem-sucedida
        currentQRCode = null;
        qrCodeTimestamp = null;
        
        if (sock.user) {
          reconnectAttempts = 0;
          
          log('SUCCESS', '✅ Conectado E AUTENTICADO ao WhatsApp!');
          console.log('\n🎉 ┌────────────────────────────────────────────┐');
          console.log('🎉 │ BOT ONLINE E FUNCIONANDO!                 │');
          console.log('🎉 └────────────────────────────────────────────┘\n');

          scheduleReconnectReset();
          startPeriodicTasks();
          printStats();

          console.log('📋 COMANDOS:');
          console.log(`   • ${process.env.COMMAND_ASSUME || '/assumir'} - Assumir`);
          console.log(`   • ${process.env.COMMAND_RELEASE || '/liberar'} - Liberar\n`);
          
          console.log('🔧 CONSOLE:');
          console.log('   stats | blocked | users | clearsession\n');
          
        } else {
          log('INFO', '⏳ Aguardando autenticação completar...');
        }
        
        return;
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const { messages, type } = m;
      
      if (type !== 'notify') return;

      for (const message of messages) {
        try {
          totalMessagesReceived++;
          
          if (!isRealUserMessage(message)) {
            continue;
          }

          if (!isRecentMessage(message)) {
            log('INFO', '⏭️ Mensagem antiga ignorada (anterior ao boot)');
            continue;
          }

          const messageId = message.key.id;

          if (processedMessages.has(messageId)) {
            continue;
          }
          
          processedMessages.add(messageId);
          
          await saveMessageToDB(message);
          
          await processMessage(sock, message);
          
          totalMessagesProcessed++;
          
          if (totalMessagesReceived % 10 === 0) {
            logMessageStats();
          }

        } catch (error) {
          log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
        }
      }
    });

    isConnecting = false;
    return sock;

  } catch (error) {
    isConnecting = false;
    log('ERROR', `❌ Erro na conexão: ${error.message}`);

    const delay = getReconnectDelay(reconnectAttempts - 1);
    log('INFO', `⏳ Tentando reconectar em ${Math.round(delay/1000)}s...`);
    
    setTimeout(() => {
      connectWhatsApp();
    }, delay);

    return null;
  }
}
// =========================================
// COMANDOS DO CONSOLE
// =========================================

function setupConsoleCommands() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ''
  });

  rl.on('line', async (input) => {
    const command = input.trim().toLowerCase();

    switch (command) {
      case 'stats':
        showStats();
        logMessageStats();
        break;
      case 'blocked':
        listBlockedUsers();
        break;
      case 'users':
        listAllUsers();
        break;
      case 'reconnect':
        log('INFO', '🔄 Reconectando...');
        reconnectAttempts = 0;
        consecutive440Errors = 0;
        destroySocket();
        connectWhatsApp();
        break;
      case 'reset':
        reconnectAttempts = 0;
        consecutive440Errors = 0;
        totalReconnectAttempts = 0;
        totalMessagesReceived = 0;
        totalMessagesProcessed = 0;
        log('SUCCESS', '✅ Contadores resetados');
        break;
      case 'clearsession':
        log('INFO', '🗑️ Limpando sessão...');
        if (mongoClient) {
          try {
            const db = mongoClient.db('baileys_auth');
            await db.collection(SESSION_ID).deleteMany({});
            consecutive440Errors = 0;
            log('SUCCESS', '✅ Sessão limpa!');
            log('INFO', '💡 Reinicie o bot (Ctrl+C) para gerar novo QR Code');
          } catch (err) {
            log('ERROR', `❌ Erro: ${err.message}`);
          }
        } else {
          log('ERROR', '❌ MongoDB não conectado');
        }
        break;
      case 'status':
        console.log('\n📊 STATUS ATUAL:');
        console.log(`   Conectado: ${!!(globalSock && globalSock.user)}`);
        console.log(`   Erros 440: ${consecutive440Errors}`);
        console.log(`   Reconexões: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        console.log(`   Msgs Recebidas: ${totalMessagesReceived}`);
        console.log(`   Msgs Processadas: ${totalMessagesProcessed}`);
        console.log(`   Msgs Filtradas: ${totalMessagesReceived - totalMessagesProcessed}`);
        console.log(`   Cache: ${processedMessages.size}\n`);
        break;
      case 'msgstats':
        logMessageStats();
        break;
      case 'help':
        console.log('\n📋 COMANDOS:');
        console.log('   stats        - Estatísticas');
        console.log('   blocked      - Bloqueados');
        console.log('   users        - Todos usuários');
        console.log('   reconnect    - Reconectar');
        console.log('   reset        - Reset contadores');
        console.log('   clearsession - Limpar sessão');
        console.log('   status       - Status atual');
        console.log('   msgstats     - Stats de mensagens');
        console.log('   help         - Ajuda');
        console.log('   clear        - Limpar tela\n');
        break;
      case 'clear':
        console.clear();
        showBanner();
        break;
      default:
        if (command) {
          console.log(`❌ Comando "${command}" inválido. Digite "help"\n`);
        }
    }
  });
}

// =========================================
// TRATAMENTO DE ERROS E SHUTDOWN
// =========================================

process.on('unhandledRejection', (err) => {
  if (process.env.DEBUG_MODE === 'true') {
    log('WARNING', `⚠️ Rejection: ${err?.message}`);
    log('WARNING', `⚠️ Stack: ${err?.stack?.substring(0, 200)}`);
  }
});

process.on('uncaughtException', (err) => {
  log('ERROR', `❌ Exception: ${err?.message}`);
  log('ERROR', `❌ Stack: ${err?.stack?.substring(0, 300)}`);
  
  if (String(err?.message || '').includes('Connection')) {
    log('INFO', '🔄 Erro de conexão detectado - tentando reconectar...');
    setTimeout(() => connectWhatsApp(), getReconnectDelay(reconnectAttempts));
  } else {
    log('ERROR', '❌ Erro crítico - encerrando processo');
    process.exit(1);
  }
});

const shutdown = async () => {
  console.log('\n\n👋 Encerrando bot...');
  
  log('INFO', `📊 Estatísticas finais:`);
  log('INFO', `   📥 Mensagens recebidas: ${totalMessagesReceived}`);
  log('INFO', `   ✅ Mensagens processadas: ${totalMessagesProcessed}`);
  log('INFO', `   🔄 Mensagens filtradas: ${totalMessagesReceived - totalMessagesProcessed}`);
  log('INFO', `   🔄 Reconexões totais: ${totalReconnectAttempts}`);
  log('INFO', `   💾 Cache de mensagens: ${processedMessages.size}`);
  
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    log('INFO', '✅ Cleanup interval limpo');
  }
  
  if (httpServer) {
    httpServer.close();
    log('INFO', '✅ Servidor HTTP encerrado');
  }
  
  if (mongoClient) {
    await mongoClient.close();
    log('INFO', '✅ MongoDB desconectado');
  }
  
  if (globalSock) {
    destroySocket();
    log('INFO', '✅ Socket destruído');
  }
  
  log('SUCCESS', '👋 Bot encerrado com sucesso!');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// =========================================
// INICIALIZAÇÃO DO BOT
// =========================================

async function startBot() {
  try {
    log('INFO', '🚀 Iniciando bot...');
    
    initializeOnce();
    
    log('INFO', '📊 Inicializando contadores de mensagens...');
    totalMessagesReceived = 0;
    totalMessagesProcessed = 0;
    lastStatsLog = 0;
    
    log('INFO', '🔌 Iniciando conexão com WhatsApp...');
    await connectWhatsApp();
    
    log('SUCCESS', '✅ Bot iniciado com sucesso!');
    
  } catch (error) {
    log('ERROR', `❌ Erro fatal ao iniciar bot: ${error.message}`);
    log('ERROR', `❌ Stack: ${error.stack}`);
    process.exit(1);
  }
}

console.log('\n🤖 ╔══════════════════════════════════════════════════════╗');
console.log('🤖 │ INICIANDO CHAT BOT WHATSAPP - STREAM STUDIO        │');
console.log('🤖 │ Versão otimizada com filtros inteligentes          │');
console.log('🤖 ╚══════════════════════════════════════════════════════╝\n');

startBot();