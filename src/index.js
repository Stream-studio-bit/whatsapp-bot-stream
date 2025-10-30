import makeWASocket, { 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  BufferJSON,
  initAuthCreds,
  proto
} from '@whiskeysockets/baileys';
import { MongoClient } from 'mongodb';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import dotenv from 'dotenv';
import readline from 'readline';
import keepAlive from './keep-alive.js';
import { startServer } from './server.js';

// Importa configurações e serviços
import { validateGroqConfig } from './config/groq.js';
import { log } from './utils/helpers.js';
import { printStats } from './services/database.js';
import { processMessage } from './controllers/messageHandler.js';
import { removeUser, resetSystem, quickStatus, cleanupExpiredBlocks, backupData, showHelpMenu, showStats, showUserDetails, listBlockedUsers, listAllUsers } from './controllers/commandHandler.js';

dotenv.config();

/**
 * 🔥 FLAGS DE CONTROLE - PREVINE LOOP INFINITO
 */
let isServerInitialized = false;
let isKeepAliveInitialized = false;
let mongoClient = null;
let isConnecting = false; // 🔥 Previne múltiplas tentativas simultâneas
let reconnectAttempts = 0; // 🔥 Contador de tentativas
let reconnectScheduled = false; // 🔥 NOVO: Previne enfileiramento de reconexões
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * 🔥 Variável global para armazenar o socket
 */
let globalSock = null;

/**
 * CONFIGURAÇÕES GLOBAIS
 */
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_ID = process.env.SESSION_ID || 'stream-studio-bot';
const BOT_NAME = process.env.BOT_NAME || 'Assistente Stream Studio';
const OWNER_NAME = process.env.OWNER_NAME || 'Roberto';

/**
 * BANNER INICIAL
 */
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

/**
 * 🔥 INICIALIZAÇÃO ÚNICA - Roda apenas 1 vez
 */
function initializeOnce() {
  // Inicia servidor HTTP (apenas 1 vez)
  if (!isServerInitialized && process.env.RENDER) {
    log('INFO', '🔧 Iniciando servidor HTTP...');
    startServer();
    isServerInitialized = true;
  }
  
  // Inicia keep-alive (apenas 1 vez)
  if (!isKeepAliveInitialized && process.env.RENDER) {
    keepAlive();
    isKeepAliveInitialized = true;
  }
  
  // Valida configuração da Groq (apenas 1 vez)
  if (!validateGroqConfig()) {
    console.error('\n❌ Configure a API Key da Groq no arquivo .env antes de continuar!\n');
    process.exit(1);
  }
  
  // Valida MONGODB_URI (apenas 1 vez)
  if (!MONGODB_URI) {
    console.error('\n❌ Configure MONGODB_URI no arquivo .env antes de continuar!\n');
    process.exit(1);
  }
}

/**
 * Função para usar MongoDB como auth state
 */
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
    await collection.updateOne(
      { _id: id },
      { $set: { value: data } },
      { upsert: true }
    );
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
            let value = await readKey(`${type}-${id}`);
            if (value) {
              data[id] = value;
            }
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
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    clearAll: async () => {
      await collection.deleteMany({});
    }
  };
}

/**
 * 🔥 Verifica se conexão está estável
 */
function isConnectionStable(sock) {
  if (!sock) return false;
  
  // Verifica se o socket existe e se tem função ws
  if (!sock.ws || typeof sock.ws !== 'object') return false;
  
  // Verifica estado da conexão WebSocket
  const wsState = sock.ws.readyState;
  
  // WebSocket.OPEN === 1 (conexão aberta)
  return wsState === 1;
}

/**
 * 🔥 Aguarda conexão estável
 */
async function waitForConnection(sock, maxWaitMs = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    if (isConnectionStable(sock)) {
      return true;
    }
    
    // Aguarda 200ms antes de verificar novamente
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return false;
}

/**
 * 🔥 CRIA CONEXÃO DO WHATSAPP (pode ser chamada múltiplas vezes para reconexão)
 */
