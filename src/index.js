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

// 🔥 CORREÇÃO: Período de estabilização aumentado de 10s para 60s
const POST_AUTH_STABILIZATION_TIME = 60000; // Era 10000
const MAX_440_BEFORE_CLEAR = 3;
const FETCH_VERSION_TIMEOUT = 10000;

let mongoClient = null;
let globalSock = null;
let reconnectAttempts = 0;
let consecutive440Errors = 0;
let isConnecting = false;
let isInitialized = false;
let httpServer = null;
let lastReconnectTime = 0;
let totalReconnectAttempts = 0;
let authenticationTimeout = null;
let isStabilizing = false;
let stabilizationTimeout = null;
let lastSuccessfulAuth = 0;

// 📊 Contadores para diagnóstico
let totalMessagesReceived = 0;
let totalMessagesProcessed = 0;
let lastStatsLog = 0;

const msgRetryCounterCache = new NodeCache();
const processedMessages = new Set();
const MESSAGE_CACHE_LIMIT = 1000;

let cleanupInterval = null;

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
  console.log('\x1b[36m%s\x1b[0m', '╔═══════════════════════════════════════════════════════════╗');
  console.log('\x1b[36m%s\x1b[0m', '║           🤖  CHAT BOT WHATSAPP - STREAM STUDIO  🤖          ║');
  console.log('\x1b[36m%s\x1b[0m', '║                    Bot Multi-tarefas com IA                  ║');
  console.log('\x1b[36m%s\x1b[0m', '╚═══════════════════════════════════════════════════════════╝\n');
  console.log('\x1b[33m%s\x1b[0m', `📱 Bot: ${BOT_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `👤 Owner: ${OWNER_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `🌐 Platform: ${process.env.RENDER ? 'Render' : process.env.FLY_APP_NAME ? 'Fly.io' : 'Local'}\n`);
}
function setupHealthServer() {
  if (httpServer) return httpServer;

  const app = express();
  
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'online',
      whatsapp: { 
        connected: !!(globalSock && globalSock.user),
        authenticated: !!(globalSock && globalSock.user),
        stabilizing: isStabilizing,
        consecutive440: consecutive440Errors
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
    res.send(`<h1>${BOT_NAME}</h1><p>Status: ${globalSock && globalSock.user ? '✅ Online' : '🔴 Offline'}</p>`);
  });
  
  httpServer = app.listen(PORT, '0.0.0.0', () => {
    log('SUCCESS', `🌐 Servidor na porta ${PORT}`);
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

async function getMessageFromDB(key) {
  try {
    if (!mongoClient) return undefined;
    
    const db = mongoClient.db('baileys_auth');
    const messagesCollection = db.collection('messages');
    const message = await messagesCollection.findOne({ 'key.id': key.id });
    
    return message?.message || undefined;
  } catch (error) {
    return undefined;
  }
}

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
    // Silencioso
  }
}

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
      }
    } catch (error) {
      log('WARNING', `⚠️ Erro no cleanup: ${error.message}`);
    }
  }, 5 * 60 * 1000);
  
  log('SUCCESS', '✅ Tarefas periódicas iniciadas');
}

function destroySocket() {
  if (globalSock) {
    try {
      globalSock.ev.removeAllListeners();
      globalSock.ws?.removeAllListeners?.();
      globalSock.ws?.terminate?.();
      globalSock.end?.();
    } catch (e) { /* ignore */ }
    globalSock = null;
  }
  
  if (authenticationTimeout) {
    clearTimeout(authenticationTimeout);
    authenticationTimeout = null;
  }
  
  if (stabilizationTimeout) {
    clearTimeout(stabilizationTimeout);
    stabilizationTimeout = null;
  }
}
function startStabilizationPeriod() {
  isStabilizing = true;
  lastSuccessfulAuth = Date.now();
  
  if (stabilizationTimeout) {
    clearTimeout(stabilizationTimeout);
  }
  
  // 🔥 CORREÇÃO: Log atualizado com novo tempo de estabilização (60s)
  log('INFO', `⏳ Iniciando período de estabilização (${POST_AUTH_STABILIZATION_TIME/1000}s)...`);
  log('INFO', `🕐 Timestamp de autenticação: ${new Date(lastSuccessfulAuth).toLocaleTimeString()}`);
  log('WARNING', '🚫 MENSAGENS IGNORADAS durante estabilização (aguarde sync de histórico finalizar)');
  
  stabilizationTimeout = setTimeout(() => {
    isStabilizing = false;
    consecutive440Errors = 0;
    log('SUCCESS', '✅ Período de estabilização concluído - Bot totalmente operacional');
    log('INFO', `📊 Mensagens recebidas: ${totalMessagesReceived} | Processadas: ${totalMessagesProcessed}`);
  }, POST_AUTH_STABILIZATION_TIME);
}

