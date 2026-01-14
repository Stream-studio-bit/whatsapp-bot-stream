// Convertido para ES Modules
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

import { useSupabaseAuthState } from './services/supabaseAuthState.js';
import { validateGroqConfig } from './config/groq.js';
import { processMessage } from './controllers/messageController.js';
import { cleanExpiredBlocks } from './services/supportService.js';
import logger from './utils/logger.js';
import { keepAlive } from './utils/keepAlive.js';

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
let qrCodeExpiry = null; // ✅ NOVO: Controla expiração do QR
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
  console.log('\x1b[36m╔═══════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║   🤖 WHATSAPP BOT - STREAM STUDIO 🤖  ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════╝\x1b[0m\n');
  console.log(`📱 Bot: ${CONFIG.botName}`);
  console.log(`👤 Owner: ${CONFIG.ownerName}`);
  console.log(`🌐 Platform: Docker + Supabase\n`);
}

// ==========================================
// SERVIDOR HTTP + QR CODE (CORRIGIDO)
// ==========================================

function setupServer() {
  if (httpServer) return;

  const app = express();

  app.get('/qr', async (req, res) => {
    // ✅ Bot já conectado
    if (sock?.user) {
      return res.send(`
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bot Conectado</title>
          </head>
          <body style="font-family:Arial;text-align:center;padding:50px;background:#f0f0f0;">
            <div style="background:white;padding:40px;border-radius:15px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;margin:0 auto;">
              <h1 style="color:#25D366;">✅ Bot Conectado!</h1>
              <p style="font-size:18px;color:#555;">Número: <strong>${sock.user.id.split(':')[0]}</strong></p>
              <p style="color:#888;margin-top:20px;">O bot está online e funcionando corretamente.</p>
            </div>
          </body>
        </html>
      `);
    }

    // ✅ QR Code expirado ou não gerado ainda
    if (!qrCode || (qrCodeExpiry && Date.now() > qrCodeExpiry)) {
      return res.send(`
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Aguardando QR Code</title>
          </head>
          <body style="font-family:Arial;text-align:center;padding:50px;background:#f0f0f0;">
            <div style="background:white;padding:40px;border-radius:15px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;margin:0 auto;">
              <h1 style="color:#FFA500;">⏳ Aguardando QR Code...</h1>
              <div style="margin:30px 0;">
                <div class="spinner" style="border:4px solid #f3f3f3;border-top:4px solid #25D366;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;margin:0 auto;"></div>
              </div>
              <p style="color:#555;">O QR Code será gerado em instantes...</p>
              <p style="color:#888;font-size:14px;margin-top:20px;">Página será atualizada automaticamente</p>
            </div>
            <style>
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
            <script>setTimeout(() => location.reload(), 3000);</script>
          </body>
        </html>
      `);
    }

    // ✅ Exibe QR Code válido
    try {
      const qrImage = await QRCode.toDataURL(qrCode);
      const timeLeft = qrCodeExpiry ? Math.max(0, Math.floor((qrCodeExpiry - Date.now()) / 1000)) : 60;
      
      res.send(`
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Escanear QR Code</title>
          </head>
          <body style="font-family:Arial;text-align:center;padding:20px;background:#f0f0f0;">
            <div style="background:white;padding:40px;border-radius:15px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;margin:0 auto;">
              <h1 style="color:#25D366;">📱 Escaneie o QR Code</h1>
              <img src="${qrImage}" 
                   style="border:3px solid #25D366;border-radius:10px;max-width:100%;height:auto;margin:20px 0;"/>
              <div style="margin:20px 0;">
                <p style="font-size:18px;color:#555;">Tempo restante: <strong id="timer">${timeLeft}s</strong></p>
                <div style="background:#eee;height:8px;border-radius:4px;overflow:hidden;margin-top:10px;">
                  <div id="progress" style="background:#25D366;height:100%;width:100%;transition:width 1s linear;"></div>
                </div>
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
              <div style="text-align:left;padding:20px;background:#f9f9f9;border-radius:8px;">
                <h3 style="margin-top:0;color:#333;">📋 Instruções:</h3>
                <ol style="color:#666;line-height:1.8;">
                  <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                  <li>Toque em <strong>Menu</strong> (⋮) → <strong>Aparelhos conectados</strong></li>
                  <li>Toque em <strong>Conectar um aparelho</strong></li>
                  <li>Aponte seu celular para esta tela</li>
                </ol>
              </div>
              <p style="color:#888;font-size:14px;margin-top:20px;">Atualizando automaticamente...</p>
            </div>
            <script>
              let timeLeft = ${timeLeft};
              const timer = document.getElementById('timer');
              const progress = document.getElementById('progress');
              
              const interval = setInterval(() => {
                timeLeft--;
                timer.textContent = timeLeft + 's';
                progress.style.width = ((timeLeft / 60) * 100) + '%';
                
                if (timeLeft <= 0) {
                  clearInterval(interval);
                  location.reload();
                }
              }, 1000);
              
              // Atualiza a cada 5 segundos para pegar novo QR se necessário
              setTimeout(() => location.reload(), 5000);
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error('❌ Erro ao gerar QR Code:', error);
      res.send(`
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Erro</title>
          </head>
          <body style="font-family:Arial;text-align:center;padding:50px;background:#f0f0f0;">
            <div style="background:white;padding:40px;border-radius:15px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;margin:0 auto;">
              <h1 style="color:#f44;">❌ Erro ao gerar QR Code</h1>
              <p style="color:#666;">Tente novamente em alguns instantes...</p>
              <button onclick="location.reload()" 
                      style="background:#25D366;color:white;border:none;padding:12px 24px;border-radius:8px;font-size:16px;cursor:pointer;margin-top:20px;">
                🔄 Recarregar
              </button>
            </div>
            <script>setTimeout(() => location.reload(), 3000);</script>
          </body>
        </html>
      `);
    }
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'online',
      connected: !!(sock?.user),
      uptime: Math.floor(process.uptime()),
      hasQrCode: !!qrCode,
      qrCodeExpired: qrCodeExpiry ? Date.now() > qrCodeExpiry : false
    });
  });

  app.get('/', (req, res) => {
    const status = sock?.user ? '✅ Online' : '🔴 Offline';
    const link = !sock?.user ? '<br><br><a href="/qr" style="background:#25D366;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:10px;">📱 Ver QR Code</a>' : '';
    res.send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${CONFIG.botName}</title>
        </head>
        <body style="font-family:Arial;text-align:center;padding:50px;background:#f0f0f0;">
          <div style="background:white;padding:40px;border-radius:15px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;margin:0 auto;">
            <h1 style="color:#333;">${CONFIG.botName}</h1>
            <p style="font-size:20px;margin:20px 0;">Status: <strong style="color:${sock?.user ? '#25D366' : '#f44'}">${status}</strong></p>
            ${link}
          </div>
        </body>
      </html>
    `);
  });

  httpServer = app.listen(CONFIG.port, () => {
    logger.info(`🌐 Servidor: http://localhost:${CONFIG.port}`);
    logger.info(`📱 QR Code: http://localhost:${CONFIG.port}/qr`);
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
  logger.info(`🔎 Analisando: ${JSON.stringify({
    remoteJid: msg.key?.remoteJid,
    fromMe: msg.key?.fromMe,
    hasMessage: !!msg.message,
    msgId: msg.key?.id
  })}`);
  
  if (!msg?.key?.remoteJid) {
    logger.warn('❌ Sem remoteJid');
    return false;
  }
  
  const remoteJid = msg.key.remoteJid;
  
  if (remoteJid === 'status@broadcast') {
    logger.info('⭐️ Status broadcast ignorado');
    return false;
  }
  
  if (remoteJid.endsWith('@g.us')) {
    logger.info('⭐️ Mensagem de grupo ignorada');
    return false;
  }
  
  if (remoteJid.endsWith('@newsletter')) {
    logger.info('⭐️ Newsletter ignorado');
    return false;
  }
  
  const isValidChat = remoteJid.endsWith('@s.whatsapp.net') || 
                     remoteJid.endsWith('@lid') ||
                     /^\d+@s\.whatsapp\.net$/.test(remoteJid);
  
  if (!isValidChat) {
    logger.warn(`❌ RemoteJid inválido: ${remoteJid}`);
    return false;
  }
  
  if (msg.key.fromMe) {
    logger.info('⭐️ Mensagem própria ignorada');
    return false;
  }
  
  if (!msg.message) {
    logger.warn('❌ Sem conteúdo de mensagem');
    return false;
  }
  
  if (msg.message.reactionMessage) {
    logger.info('⭐️ Reação ignorada');
    return false;
  }
  
  if (msg.message.protocolMessage) {
    logger.info('⭐️ Mensagem de protocolo ignorada');
    return false;
  }
  
  const msgId = msg.key.id;
  if (processedMsgs.has(msgId)) {
    logger.warn('⭐️ Mensagem já processada');
    return false;
  }
  
  if (!isRecentMessage(msg)) {
    logger.info('⭐️ Mensagem antiga ignorada');
    return false;
  }
  
  processedMsgs.add(msgId);
  
  if (processedMsgs.size > 1000) {
    const toDelete = Array.from(processedMsgs).slice(0, 500);
    toDelete.forEach(id => processedMsgs.delete(id));
    logger.info('🗑️ Cache de mensagens limpo');
  }
  
  logger.info('✅ Mensagem válida para processamento!');
  return true;
}

async function handleMessage(msg) {
  logger.info(`📝 Verificando msg | ID: ${msg.key.id}`);
  
  if (!shouldProcessMessage(msg)) {
    logger.warn('⚠️ Mensagem filtrada por shouldProcessMessage');
    return;
  }
  
  logger.info('✅ Mensagem aprovada! Enviando para processMessage...');
  
  try {
    await processMessage(sock, msg);
    logger.info('✅ Mensagem processada com sucesso!');
  } catch (err) {
    logger.error(`❌ Erro em processMessage: ${err.message}`);
    if (process.env.DEBUG_MODE === 'true') {
      console.error(err);
    }
  }
}

// ==========================================
// CONEXÃO WHATSAPP (CORRIGIDO)
// ==========================================

async function connectWhatsApp() {
  if (isConnecting) {
    logger.warn('⚠️ Conexão em andamento...');
    return;
  }

  if (sock?.user) {
    logger.warn('⚠️ Já conectado');
    return;
  }

  if (reconnectAttempts >= CONFIG.maxReconnects) {
    logger.error(`❌ Máximo de ${CONFIG.maxReconnects} tentativas atingido`);
    setTimeout(() => {
      reconnectAttempts = 0;
      logger.info('🔄 Contadores resetados');
    }, 15 * 60 * 1000);
    return;
  }

  isConnecting = true;
  reconnectAttempts++;

  try {
    logger.info(`🔄 Conectando (${reconnectAttempts}/${CONFIG.maxReconnects})...`);

    if (!supabase) {
      supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
      logger.info('✅ Supabase conectado');
    }

    let version;
    try {
      const versionData = await fetchLatestBaileysVersion();
      version = versionData.version;
      logger.info(`✅ Baileys v${version.join('.')}`);
    } catch (err) {
      version = [2, 3000, 1015901307];
      logger.warn('⚠️ Usando versão fixa do Baileys');
    }

    const { state, saveCreds, clearAll } = await useSupabaseAuthState(
      supabase,
      CONFIG.sessionId
    );

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
    // EVENTOS (CORRIGIDO)
    // ==========================================

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ✅ QR Code - CORRIGIDO
      if (qr) {
        qrCode = qr;
        qrCodeExpiry = Date.now() + 60000; // Expira em 60 segundos
        
        logger.info('📱 QR Code gerado e disponível em /qr');
        console.log('\n┌─────────────────────────────────────┐');
        console.log('│  📱 NOVO QR CODE GERADO!           │');
        console.log('└─────────────────────────────────────┘');
        console.log(`🔗 Acesse: https://whatsapp-bot-stream.onrender.com/qr`);
        console.log(`⏰ Válido por: 60 segundos\n`);
        
        // ⚠️ NÃO FAZ RETURN AQUI - permite processar outros estados
      }

      // Desconexão
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : null;

        logger.warn(`⚠️ Desconectado (código: ${statusCode || 'desconhecido'})`);

        // Logout
        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('❌ Logout detectado - limpando sessão');
          qrCode = null;
          qrCodeExpiry = null;
          await clearAll();
          process.exit(0);
          return;
        }

        // Credenciais inválidas
        if (statusCode === 401 || statusCode === 405) {
          logger.error(`❌ Erro ${statusCode}: Sessão inválida - limpando...`);
          qrCode = null;
          qrCodeExpiry = null;
          await clearAll();
          reconnectAttempts = 0;
          isConnecting = false;
          setTimeout(() => connectWhatsApp(), 3000);
          return;
        }

        // Reconecta
        qrCode = null;
        qrCodeExpiry = null;
        isConnecting = false;
        setTimeout(() => connectWhatsApp(), CONFIG.reconnectDelay);
        return;
      }

      // ✅ Conectado
      if (connection === 'open') {
        isConnecting = false;
        qrCode = null;
        qrCodeExpiry = null;
        reconnectAttempts = 0;

        logger.info('✅ CONECTADO AO WHATSAPP!');
        console.log('\n🎉 ┌────────────────────────────────┐');
        console.log('🎉 │ BOT ONLINE E FUNCIONANDO!     │');
        console.log('🎉 └────────────────────────────────┘\n');

        printStats();
        startPeriodicTasks();
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      logger.info(`📨 Evento messages.upsert | Tipo: ${m.type} | Msgs: ${m.messages.length}`);
      
      if (m.type !== 'notify') {
        logger.warn(`⚠️ Tipo ignorado: ${m.type}`);
        return;
      }
      
      for (const msg of m.messages) {
        try {
          logger.info(`📥 Processando msg de: ${msg.key.remoteJid}`);
          await handleMessage(msg);
        } catch (err) {
          logger.error(`❌ Erro ao processar msg: ${err.message}`);
        }
      }
    });

    isConnecting = false;

  } catch (error) {
    isConnecting = false;
    logger.error(`❌ Erro na conexão: ${error.message}`);
    setTimeout(() => connectWhatsApp(), CONFIG.reconnectDelay);
  }
}

