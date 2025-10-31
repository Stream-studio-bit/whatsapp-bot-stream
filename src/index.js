// index.js (versão refatorada — estabilidade e prevenção de loop de reconexão)
// Mantive a estrutura original, adicionando melhorias de reconexão, debounce, getMessage e comentários.

// Dependências
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

// Importa configurações e serviços (mantidos)
import { validateGroqConfig } from './config/groq.js';
import { log } from './utils/helpers.js';
import { printStats, cleanExpiredBlocks } from './services/database.js';
import { processMessage } from './controllers/messageHandler.js';
import { removeUser, resetSystem, quickStatus, backupData, showHelpMenu, showStats, showUserDetails, listBlockedUsers, listAllUsers } from './controllers/commandHandler.js';

dotenv.config();

/**
 * FLAGS DE CONTROLE - PREVINE LOOP INFINITO
 */
let isServerInitialized = false;
let isKeepAliveInitialized = false;
let mongoClient = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * TIMEOUT / BACKOFF HANDLE PARA RECONEXÃO
 * - Garantir apenas *um* timeout ativo
 * - Exponential backoff com teto
 */
let reconnectTimeout = null;
let lastReconnectTimestamp = 0;
const MIN_RECONNECT_DELAY = 3000; // 3s
const MAX_RECONNECT_DELAY = 2 * 60 * 1000; // 2 minutos

/**
 * Proteção contra mensagens duplicadas
 */
const processedMessages = new Set();
const MESSAGE_CACHE_LIMIT = 1000;
const MESSAGE_CACHE_CLEANUP_INTERVAL = 300000; // 5 minutos

/**
 * Variável global do socket (fonte única de verdade)
 */
let globalSock = null;

/**
 * Cleanup interval handle
 */
let cleanupInterval = null;

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
 * Limpeza do cache de mensagens
 */
function cleanupMessageCache() {
  if (processedMessages.size > MESSAGE_CACHE_LIMIT) {
    const excess = processedMessages.size - MESSAGE_CACHE_LIMIT;
    const iterator = processedMessages.values();
    
    for (let i = 0; i < excess; i++) {
      const { value } = iterator.next();
      if (value) processedMessages.delete(value);
    }
    
    log('INFO', `🧹 Cache de mensagens limpo: ${excess} entradas removidas`);
  }
}

/**
 * Inicialização de tarefas periódicas (apenas 1 vez)
 */
function startPeriodicTasks() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(async () => {
    try {
      await cleanExpiredBlocks();
      cleanupMessageCache();
    } catch (error) {
      log('WARNING', `⚠️  Erro no cleanup periódico: ${error.message}`);
    }
  }, 5 * 60 * 1000); // 5 minutos
  
  log('SUCCESS', '✅ Tarefas periódicas iniciadas (cleanup a cada 5min)');
}

/**
 * Inicialização única
 */
function initializeOnce() {
  if (!isServerInitialized && process.env.RENDER) {
    log('INFO', '🔧 Iniciando servidor HTTP...');
    startServer();
    isServerInitialized = true;
  }
  
  if (!isKeepAliveInitialized && process.env.RENDER) {
    keepAlive();
    isKeepAliveInitialized = true;
  }
  
  if (!validateGroqConfig()) {
    console.error('\n❌ Configure a API Key da Groq no arquivo .env antes de continuar!\n');
    process.exit(1);
  }
  
  if (!MONGODB_URI) {
    console.error('\n❌ Configure MONGODB_URI no arquivo .env antes de continuar!\n');
    process.exit(1);
  }
}

/**
 * Uso do MongoDB como auth state (mantive sua implementação, levemente endurecida)
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
 * Util: delay/espera
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Util: calcula exponential backoff (com teto)
 */
function calcBackoff(attempts) {
  // Doubling base delay mas com teto em MAX_RECONNECT_DELAY
  const base = MIN_RECONNECT_DELAY;
  const delayMs = Math.min(base * Math.pow(2, Math.max(0, attempts - 1)), MAX_RECONNECT_DELAY);
  return delayMs;
}

/**
 * Faz check do estado do websocket de forma robusta
 * readyState: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED
 */
function isSocketOpen(sock) {
  try {
    return !!(sock && sock.ws && sock.ws.readyState === 1);
  } catch (e) {
    return false;
  }
}

/**
 * Função principal de conexão ao WhatsApp (reconectável)
 * - Garante apenas UMA conexão ativa
 * - Usa backoff e debounce para evitar loops de reconexão
 * - Mantém persistência do authState via MongoDB
 */
