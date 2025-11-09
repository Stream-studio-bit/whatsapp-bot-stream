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
import qrcode from 'qrcode-terminal';
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

// ============================================
// 🔧 CONFIGURAÇÕES
// ============================================
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_ID = process.env.SESSION_ID || 'stream-studio-bot';
const BOT_NAME = process.env.BOT_NAME || 'Assistente Stream Studio';
const OWNER_NAME = process.env.OWNER_NAME || 'Roberto';
const PORT = process.env.PORT || 3000;

// Configurações de reconexão
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 5;
const INITIAL_RECONNECT_DELAY = parseInt(process.env.INITIAL_RECONNECT_DELAY) || 5000;
const MAX_RECONNECT_DELAY = parseInt(process.env.MAX_RECONNECT_DELAY) || 300000;
const RECONNECT_RESET_TIME = parseInt(process.env.RECONNECT_RESET_TIME) || 900000;

// Timeouts
const CONNECT_TIMEOUT = parseInt(process.env.CONNECT_TIMEOUT) || 120000;
const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT) || 120000;
const KEEPALIVE_INTERVAL = parseInt(process.env.KEEPALIVE_INTERVAL) || 60000;

// ============================================
// 🔥 ESTADO GLOBAL
// ============================================
let mongoClient = null;
let globalSock = null;
let reconnectAttempts = 0;
let isConnecting = false;
let isReconnecting = false;
let isInitialized = false;
let httpServer = null;
let lastReconnectTime = 0;
let totalReconnectAttempts = 0;

// 🔥 CRITICAL: msgRetryCounterCache FORA do socket
const msgRetryCounterCache = new NodeCache();

// Cache de mensagens processadas
const processedMessages = new Set();
const MESSAGE_CACHE_LIMIT = 1000;

// Cleanup interval
let cleanupInterval = null;

// ============================================
// 🔥 FUNÇÕES AUXILIARES
// ============================================
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
      log('INFO', '🔄 Contador de reconexões resetado (bot estável)');
    }
  }, RECONNECT_RESET_TIME);
}

