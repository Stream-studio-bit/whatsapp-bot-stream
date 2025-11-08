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
import keepAlive from './keep-alive.js';
import { startServer } from './server.js';
import { validateGroqConfig } from './config/groq.js';
import { log } from './utils/helpers.js';
import { printStats, cleanExpiredBlocks } from './services/database.js';
import { processMessage } from './controllers/messageHandler.js';
import { showStats, listBlockedUsers, listAllUsers } from './controllers/commandHandler.js';

dotenv.config();

// ============================================
// CONFIGURAÇÕES
// ============================================
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_ID = process.env.SESSION_ID || 'stream-studio-bot';
const BOT_NAME = process.env.BOT_NAME || 'Assistente Stream Studio';
const OWNER_NAME = process.env.OWNER_NAME || 'Roberto';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000;

// ============================================
// 🔥 ESTADO GLOBAL PERSISTENTE
// ============================================
let mongoClient = null;
let globalSock = null;
let reconnectAttempts = 0;
let isConnecting = false;
let isInitialized = false;

// 🔥 CRITICAL: msgRetryCounterCache FORA do socket (previne loop)
const msgRetryCounterCache = new NodeCache();

// Cache de mensagens processadas (anti-duplicação)
const processedMessages = new Set();
const MESSAGE_CACHE_LIMIT = 1000;

// 🔥 CRITICAL: welcomeSent GLOBAL (não reseta em reconexões)
const welcomeSent = new Map();

// Cleanup interval
let cleanupInterval = null;

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
  console.log('');
}

// ============================================
// INICIALIZAÇÃO ÚNICA
// ============================================
function initializeOnce() {
  if (isInitialized) return;
  
  showBanner();
  
  if (process.env.RENDER === 'true') {
    log('INFO', '🔧 Iniciando servidor HTTP...');
    startServer();
    keepAlive();
  }
  
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
// 🔥 getMessage - CORREÇÃO CRÍTICA
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
      
      // Limpa cache de mensagens
      if (processedMessages.size > MESSAGE_CACHE_LIMIT) {
        const excess = processedMessages.size - MESSAGE_CACHE_LIMIT;
        const iterator = processedMessages.values();
        for (let i = 0; i < excess; i++) {
          const { value } = iterator.next();
          if (value) processedMessages.delete(value);
        }
        log('INFO', `🧹 Cache limpo: ${excess} mensagens`);
      }
      
      // 🔥 Limpa welcomeSent após 1 hora
      const now = Date.now();
      for (const [jid, timestamp] of welcomeSent.entries()) {
        if (now - timestamp > 3600000) {
          welcomeSent.delete(jid);
        }
      }
    } catch (error) {
      log('WARNING', `⚠️ Erro no cleanup: ${error.message}`);
    }
  }, 5 * 60 * 1000); // 5 minutos
  
  log('SUCCESS', '✅ Tarefas periódicas iniciadas');
}

// ============================================
// 🔥 EXPORTA welcomeSent PARA messageHandler
// ============================================
export { welcomeSent };