async function connectWhatsApp() {
  // Se já existe uma tentativa em andamento, aborta
  if (isConnecting) {
    log('WARNING', '⚠️  Já existe uma tentativa de conexão em andamento...abortando nova tentativa.');
    return globalSock;
  }
  
  // Se socket atual está aberto, não cria nova conexão
  if (isSocketOpen(globalSock)) {
    log('INFO', 'ℹ️ Socket já está aberto. Nenhuma nova conexão necessária.');
    return globalSock;
  }
  
  // Limite máximo de tentativas (proteção)
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('ERROR', `❌ Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas de reconexão atingido`);
    // Reset agendado com tempo maior para evitar loops infinitos
    const resetDelay = Math.min(MAX_RECONNECT_DELAY, 2 * 60 * 1000);
    setTimeout(() => {
      reconnectAttempts = 0;
      log('INFO', '🔄 Contador de tentativas resetado. Você pode tentar reconectar manualmente.');
    }, resetDelay);
    return null;
  }

  // Debounce: evita reconectar muito rápido se uma reconexão acabou de acontecer
  const now = Date.now();
  if (now - lastReconnectTimestamp < 1000) { // 1s de debounce mínimo
    log('INFO', '⏳ Reconexão ignorada por debounce (evento muito próximo)');
    return null;
  }

  isConnecting = true;
  reconnectAttempts++;
  lastReconnectTimestamp = now;

  try {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    log('INFO', `🔄 Iniciando conexão (Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) - ${timestamp}`);

    // Se havia socket anterior em estado não aberto, garante limpeza
    if (globalSock) {
      try {
        log('INFO', '🔌 Limpando socket anterior (se existir)...');
        globalSock.ev.removeAllListeners?.();
        globalSock.ws?.removeAllListeners?.();
        globalSock.ws?.terminate?.();
      } catch (e) { /* ignore */ }
      globalSock = null;
    }

    // Obtém versão mais recente do Baileys (ajuda evitar incompatibilidade)
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 2320, 0], isLatest: false }));
    log('SUCCESS', `✅ Baileys v${version.join('.')} ${isLatest ? '(latest)' : '(verificação de versão realizada)'}`);

    // Conecta ao MongoDB (reutiliza conexão se já existe)
    if (!mongoClient) {
      log('INFO', '🔗 Conectando ao MongoDB...');
      mongoClient = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
      await mongoClient.connect();
      log('SUCCESS', '✅ MongoDB conectado com sucesso!');
    }

    const db = mongoClient.db('baileys_auth');
    const collection = db.collection(SESSION_ID);

    // Usa MongoDB para auth state (persistência)
    const { state, saveCreds, clearAll } = await useMongoDBAuthState(collection);

    // Implementação do getMessage exigido em algumas versões
    const getMessage = async (key) => {
      // Retorna uma mensagem vazia se não encontrada — isso é preferível à quebra
      // Você pode adaptar para buscar no banco se desejar histórico
      return { conversation: '' };
    };

    // Cria o socket com configuração robusta
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Stream Studio Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      emitOwnEvents: false,
      syncFullHistory: false,
      getMessage // necessário em algumas versões/cenários
    });

    // Armazena socket globalmente (fonte única)
    globalSock = sock;

    // Evento: credenciais atualizadas
    sock.ev.on('creds.update', saveCreds);

    // Evento: updates de conexão (tratamento robusto)
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code (se solicitado)
      if (qr) {
        console.log('\n📱 ┌──────────────────────────────────────────────┐');
        console.log('📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP BUSINESS');
        console.log('📱 └──────────────────────────────────────────────┘\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 └──────────────────────────────────────────────┘\n');
      }

      // Conexão fechada
      if (connection === 'close') {
        log('WARNING', '⚠️ Evento connection.close recebido');

        // Cancela qualquer timeout anterior antes de programar nova reconexão
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
          log('INFO', '🔥 Timeout anterior de reconexão cancelado');
        }

        // Se socket ainda estiver aberto, evita reconexão
        if (isSocketOpen(globalSock)) {
          log('WARNING', '⚠️ Socket ainda ativo - abortando nova reconexão');
          return;
        }

        // Verifica motivo do disconnect
        let statusCode = null;
        if (lastDisconnect?.error instanceof Boom) {
          statusCode = lastDisconnect.error.output?.statusCode || null;
        }

        const reason = (lastDisconnect?.error && lastDisconnect.error?.output?.payload?.error) || lastDisconnect?.error || null;
        const wasLoggedOut = statusCode === DisconnectReason.loggedOut || (String(reason).toLowerCase().includes('loggedout'));

        if (wasLoggedOut) {
          log('ERROR', '❌ Sessão invalidada (logout detectado) — não será feita reconexão automática');
          try {
            await clearAll();
            log('INFO', '🧹 Credenciais removidas da store (logout)');
          } catch (e) {
            log('ERROR', `❌ Falha ao limpar credenciais: ${e.message}`);
          }
          
          // Limpa periodic tasks
          if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
          }

          // Fecha MongoDB para evitar locks
          if (mongoClient) {
            try {
              await mongoClient.close();
              mongoClient = null;
              log('INFO', '🔌 MongoDB fechado após logout');
            } catch (e) {
              log('ERROR', `❌ Erro ao fechar MongoDB: ${e.message}`);
            }
          }

          if (process.env.FORCE_EXIT_ON_LOGOUT === 'true') {
            log('INFO', '🛑 Encerrando processo (FORCE_EXIT_ON_LOGOUT=true)');
            process.exit(0);
          } else {
            log('INFO', '⏸️  Bot pausado (logout) - aguarde ação manual e re-autenticação');
          }
          return;
        }

        // Caso seja erro temporário: agenda nova reconexão com backoff
        const backoff = calcBackoff(reconnectAttempts);
        log('INFO', `🔄 Agendando reconexão em ${backoff}ms (tentativa ${reconnectAttempts + 1})`);
        reconnectTimeout = setTimeout(async () => {
          reconnectTimeout = null;
          try {
            await connectWhatsApp();
          } catch (e) {
            log('ERROR', `❌ Erro na tentativa agendada de reconexão: ${e.message}`);
          }
        }, backoff);
        return;
      }

      // Conexão aberta com sucesso
      if (connection === 'open') {
        // Cancela timeout de reconexão pendente
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
          log('INFO', '🔥 Timeout de reconexão cancelado (conexão estabelecida)');
        }

        // Reset flags
        isConnecting = false;
        reconnectAttempts = 0;
        lastReconnectTimestamp = Date.now();

        log('SUCCESS', '✅ Conectado ao WhatsApp com sucesso!');
        console.log('\n🎉 ┌──────────────────────────────────────────────┐');
        console.log('🎉 BOT ONLINE E FUNCIONANDO!');
        console.log('🎉 └──────────────────────────────────────────────┘\n');

        // Inicia tarefas periódicas
        startPeriodicTasks();

        // Mostra estatísticas
        printStats();

        // Instruções e comandos
        console.log('📋 COMANDOS DISPONÍVEIS (envie para o cliente):');
        console.log(`   • ${process.env.COMMAND_ASSUME || '/assumir'} - Assumir atendimento manual`);
        console.log(`   • ${process.env.COMMAND_RELEASE || '/liberar'} - Liberar bot automático`);
        console.log('\n💡 DICA: Ao enviar qualquer mensagem para um cliente,');
        console.log('   o bot automaticamente para de responder (atendimento manual).\n');

        console.log('🔧 COMANDOS NO CONSOLE:');
        console.log('   Digite "stats" para ver estatísticas');
        console.log('   Digite "blocked" para ver usuários em atendimento manual');
        console.log('   Digite "users" para ver todos os usuários\n');

        return;
      }
    });

    // Evento: mensagens
    sock.ev.on('messages.upsert', async (m) => {
      const { messages, type } = m;
      if (type !== 'notify') return;

      for (const message of messages) {
        try {
          if (message.key.fromMe) continue;
          if (!message.message) continue;

          const messageId = message.key.id;
          if (processedMessages.has(messageId)) {
            if (process.env.DEBUG_MODE === 'true') {
              log('INFO', '🔁 Mensagem duplicada ignorada');
            }
            continue;
          }
          processedMessages.add(messageId);

          // Processa mensagem usando seu handler (passes o sock local)
          await processMessage(sock, message);

        } catch (error) {
          if (error.message?.includes('Connection') || error.message?.includes('WebSocket')) {
            log('WARNING', '⚠️  Conexão interrompida durante processamento');
          } else {
            log('WARNING', `⚠️  Erro ao processar mensagem: ${error.message}`);
            if (process.env.DEBUG_MODE === 'true') {
              console.error(error.stack);
            }
          }
        }
      }
    });

    // Evento: presença (apenas logs de debug)
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

    // Cancela timeout anterior se existir
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
      log('INFO', '🔥 Timeout anterior cancelado');
    }

    // Agenda reconexão com backoff
    const backoff = calcBackoff(reconnectAttempts);
    log('INFO', `🔄 Agendando reconexão em ${backoff}ms (fallback)`);
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connectWhatsApp();
    }, backoff);

    return null;
  }
}