// ============================================
// BANNER
// ============================================
function showBanner() {
  console.clear();
  console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════════════════════════════════════╗');
  console.log('\x1b[36m%s\x1b[0m', '║                                                              ║');
  console.log('\x1b[36m%s\x1b[0m', '║           🤖  CHAT BOT WHATSAPP - STREAM STUDIO  🤖          ║');
  console.log('\x1b[36m%s\x1b[0m', '║                                                              ║');
  console.log('\x1b[36m%s\x1b[0m', '║                    Bot Multi-tarefas com IA                  ║');
  console.log('\x1b[36m%s\x1b[0m', '║                                                              ║');
  console.log('\x1b[36m%s\x1b[0m', '╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('\x1b[33m%s\x1b[0m', `📱 Bot Name: ${BOT_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `👤 Owner: ${OWNER_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `⚙️  Powered by: Baileys + Groq AI + MongoDB`);
  console.log('\x1b[33m%s\x1b[0m', `🌐 Platform: ${process.env.RENDER ? 'Render' : process.env.FLY_APP_NAME ? 'Fly.io' : 'Local'}`);
  console.log('');
}

// ============================================
// 🔥 SERVIDOR HTTP
// ============================================
function setupHealthServer() {
  if (httpServer) {
    log('WARNING', '⚠️  Servidor HTTP já está rodando');
    return httpServer;
  }

  const app = express();
  
  app.get('/health', (req, res) => {
    const status = {
      status: 'online',
      service: 'WhatsApp Bot Stream Studio',
      platform: process.env.RENDER ? 'Render' : process.env.FLY_APP_NAME ? 'Fly.io' : 'Local',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      whatsapp: {
        connected: globalSock && globalSock.user ? true : false,
        reconnectAttempts: reconnectAttempts,
        totalReconnectAttempts: totalReconnectAttempts,
        isReconnecting: isReconnecting
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      }
    };
    res.status(200).json(status);
  });
  
  app.get('/', (req, res) => {
    res.send(`
      <html>
        <head>
          <title>${BOT_NAME}</title>
          <style>
            body { font-family: Arial; background: #1a1a2e; color: #eee; text-align: center; padding: 50px; }
            h1 { color: #16C79A; }
            .status { font-size: 24px; margin: 20px; }
            .info { background: #0f3460; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; }
          </style>
        </head>
        <body>
          <h1>🤖 ${BOT_NAME}</h1>
          <div class="status">✅ Bot Online</div>
          <div class="info">
            <p><strong>Platform:</strong> ${process.env.RENDER ? 'Render' : process.env.FLY_APP_NAME ? 'Fly.io' : 'Local'}</p>
            <p><strong>Uptime:</strong> ${Math.floor(process.uptime() / 60)} minutos</p>
            <p><strong>WhatsApp:</strong> ${globalSock && globalSock.user ? '🟢 Conectado' : '🔴 Desconectado'}</p>
          </div>
          <p>Powered by Baileys + Groq AI + MongoDB</p>
        </body>
      </html>
    `);
  });
  
  app.get('/status', (req, res) => {
    res.json({
      service: 'WhatsApp Bot Stream Studio',
      platform: process.env.RENDER ? 'Render' : process.env.FLY_APP_NAME ? 'Fly.io' : 'Local',
      whatsapp: {
        connected: globalSock && globalSock.user ? true : false,
        phoneNumber: globalSock?.user?.id?.split(':')[0] || null,
        reconnectAttempts: reconnectAttempts,
        totalReconnectAttempts: totalReconnectAttempts,
        isReconnecting: isReconnecting,
        lastReconnect: lastReconnectTime ? new Date(lastReconnectTime).toISOString() : null
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
        nodeVersion: process.version
      }
    });
  });
  
  httpServer = app.listen(PORT, '0.0.0.0', () => {
    log('SUCCESS', `🌐 Servidor HTTP ativo na porta ${PORT}`);
    log('SUCCESS', `🏥 Health check: http://localhost:${PORT}/health`);
    log('SUCCESS', `📊 Status: http://localhost:${PORT}/status`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log('ERROR', `❌ Porta ${PORT} já está em uso!`);
      log('INFO', '💡 Aguarde alguns segundos e tente novamente...');
      process.exit(1);
    } else {
      log('ERROR', `❌ Erro ao iniciar servidor: ${err.message}`);
      throw err;
    }
  });
  
  return httpServer;
}

// ============================================
// INICIALIZAÇÃO ÚNICA
// ============================================
function initializeOnce() {
  if (isInitialized) return;
  
  showBanner();
  
  log('INFO', '🔧 Iniciando servidor HTTP...');
  setupHealthServer();
  
  log('INFO', '💚 Iniciando keep-alive...');
  keepAlive();
  
  if (!validateGroqConfig()) {
    console.error('\n❌ Configure GROQ_API_KEY no .env!\n');
    process.exit(1);
  }
  
  if (!MONGODB_URI) {
    console.error('\n❌ Configure MONGODB_URI no .env!\n');
    process.exit(1);
  }
  
  setupConsoleCommands();
  isInitialized = true;
}

// ============================================
// MONGODB AUTH STATE
// ============================================
async function useMongoDBAuthState(collection) {
  const readCreds = async () => {
    const data = await collection.findOne({ _id: 'creds' });
    return data ? JSON.parse(JSON.stringify(data.value), BufferJSON.reviver) : null;
  };

  const readKey = async (id) => {
    const data = await collection.findOne({ _id: id });
    return data ? JSON.parse(JSON.stringify(data.value), BufferJSON.reviver) : null;
  };

  const writeData = async (id, value) => {
    const data = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await collection.updateOne({ _id: id }, { $set: { value: data } }, { upsert: true });
  };

  const removeData = async (id) => {
    await collection.deleteOne({ _id: id });
  };

  let creds = await readCreds();
  if (!creds) {
    creds = initAuthCreds();
    await writeData('creds', creds);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const value = await readKey(`${type}-${id}`);
            if (value) data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                await writeData(key, value);
              } else {
                await removeData(key);
              }
            }
          }
        }
      }
    },
    saveCreds: async () => await writeData('creds', creds),
    clearAll: async () => await collection.deleteMany({})
  };
}

