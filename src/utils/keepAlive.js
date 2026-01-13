// Convertido para ES Modules
/**
 * keepAlive.js
 * Mantém o serviço ativo em plataformas como Render, Railway, etc.
 * Evita que o serviço entre em modo sleep por inatividade
 */

import http from 'http';
import https from 'https';
import logger from './logger.js';

// Configurações
const KEEP_ALIVE_CONFIG = {
  enabled: process.env.KEEP_ALIVE_ENABLED !== 'false', // Habilitado por padrão
  interval: parseInt(process.env.KEEP_ALIVE_INTERVAL) || 5 * 60 * 1000, // 5 minutos
  url: process.env.KEEP_ALIVE_URL || null, // URL para fazer ping (opcional)
  timeout: 10000, // 10 segundos timeout
};

let keepAliveInterval = null;

/**
 * Faz ping em uma URL para manter serviço ativo
 * @param {string} url - URL para fazer ping
 * @returns {Promise<boolean>} Sucesso do ping
 */
async function ping(url) {
  return new Promise((resolve) => {
    try {
      const protocol = url.startsWith('https') ? https : http;
      
      const req = protocol.get(url, (res) => {
        logger.debug(`✅ Keep-alive ping: ${res.statusCode}`);
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });

      req.on('error', (error) => {
        logger.warn(`⚠️ Erro no keep-alive ping: ${error.message}`);
        resolve(false);
      });

      req.setTimeout(KEEP_ALIVE_CONFIG.timeout, () => {
        req.destroy();
        logger.warn('⚠️ Keep-alive ping timeout');
        resolve(false);
      });

    } catch (error) {
      logger.error('❌ Erro ao fazer ping:', error);
      resolve(false);
    }
  });
}

/**
 * Executa keep-alive
 */
async function executeKeepAlive() {
  try {
    logger.debug('🔄 Executando keep-alive...');

    // Se tem URL configurada, faz ping
    if (KEEP_ALIVE_CONFIG.url) {
      const success = await ping(KEEP_ALIVE_CONFIG.url);
      if (success) {
        logger.debug('✅ Keep-alive bem-sucedido');
      }
    } else {
      // Se não tem URL, apenas loga para indicar atividade
      logger.debug('💚 Keep-alive: serviço ativo');
    }

  } catch (error) {
    logger.error('❌ Erro no keep-alive:', error);
  }
}

/**
 * Inicia keep-alive automático
 */
function startKeepAlive() {
  if (!KEEP_ALIVE_CONFIG.enabled) {
    logger.info('⏸️ Keep-alive desabilitado');
    return;
  }

  if (keepAliveInterval) {
    logger.warn('⚠️ Keep-alive já está ativo');
    return;
  }

  logger.info('🚀 Iniciando keep-alive...');
  logger.info(`   Intervalo: ${KEEP_ALIVE_CONFIG.interval / 1000}s`);
  if (KEEP_ALIVE_CONFIG.url) {
    logger.info(`   URL: ${KEEP_ALIVE_CONFIG.url}`);
  }

  // Executa imediatamente
  executeKeepAlive();

  // Agenda execuções periódicas
  keepAliveInterval = setInterval(() => {
    executeKeepAlive();
  }, KEEP_ALIVE_CONFIG.interval);

  logger.info('✅ Keep-alive ativo');
}

/**
 * Para keep-alive
 */
function stopKeepAlive() {
  if (!keepAliveInterval) {
    logger.warn('⚠️ Keep-alive não está ativo');
    return;
  }

  clearInterval(keepAliveInterval);
  keepAliveInterval = null;
  logger.info('⏹️ Keep-alive parado');
}

/**
 * Verifica se keep-alive está ativo
 * @returns {boolean} Status
 */
function isKeepAliveActive() {
  return keepAliveInterval !== null;
}

/**
 * Configura keep-alive
 * @param {Object} options - Opções de configuração
 */
function configureKeepAlive(options = {}) {
  if (options.enabled !== undefined) {
    KEEP_ALIVE_CONFIG.enabled = options.enabled;
  }
  if (options.interval) {
    KEEP_ALIVE_CONFIG.interval = options.interval;
  }
  if (options.url) {
    KEEP_ALIVE_CONFIG.url = options.url;
  }
  if (options.timeout) {
    KEEP_ALIVE_CONFIG.timeout = options.timeout;
  }

  logger.info('⚙️ Keep-alive configurado:', KEEP_ALIVE_CONFIG);
}

/**
 * Obtém configuração atual
 * @returns {Object} Configuração
 */
function getKeepAliveConfig() {
  return { ...KEEP_ALIVE_CONFIG };
}

/**
 * Alias para startKeepAlive (compatibilidade)
 */
function keepAlive() {
  startKeepAlive();
}

export {
  startKeepAlive,
  stopKeepAlive,
  isKeepAliveActive,
  configureKeepAlive,
  getKeepAliveConfig,
  keepAlive,
  executeKeepAlive,
  ping
};

export default {
  start: startKeepAlive,
  stop: stopKeepAlive,
  isActive: isKeepAliveActive,
  configure: configureKeepAlive,
  getConfig: getKeepAliveConfig,
  keepAlive,
  execute: executeKeepAlive,
  ping
};