function shouldIgnore440Error() {
  if (!isStabilizing) return false;
  
  const timeSinceAuth = Date.now() - lastSuccessfulAuth;
  if (timeSinceAuth < POST_AUTH_STABILIZATION_TIME) {
    log('INFO', '🔄 Erro 440 ignorado (período de estabilização pós-auth)');
    return true;
  }
  
  return false;
}

async function fetchBaileysVersionWithTimeout() {
  try {
    log('INFO', '📡 Buscando versão mais recente do Baileys...');
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout ao buscar versão')), FETCH_VERSION_TIMEOUT)
    );
    
    const versionPromise = fetchLatestBaileysVersion();
    
    const { version } = await Promise.race([versionPromise, timeoutPromise]);
    
    log('SUCCESS', `✅ Versão obtida: ${version.join('.')}`);
    return version;
    
  } catch (error) {
    log('WARNING', `⚠️ Erro ao buscar versão: ${error.message}`);
    log('INFO', '📦 Usando versão fallback mais recente conhecida');
    
    return [2, 3000, 1019826820];
  }
}

function logMessageStats() {
  const now = Date.now();
  if (now - lastStatsLog < 30000) return;
  
  lastStatsLog = now;
  const diff = totalMessagesReceived - totalMessagesProcessed;
  
  if (totalMessagesReceived > 0) {
    log('INFO', `📊 Stats: Recebidas=${totalMessagesReceived} | Processadas=${totalMessagesProcessed} | Bloqueadas=${diff} | Cache=${processedMessages.size}`);
    
    if (diff > 5) {
      log('WARNING', `⚠️ ALERTA: ${diff} mensagens foram bloqueadas/rejeitadas!`);
    }
  }
}

// 🔥 NOVA FUNÇÃO: Detecta se mensagem é de sincronização de histórico
function isHistorySyncMessage(message) {
  try {
    if (!message?.message) return false;
    
    // Tipos de mensagens de protocolo que devem ser ignoradas
    const protocolTypes = [
      'protocolMessage',
      'senderKeyDistributionMessage', 
      'messageContextInfo'
    ];
    
    // Verifica se tem algum tipo de protocolo
    const hasProtocolMessage = protocolTypes.some(type => message.message[type]);
    
    if (hasProtocolMessage) {
      const protocolType = message.message.protocolMessage?.type;
      if (protocolType) {
        log('INFO', `🔄 Mensagem de protocolo detectada: ${protocolType} - IGNORADA`);
      }
      return true;
    }
    
    return false;
    
  } catch (error) {
    return false;
  }
}