// ============================================
// 🔥 getMessage
// ============================================
async function getMessageFromDB(key) {
  try {
    if (!mongoClient) return proto.Message.fromObject({});
    
    const db = mongoClient.db('baileys_auth');
    const messagesCollection = db.collection('messages');
    const message = await messagesCollection.findOne({ 'key.id': key.id });
    
    if (message && message.message) {
      return message.message;
    }
    
    return proto.Message.fromObject({});
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao buscar mensagem: ${error.message}`);
    }
    return proto.Message.fromObject({});
  }
}

// ============================================
// 🔥 SALVA MENSAGENS NO MONGODB
// ============================================
async function saveMessageToDB(message) {
  try {
    if (!mongoClient || !message?.key?.id) return;
    
    const db = mongoClient.db('baileys_auth');
    const messagesCollection = db.collection('messages');
    
    await messagesCollection.updateOne(
      { 'key.id': message.key.id },
      { $set: message },
      { upsert: true }
    );
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao salvar mensagem: ${error.message}`);
    }
  }
}

// ============================================
// LIMPEZA PERIÓDICA
// ============================================
function startPeriodicTasks() {
  if (cleanupInterval) clearInterval(cleanupInterval);
  
  cleanupInterval = setInterval(async () => {
    try {
      await cleanExpiredBlocks();
      
      if (processedMessages.size > MESSAGE_CACHE_LIMIT) {
        const excess = processedMessages.size - MESSAGE_CACHE_LIMIT;
        const iterator = processedMessages.values();
        for (let i = 0; i < excess; i++) {
          const { value } = iterator.next();
          if (value) processedMessages.delete(value);
        }
        log('INFO', `🧹 Cache limpo: ${excess} mensagens`);
      }
    } catch (error) {
      log('WARNING', `⚠️ Erro no cleanup: ${error.message}`);
    }
  }, 5 * 60 * 1000);
  
  log('SUCCESS', '✅ Tarefas periódicas iniciadas');
}