// ============================================
// 🔥 CONEXÃO WHATSAPP - SEM LOOP INFINITO
// ============================================
async function connectWhatsApp() {
  // Previne múltiplas conexões simultâneas
  if (isConnecting) {
    log('WARNING', '⚠️ Conexão já em andamento...');
    return null;
  }
  
  // 🔥 CORREÇÃO: Se socket ativo, não reconecta
  if (globalSock && globalSock.user) {
    log('WARNING', '⚠️ Socket já conectado - ignorando nova conexão');
    return globalSock;
  }
  
  // Limite de tentativas
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('ERROR', `❌ Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas atingido`);
    log('INFO', '⏸️ Aguarde 5 minutos para nova tentativa...');
    setTimeout(() => {
      reconnectAttempts = 0;
      log('INFO', '🔄 Contador resetado. Você pode reconectar agora.');
    }, 5 * 60 * 1000);
    return null;
  }

  isConnecting = true;
  reconnectAttempts++;

  try {
    log('INFO', `🔄 Conectando... (Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    // Limpa socket anterior
    if (globalSock) {
      try {
        globalSock.ev.removeAllListeners();
        globalSock.ws?.removeAllListeners?.();
        globalSock.ws?.terminate?.();
      } catch (e) { /* ignore */ }
      globalSock = null;
    }

    // Conecta MongoDB
    if (!mongoClient) {
      log('INFO', '🔗 Conectando ao MongoDB...');
      mongoClient = new MongoClient(MONGODB_URI, { 
        useNewUrlParser: true, 
        useUnifiedTopology: true 
      });
      await mongoClient.connect();
      log('SUCCESS', '✅ MongoDB conectado!');
    }

    // Versão do Baileys
    const { version } = await fetchLatestBaileysVersion()
      .catch(() => ({ version: [2, 2320, 0] }));
    log('SUCCESS', `✅ Baileys v${version.join('.')}`);

    // Auth state
    const db = mongoClient.db('baileys_auth');
    const collection = db.collection(SESSION_ID);
    const { state, saveCreds, clearAll } = await useMongoDBAuthState(collection);

    // 🔥 Cria socket COM makeCacheableSignalKeyStore
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        // 🔥 CRITICAL: makeCacheableSignalKeyStore previne descriptografia lenta
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser: ['Stream Studio Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      getMessage: getMessageFromDB,
      // 🔥 CRITICAL: msgRetryCounterCache previne loop de descriptografia
      msgRetryCounterCache,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      emitOwnEvents: false,
      syncFullHistory: false
    });

    globalSock = sock;

    // ============================================
    // 🔥 EVENTO: CREDENCIAIS
    // ============================================
    sock.ev.on('creds.update', saveCreds);

    // ============================================
    // 🔥 EVENTO: CONEXÃO - TRATAMENTO CORRETO
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

        // 🔥 CRITICAL: Trata TODOS os DisconnectReason corretamente
        const shouldLogout = statusCode === DisconnectReason.loggedOut;
        const shouldRestart = statusCode === DisconnectReason.restartRequired;
        const isBadSession = statusCode === DisconnectReason.badSession;
        const isTimedOut = statusCode === DisconnectReason.timedOut;
        const isLoginTimeout = statusCode === 440; // 🔥 Erro 440 = Login Timeout

        // LOG do motivo da desconexão
        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', `🔍 Desconexão: statusCode=${statusCode}`);
        }

        // CASO 1: Logout - NÃO reconecta
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

        // 🔥 CASO 2: Erro 440 (Login Timeout) - NÃO RECONECTA
        // Issue #502: Desconexão temporária do WhatsApp, se resolve sozinha
        if (isLoginTimeout) {
          log('WARNING', '⚠️ Login Timeout (440) detectado - ignorando (desconexão temporária)');
          isConnecting = false;
          return; // NÃO reconecta
        }

        // CASO 3: restartRequired - Reconecta com delay adequado
        if (shouldRestart) {
          log('WARNING', '⚠️ Restart necessário - reconectando...');
          
          // 🔥 CORREÇÃO: Limpa socket anterior antes de reconectar
          if (globalSock) {
            try {
              globalSock.end();
            } catch (e) {
              // Ignora erros de limpeza
            }
            globalSock = null;
          }
          
          isConnecting = false;
          reconnectAttempts = 0;
          
          // 🔥 CORREÇÃO: Aguarda 5s para WhatsApp processar desconexão anterior
          setTimeout(() => {
            connectWhatsApp();
          }, 5000); // Aumentado de 1s para 5s
          return;
        }

        // CASO 4: badSession - Limpa credenciais e reconecta
        if (isBadSession) {
          log('WARNING', '⚠️ Sessão inválida - limpando e reconectando...');
          try {
            await clearAll();
          } catch (e) {
            log('ERROR', `❌ Erro ao limpar sessão: ${e.message}`);
          }
          
          isConnecting = false;
          reconnectAttempts = 0;
          
          setTimeout(() => {
            connectWhatsApp();
          }, 2000);
          return;
        }

        // CASO 5: timedOut - Aguarda mais tempo
        if (isTimedOut) {
          log('WARNING', '⚠️ Timeout - aguardando...');
          isConnecting = false;
          
          setTimeout(() => {
            connectWhatsApp();
          }, 10000);
          return;
        }

        // CASO 6: Outras desconexões - Reconexão com delay padrão
        log('WARNING', `⚠️ Conexão fechada (código ${statusCode || 'desconhecido'}) - reconectando...`);
        isConnecting = false;
        
        setTimeout(() => {
          connectWhatsApp();
        }, RECONNECT_DELAY);
        
        return;
      }

      if (connection === 'open') {
        isConnecting = false;
        reconnectAttempts = 0;

        log('SUCCESS', '✅ Conectado ao WhatsApp!');
        console.log('\n🎉 ┌────────────────────────────────────────────┐');
        console.log('🎉 BOT ONLINE E FUNCIONANDO!');
        console.log('🎉 └────────────────────────────────────────────┘\n');

        startPeriodicTasks();
        printStats();

        console.log('📋 COMANDOS DISPONÍVEIS:');
        console.log(`   • ${process.env.COMMAND_ASSUME || '/assumir'} - Assumir atendimento`);
        console.log(`   • ${process.env.COMMAND_RELEASE || '/liberar'} - Liberar bot\n`);
        
        console.log('🔧 COMANDOS NO CONSOLE:');
        console.log('   Digite "stats" para estatísticas');
        console.log('   Digite "blocked" para usuários bloqueados');
        console.log('   Digite "users" para todos os usuários\n');
        
        return;
      }
    });

    // ============================================
    // 🔥 EVENTO: MENSAGENS
    // ============================================
    sock.ev.on('messages.upsert', async (m) => {
      const { messages, type } = m;
      if (type !== 'notify') return;

      for (const message of messages) {
        try {
          if (!message.message) continue;

          const messageId = message.key.id;
          
          // Anti-duplicação
          if (processedMessages.has(messageId)) {
            if (process.env.DEBUG_MODE === 'true') {
              log('INFO', '📍 Mensagem duplicada ignorada');
            }
            continue;
          }
          
          processedMessages.add(messageId);

          // 🔥 Salva mensagem no MongoDB
          await saveMessageToDB(message);

          // 🔥 Processa TODAS as mensagens (incluindo fromMe)
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
    log('ERROR', `❌ Erro ao conectar: ${error.message}`);
    
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }

    // Reconexão com delay
    setTimeout(() => {
      connectWhatsApp();
    }, RECONNECT_DELAY);

    return null;
  }
}

// ============================================
// COMANDOS CONSOLE
// ============================================
function setupConsoleCommands() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ''
  });

  rl.on('line', (input) => {
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
      case 'help':
        console.log('\n📋 COMANDOS DISPONÍVEIS:');
        console.log('   stats   - Estatísticas do bot');
        console.log('   blocked - Usuários em atendimento manual');
        console.log('   users   - Todos os usuários');
        console.log('   help    - Esta ajuda');
        console.log('   clear   - Limpa console\n');
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
    setTimeout(() => connectWhatsApp(), RECONNECT_DELAY);
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