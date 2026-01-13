import makeWASocket, { 
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';

import { createRequire } from 'module';
import { useSupabaseAuthState } from './services/supabaseAuthState.js';

const require = createRequire(import.meta.url);
const { validateGroqConfig } = require('./config/groq.js');

dotenv.config();

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const CONFIG = {
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  },
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
let supabase = null;
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
  console.log(`🌐 Platform: Docker + Supabase\n`);
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
  // Log inicial
  log('INFO', `🔎 Analisando: ${JSON.stringify({
    remoteJid: msg.key?.remoteJid,
    fromMe: msg.key?.fromMe,
    hasMessage: !!msg.message,
    msgId: msg.key?.id
  })}`);
  
  if (!msg?.key?.remoteJid) {
    log('WARNING', '❌ Sem remoteJid');
    return false;
  }
  
  const remoteJid = msg.key.remoteJid;
  
  if (remoteJid === 'status@broadcast') {
    log('INFO', '⭐️ Status broadcast ignorado');
    return false;
  }
  
  // Ignora grupos
  if (remoteJid.endsWith('@g.us')) {
    log('INFO', '⭐️ Mensagem de grupo ignorada');
    return false;
  }
  
  // Ignora newsletters/canais
  if (remoteJid.endsWith('@newsletter')) {
    log('INFO', '⭐️ Newsletter ignorado');
    return false;
  }
  
  // Aceita apenas conversas individuais (@s.whatsapp.net) ou IDs válidos
  const isValidChat = remoteJid.endsWith('@s.whatsapp.net') || 
                     remoteJid.endsWith('@lid') ||
                     /^\d+@s\.whatsapp\.net$/.test(remoteJid);
  
  if (!isValidChat) {
    log('WARNING', `❌ RemoteJid inválido: ${remoteJid}`);
    return false;
  }
  
  if (msg.key.fromMe) {
    log('INFO', '⭐️ Mensagem própria ignorada');
    return false;
  }
  
  if (!msg.message) {
    log('WARNING', '❌ Sem conteúdo de mensagem');
    return false;
  }
  
  if (msg.message.reactionMessage) {
    log('INFO', '⭐️ Reação ignorada');
    return false;
  }
  
  if (msg.message.protocolMessage) {
    log('INFO', '⭐️ Mensagem de protocolo ignorada');
    return false;
  }
  
  const msgId = msg.key.id;
  if (processedMsgs.has(msgId)) {
    log('WARNING', '⭐️ Mensagem já processada');
    return false;
  }
  
  if (!isRecentMessage(msg)) {
    log('INFO', '⭐️ Mensagem antiga ignorada');
    return false;
  }
  
  processedMsgs.add(msgId);
  
  // Limpa cache se muito grande
  if (processedMsgs.size > 1000) {
    const toDelete = Array.from(processedMsgs).slice(0, 500);
    toDelete.forEach(id => processedMsgs.delete(id));
    log('INFO', '🗑️ Cache de mensagens limpo');
  }
  
  log('SUCCESS', '✅ Mensagem válida para processamento!');
  return true;
}

async function handleMessage(msg) {
  log('INFO', `🔍 Verificando msg | ID: ${msg.key.id}`);
  
  if (!shouldProcessMessage(msg)) {
    log('WARNING', '⚠️ Mensagem filtrada por shouldProcessMessage');
    return;
  }
  
  log('SUCCESS', '✅ Mensagem aprovada! Enviando para processMessage...');
  
  try {
    await processMessage(sock, msg);
    log('SUCCESS', '✅ Mensagem processada com sucesso!');
  } catch (err) {
    log('ERROR', `❌ Erro em processMessage: ${err.message}`);
    if (process.env.DEBUG_MODE === 'true') {
      console.error(err);
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
    }, 15 * 60 * 1000);
    return;
  }

  isConnecting = true;
  reconnectAttempts++;

  try {
    log('INFO', `🔄 Conectando (${reconnectAttempts}/${CONFIG.maxReconnects})...`);

    // Conecta Supabase
    if (!supabase) {
      supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
      log('SUCCESS', '✅ Supabase conectado');
    }

    // Busca versão do Baileys
    let version;
    try {
      const versionData = await fetchLatestBaileysVersion();
      version = versionData.version;
      log('SUCCESS', `✅ Baileys v${version.join('.')}`);
    } catch (err) {
      version = [2, 3000, 1015901307];
      log('WARNING', '⚠️ Usando versão fixa do Baileys');
    }

    // Auth state
    const { state, saveCreds, clearAll } = await useSupabaseAuthState(
      supabase,
      CONFIG.sessionId
    );

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
      generateHighQualityLinkPreview: true,
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

        log('WARNING', `⚠️ Desconectado (código: ${statusCode || 'desconhecido'})`);

        // Logout
        if (statusCode === DisconnectReason.loggedOut) {
          log('ERROR', '❌ Logout detectado - limpando sessão');
          await clearAll();
          process.exit(0);
          return;
        }

        // Credenciais inválidas
        if (statusCode === 401 || statusCode === 405) {
          log('ERROR', `❌ Erro ${statusCode}: Sessão inválida - limpando...`);
          await clearAll();
          reconnectAttempts = 0;
          isConnecting = false;
          setTimeout(() => connectWhatsApp(), 3000);
          return;
        }

        // Reconecta
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
      log('INFO', `📨 Evento messages.upsert | Tipo: ${m.type} | Msgs: ${m.messages.length}`);
      
      if (m.type !== 'notify') {
        log('WARNING', `⚠️ Tipo ignorado: ${m.type}`);
        return;
      }
      
      for (const msg of m.messages) {
        try {
          log('INFO', `📥 Processando msg de: ${msg.key.remoteJid}`);
          await handleMessage(msg);
        } catch (err) {
          log('ERROR', `❌ Erro ao processar msg: ${err.message}`);
        }
      }
    });

    isConnecting = false;

  } catch (error) {
    isConnecting = false;
    log('ERROR', `❌ Erro na conexão: ${error.message}`);
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
        if (supabase) {
          try {
            const { error } = await supabase.storage
              .from('whatsapp-sessions')
              .remove([`${CONFIG.sessionId}/session.json`]);
            
            if (error) throw error;
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

  if (sock) {
    sock.ws?.close();
    sock = null;
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

    if (!CONFIG.supabase.url || !CONFIG.supabase.anonKey) {
      console.error('❌ Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env!');
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