// ============================================
// 🔥 CONEXÃO WHATSAPP - SEM ALTERAÇÕES CRÍTICAS
// ============================================
async function connectWhatsApp() {
  if (isConnecting || isReconnecting) {
    log('WARNING', '⚠️ Conexão/reconexão já em andamento...');
    return null;
  }
  
  if (globalSock && globalSock.user) {
    log('WARNING', '⚠️ Socket já conectado - ignorando nova conexão');
    return globalSock;
  }
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('ERROR', `❌ Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas atingido`);
    log('INFO', `⏸️ Aguarde ${RECONNECT_RESET_TIME / 60000} minutos para nova tentativa...`);
    
    setTimeout(() => {
      reconnectAttempts = 0;
      totalReconnectAttempts = 0;
      log('INFO', '🔄 Contador resetado. Você pode reconectar agora.');
    }, RECONNECT_RESET_TIME);
    
    return null;
  }

  isConnecting = true;
  isReconnecting = reconnectAttempts > 0;
  reconnectAttempts++;
  totalReconnectAttempts++;
  lastReconnectTime = Date.now();

  try {
    log('INFO', `🔄 ${isReconnecting ? 'Reconectando' : 'Conectando'}... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    if (globalSock) {
      try {
        globalSock.ev.removeAllListeners();
        globalSock.ws?.removeAllListeners?.();
        globalSock.ws?.terminate?.();
      } catch (e) { /* ignore */ }
      globalSock = null;
    }

    if (!mongoClient) {
      log('INFO', '🔗 Conectando ao MongoDB...');
      mongoClient = new MongoClient(MONGODB_URI);
      await mongoClient.connect();
      log('SUCCESS', '✅ MongoDB conectado!');
    }

    const { version } = await fetchLatestBaileysVersion()
      .catch(() => ({ version: [2, 3000, 0] }));
    log('SUCCESS', `✅ Baileys v${version.join('.')}`);

    const db = mongoClient.db('baileys_auth');
    const collection = db.collection(SESSION_ID);
    const { state, saveCreds, clearAll } = await useMongoDBAuthState(collection);

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser: ['Stream Studio Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      getMessage: getMessageFromDB,
      msgRetryCounterCache,
      connectTimeoutMs: CONNECT_TIMEOUT,
      defaultQueryTimeoutMs: QUERY_TIMEOUT,
      keepAliveIntervalMs: KEEPALIVE_INTERVAL,
      emitOwnEvents: false,
      syncFullHistory: false
    });

    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    // ============================================
    // 🔥 EVENTO: CONEXÃO
    // ============================================
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 ┌────────────────────────────────────────────┐');
        console.log('📱 ESCANEIE O QR CODE ABAIXO');
        console.log('📱 └────────────────────────────────────────────┘\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 └────────────────────────────────────────────┘\n');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : null;

        const shouldLogout = statusCode === DisconnectReason.loggedOut;
        const shouldRestart = statusCode === DisconnectReason.restartRequired;
        const isTimedOut = statusCode === DisconnectReason.timedOut;
        const isLoginTimeout = statusCode === 440;
        const isBadRequest = statusCode === 400;

        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', `🔍 Desconexão: statusCode=${statusCode}, reason=${lastDisconnect?.error?.message || 'unknown'}`);
        }

        // Logout - NÃO reconecta
        if (shouldLogout) {
          log('ERROR', '❌ Logout detectado - limpando credenciais');
          try {
            await clearAll();
          } catch (e) {
            log('ERROR', `❌ Erro ao limpar: ${e.message}`);
          }
          
          if (cleanupInterval) clearInterval(cleanupInterval);
          if (mongoClient) {
            await mongoClient.close();
            mongoClient = null;
          }
          
          log('INFO', '⏸️ Bot pausado - necessário re-autenticar');
          process.exit(0);
          return;
        }

        // Erro 440 (Login Timeout)
        if (isLoginTimeout) {
          log('WARNING', `⚠️ Erro 440 - Login timeout (tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            log('ERROR', '❌ Muitos erros 440. Possível problema de rede ou conta.');
            log('INFO', '💡 Verifique: 1) Conexão de internet 2) WhatsApp não está aberto em outro dispositivo');
            isConnecting = false;
            isReconnecting = false;
            return;
          }
          
          if (globalSock) {
            try {
              globalSock.end();
            } catch (e) { /* ignore */ }
            globalSock = null;
          }
          
          isConnecting = false;
          isReconnecting = false;
          
          const delay = getReconnectDelay(reconnectAttempts - 1);
          log('INFO', `⏳ Aguardando ${Math.round(delay / 1000)}s antes de reconectar...`);
          
          setTimeout(() => {
            connectWhatsApp();
          }, delay);
          return;
        }

        // Bad Request (400)
        if (isBadRequest) {
          log('WARNING', '⚠️ Erro 400 - Possível problema com credenciais...');
          
          if (reconnectAttempts >= 3) {
            log('ERROR', '❌ Múltiplos erros 400. Credenciais podem estar corrompidas.');
            log('INFO', '💡 Use o comando "clearsession" no console para limpar a sessão.');
            isConnecting = false;
            isReconnecting = false;
            return;
          }
          
          isConnecting = false;
          isReconnecting = false;
          
          const delay = getReconnectDelay(reconnectAttempts - 1);
          setTimeout(() => {
            connectWhatsApp();
          }, delay);
          return;
        }

        // restartRequired
        if (shouldRestart) {
          log('WARNING', '⚠️ Restart necessário - reconectando...');
          
          if (globalSock) {
            try {
              globalSock.end();
            } catch (e) { /* ignore */ }
            globalSock = null;
          }
          
          isConnecting = false;
          isReconnecting = false;
          reconnectAttempts = Math.max(0, reconnectAttempts - 1);
          
          setTimeout(() => {
            connectWhatsApp();
          }, 5000);
          return;
        }

        // timedOut
        if (isTimedOut) {
          log('WARNING', '⚠️ Timeout - aguardando...');
          isConnecting = false;
          isReconnecting = false;
          
          const delay = getReconnectDelay(reconnectAttempts - 1);
          log('INFO', `⏳ Aguardando ${Math.round(delay / 1000)}s...`);
          
          setTimeout(() => {
            connectWhatsApp();
          }, delay);
          return;
        }

        // Outras desconexões
        log('WARNING', `⚠️ Conexão fechada (código ${statusCode || 'desconhecido'})`);
        isConnecting = false;
        isReconnecting = false;
        
        const delay = getReconnectDelay(reconnectAttempts - 1);
        log('INFO', `⏳ Reconectando em ${Math.round(delay / 1000)}s...`);
        
        setTimeout(() => {
          connectWhatsApp();
        }, delay);
        
        return;
      }

      if (connection === 'open') {
        isConnecting = false;
        isReconnecting = false;
        reconnectAttempts = 0;

        log('SUCCESS', '✅ Conectado ao WhatsApp!');
        console.log('\n🎉 ┌────────────────────────────────────────────┐');
        console.log('🎉 BOT ONLINE E FUNCIONANDO!');
        console.log('🎉 └────────────────────────────────────────────┘\n');

        scheduleReconnectReset();
        startPeriodicTasks();
        printStats();

        console.log('📋 COMANDOS DISPONÍVEIS:');
        console.log(`   • ${process.env.COMMAND_ASSUME || '/assumir'} - Assumir atendimento`);
        console.log(`   • ${process.env.COMMAND_RELEASE || '/liberar'} - Liberar bot\n`);
        
        console.log('🔧 COMANDOS NO CONSOLE:');
        console.log('   Digite "stats" para estatísticas');
        console.log('   Digite "blocked" para usuários bloqueados');
        console.log('   Digite "users" para todos os usuários');
        console.log('   Digite "clearsession" para limpar sessão\n');
        
        return;
      }
    });

    // ============================================
    // 🔥 EVENTO: MENSAGENS - SEM ALTERAÇÕES
    // ============================================
    sock.ev.on('messages.upsert', async (m) => {
      const { messages, type } = m;
      if (type !== 'notify') return;

      for (const message of messages) {
        try {
          if (!message.message) continue;

          const messageId = message.key.id;
          
          if (processedMessages.has(messageId)) {
            if (process.env.DEBUG_MODE === 'true') {
              log('INFO', '🔍 Mensagem duplicada ignorada');
            }
            continue;
          }
          
          processedMessages.add(messageId);
          await saveMessageToDB(message);
          await processMessage(sock, message);

        } catch (error) {
          if (!error.message?.includes('Connection') && !error.message?.includes('WebSocket')) {
            log('WARNING', `⚠️ Erro ao processar: ${error.message}`);
            if (process.env.DEBUG_MODE === 'true') {
              console.error(error.stack);
            }
          }
        }
      }
    });

    isConnecting = false;
    return sock;

  } catch (error) {
    isConnecting = false;
    isReconnecting = false;
    log('ERROR', `❌ Erro ao conectar: ${error.message}`);
    
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }

    const delay = getReconnectDelay(reconnectAttempts - 1);
    log('INFO', `⏳ Tentando novamente em ${Math.round(delay / 1000)}s...`);
    
    setTimeout(() => {
      connectWhatsApp();
    }, delay);

    return null;
  }
}

