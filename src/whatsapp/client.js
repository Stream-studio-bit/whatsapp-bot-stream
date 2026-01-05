/**
 * client.js
 * Cria e gerencia o cliente Baileys
 * Inicia socket, gerencia conexão e chama handlers de eventos
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { getBaileysSocketConfig, shouldReconnect, getReconnectDelay, getDisconnectMessage } = require('../../config/baileys');
const { saveSession, loadSession } = require('./sessionStore');
const { registerEvents } = require('./events');
const logger = require('../utils/logger');

let sock = null;
let reconnectAttempt = 0;
let reconnectTimeout = null;
let isConnecting = false;

/**
 * Cria e inicializa o cliente WhatsApp
 * @returns {Promise<Object>} Socket do WhatsApp
 */
async function createWhatsAppClient() {
  try {
    if (isConnecting) {
      logger.warn('Já existe uma tentativa de conexão em andamento');
      return sock;
    }

    isConnecting = true;
    logger.info('Iniciando cliente WhatsApp...');

    // Carrega o estado de autenticação (sessão)
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    // Tenta carregar sessão salva do Supabase
    const savedSession = await loadSession();
    if (savedSession) {
      logger.info('Sessão recuperada do Supabase');
    }

    // Cria o socket com as configurações do Baileys
    sock = makeWASocket(getBaileysSocketConfig(state));

    // Salva credenciais automaticamente quando atualizadas
    sock.ev.on('creds.update', async () => {
      await saveCreds();
      await saveSession(state);
      logger.debug('Credenciais atualizadas e salvas');
    });

    // Registra todos os eventos do WhatsApp
    registerEvents(sock, handleDisconnect);

    reconnectAttempt = 0; // Reset do contador de tentativas
    isConnecting = false;

    logger.info('✅ Cliente WhatsApp iniciado com sucesso');
    return sock;

  } catch (error) {
    isConnecting = false;
    logger.error('Erro ao criar cliente WhatsApp:', error);
    throw error;
  }
}

/**
 * Gerencia desconexão e reconexão automática
 * @param {number} reason - Motivo da desconexão
 */
async function handleDisconnect(reason) {
  const message = getDisconnectMessage(reason);
  logger.warn(`Desconectado: ${message}`);

  // Limpa timeout anterior se existir
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Verifica se deve tentar reconectar
  if (shouldReconnect(reason)) {
    reconnectAttempt++;

    // Verifica limite de tentativas
    const maxRetries = require('../../config/baileys').baileysConfig.reconnect.maxRetries;
    if (reconnectAttempt > maxRetries) {
      logger.error(`Limite de ${maxRetries} tentativas de reconexão atingido`);
      reconnectAttempt = 0;
      return;
    }

    // Calcula delay com backoff exponencial
    const delay = getReconnectDelay(reconnectAttempt);
    logger.info(`Tentativa ${reconnectAttempt} de reconexão em ${delay}ms...`);

    // Aguarda e tenta reconectar
    reconnectTimeout = setTimeout(async () => {
      try {
        await createWhatsAppClient();
      } catch (error) {
        logger.error('Erro na reconexão:', error);
        await handleDisconnect(reason);
      }
    }, delay);

  } else {
    logger.error('❌ Reconexão não permitida. Sessão inválida ou logout realizado.');
    reconnectAttempt = 0;
  }
}

/**
 * Retorna o socket atual do WhatsApp
 * @returns {Object|null} Socket ativo ou null
 */
function getWhatsAppSocket() {
  return sock;
}

/**
 * Verifica se o cliente está conectado
 * @returns {boolean} Status de conexão
 */
function isConnected() {
  return sock !== null && sock.user !== undefined;
}

/**
 * Desconecta o cliente do WhatsApp
 */
async function disconnect() {
  try {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (sock) {
      await sock.logout();
      sock = null;
      logger.info('Cliente WhatsApp desconectado');
    }
  } catch (error) {
    logger.error('Erro ao desconectar:', error);
  }
}

/**
 * Reinicia o cliente WhatsApp
 */
async function restart() {
  try {
    logger.info('Reiniciando cliente WhatsApp...');
    await disconnect();
    reconnectAttempt = 0;
    await createWhatsAppClient();
  } catch (error) {
    logger.error('Erro ao reiniciar cliente:', error);
    throw error;
  }
}

/**
 * Retorna informações do cliente
 * @returns {Object} Dados do cliente conectado
 */
function getClientInfo() {
  if (!sock || !sock.user) {
    return {
      connected: false,
      user: null,
    };
  }

  return {
    connected: true,
    user: {
      id: sock.user.id,
      name: sock.user.name || 'OmniWa Bot',
    },
    reconnectAttempts: reconnectAttempt,
  };
}

module.exports = {
  createWhatsAppClient,
  getWhatsAppSocket,
  isConnected,
  disconnect,
  restart,
  getClientInfo,
};