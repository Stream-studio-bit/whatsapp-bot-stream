// Convertido para ES Modules
/**
 * baileys.js
 * Configuração das opções de conexão do WhatsApp via Baileys
 * Define parâmetros de timeout, reconexão, logs e comportamento do socket
 */

import { DisconnectReason } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';

/**
 * Opções de configuração do Baileys
 */
const baileysConfig = {
  // Configurações de log do Baileys
  logger: {
    level: process.env.BAILEYS_LOG_LEVEL || 'silent', // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'
    info: (...args) => logger.info('[Baileys]', ...args),
    error: (...args) => logger.error('[Baileys]', ...args),
    warn: (...args) => logger.warn('[Baileys]', ...args),
    debug: (...args) => logger.debug('[Baileys]', ...args),
  },

  // Configurações de conexão
  connection: {
    printQRInTerminal: true, // Exibir QR code no terminal
    connectTimeoutMs: 60000, // Timeout de conexão (60 segundos)
    keepAliveIntervalMs: 30000, // Intervalo de keep-alive (30 segundos)
    defaultQueryTimeoutMs: 60000, // Timeout padrão para queries (60 segundos)
    emitOwnEvents: false, // Não emitir eventos próprios
    fireInitQueries: true, // Executar queries iniciais
    markOnlineOnConnect: true, // Marcar como online ao conectar
    syncFullHistory: false, // Não sincronizar histórico completo (economiza recursos)
    browser: ['OmniWa Bot', 'Chrome', '120.0.0'], // Identificação do navegador
  },

  // Configurações de reconexão automática
  reconnect: {
    maxRetries: 10, // Máximo de tentativas de reconexão
    retryDelay: 5000, // Delay entre tentativas (5 segundos)
    exponentialBackoff: true, // Aumentar delay progressivamente
    maxRetryDelay: 60000, // Delay máximo (60 segundos)
  },

  // Configurações de mensagens
  messages: {
    downloadMediaBufferSize: 1024 * 1024 * 10, // 10MB buffer para download de mídia
    retryRequestDelayMs: 250, // Delay para retry de requisições (250ms)
    cachedGroupMetadata: true, // Cache de metadados de grupos
  },

  // Configurações de autenticação
  auth: {
    multiDevice: true, // Suporte para múltiplos dispositivos
  },
};

/**
 * Retorna as opções de socket do Baileys
 * @param {Object} authState - Estado de autenticação do Baileys
 * @returns {Object} Opções configuradas para o socket
 */
function getBaileysSocketConfig(authState) {
  return {
    auth: authState,
    printQRInTerminal: baileysConfig.connection.printQRInTerminal,
    connectTimeoutMs: baileysConfig.connection.connectTimeoutMs,
    keepAliveIntervalMs: baileysConfig.connection.keepAliveIntervalMs,
    defaultQueryTimeoutMs: baileysConfig.connection.defaultQueryTimeoutMs,
    emitOwnEvents: baileysConfig.connection.emitOwnEvents,
    fireInitQueries: baileysConfig.connection.fireInitQueries,
    markOnlineOnConnect: baileysConfig.connection.markOnlineOnConnect,
    syncFullHistory: baileysConfig.connection.syncFullHistory,
    browser: baileysConfig.connection.browser,
    logger: baileysConfig.logger,
    getMessage: async (key) => {
      // Retorna mensagem do cache (necessário para algumas operações)
      return { conversation: 'Mensagem não encontrada' };
    },
  };
}

/**
 * Verifica se o motivo de desconexão requer reconexão
 * @param {number} reason - Código do motivo de desconexão
 * @returns {boolean} True se deve reconectar
 */
function shouldReconnect(reason) {
  const noReconnectReasons = [
    DisconnectReason.loggedOut,
    DisconnectReason.badSession,
    DisconnectReason.connectionClosed,
  ];
  
  return !noReconnectReasons.includes(reason);
}

/**
 * Calcula o delay de reconexão com backoff exponencial
 * @param {number} attempt - Número da tentativa atual
 * @returns {number} Delay em milissegundos
 */
function getReconnectDelay(attempt) {
  if (!baileysConfig.reconnect.exponentialBackoff) {
    return baileysConfig.reconnect.retryDelay;
  }

  const delay = baileysConfig.reconnect.retryDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, baileysConfig.reconnect.maxRetryDelay);
}

/**
 * Mensagens de erro traduzidas
 */
const errorMessages = {
  [DisconnectReason.badSession]: 'Sessão inválida. É necessário fazer nova autenticação.',
  [DisconnectReason.connectionClosed]: 'Conexão fechada pelo servidor.',
  [DisconnectReason.connectionLost]: 'Conexão perdida. Tentando reconectar...',
  [DisconnectReason.connectionReplaced]: 'Conexão substituída por outro cliente.',
  [DisconnectReason.loggedOut]: 'Sessão desconectada. Faça login novamente.',
  [DisconnectReason.restartRequired]: 'Reinício necessário.',
  [DisconnectReason.timedOut]: 'Tempo de conexão esgotado.',
};

/**
 * Retorna mensagem de erro amigável
 * @param {number} reason - Código do motivo de desconexão
 * @returns {string} Mensagem de erro
 */
function getDisconnectMessage(reason) {
  return errorMessages[reason] || `Desconectado. Motivo: ${reason}`;
}

export {
  baileysConfig,
  getBaileysSocketConfig,
  shouldReconnect,
  getReconnectDelay,
  getDisconnectMessage,
  DisconnectReason
};