// ============================================
// COMANDOS CONSOLE - 🔥 ADICIONADO: clearsession
// ============================================
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
        break;
      case 'blocked':
        listBlockedUsers();
        break;
      case 'users':
        listAllUsers();
        break;
      case 'reconnect':
        log('INFO', '🔄 Forçando reconexão...');
        reconnectAttempts = 0;
        if (globalSock) {
          globalSock.end();
          globalSock = null;
        }
        connectWhatsApp();
        break;
      case 'reset':
        log('INFO', '🔄 Resetando contadores...');
        reconnectAttempts = 0;
        totalReconnectAttempts = 0;
        log('SUCCESS', '✅ Contadores resetados!');
        break;
      case 'clearsession':
        log('INFO', '🗑️  Limpando sessão do MongoDB...');
        if (mongoClient) {
          try {
            const db = mongoClient.db('baileys_auth');
            await db.collection(SESSION_ID).deleteMany({});
            log('SUCCESS', '✅ Sessão limpa com sucesso!');
            log('INFO', '💡 Reinicie o bot para escanear novo QR Code.');
            log('INFO', '💡 Use: Ctrl+C para encerrar, depois inicie novamente.');
          } catch (err) {
            log('ERROR', `❌ Erro ao limpar sessão: ${err.message}`);
          }
        } else {
          log('ERROR', '❌ MongoDB não está conectado.');
        }
        break;
      case 'help':
        console.log('\n📋 COMANDOS DISPONÍVEIS:');
        console.log('   stats        - Estatísticas do bot');
        console.log('   blocked      - Usuários em atendimento manual');
        console.log('   users        - Todos os usuários');
        console.log('   reconnect    - Força reconexão');
        console.log('   reset        - Reseta contadores de reconexão');
        console.log('   clearsession - Limpa sessão do MongoDB (requer restart)');
        console.log('   help         - Esta ajuda');
        console.log('   clear        - Limpa console\n');
        break;
      case 'clear':
        console.clear();
        showBanner();
        break;
      default:
        if (command) {
          console.log(`❌ Comando "${command}" não reconhecido. Digite "help".\n`);
        }
    }
  });
}

