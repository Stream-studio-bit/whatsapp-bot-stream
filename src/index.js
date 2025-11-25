import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  initAuthCreds
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';
import { MongoClient } from 'mongodb';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';

import keepAlive from './keep-alive.js';
import { validateGroqConfig } from './config/groq.js';
import { log } from './utils/helpers.js';
import { printStats, cleanExpiredBlocks } from './services/database.js';
import { processMessage } from './controllers/messageHandler.js';

dotenv.config();

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const CONFIG = {
  mongodb: process.env.MONGODB_URI,
  sessionId: process.env.SESSION_ID || 'stream-studio-bot',
  botName: process.env.BOT_NAME || 'Assistente Stream Studio',
  ownerName: process.env.OWNER_NAME || 'Roberto',
  port: process.env.PORT || 3000,
  maxReconnects: 5,
  reconnectDelay: 5000
};

// ==========================================
// ESTADO GLOBAL
// ==========================================

let sock = null;
let mongoClient = null;
let httpServer = null;
let qrCode = null;
let reconnectAttempts = 0;
let isConnecting = false;

const msgRetryCache = new NodeCache();
const processedMsgs = new Set();
const BOT_START_TIME = Date.now();

// ==========================================
// BANNER
// ==========================================

function showBanner() {
  console.clear();
  console.log('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║   🤖 WHATSAPP BOT - STREAM STUDIO 🤖  ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m\n');
  console.log(`📱 Bot: ${CONFIG.botName}`);
  console.log(`👤 Owner: ${CONFIG.ownerName}`);
  console.log(`🌐 Platform: ${process.env.RENDER ? 'Render' : 'Local'}\n`);
}

// ==========================================
// MONGODB AUTH STATE
// ==========================================

async function useMongoDBAuthState(collection) {
  const readData = async (key) => {
    try {
      const doc = await collection.findOne({ _id: key });
      return doc ? JSON.parse(JSON.stringify(doc.value)) : null;
    } catch { return null; }
  };

  const writeData = async (key, value) => {
    try {
      await collection.replaceOne(
        { _id: key },
        { _id: key, value },
        { upsert: true }
      );
    } catch (e) {
      log('ERROR', `Erro ao salvar: ${e.message}`);
    }
  };

  const removeData = async (key) => {
    try {
      await collection.deleteOne({ _id: key });
    } catch {}
  };

  const clearAll = async () => {
    await collection.deleteMany({});
    log('SUCCESS', '✅ Sessão limpa');
  };

  const creds = await readData('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const val = await readData(`${type}-${id}`);
            if (val) data[id] = val;
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) await writeData(key, value);
              else await removeData(key);
            }
          }
        }
      }
    },
    saveCreds: () => writeData('creds', creds),
    clearAll
  };
}

// ==========================================
// SERVIDOR HTTP + QR CODE
// ==========================================

function setupServer() {
  if (httpServer) return;

  const app = express();

  app.get('/qr', async (req, res) => {
    if (sock?.user) {
      return res.send(`
        <html><body style="font-family:Arial;text-align:center;padding:50px;">
          <h1 style="color:#25D366;">✅ Bot Conectado!</h1>
          <p>Número: ${sock.user.id.split(':')[0]}</p>
        </body></html>
      `);
    }

    if (!qrCode) {
      return res.send(`
        <html><body style="font-family:Arial;text-align:center;padding:50px;">
          <h1>⏳ Aguardando QR Code...</h1>
          <script>setTimeout(() => location.reload(), 3000);</script>
        </body></html>
      `);
    }

    const qrImage = await QRCode.toDataURL(qrCode);
    res.send(`
      <html><body style="font-family:Arial;text-align:center;padding:20px;">
        <h1 style="color:#25D366;">📱 Escaneie o QR Code</h1>
        <img src="${qrImage}" style="border:3px solid #25D366;border-radius:10px;"/>
        <p>Expira em 60 segundos</p>
        <script>setTimeout(() => location.reload(), 5000);</script>
      </body></html>
    `);
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'online',
      connected: !!(sock?.user),
      uptime: Math.floor(process.uptime())
    });
  });

  app.get('/', (req, res) => {
    const status = sock?.user ? '✅ Online' : '🔴 Offline';
    const link = !sock?.user ? '<br><a href="/qr">📱 Ver QR Code</a>' : '';
    res.send(`<h1>${CONFIG.botName}</h1><p>Status: ${status}</p>${link}`);
  });

  httpServer = app.listen(CONFIG.port, () => {
    log('SUCCESS', `🌐 Servidor: http://localhost:${CONFIG.port}`);
  });
}
// ==========================================
// GERENCIAMENTO DE MENSAGENS
// ==========================================