async function connectWhatsApp() {
  // 🔥 PROTEÇÃO: Previne múltiplas conexões simultâneas
  if (isConnecting) {
    log('WARNING', '⚠️  Já existe uma tentativa de conexão em andamento...');
    return null;
  }
  
  // 🔥 PROTEÇÃO: Limite de tentativas
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('ERROR', `❌ Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas de reconexão atingido`);
    log('INFO', '💡 Aguarde 2 minutos antes de tentar novamente ou reinicie o bot');
    
    // Reset contador após 2 minutos
    setTimeout(() => {
      reconnectAttempts = 0;
      log('INFO', '🔄 Contador de tentativas resetado. Você pode tentar reconectar.');
    }, 120000);
    
    return null;
  }
  
  // 🔥 CORREÇÃO: Incrementa apenas se não está conectando
  if (!isConnecting) {
    reconnectAttempts++;
    isConnecting = true;
  }
  
  try {
    log('INFO', `🔄 Iniciando conexão com WhatsApp (Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) - ${new Date().toLocaleTimeString()}`);
    
    // 🔥 CORREÇÃO 1: Fecha socket anterior antes de criar novo
    if (globalSock && globalSock.ws) {
      log('INFO', '🔁 Encerrando socket anterior de forma segura...');
      try {
        globalSock.ev.removeAllListeners?.();
      } catch (e) { /* ignore */ }
      try {
        await globalSock.logout?.();
      } catch (e) { /* ignore */ }
      try {
        globalSock.ws.close?.();
      } catch (e) { /* ignore */ }
      globalSock = null;
    }
    
    // Obtém versão mais recente do Baileys
    const { version, isLatest } = await fetchLatestBaileysVersion();
    log('SUCCESS', `✅ Baileys v${version.join('.')} ${isLatest ? '(latest)' : '(outdated)'}`);
    
    // Conecta ao MongoDB (reutiliza conexão se já existe)
    if (!mongoClient) {
      log('INFO', '🔗 Conectando ao MongoDB...');
      mongoClient = new MongoClient(MONGODB_URI);
      await mongoClient.connect();
      log('SUCCESS', '✅ MongoDB conectado com sucesso!');
    }
    
    const db = mongoClient.db('baileys_auth');
    const collection = db.collection(SESSION_ID);
    
    // Usa MongoDB para auth state
    const { state, saveCreds, clearAll } = await useMongoDBAuthState(collection);
    
    // Cria socket de conexão
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Stream Studio Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      // 🔥 Configurações de reconexão mais suaves
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      emitOwnEvents: false,
      syncFullHistory: false
    });
    
    // 🔥 CORREÇÃO: Armazena socket globalmente
    globalSock = sock;
    
    // ============================================
    // EVENTO: Atualização de credenciais
    // ============================================
    sock.ev.on('creds.update', saveCreds);
    
    // ============================================
    // EVENTO: Atualização de conexão
    // ============================================
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      // Mostra QR Code
      if (qr) {
        console.log('\n📱 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP BUSINESS');
        console.log('📱 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
      
      // Conexão fechada
      if (connection === 'close') {
        isConnecting = false;
        
        // 🔥 CORREÇÃO 2: Log detalhado de lastDisconnect para diagnóstico
        log('INFO', `🧾 lastDisconnect completo: ${JSON.stringify(lastDisconnect?.error?.output || lastDisconnect || {})}`);
        
        // 🔥 CORREÇÃO 3: Detecção robusta de logout
        let shouldReconnect = true;
        const statusCode = (lastDisconnect?.error instanceof Boom) 
          ? lastDisconnect.error.output?.statusCode 
          : null;
        
        const errorMessage = String(lastDisconnect?.error?.message || '').toLowerCase();
        
        // Verifica se foi logout explícito
        if (errorMessage.includes('logged out') || statusCode === DisconnectReason.loggedOut) {
          shouldReconnect = false;
          log('ERROR', '🚫 Sessão invalidada (logged out) - não reconectará automaticamente');
        }
        
        if (shouldReconnect) {
          // 🔥 CORREÇÃO 4: Usa flag única para agendar reconexão (evita enfileiramento)
          if (!reconnectScheduled) {
            reconnectScheduled = true;
            
            // Delay progressivo (3s, 5s, 10s, 15s...)
            const delay = Math.min(3000 + (reconnectAttempts * 2000), 15000);
            
            log('WARNING', `⚠️  Conexão perdida. Reconectando em ${delay/1000} segundos...`);
            log('INFO', `📊 Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} - ${new Date().toLocaleTimeString()}`);
            
            setTimeout(() => {
              reconnectScheduled = false; // 🔥 Libera flag antes de reconectar
              connectWhatsApp();
            }, delay);
          } else {
            log('INFO', '🔁 Reconexão já agendada — ignorando nova tentativa');
          }
        } else {
          // 🔥 CORREÇÃO 5: Não usar process.exit(0) em produção automaticamente
          log('ERROR', '❌ Desconectado (logout detectado). Limpando credenciais...');
          
          try {
            await clearAll();
          } catch (e) {
            log('ERROR', `❌ Erro ao limpar credenciais: ${e.message}`);
          }
          
          // Fecha MongoDB
          if (mongoClient) {
            try {
              await mongoClient.close();
              mongoClient = null;
            } catch (e) {
              log('ERROR', `❌ Erro ao fechar MongoDB: ${e.message}`);
            }
          }
          
          // 🔥 CORREÇÃO: Só encerra se FORCE_EXIT_ON_LOGOUT estiver configurado
          if (process.env.FORCE_EXIT_ON_LOGOUT === 'true') {
            log('INFO', '🛑 Encerrando processo (FORCE_EXIT_ON_LOGOUT=true)');
            process.exit(0);
          } else {
            log('INFO', '⏸️  Bot pausado (logout) - aguardando ação manual ou reinicie o container');
          }
        }
      }
      
      // Conectado
      if (connection === 'open') {
        isConnecting = false;
        reconnectAttempts = 0; // 🔥 RESET contador ao conectar com sucesso
        reconnectScheduled = false; // 🔥 Limpa flag de agendamento
        
        log('SUCCESS', '✅ Conectado ao WhatsApp com sucesso!');
        console.log('\n🎉 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 BOT ONLINE E FUNCIONANDO!');
        console.log('🎉 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Mostra estatísticas
        printStats();
        
        // Instruções
        console.log('📋 COMANDOS DISPONÍVEIS (envie para o cliente):');
        console.log(`   • ${process.env.COMMAND_ASSUME || '/assumir'} - Assumir atendimento manual`);
        console.log(`   • ${process.env.COMMAND_RELEASE || '/liberar'} - Liberar bot automático`);
        console.log('\n💡 DICA: Ao enviar qualquer mensagem para um cliente,');
        console.log('   o bot automaticamente para de responder (atendimento manual).\n');
        
        console.log('🔍 COMANDOS NO CONSOLE:');
        console.log('   Digite "stats" para ver estatísticas');
        console.log('   Digite "blocked" para ver usuários em atendimento manual');
        console.log('   Digite "users" para ver todos os usuários\n');
      }
    });
    
    // ============================================
    // EVENTO: Novas mensagens
    // ============================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      
      for (const message of messages) {
        try {
          // Ignora mensagens próprias
          if (message.key.fromMe) {
            continue;
          }
          
          // 🔥 CORREÇÃO 6: Usa globalSock (fonte única de verdade) ao invés de sock local
          const activeSock = globalSock || sock;
          
          // Verifica se conexão está estável antes de processar
          if (!isConnectionStable(activeSock)) {
            log('WARNING', '⚠️  Conexão instável - aguardando estabilização...');
            
            const stable = await waitForConnection(activeSock, 10000);
            
            if (!stable) {
              log('ERROR', '❌ Conexão não estabilizou - mensagem não processada');
              continue;
            }
          }
          
          // Processa mensagem recebida
          await processMessage(activeSock, message);
          
        } catch (error) {
          // 🔥 Tratamento específico para Connection Closed
          if (error.message.includes('Connection Closed')) {
            log('WARNING', '⚠️  Conexão caiu durante processamento - mensagem será processada após reconexão');
          } else {
            log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
            if (process.env.DEBUG_MODE === 'true') {
              console.error(error.stack);
            }
          }
        }
      }
    });
    
    // ============================================
    // EVENTO: Presença (status online/offline)
    // ============================================
    sock.ev.on('presence.update', ({ id, presences }) => {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', `👁️  Presença atualizada: ${id}`);
      }
    });
    
    isConnecting = false;
    return sock;
    
  } catch (error) {
    isConnecting = false;
    
    log('ERROR', `❌ Erro ao conectar WhatsApp: ${error.message}`);
    
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }
    
    // 🔥 CORREÇÃO 7: Fecha recursos antes de tentar reconectar
    try {
      if (globalSock?.ws) {
        globalSock.ws.close?.();
      }
      globalSock = null;
    } catch (e) { /* ignore */ }
    
    // 🔥 CORREÇÃO: Delay maior após erro (10 segundos) e usa flag de agendamento
    if (!reconnectScheduled) {
      reconnectScheduled = true;
      log('INFO', '🔄 Tentando reconectar em 10 segundos...');
      
      setTimeout(() => {
        reconnectScheduled = false;
        connectWhatsApp();
      }, 10000);
    }
    
    return null;
  }
}