/**
 * Inicializa o bot (chamada apenas 1 vez)
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
  log('WARNING', `⚠️  Unhandled Rejection: ${err?.message || err}`);
  if (process.env.DEBUG_MODE === 'true') {
    console.error(err?.stack || err);
  }
});

process.on('uncaughtException', (err) => {
  log('WARNING', `⚠️  Uncaught Exception: ${err?.message || err}`);

  if (process.env.DEBUG_MODE === 'true') {
    console.error(err?.stack || err);
  }

  // Se for erro relacionado a conexão, tenta reconectar
  if (String(err?.message || '').includes('Connection') || String(err?.message || '').includes('WebSocket')) {
    log('INFO', '🔄 Tentando reconectar após erro de conexão...');

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connectWhatsApp();
    }, MIN_RECONNECT_DELAY);
  } else {
    log('ERROR', '❌ Erro crítico detectado. Encerrando...');
    process.exit(1);
  }
});

/**
 * Encerramento gracioso
 */
process.on('SIGINT', async () => {
  console.log('\n\n👋 Encerrando bot...');
  log('INFO', '🛑 Bot encerrado pelo usuário');

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  if (mongoClient) {
    await mongoClient.close();
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n👋 Encerrando bot...');
  log('INFO', '🛑 Bot encerrado');

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  if (mongoClient) {
    await mongoClient.close();
  }

  process.exit(0);
});

/**
 * INICIA O BOT
 */
startBot();