// ============================================
// TRATAMENTO DE ERROS
// ============================================
process.on('unhandledRejection', (err) => {
  if (process.env.DEBUG_MODE === 'true') {
    log('WARNING', `⚠️ Unhandled Rejection: ${err?.message || err}`);
    console.error(err?.stack || err);
  }
});

process.on('uncaughtException', (err) => {
  log('WARNING', `⚠️ Uncaught Exception: ${err?.message || err}`);
  
  if (process.env.DEBUG_MODE === 'true') {
    console.error(err?.stack || err);
  }

  if (String(err?.message || '').includes('Connection') || 
      String(err?.message || '').includes('WebSocket')) {
    log('INFO', '🔄 Tentando reconectar...');
    setTimeout(() => connectWhatsApp(), getReconnectDelay(reconnectAttempts));
  } else {
    log('ERROR', '❌ Erro crítico. Encerrando...');
    process.exit(1);
  }
});

// ============================================
// ENCERRAMENTO GRACIOSO
// ============================================
const shutdown = async () => {
  console.log('\n\n👋 Encerrando bot...');
  log('INFO', '🛑 Bot encerrado');

  if (cleanupInterval) clearInterval(cleanupInterval);
  if (httpServer) {
    httpServer.close(() => {
      log('INFO', '🌐 Servidor HTTP encerrado');
    });
  }
  if (mongoClient) await mongoClient.close();
  
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ============================================
// 🔥 INICIA O BOT
// ============================================
async function startBot() {
  initializeOnce();
  await connectWhatsApp();
}

startBot();