function isRecentMessage(msg) {
  const timestamp = msg.messageTimestamp;
  if (!timestamp) return true;
  
  const msgTime = typeof timestamp === 'number' 
    ? (timestamp < 10000000000 ? timestamp * 1000 : timestamp)
    : timestamp.low * 1000;
  
  return msgTime >= BOT_START_TIME;
}

function shouldProcessMessage(msg) {
  if (!msg?.key?.remoteJid) return false;
  if (msg.key.remoteJid === 'status@broadcast') return false;
  if (msg.key.remoteJid?.endsWith('@g.us')) return false;
  if (!msg.key.remoteJid?.endsWith('@s.whatsapp.net')) return false;
  if (msg.key.fromMe) return false;
  if (!msg.message) return false;
  if (msg.message.reactionMessage) return false;
  if (msg.message.protocolMessage) return false;
  
  const msgId = msg.key.id;
  if (processedMsgs.has(msgId)) return false;
  
  if (!isRecentMessage(msg)) {
    log('INFO', '⏭️ Mensagem antiga ignorada');
    return false;
  }
  
  processedMsgs.add(msgId);
  
  // Limpa cache se muito grande
  if (processedMsgs.size > 1000) {
    const toDelete = Array.from(processedMsgs).slice(0, 500);
    toDelete.forEach(id => processedMsgs.delete(id));
  }
  
  return true;
}

async function handleMessage(msg) {
  if (!shouldProcessMessage(msg)) return;
  
  try {
    await processMessage(sock, msg);
  } catch (err) {
    if (!err.message?.includes('Connection')) {
      log('ERROR', `Erro: ${err.message}`);
    }
  }
}

// ==========================================
// CONEXÃO WHATSAPP
// ==========================================

async function connectWhatsApp() {
  if (isConnecting) {
    log('WARNING', '⚠️ Conexão em andamento...');
    return;
  }

  if (sock?.user) {
    log('WARNING', '⚠️ Já conectado');
    return;
  }

  if (reconnectAttempts >= CONFIG.maxReconnects) {
    log('ERROR', `❌ Máximo de ${CONFIG.maxReconnects} tentativas atingido`);
    setTimeout(() => {
      reconnectAttempts = 0;
      log('INFO', '🔄 Contadores resetados');
    }, 15 * 60 * 1000); // 15 minutos
    return;
  }

  isConnecting = true;
  reconnectAttempts++;

  try {
    log('INFO', `🔄 Conectando (${reconnectAttempts}/${CONFIG.maxReconnects})...`);

    // Conecta MongoDB
    if (!mongoClient) {
      mongoClient = new MongoClient(CONFIG.mongodb);
      await mongoClient.connect();
      log('SUCCESS', '✅ MongoDB conectado');
    }

    // Busca versão do Baileys (com fallback)
    let version;
    try {
      version = await fetchLatestBaileysVersion();
    } catch {
      version = [2, 3000, 1015901307]; // Versão estável fixa
      log('WARNING', '⚠️ Usando versão fixa do Baileys');
    }

    // Auth state
    const collection = mongoClient.db('baileys_auth').collection(CONFIG.sessionId);
    const { state, saveCreds, clearAll } = await useMongoDBAuthState(collection);

    // Cria socket
    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['Stream Studio Bot', 'Chrome', '1.0.0'],
      printQRInTerminal: false,
      msgRetryCounterCache: msgRetryCache,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      getMessage: async () => null
    });

    // ==========================================
    // EVENTOS
    // ==========================================

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code
      if (qr) {
        qrCode = qr;
        log('INFO', '📱 QR Code disponível em /qr');
        return;
      }

      // Desconexão
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : null;

        // Logout
        if (statusCode === DisconnectReason.loggedOut) {
          log('ERROR', '❌ Logout detectado');
          await clearAll();
          process.exit(0);
          return;
        }

        // Credenciais inválidas
        if (statusCode === 405) {
          log('ERROR', '❌ Erro 405: Limpando sessão...');
          await clearAll();
          reconnectAttempts = 0;
          isConnecting = false;
          setTimeout(() => connectWhatsApp(), 3000);
          return;
        }

        // Reconecta
        log('WARNING', `⚠️ Desconectado (${statusCode || 'desconhecido'})`);
        isConnecting = false;
        setTimeout(() => connectWhatsApp(), CONFIG.reconnectDelay);
        return;
      }

      // Conectado
      if (connection === 'open') {
        isConnecting = false;
        qrCode = null;
        reconnectAttempts = 0;

        log('SUCCESS', '✅ CONECTADO AO WHATSAPP!');
        console.log('\n🎉 ┌────────────────────────────────┐');
        console.log('🎉 │ BOT ONLINE E FUNCIONANDO!     │');
        console.log('🎉 └────────────────────────────────┘\n');

        printStats();
        startPeriodicTasks();
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      for (const msg of m.messages) {
        await handleMessage(msg);
      }
    });

    isConnecting = false;

  } catch (error) {
    isConnecting = false;
    log('ERROR', `❌ Erro: ${error.message}`);
    setTimeout(() => connectWhatsApp(), CONFIG.reconnectDelay);
  }
}