// ==========================================
// TAREFAS PERIÓDICAS
// ==========================================

function startPeriodicTasks() {
  setInterval(async () => {
    try {
      await cleanExpiredBlocks();
    } catch (err) {
      logger.error(`Erro ao limpar bloqueios: ${err.message}`);
    }
  }, 5 * 60 * 1000);
}

// ==========================================
// PRINT STATS
// ==========================================

function printStats() {
  logger.info('📊 ╔═══════════════════════════════════╗');
  logger.info('📊 ║  ESTATÍSTICAS DO BOT             ║');
  logger.info('📊 ╚═══════════════════════════════════╝');
  logger.info(`📊 Conectado: ${!!(sock?.user)}`);
  logger.info(`📊 Mensagens processadas: ${processedMsgs.size}`);
  logger.info(`📊 Uptime: ${Math.floor(process.uptime())}s`);
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
        logger.info('🔄 Reconectando...');
        reconnectAttempts = 0;
        if (sock) {
          sock.ws?.close();
          sock = null;
        }
        qrCode = null;
        qrCodeExpiry = null;
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
            logger.info('✅ Sessão limpa! Reinicie o bot.');
            qrCode = null;
            qrCodeExpiry = null;
          } catch (err) {
            logger.error(`Erro: ${err.message}`);
          }
        }
        break;

      case 'status':
        console.log('\n📊 STATUS:');
        console.log(`   Conectado: ${!!(sock?.user)}`);
        console.log(`   Reconexões: ${reconnectAttempts}`);
        console.log(`   Mensagens processadas: ${processedMsgs.size}`);
        console.log(`   Uptime: ${Math.floor(process.uptime())}s`);
        console.log(`   QR Code ativo: ${!!qrCode && (!qrCodeExpiry || Date.now() < qrCodeExpiry)}\n`);
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
    logger.warn(`⚠️ Rejection: ${err?.message}`);
  }
});

process.on('uncaughtException', (err) => {
  logger.error(`❌ Exception: ${err?.message}`);
  if (String(err?.message || '').includes('Connection')) {
    logger.info('🔄 Erro de conexão - tentando reconectar...');
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
    logger.info('✅ Servidor HTTP encerrado');
  }

  if (sock) {
    sock.ws?.close();
    sock = null;
    logger.info('✅ Socket destruído');
  }

  logger.info('👋 Bot encerrado com sucesso!');
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

    if (!validateGroqConfig()) {
      console.error('❌ Configure GROQ_API_KEY no .env!');
      process.exit(1);
    }

    if (!CONFIG.supabase.url || !CONFIG.supabase.anonKey) {
      console.error('❌ Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env!');
      process.exit(1);
    }

    setupServer();
    setupConsoleCommands();
    keepAlive();

    logger.info('🚀 Iniciando conexão...');
    await connectWhatsApp();

    logger.info('✅ Bot iniciado com sucesso!');

  } catch (error) {
    logger.error(`❌ Erro fatal: ${error.message}`);
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