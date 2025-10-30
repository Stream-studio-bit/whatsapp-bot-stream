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
let isConnecting = false; // 🔥 NOVO: Previne múltiplas tentativas simultâneas
let reconnectAttempts = 0; // 🔥 NOVO: Contador de tentativas
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * 🔥 NOVA: Variável global para armazenar o socket
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
 * 🔥 NOVA: Verifica se conexão está estável
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
 * 🔥 MELHORADA: Aguarda conexão estável
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
  
  isConnecting = true;
  reconnectAttempts++;
  
  try {
    log('INFO', `🔄 Iniciando conexão com WhatsApp (Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
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
      // 🔥 NOVO: Configurações de reconexão mais suaves
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      emitOwnEvents: false,
      syncFullHistory: false
    });
    
    // Armazena socket globalmente
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
        console.log('\n📱 ═══════════════════════════════════════════════════');
        console.log('📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP BUSINESS');
        console.log('📱 ═══════════════════════════════════════════════════\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 ═══════════════════════════════════════════════════\n');
      }
      
      // Conexão fechada
      if (connection === 'close') {
        isConnecting = false;
        
        const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;
        
        if (shouldReconnect) {
          // 🔥 CORREÇÃO: Delay progressivo (3s, 5s, 10s, 15s...)
          const delay = Math.min(3000 + (reconnectAttempts * 2000), 15000);
          
          log('WARNING', `⚠️  Conexão perdida. Reconectando em ${delay/1000} segundos...`);
          log('INFO', `📊 Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
          
          setTimeout(() => connectWhatsApp(), delay);
        } else {
          log('ERROR', '❌ Desconectado. Limpando credenciais...');
          await clearAll();
          if (mongoClient) {
            await mongoClient.close();
            mongoClient = null;
          }
          process.exit(0);
        }
      }
      
      // Conectado
      if (connection === 'open') {
        isConnecting = false;
        reconnectAttempts = 0; // 🔥 RESET contador ao conectar com sucesso
        
        log('SUCCESS', '✅ Conectado ao WhatsApp com sucesso!');
        console.log('\n🎉 ═══════════════════════════════════════════════════');
        console.log('🎉 BOT ONLINE E FUNCIONANDO!');
        console.log('🎉 ═══════════════════════════════════════════════════\n');
        
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
          
          // 🔥 NOVO: Verifica se conexão está estável antes de processar
          if (!isConnectionStable(sock)) {
            log('WARNING', '⚠️  Conexão instável - aguardando estabilização...');
            
            const stable = await waitForConnection(sock, 10000);
            
            if (!stable) {
              log('ERROR', '❌ Conexão não estabilizou - mensagem não processada');
              continue;
            }
          }
          
          // Processa mensagem recebida
          await processMessage(sock, message);
          
        } catch (error) {
          // 🔥 NOVO: Tratamento específico para Connection Closed
          if (error.message.includes('Connection Closed')) {
            log('WARNING', '⚠️  Conexão caiu durante processamento - mensagem será processada após reconexão');
          } else {
            log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
            console.error(error);
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
    console.error(error);
    
    // 🔥 CORREÇÃO: Delay maior após erro (10 segundos)
    log('INFO', '🔄 Tentando reconectar em 10 segundos...');
    setTimeout(() => connectWhatsApp(), 10000);
    
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
  
  // 🔥 NOVO: Não encerra o processo por erro não tratado
  if (process.env.DEBUG_MODE === 'true') {
    console.error(err);
  }
});

process.on('uncaughtException', (err) => {
  log('ERROR', `❌ Uncaught Exception: ${err.message}`);
  console.error(err);
  
  // 🔥 NOVO: Tenta reconectar ao invés de encerrar
  if (err.message.includes('Connection') || err.message.includes('WebSocket')) {
    log('INFO', '🔄 Tentando reconectar após erro de conexão...');
    setTimeout(() => connectWhatsApp(), 5000);
  } else {
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