// ==========================================
// TAREFAS PERIÓDICAS
// ==========================================

function startPeriodicTasks() {
  // Limpa bloqueios expirados a cada 5 minutos
  setInterval(async () => {
    try {
      await cleanExpiredBlocks();
    } catch (err) {
      log('ERROR', `Erro ao limpar bloqueios: ${err.message}`);
    }
  }, 5 * 60 * 1000);
}
// ==========================================
// COMANDOS DO CONSOLE
// ==========================================

function setupConsoleCommands() {
  process.stdin.on('data', async (data) => {
    const cmd = data.toString().trim().toLowerCase();

    switch (cmd) {
      case 'stats':
        printStats();
        break;

      case 'reconnect':
        log('INFO', '🔄 Reconectando...');
        reconnectAttempts = 0;
        if (sock) {
          sock.ws?.close();
          sock = null;
        }
        setTimeout(() => connectWhatsApp(), 1000);
        break;

      case 'clear':
        console.clear();
        showBanner();
        break;

      case 'clearsession':
        if (mongoClient) {
          try {
            const db = mongoClient.db('baileys_auth');
            await db.collection(CONFIG.sessionId).deleteMany({});
            log('SUCCESS', '✅ Sessão limpa! Reinicie o bot.');
          } catch (err) {
            log('ERROR', `Erro: ${err.message}`);
          }
        }
        break;

      case 'status':
        console.log('\n📊 STATUS:');
        console.log(`   Conectado: ${!!(sock?.user)}`);
        console.log(`   Reconexões: ${reconnectAttempts}`);
        console.log(`   Mensagens processadas: ${processedMsgs.size}`);
        console.log(`   Uptime: ${Math.floor(process.uptime())}s\n`);
        break;

      case 'help':
        console.log('\n📋 COMANDOS:');
        console.log('   stats        - Estatísticas');
        console.log('   reconnect    - Reconectar');
        console.log('   clear        - Limpar tela');
        console.log('   clearsession - Limpar sessão');
        console.log('   status       - Status atual');
        console.log('   help         - Ajuda\n');
        break;

      default:
        if (cmd) console.log(`❌ Comando inválido: "${cmd}". Digite "help"\n`);
    }
  });
}

// ==========================================
// TRATAMENTO DE ERROS
// ==========================================

process.on('unhandledRejection', (err) => {
  if (process.env.DEBUG_MODE === 'true') {
    log('WARNING', `⚠️ Rejection: ${err?.message}`);
  }
});

process.on('uncaughtException', (err) => {
  log('ERROR', `❌ Exception: ${err?.message}`);
  if (String(err?.message || '').includes('Connection')) {
    log('INFO', '🔄 Erro de conexão - tentando reconectar...');
    setTimeout(() => connectWhatsApp(), CONFIG.reconnectDelay);
  } else {
    process.exit(1);
  }
});

// ==========================================
// SHUTDOWN GRACIOSO
// ==========================================

async function shutdown() {
  console.log('\n\n👋 Encerrando bot...');

  if (httpServer) {
    httpServer.close();
    log('INFO', '✅ Servidor HTTP encerrado');
  }

  if (mongoClient) {
    await mongoClient.close();
    log('INFO', '✅ MongoDB desconectado');
  }

  if (sock) {
    sock.ws?.close();
    log('INFO', '✅ Socket destruído');
  }

  log('SUCCESS', '👋 Bot encerrado com sucesso!');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function start() {
  try {
    showBanner();

    // Valida configurações
    if (!validateGroqConfig()) {
      console.error('❌ Configure GROQ_API_KEY no .env!');
      process.exit(1);
    }

    if (!CONFIG.mongodb) {
      console.error('❌ Configure MONGODB_URI no .env!');
      process.exit(1);
    }

    // Inicia serviços
    setupServer();
    setupConsoleCommands();
    keepAlive();

    log('INFO', '🚀 Iniciando conexão...');
    await connectWhatsApp();

    log('SUCCESS', '✅ Bot iniciado com sucesso!');

  } catch (error) {
    log('ERROR', `❌ Erro fatal: ${error.message}`);
    process.exit(1);
  }
}

// ==========================================
// INICIA O BOT
// ==========================================

console.log('\n🤖 ╔═══════════════════════════════════╗');
console.log('🤖 ║ INICIANDO WHATSAPP BOT              ║');
console.log('🤖 ╚═══════════════════════════════════╝\n');

start();