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
import { handleCommand, handleOwnerMessage, showStats, listBlockedUsers, listAllUsers } from './controllers/commandHandler.js';

dotenv.config();

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
  console.log('\x1b[36m%s\x1b[0m', '╔═══════════════════════════════════════════════════════════════╗');
  console.log('\x1b[36m%s\x1b[0m', '║                                                              ║');
  console.log('\x1b[36m%s\x1b[0m', '║           🤖  CHAT BOT WHATSAPP - STREAM STUDIO  🤖          ║');
  console.log('\x1b[36m%s\x1b[0m', '║                                                              ║');
  console.log('\x1b[36m%s\x1b[0m', '║                    Bot Multi-tarefas com IA                  ║');
  console.log('\x1b[36m%s\x1b[0m', '║                                                              ║');
  console.log('\x1b[36m%s\x1b[0m', '╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('\x1b[33m%s\x1b[0m', `📱 Bot Name: ${BOT_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `👤 Owner: ${OWNER_NAME}`);
  console.log('\x1b[33m%s\x1b[0m', `⚙️  Powered by: Baileys + Groq AI + MongoDB`);
  console.log('');
}

/**
 * Função para usar MongoDB como auth state
 */
async function useMongoDBAuthState(collection) {
  // Lê as credenciais do MongoDB
  const readCreds = async () => {
    const data = await collection.findOne({ _id: 'creds' });
    return data ? JSON.parse(JSON.stringify(data.value), BufferJSON.reviver) : null;
  };

  // Lê uma chave específica
  const readKey = async (id) => {
    const data = await collection.findOne({ _id: id });
    return data ? JSON.parse(JSON.stringify(data.value), BufferJSON.reviver) : null;
  };

  // Escreve dados no MongoDB
  const writeData = async (id, value) => {
    const data = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await collection.updateOne(
      { _id: id },
      { $set: { value: data } },
      { upsert: true }
    );
  };

  // Remove dados do MongoDB
  const removeData = async (id) => {
    await collection.deleteOne({ _id: id });
  };

  // Carrega credenciais existentes ou cria novas
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
 * INICIALIZA O BOT
 */
async function startBot() {
  showBanner();
  
  // Inicia servidor HTTP se estiver no Render
  if (process.env.RENDER) {
    console.log('🔧 Ambiente Render detectado - iniciando servidor HTTP...');
    startServer();
    keepAlive();
  }
  
  // Valida configuração da Groq
  if (!validateGroqConfig()) {
    console.error('\n❌ Configure a API Key da Groq no arquivo .env antes de continuar!\n');
    process.exit(1);
  }
  
  // Valida MONGODB_URI
  if (!MONGODB_URI) {
    console.error('\n❌ Configure MONGODB_URI no arquivo .env antes de continuar!\n');
    process.exit(1);
  }
  
  log('INFO', '🔄 Iniciando conexão com WhatsApp...');
  
  let mongoClient;
  
  try {
    // Obtém versão mais recente do Baileys
    const { version, isLatest } = await fetchLatestBaileysVersion();
    log('SUCCESS', `✅ Baileys v${version.join('.')} ${isLatest ? '(latest)' : '(outdated)'}`);
    
    // Conecta ao MongoDB
    log('INFO', '🔗 Conectando ao MongoDB...');
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    
    const db = mongoClient.db('baileys_auth');
    const collection = db.collection(SESSION_ID);
    
    log('SUCCESS', '✅ MongoDB conectado com sucesso!');
    
    // Usa MongoDB para auth state
    const { state, saveCreds, clearAll } = await useMongoDBAuthState(collection);
    
    // Cria socket de conexão
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Stream Studio Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true
    });
    
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
        console.log('\n📱 ═══════════════════════════════════════════════════════');
        console.log('📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP BUSINESS');
        console.log('📱 ═══════════════════════════════════════════════════════\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 ═══════════════════════════════════════════════════════\n');
      }
      
      // Conexão fechada
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;
        
        if (shouldReconnect) {
          log('WARNING', '⚠️  Conexão perdida. Reconectando...');
          setTimeout(() => startBot(), 3000);
        } else {
          log('ERROR', '❌ Desconectado. Limpando credenciais...');
          await clearAll();
          await mongoClient.close();
          process.exit(0);
        }
      }
      
      // Conectado
      if (connection === 'open') {
        log('SUCCESS', '✅ Conectado ao WhatsApp com sucesso!');
        console.log('\n🎉 ═══════════════════════════════════════════════════════');
        console.log('🎉 BOT ONLINE E FUNCIONANDO!');
        console.log('🎉 ═══════════════════════════════════════════════════════\n');
        
        // Mostra estatísticas
        printStats();
        
        // Instruções
        console.log('📋 COMANDOS DISPONÍVEIS (envie para o cliente):');
        console.log(`   • ${process.env.COMMAND_ASSUME} - Assumir atendimento manual`);
        console.log(`   • ${process.env.COMMAND_RELEASE} - Liberar bot automático`);
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
            // Processa comandos e auto-bloqueio do Roberto
            const isCommand = await handleCommand(sock, message);
            
            if (!isCommand) {
              // Se não é comando, verifica auto-bloqueio
              await handleOwnerMessage(sock, message);
            }
            
            continue;
          }
          
          // Processa mensagem recebida
          await processMessage(sock, message);
          
        } catch (error) {
          log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
          console.error(error);
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
    
    // ============================================
    // COMANDOS NO CONSOLE
    // ============================================
    setupConsoleCommands();
    
    return sock;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao iniciar bot: ${error.message}`);
    console.error(error);
    if (mongoClient) {
      await mongoClient.close();
    }
    process.exit(1);
  }
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
  console.error(err);
});

process.on('uncaughtException', (err) => {
  log('ERROR', `❌ Uncaught Exception: ${err.message}`);
  console.error(err);
  process.exit(1);
});

/**
 * Tratamento de encerramento gracioso
 */
process.on('SIGINT', () => {
  console.log('\n\n👋 Encerrando bot...');
  log('INFO', '🛑 Bot encerrado pelo usuário');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Encerrando bot...');
  log('INFO', '🛑 Bot encerrado');
  process.exit(0);
});

/**
 * INICIA O BOT
 */
startBot();