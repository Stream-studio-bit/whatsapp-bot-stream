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
  reconnectDelay: 5000,
  // ✅ NOVO: Força limpeza de sessão
  forceNewSession: process.env.FORCE_NEW_SESSION === 'true'
};

// ==========================================
// ESTADO GLOBAL
// ==========================================

let sock = null;
let supabase = null;
let httpServer = null;
let qrCode = null;
let qrCodeExpiry = null;
let reconnectAttempts = 0;
let isConnecting = false;
let connectionState = 'disconnected'; // ✅ NOVO: Rastreia estado real

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
// SERVIDOR HTTP + QR CODE
// ==========================================

function setupServer() {
  if (httpServer) return;

  const app = express();

  app.get('/qr', async (req, res) => {
    // Bot conectado
    if (sock?.user && connectionState === 'open') {
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
              <p style="color:#888;margin-top:20px;">O bot está online e funcionando.</p>
              <div style="margin-top:30px;">
                <a href="/clearsession" style="background:#dc3545;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">🗑️ Limpar Sessão</a>
              </div>
            </div>
          </body>
        </html>
      `);
    }

    // QR Code válido disponível
    if (qrCode && (!qrCodeExpiry || Date.now() < qrCodeExpiry)) {
      try {
        const qrImage = await QRCode.toDataURL(qrCode);
        const timeLeft = qrCodeExpiry ? Math.max(0, Math.floor((qrCodeExpiry - Date.now()) / 1000)) : 60;
        
        return res.send(`
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
                    <div id="progress" style="background:#25D366;height:100%;width:${(timeLeft/60)*100}%;transition:width 1s linear;"></div>
                  </div>
                </div>
                <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
                <div style="text-align:left;padding:20px;background:#f9f9f9;border-radius:8px;">
                  <h3 style="margin-top:0;color:#333;">📋 Instruções:</h3>
                  <ol style="color:#666;line-height:1.8;">
                    <li>Abra o <strong>WhatsApp</strong> no celular</li>
                    <li>Toque em <strong>Menu (⋮)</strong> → <strong>Aparelhos conectados</strong></li>
                    <li>Toque em <strong>Conectar um aparelho</strong></li>
                    <li>Aponte a câmera para este QR Code</li>
                  </ol>
                </div>
                <p style="color:#888;font-size:14px;margin-top:20px;">Página atualiza automaticamente</p>
              </div>
              <script>
                let timeLeft = ${timeLeft};
                const timer = document.getElementById('timer');
                const progress = document.getElementById('progress');
                
                const interval = setInterval(() => {
                  timeLeft--;
                  if (timeLeft < 0) {
                    clearInterval(interval);
                    location.reload();
                    return;
                  }
                  timer.textContent = timeLeft + 's';
                  progress.style.width = ((timeLeft / 60) * 100) + '%';
                }, 1000);
                
                setTimeout(() => location.reload(), 5000);
              </script>
            </body>
          </html>
        `);
      } catch (error) {
        logger.error('❌ Erro ao gerar QR Code:', error);
      }
    }

    // Aguardando QR Code
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
            <p style="color:#555;">Estado: <strong>${connectionState}</strong></p>
            <p style="color:#666;font-size:14px;">O QR Code aparecerá em instantes...</p>
            <div style="margin-top:30px;">
              <a href="/clearsession" style="background:#dc3545;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">🗑️ Limpar Sessão</a>
            </div>
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
  });

  // ✅ NOVO: Endpoint para limpar sessão via navegador
  app.get('/clearsession', async (req, res) => {
    try {
      logger.info('🗑️ Limpando sessão via web...');
      
      if (sock) {
        try {
          await sock.logout();
        } catch (e) {
          logger.warn('Erro ao fazer logout:', e.message);
        }
        sock.ws?.close();
        sock = null;
      }

      qrCode = null;
      qrCodeExpiry = null;
      connectionState = 'disconnected';

      if (supabase) {
        try {
          // Limpa do Supabase
          const { error } = await supabase.storage
            .from('whatsapp-sessions')
            .remove([`${CONFIG.sessionId}/creds.json`]);
          
          if (!error) {
            logger.info('✅ Sessão limpa do Supabase');
          }
        } catch (e) {
          logger.warn('Erro ao limpar Supabase:', e.message);
        }
      }

      res.send(`
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sessão Limpa</title>
          </head>
          <body style="font-family:Arial;text-align:center;padding:50px;background:#f0f0f0;">
            <div style="background:white;padding:40px;border-radius:15px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;margin:0 auto;">
              <h1 style="color:#25D366;">✅ Sessão Limpa!</h1>
              <p style="color:#555;">A sessão foi removida com sucesso.</p>
              <p style="color:#666;font-size:14px;margin-top:20px;">O bot está reconectando...</p>
              <a href="/qr" style="background:#25D366;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:20px;">📱 Ver QR Code</a>
            </div>
            <script>
              setTimeout(() => {
                window.location.href = '/qr';
              }, 3000);
            </script>
          </body>
        </html>
      `);

      // Reconecta após 2 segundos
      setTimeout(() => {
        reconnectAttempts = 0;
        connectWhatsApp();
      }, 2000);

    } catch (error) {
      logger.error('Erro ao limpar sessão:', error);
      res.status(500).send('Erro ao limpar sessão');
    }
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'online',
      connected: connectionState === 'open',
      connectionState,
      uptime: Math.floor(process.uptime()),
      hasQrCode: !!qrCode,
      qrCodeValid: !!(qrCode && (!qrCodeExpiry || Date.now() < qrCodeExpiry))
    });
  });

  app.get('/', (req, res) => {
    const status = connectionState === 'open' ? '✅ Online' : '🔴 Offline';
    const stateText = connectionState;
    const link = connectionState !== 'open' ? '<br><br><a href="/qr" style="background:#25D366;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:10px;">📱 Ver QR Code</a>' : '';
    
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
            <p style="font-size:20px;margin:20px 0;">Status: <strong style="color:${connectionState === 'open' ? '#25D366' : '#f44'}">${status}</strong></p>
            <p style="font-size:14px;color:#888;">Estado: ${stateText}</p>
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
  if (!msg?.key?.remoteJid) return false;
  
  const remoteJid = msg.key.remoteJid;
  
  if (remoteJid === 'status@broadcast') return false;
  if (remoteJid.endsWith('@g.us')) return false;
  if (remoteJid.endsWith('@newsletter')) return false;
  
  const isValidChat = remoteJid.endsWith('@s.whatsapp.net') || 
                     remoteJid.endsWith('@lid') ||
                     /^\d+@s\.whatsapp\.net$/.test(remoteJid);
  
  if (!isValidChat) return false;
  if (msg.key.fromMe) return false;
  if (!msg.message) return false;
  if (msg.message.reactionMessage) return false;
  if (msg.message.protocolMessage) return false;
  
  const msgId = msg.key.id;
  if (processedMsgs.has(msgId)) return false;
  if (!isRecentMessage(msg)) return false;
  
  processedMsgs.add(msgId);
  
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
    logger.error(`❌ Erro em processMessage: ${err.message}`);
  }
}

// ==========================================
// CONEXÃO WHATSAPP
// ==========================================

async function connectWhatsApp() {
  if (isConnecting) {
    logger.warn('⚠️ Conexão já em andamento');
    return;
  }

  if (sock?.user && connectionState === 'open') {
    logger.warn('⚠️ Já conectado');
    return;
  }

  if (reconnectAttempts >= CONFIG.maxReconnects) {
    logger.error(`❌ Máximo de ${CONFIG.maxReconnects} tentativas atingido`);
    setTimeout(() => {
      reconnectAttempts = 0;
      logger.info('🔄 Contadores resetados - tentando novamente');
      connectWhatsApp();
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

    // ✅ Busca versão mais recente
    let version;
    try {
      const versionData = await fetchLatestBaileysVersion();
      version = versionData.version;
      logger.info(`✅ Baileys v${version.join('.')}`);
    } catch (err) {
      logger.warn('⚠️ Erro ao buscar versão, usando fallback');
      version = undefined; // Deixa o Baileys escolher
    }

    // ✅ Limpa sessão se forçado
    if (CONFIG.forceNewSession || reconnectAttempts === 1) {
      logger.info('🗑️ Verificando sessão existente...');
      try {
        const { data } = await supabase.storage
          .from('whatsapp-sessions')
          .list(CONFIG.sessionId);
        
        if (data && data.length > 0) {
          logger.warn('⚠️ Sessão antiga encontrada - limpando...');
          await supabase.storage
            .from('whatsapp-sessions')
            .remove([`${CONFIG.sessionId}/creds.json`]);
          logger.info('✅ Sessão antiga removida');
        }
      } catch (e) {
        logger.warn('Erro ao verificar sessão:', e.message);
      }
    }

    const { state, saveCreds, clearAll } = await useSupabaseAuthState(
      supabase,
      CONFIG.sessionId
    );

    // ✅ Verifica se tem credenciais válidas
    const hasCreds = state?.creds?.me?.id;
    if (hasCreds) {
      logger.info('📂 Credenciais encontradas - tentando conectar automaticamente');
    } else {
      logger.info('🆕 Nenhuma credencial - gerando QR Code');
    }

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

      logger.info(`🔄 connection.update: ${JSON.stringify({ connection, hasQr: !!qr })}`);

      // ✅ QR Code gerado
      if (qr) {
        connectionState = 'qr';
        qrCode = qr;
        qrCodeExpiry = Date.now() + 60000;
        
        logger.info('📱 QR Code GERADO com sucesso!');
        console.log('\n┌─────────────────────────────────────┐');
        console.log('│  📱 NOVO QR CODE DISPONÍVEL!       │');
        console.log('└─────────────────────────────────────┘');
        console.log(`🔗 Acesse: https://whatsapp-bot-stream.onrender.com/qr`);
        console.log(`⏰ Válido por: 60 segundos\n`);
      }

      // Conectando
      if (connection === 'connecting') {
        connectionState = 'connecting';
        logger.info('🔄 Conectando ao WhatsApp...');
      }

      // Desconectado
      if (connection === 'close') {
        connectionState = 'close';
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : null;

        logger.warn(`⚠️ Desconectado (código: ${statusCode || 'desconhecido'})`);

        // Logout - limpa tudo
        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('❌ Logout detectado - limpando sessão');
          qrCode = null;
          qrCodeExpiry = null;
          await clearAll();
          
          // Aguarda antes de reconectar
          setTimeout(() => {
            reconnectAttempts = 0;
            isConnecting = false;
            connectWhatsApp();
          }, 3000);
          return;
        }

        // Erro 401/405 - sessão inválida
        if (statusCode === 401 || statusCode === 405) {
          logger.error(`❌ Erro ${statusCode}: Sessão inválida - limpando`);
          qrCode = null;
          qrCodeExpiry = null;
          
          try {
            await clearAll();
            logger.info('✅ Sessão limpa');
          } catch (e) {
            logger.warn('Erro ao limpar:', e.message);
          }
          
          reconnectAttempts = 0;
          isConnecting = false;
          
          setTimeout(() => connectWhatsApp(), 3000);
          return;
        }

        // Outros erros - reconecta
        qrCode = null;
        qrCodeExpiry = null;
        isConnecting = false;
        setTimeout(() => connectWhatsApp(), CONFIG.reconnectDelay);
        return;
      }

      // ✅ Conectado com sucesso
      if (connection === 'open') {
        connectionState = 'open';
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
      if (m.type !== 'notify') return;
      
      for (const msg of m.messages) {
        try {
          await handleMessage(msg);
        } catch (err) {
          logger.error(`❌ Erro ao processar msg: ${err.message}`);
        }
      }
    });

    isConnecting = false;

  } catch (error) {
    isConnecting = false;
    connectionState = 'error';
    logger.error(`❌ Erro na conexão: ${error.message}`);
    
    // Limpa QR Code em caso de erro
    qrCode = null;
    qrCodeExpiry = null;
    
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
  logger.info(`📊 Conectado: ${connectionState === 'open'}`);
  logger.info(`📊 Estado: ${connectionState}`);
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
        connectionState = 'disconnected';
        setTimeout(() => connectWhatsApp(), 1000);
        break;

      case 'clear':
        console.clear();
        showBanner();
        break;

      case 'clearsession':
        logger.info('🗑️ Limpando sessão...');
        if (sock) {
          try {
            await sock.logout();
          } catch (e) {}
          sock.ws?.close();
          sock = null;
        }
        
        if (supabase) {
          try {
            await supabase.storage
              .from('whatsapp-sessions')
              .remove([`${CONFIG.sessionId}/creds.json`]);
            logger.info('✅ Sessão limpa! Reiniciando...');
          } catch (err) {
            logger.error(`Erro: ${err.message}`);
          }
        }
        
        qrCode = null;
        qrCodeExpiry = null;
        connectionState = 'disconnected';
        reconnectAttempts = 0;
        
        setTimeout(() => connectWhatsApp(), 2000);
        break;

      case 'status':
        console.log('\n📊 STATUS:');
        console.log(`   Conectado: ${connectionState === 'open'}`);
        console.log(`   Estado: ${connectionState}`);
        console.log(`   Reconexões: ${reconnectAttempts}`);
        console.log(`   QR Code ativo: ${!!qrCode && (!qrCodeExpiry || Date.now() < qrCodeExpiry)}`);
        console.log(`   Mensagens processadas: ${processedMsgs.size}`);
        console.log(`   Uptime: ${Math.floor(process.uptime())}s\n`);
        break;

      case 'help':
        console.log('\n📋 COMANDOS:');
        console.log('   stats        - Estatísticas');
        console.log('   reconnect    - Reconectar');
        console.log('   clear        - Limpar tela');
        console.log('   clearsession - Limpar sessão');
        console.log('   status       - Status detalhado');
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