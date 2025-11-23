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

// 🔥 FIX: Configurações de estabilização pós-autenticação
const POST_AUTH_STABILIZATION_TIME = 10000; // 10 segundos para estabilizar após auth
const MAX_440_BEFORE_CLEAR = 3; // Aumentado para 3

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

// 🔥 NOVO: Flag para período de estabilização pós-auth
let isStabilizing = false;
let stabilizationTimeout = null;
let lastSuccessfulAuth = 0;

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
      uptime: Math.floor(process.uptime())
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
    if (!mongoClient) return proto.Message.fromObject({});
    
    const db = mongoClient.db('baileys_auth');
    const messagesCollection = db.collection('messages');
    const message = await messagesCollection.findOne({ 'key.id': key.id });
    
    return message?.message || proto.Message.fromObject({});
  } catch (error) {
    return proto.Message.fromObject({});
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
  
  log('SUCCESS', '✅ Tarefas iniciadas');
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
  
  // Limpa timeouts
  if (authenticationTimeout) {
    clearTimeout(authenticationTimeout);
    authenticationTimeout = null;
  }
  
  if (stabilizationTimeout) {
    clearTimeout(stabilizationTimeout);
    stabilizationTimeout = null;
  }
}

// 🔥 NOVO: Inicia período de estabilização pós-autenticação
function startStabilizationPeriod() {
  isStabilizing = true;
  lastSuccessfulAuth = Date.now();
  
  if (stabilizationTimeout) {
    clearTimeout(stabilizationTimeout);
  }
  
  stabilizationTimeout = setTimeout(() => {
    isStabilizing = false;
    consecutive440Errors = 0;
    log('SUCCESS', '✅ Período de estabilização concluído - Bot totalmente operacional');
  }, POST_AUTH_STABILIZATION_TIME);
  
  log('INFO', `⏳ Iniciando período de estabilização (${POST_AUTH_STABILIZATION_TIME/1000}s)...`);
}

// 🔥 NOVO: Verifica se erro 440 deve ser ignorado
function shouldIgnore440Error() {
  if (!isStabilizing) return false;
  
  const timeSinceAuth = Date.now() - lastSuccessfulAuth;
  if (timeSinceAuth < POST_AUTH_STABILIZATION_TIME) {
    log('INFO', '🔄 Erro 440 ignorado (período de estabilização pós-auth)');
    return true;
  }
  
  return false;
}

async function connectWhatsApp() {
  if (isConnecting) {
    log('WARNING', '⚠️ Conexão em andamento...');
    return null;
  }
  
  // Durante estabilização, não reconecta
  if (isStabilizing && globalSock) {
    log('INFO', '⏳ Aguardando estabilização...');
    return globalSock;
  }
  
  // Verifica se já está autenticado e estável
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

    // 🔥 Versão fixa - fetchLatestBaileysVersion() trava no Render
    const version = [2, 3000, 1017531287];
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
      connectTimeoutMs: CONNECT_TIMEOUT,
      defaultQueryTimeoutMs: QUERY_TIMEOUT,
      keepAliveIntervalMs: KEEPALIVE_INTERVAL,
      emitOwnEvents: false,
      syncFullHistory: false,
      retryRequestDelayMs: 2000,
      fireInitQueries: true
    });

    globalSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Captura QR Code
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

        // restartRequired (515)
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

        // 🔥 FIX: Erro 405 = credenciais inválidas
        if (statusCode === 405) {
          log('WARNING', '⚠️ Erro 405 - Credenciais inválidas detectadas');
          log('INFO', '🧹 Limpando sessão para gerar novo QR Code...');
          
          try {
            await clearAll();
            consecutive440Errors = 0;
            reconnectAttempts = 0;
            log('SUCCESS', '✅ Sessão limpa!');
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

        // Erro 440
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

        // Outros erros
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
        
        // 🔥 FIX CRÍTICO: Verifica se realmente autenticou
        if (sock.user) {
          // Limpa timeout de autenticação
          if (authenticationTimeout) {
            clearTimeout(authenticationTimeout);
            authenticationTimeout = null;
          }
          
          // 🔥 NOVO: Inicia período de estabilização
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
          // Aguarda autenticação completar
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

    sock.ev.on('messages.upsert', async (m) => {
      const { messages, type } = m;
      
      // 🔥 FIX: Ignora mensagens durante estabilização inicial
      if (isStabilizing) {
        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', '⏸️ Mensagem ignorada (estabilização em andamento)');
        }
        return;
      }
      
      // Ignora mensagens históricas
      if (type !== 'notify') {
        return;
      }

      for (const message of messages) {
        try {
          if (!message.message) continue;

          const messageId = message.key.id;
          
          if (processedMessages.has(messageId)) continue;
          
          processedMessages.add(messageId);
          await saveMessageToDB(message);
          await processMessage(sock, message);

        } catch (error) {
          if (!error.message?.includes('Connection')) {
            log('WARNING', `⚠️ Erro: ${error.message}`);
          }
        }
      }
    });

    isConnecting = false;
    return sock;

  } catch (error) {
    isConnecting = false;
    log('ERROR', `❌ Erro: ${error.message}`);

    const delay = getReconnectDelay(reconnectAttempts - 1);
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
            log('INFO', '💡 Reinicie o bot (Ctrl+C)');
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
        console.log(`   Reconexões: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}\n`);
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
  }
});

process.on('uncaughtException', (err) => {
  log('WARNING', `⚠️ Exception: ${err?.message}`);
  
  if (String(err?.message || '').includes('Connection')) {
    setTimeout(() => connectWhatsApp(), getReconnectDelay(reconnectAttempts));
  } else {
    process.exit(1);
  }
});

const shutdown = async () => {
  console.log('\n\n👋 Encerrando...');
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (authenticationTimeout) clearTimeout(authenticationTimeout);
  if (stabilizationTimeout) clearTimeout(stabilizationTimeout);
  if (httpServer) httpServer.close();
  if (mongoClient) await mongoClient.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function startBot() {
  initializeOnce();
  await connectWhatsApp();
}

startBot();