// 🔥 NOVA FUNÇÃO: Valida se é mensagem real de usuário
function isRealUserMessage(message) {
  try {
    if (!message?.message) return false;
    
    // 🔥 FILTRO 1: Rejeita mensagens de protocolo
    if (isHistorySyncMessage(message)) {
      return false;
    }
    
    // 🔥 FILTRO 2: Aceita apenas tipos válidos
    const validTypes = [
      'conversation',
      'extendedTextMessage',
      'imageMessage',
      'videoMessage',
      'documentMessage',
      'audioMessage'
    ];
    
    const hasValidType = validTypes.some(type => message.message[type]);
    
    if (!hasValidType) {
      log('INFO', '⚠️ Mensagem sem tipo válido - IGNORADA');
      return false;
    }
    
    return true;
    
  } catch (error) {
    return false;
  }
}
async function connectWhatsApp() {
  if (isConnecting) {
    log('WARNING', '⚠️ Conexão em andamento...');
    return null;
  }
  
  if (isStabilizing && globalSock) {
    log('INFO', '⏳ Aguardando estabilização...');
    return globalSock;
  }
  
  if (globalSock && globalSock.user && !isStabilizing) {
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

    // 🔥 CORREÇÃO: syncFullHistory desabilitado + configurações otimizadas
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
      connectTimeoutMs: CONNECT_TIMEOUT,
      defaultQueryTimeoutMs: QUERY_TIMEOUT,
      keepAliveIntervalMs: KEEPALIVE_INTERVAL,
      emitOwnEvents: true,
      
      // 🔥 CORREÇÃO CRÍTICA: Desabilita sincronização de histórico completo
      syncFullHistory: false,
      
      retryRequestDelayMs: 2000,
      fireInitQueries: true,
      printQRInTerminal: false,
      
      // 🔥 NOVO: Configurações adicionais para evitar sync massivo
      shouldSyncHistoryMessage: () => false, // Nunca sincroniza histórico
      patchMessageBeforeSending: (message) => message // Não modifica mensagens
    });

    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log('INFO', '📱 QR Code recebido!');
        isStabilizing = false;
        consecutive440Errors = 0;
        
        console.log('\n📱 ┌────────────────────────────────────────────┐');
        console.log('📱 ESCANEIE O QR CODE ABAIXO EM 60 SEGUNDOS');
        console.log('📱 └────────────────────────────────────────────┘\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 └────────────────────────────────────────────┘\n');
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
          
          log('INFO', '⸱️ Bot pausado. Reinicie manualmente para gerar novo QR Code.');
          log('INFO', '💡 Dica: Certifique-se de que a versão do Baileys está atualizada');
          
          return;
        }

        if (isLoginTimeout) {
          if (shouldIgnore440Error()) {
            isConnecting = false;
            return;
          }
          
          consecutive440Errors++;
          log('INFO', `📲 Erro 440 (${consecutive440Errors}/${MAX_440_BEFORE_CLEAR})`);
          
          if (consecutive440Errors >= MAX_440_BEFORE_CLEAR && !isStabilizing) {
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
        
        if (sock.user) {
          if (authenticationTimeout) {
            clearTimeout(authenticationTimeout);
            authenticationTimeout = null;
          }
          
          startStabilizationPeriod();
          
          reconnectAttempts = 0;
          
          log('SUCCESS', '✅ Conectado E AUTENTICADO ao WhatsApp!');
          console.log('\n🎉 ┌────────────────────────────────────────────┐');
          console.log('🎉 BOT ONLINE E FUNCIONANDO!');
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
          
          authenticationTimeout = setTimeout(() => {
            if (!sock.user) {
              log('WARNING', '⚠️ Timeout de autenticação - reconectando...');
              destroySocket();
              isConnecting = false;
              connectWhatsApp();
            }
          }, 45000);
        }
        
        return;
      }
    });

    // 🔥 EVENT LISTENER COM FILTROS AGRESSIVOS
    sock.ev.on('messages.upsert', async (m) => {
      const { messages, type } = m;
      
      log('INFO', `📥 Event 'messages.upsert' disparado | Tipo: ${type} | Quantidade: ${messages.length}`);
      
      if (type !== 'notify') {
        log('INFO', `⭕ Tipo '${type}' ignorado (não é 'notify')`);
        return;
      }

      // 🔥 FILTRO CRÍTICO 1: Ignora TODAS mensagens durante estabilização
      if (isStabilizing) {
        const timeSinceAuth = Date.now() - lastSuccessfulAuth;
        log('WARNING', `🚫 MENSAGENS IGNORADAS - Bot em estabilização (${Math.round(timeSinceAuth/1000)}s/${POST_AUTH_STABILIZATION_TIME/1000}s)`);
        return; // IMPORTANTE: Retorna imediatamente
      }

      for (const message of messages) {
        try {
          totalMessagesReceived++;
          
          const from = message.key.remoteJid;
          const messageId = message.key.id;
          
          log('INFO', `📨 Mensagem #${totalMessagesReceived} | De: ${from} | ID: ${messageId}`);

          // 🔥 FILTRO CRÍTICO 2: Rejeita mensagens de sync/protocolo
          if (!isRealUserMessage(message)) {
            log('WARNING', `🚫 Mensagem #${totalMessagesReceived} de SYNC/PROTOCOLO - IGNORADA`);
            continue;
          }

          if (!message.message) {
            log('WARNING', `⚠️ Mensagem #${totalMessagesReceived} sem conteúdo - IGNORADA`);
            continue;
          }

          // 🔥 FILTRO CRÍTICO 3: Verifica duplicatas
          if (processedMessages.has(messageId)) {
            log('INFO', `🔄 Mensagem #${totalMessagesReceived} DUPLICADA (ID: ${messageId}) - IGNORADA`);
            continue;
          }
          
          processedMessages.add(messageId);
          log('INFO', `💾 Mensagem #${totalMessagesReceived} adicionada ao cache (total: ${processedMessages.size})`);
          
          await saveMessageToDB(message);
          log('INFO', `💿 Mensagem #${totalMessagesReceived} salva no MongoDB`);
          
          log('INFO', `🚀 Chamando processMessage() para mensagem #${totalMessagesReceived}...`);
          
          await processMessage(sock, message);
          
          totalMessagesProcessed++;
          log('SUCCESS', `✅ Mensagem #${totalMessagesReceived} PROCESSADA COM SUCESSO (total processadas: ${totalMessagesProcessed})`);
          
          if (totalMessagesReceived % 10 === 0) {
            logMessageStats();
          }

        } catch (error) {
          log('ERROR', `❌ Erro ao processar mensagem #${totalMessagesReceived}: ${error.message}`);
          
          if (!error.message?.includes('Connection')) {
            log('ERROR', `❌ Stack trace: ${error.stack?.substring(0, 200)}`);
          }
        }
      }
      
      log('INFO', `✅ Batch processado | Total recebidas: ${totalMessagesReceived} | Total processadas: ${totalMessagesProcessed}`);
    });

    isConnecting = false;
    return sock;

  } catch (error) {
    isConnecting = false;
    log('ERROR', `❌ Erro na conexão: ${error.message}`);
    log('ERROR', `❌ Stack: ${error.stack?.substring(0, 300)}`);

    const delay = getReconnectDelay(reconnectAttempts - 1);
    log('INFO', `⏳ Tentando reconectar em ${Math.round(delay/1000)}s...`);
    
    setTimeout(() => {
      connectWhatsApp();
    }, delay);

    return null;
  }
}

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
        isStabilizing = false;
        destroySocket();
        connectWhatsApp();
        break;
      case 'reset':
        reconnectAttempts = 0;
        consecutive440Errors = 0;
        isStabilizing = false;
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
            isStabilizing = false;
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
        console.log(`   Estabilizando: ${isStabilizing}`);
        console.log(`   Erros 440: ${consecutive440Errors}`);
        console.log(`   Reconexões: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        console.log(`   Msgs Recebidas: ${totalMessagesReceived}`);
        console.log(`   Msgs Processadas: ${totalMessagesProcessed}`);
        console.log(`   Msgs Bloqueadas: ${totalMessagesReceived - totalMessagesProcessed}`);
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
  log('INFO', `   ❌ Mensagens bloqueadas: ${totalMessagesReceived - totalMessagesProcessed}`);
  log('INFO', `   🔄 Reconexões totais: ${totalReconnectAttempts}`);
  log('INFO', `   💾 Cache de mensagens: ${processedMessages.size}`);
  
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    log('INFO', '✅ Cleanup interval limpo');
  }
  
  if (authenticationTimeout) {
    clearTimeout(authenticationTimeout);
    log('INFO', '✅ Auth timeout limpo');
  }
  
  if (stabilizationTimeout) {
    clearTimeout(stabilizationTimeout);
    log('INFO', '✅ Stabilization timeout limpo');
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

console.log('\n🤖 ╔═══════════════════════════════════════════════════╗');
console.log('🤖 INICIANDO CHAT BOT WHATSAPP - STREAM STUDIO');
console.log('🤖 Versão com filtros anti-sync otimizada');
console.log('🤖 ╚═══════════════════════════════════════════════════╝\n');

startBot();