/**
 * 🔥 INICIALIZA O BOT (chamada apenas 1 vez)
 */
async function startBot() {
  showBanner();
  
  // Inicializa componentes únicos (servidor, keep-alive, validações)
  initializeOnce();
  
  // Configura comandos no console
  setupConsoleCommands();
  
  // Conecta ao WhatsApp (pode reconectar automaticamente)
  await connectWhatsApp();
}

/**
 * Configura comandos interativos no console
 */
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
        console.log('   stats   - Mostra estatísticas do bot');
        console.log('   blocked - Lista usuários em atendimento manual');
        console.log('   users   - Lista todos os usuários cadastrados');
        console.log('   help    - Mostra esta ajuda');
        console.log('   clear   - Limpa o console\n');
        break;
        
      case 'clear':
        console.clear();
        showBanner();
        break;
        
      default:
        if (command) {
          console.log(`❌ Comando "${command}" não reconhecido. Digite "help" para ajuda.\n`);
        }
    }
  });
}

/**
 * Tratamento de erros não capturados
 */
process.on('unhandledRejection', (err) => {
  log('ERROR', `❌ Unhandled Rejection: ${err.message}`);
  
  // 🔥 Não encerra o processo por erro não tratado
  if (process.env.DEBUG_MODE === 'true') {
    console.error(err.stack);
  }
});

process.on('uncaughtException', (err) => {
  log('ERROR', `❌ Uncaught Exception: ${err.message}`);
  
  if (process.env.DEBUG_MODE === 'true') {
    console.error(err.stack);
  }
  
  // 🔥 Tenta reconectar ao invés de encerrar
  if (err.message.includes('Connection') || err.message.includes('WebSocket')) {
    log('INFO', '🔄 Tentando reconectar após erro de conexão...');
    
    if (!reconnectScheduled) {
      reconnectScheduled = true;
      setTimeout(() => {
        reconnectScheduled = false;
        connectWhatsApp();
      }, 5000);
    }
  } else {
    // Erro crítico não relacionado a conexão
    process.exit(1);
  }
});

/**
 * Tratamento de encerramento gracioso
 */
process.on('SIGINT', async () => {
  console.log('\n\n👋 Encerrando bot...');
  log('INFO', '🛑 Bot encerrado pelo usuário');
  
  if (mongoClient) {
    await mongoClient.close();
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n👋 Encerrando bot...');
  log('INFO', '🛑 Bot encerrado');
  
  if (mongoClient) {
    await mongoClient.close();
  }
  
  process.exit(0);
});

/**
 * INICIA O BOT
 */
startBot();