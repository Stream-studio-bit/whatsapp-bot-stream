// Convertido para ES Modules
/**
 * logger.js
 * Sistema de logs padronizado para o bot OmniWA
 * - Níveis: debug, info, warn, error
 * - Formatação colorida no console
 * - Timestamps automáticos
 * - Contexto e metadata
 * - Persistência opcional em arquivo
 */

import fs from 'fs';
import path from 'path';
import util from 'util';

// Níveis de log
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Configuração padrão
const DEFAULT_CONFIG = {
  level: process.env.LOG_LEVEL || 'INFO', // Nível mínimo para exibir
  enableConsole: true, // Exibir no console
  enableFile: process.env.LOG_TO_FILE === 'true', // Salvar em arquivo
  logDir: process.env.LOG_DIR || './logs', // Diretório de logs
  maxFileSize: 10 * 1024 * 1024, // 10MB
  includeTimestamp: true,
  includeLevel: true,
  colorize: true, // Cores no console
};

// Cores ANSI para console
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Cores de texto
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Cores de fundo
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Emojis por nível
const EMOJIS = {
  DEBUG: '🔍',
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
};

// Configuração atual
let config = { ...DEFAULT_CONFIG };

/**
 * Configura o logger
 * @param {Object} options - Opções de configuração
 */
function configure(options = {}) {
  config = {
    ...config,
    ...options,
  };

  // Cria diretório de logs se necessário
  if (config.enableFile && !fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }
}

/**
 * Formata timestamp
 * @returns {string} Timestamp formatado
 */
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Formata objeto para exibição
 * @param {*} obj - Objeto a formatar
 * @returns {string} String formatada
 */
function formatObject(obj) {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  
  // Para erros, mostra stack completo
  if (obj instanceof Error) {
    return `${obj.message}\n${obj.stack}`;
  }
  
  // Para objetos, usa inspect com cores
  return util.inspect(obj, {
    depth: 3,
    colors: config.colorize && config.enableConsole,
    compact: false,
  });
}

/**
 * Aplica cor no texto (se habilitado)
 * @param {string} text - Texto
 * @param {string} color - Nome da cor
 * @returns {string} Texto colorido
 */
function colorize(text, color) {
  if (!config.colorize || !config.enableConsole) {
    return text;
  }
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

/**
 * Verifica se deve logar baseado no nível
 * @param {string} level - Nível do log
 * @returns {boolean} Deve logar?
 */
function shouldLog(level) {
  const currentLevel = LOG_LEVELS[config.level.toUpperCase()] || LOG_LEVELS.INFO;
  const messageLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  return messageLevel >= currentLevel;
}

/**
 * Formata mensagem de log
 * @param {string} level - Nível do log
 * @param {Array} args - Argumentos da mensagem
 * @returns {Object} Mensagem formatada para console e arquivo
 */
function formatMessage(level, args) {
  const timestamp = getTimestamp();
  const emoji = EMOJIS[level.toUpperCase()] || '';
  
  // Formata cada argumento
  const formattedArgs = args.map(arg => formatObject(arg));
  const message = formattedArgs.join(' ');
  
  // Versão para console (com cores)
  let consoleMessage = '';
  if (config.includeTimestamp) {
    consoleMessage += colorize(`[${timestamp}]`, 'dim') + ' ';
  }
  if (config.includeLevel) {
    const levelText = `${emoji} ${level.toUpperCase()}`;
    const levelColor = {
      DEBUG: 'cyan',
      INFO: 'green',
      WARN: 'yellow',
      ERROR: 'red',
    }[level.toUpperCase()] || 'white';
    
    consoleMessage += colorize(levelText.padEnd(10), levelColor) + ' ';
  }
  consoleMessage += message;
  
  // Versão para arquivo (sem cores)
  let fileMessage = '';
  if (config.includeTimestamp) {
    fileMessage += `[${timestamp}] `;
  }
  if (config.includeLevel) {
    fileMessage += `${level.toUpperCase().padEnd(7)} `;
  }
  fileMessage += message;
  
  return {
    console: consoleMessage,
    file: fileMessage,
  };
}

/**
 * Escreve log em arquivo
 * @param {string} level - Nível do log
 * @param {string} message - Mensagem formatada
 */
function writeToFile(level, message) {
  if (!config.enableFile) return;
  
  try {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${level.toLowerCase()}-${date}.log`;
    const filepath = path.join(config.logDir, filename);
    
    // Verifica tamanho do arquivo
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > config.maxFileSize) {
        // Rotaciona arquivo (renomeia com timestamp)
        const timestamp = Date.now();
        const rotatedFilename = `${level.toLowerCase()}-${date}-${timestamp}.log`;
        fs.renameSync(filepath, path.join(config.logDir, rotatedFilename));
      }
    }
    
    // Escreve log
    fs.appendFileSync(filepath, message + '\n', 'utf8');
    
  } catch (error) {
    console.error('Erro ao escrever log em arquivo:', error);
  }
}

/**
 * Função interna de log
 * @param {string} level - Nível do log
 * @param {Array} args - Argumentos
 */
function log(level, ...args) {
  if (!shouldLog(level)) return;
  
  const formatted = formatMessage(level, args);
  
  // Exibe no console
  if (config.enableConsole) {
    const consoleMethod = {
      DEBUG: console.log,
      INFO: console.log,
      WARN: console.warn,
      ERROR: console.error,
    }[level.toUpperCase()] || console.log;
    
    consoleMethod(formatted.console);
  }
  
  // Escreve em arquivo
  if (config.enableFile) {
    writeToFile(level, formatted.file);
  }
}

/**
 * Log nível DEBUG
 * @param {...*} args - Argumentos a logar
 */
function debug(...args) {
  log('DEBUG', ...args);
}

/**
 * Log nível INFO
 * @param {...*} args - Argumentos a logar
 */
function info(...args) {
  log('INFO', ...args);
}

/**
 * Log nível WARN
 * @param {...*} args - Argumentos a logar
 */
function warn(...args) {
  log('WARN', ...args);
}

/**
 * Log nível ERROR
 * @param {...*} args - Argumentos a logar
 */
function error(...args) {
  log('ERROR', ...args);
}

/**
 * Log de erro com contexto adicional
 * @param {string} message - Mensagem de erro
 * @param {Error} err - Objeto de erro
 * @param {Object} context - Contexto adicional
 */
function errorWithContext(message, err, context = {}) {
  const errorInfo = {
    message,
    error: err.message,
    stack: err.stack,
    ...context,
  };
  
  log('ERROR', message, errorInfo);
}

/**
 * Log de início de operação
 * @param {string} operation - Nome da operação
 * @param {Object} details - Detalhes opcionais
 */
function startOperation(operation, details = {}) {
  log('INFO', `🚀 Iniciando: ${operation}`, details);
}

/**
 * Log de conclusão de operação
 * @param {string} operation - Nome da operação
 * @param {number} duration - Duração em ms (opcional)
 * @param {Object} details - Detalhes opcionais
 */
function endOperation(operation, duration = null, details = {}) {
  const durationText = duration ? ` (${duration}ms)` : '';
  log('INFO', `✅ Concluído: ${operation}${durationText}`, details);
}

/**
 * Log de operação com medição de tempo
 * @param {string} operation - Nome da operação
 * @param {Function} fn - Função a executar
 * @returns {Promise<*>} Resultado da função
 */
async function measureTime(operation, fn) {
  const start = Date.now();
  startOperation(operation);
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    endOperation(operation, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    errorWithContext(`Erro em: ${operation}`, error, { duration });
    throw error;
  }
}

/**
 * Cria um logger com contexto específico
 * @param {string} context - Contexto (ex: 'WhatsApp', 'AI', 'Database')
 * @returns {Object} Logger contextualizado
 */
function createContextLogger(context) {
  const prefix = colorize(`[${context}]`, 'magenta');
  
  return {
    debug: (...args) => log('DEBUG', prefix, ...args),
    info: (...args) => log('INFO', prefix, ...args),
    warn: (...args) => log('WARN', prefix, ...args),
    error: (...args) => log('ERROR', prefix, ...args),
    errorWithContext: (message, err, ctx) => errorWithContext(`${context}: ${message}`, err, ctx),
    startOperation: (op, details) => startOperation(`${context} - ${op}`, details),
    endOperation: (op, duration, details) => endOperation(`${context} - ${op}`, duration, details),
    measureTime: (op, fn) => measureTime(`${context} - ${op}`, fn),
  };
}

/**
 * Log estruturado (JSON)
 * @param {string} level - Nível do log
 * @param {Object} data - Dados estruturados
 */
function structured(level, data) {
  const structuredData = {
    timestamp: getTimestamp(),
    level: level.toUpperCase(),
    ...data,
  };
  
  if (config.enableConsole) {
    console.log(JSON.stringify(structuredData, null, 2));
  }
  
  if (config.enableFile) {
    writeToFile(level, JSON.stringify(structuredData));
  }
}

/**
 * Limpa logs antigos (arquivos com mais de N dias)
 * @param {number} days - Dias para manter
 * @returns {number} Número de arquivos deletados
 */
function cleanOldLogs(days = 7) {
  if (!config.enableFile) return 0;
  
  try {
    const files = fs.readdirSync(config.logDir);
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    let deleted = 0;
    
    files.forEach(file => {
      const filepath = path.join(config.logDir, file);
      const stats = fs.statSync(filepath);
      
      if (stats.mtimeMs < cutoffDate) {
        fs.unlinkSync(filepath);
        deleted++;
      }
    });
    
    info(`🧹 Limpeza de logs concluída: ${deleted} arquivo(s) deletado(s)`);
    return deleted;
    
  } catch (error) {
    errorWithContext('Erro ao limpar logs antigos', error);
    return 0;
  }
}

/**
 * Obtém estatísticas dos logs
 * @returns {Object} Estatísticas
 */
function getLogStats() {
  if (!config.enableFile) {
    return { enabled: false };
  }
  
  try {
    const files = fs.readdirSync(config.logDir);
    let totalSize = 0;
    const fileStats = [];
    
    files.forEach(file => {
      const filepath = path.join(config.logDir, file);
      const stats = fs.statSync(filepath);
      totalSize += stats.size;
      
      fileStats.push({
        name: file,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
      });
    });
    
    return {
      enabled: true,
      directory: config.logDir,
      fileCount: files.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      files: fileStats.sort((a, b) => b.modified - a.modified),
    };
    
  } catch (error) {
    errorWithContext('Erro ao obter estatísticas de logs', error);
    return { enabled: true, error: error.message };
  }
}

/**
 * Log de evento do WhatsApp
 * @param {string} event - Nome do evento
 * @param {Object} data - Dados do evento
 */
function whatsappEvent(event, data = {}) {
  const whatsappLogger = createContextLogger('WhatsApp');
  whatsappLogger.info(`📱 Evento: ${event}`, data);
}

/**
 * Log de chamada à IA
 * @param {string} provider - Provedor (Groq, OpenAI, etc)
 * @param {Object} data - Dados da chamada
 */
function aiCall(provider, data = {}) {
  const aiLogger = createContextLogger('AI');
  aiLogger.info(`🤖 Chamada: ${provider}`, data);
}

/**
 * Log de operação no banco de dados
 * @param {string} operation - Operação (SELECT, INSERT, etc)
 * @param {string} table - Nome da tabela
 * @param {Object} data - Dados adicionais
 */
function dbOperation(operation, table, data = {}) {
  const dbLogger = createContextLogger('Database');
  dbLogger.debug(`💾 ${operation} em ${table}`, data);
}

/**
 * Função auxiliar para printStats (exportada do index.js)
 */
function printStats() {
  info('📊 ═══════════════════════════════════════');
  info('📊 ESTATÍSTICAS DO BOT');
  info('📊 ═══════════════════════════════════════');
  // Esta função pode ser expandida conforme necessário
}

// Exporta logger
export {
  configure,
  debug,
  info,
  warn,
  error,
  errorWithContext,
  startOperation,
  endOperation,
  measureTime,
  createContextLogger,
  structured,
  cleanOldLogs,
  getLogStats,
  whatsappEvent,
  aiCall,
  dbOperation,
  printStats,
  LOG_LEVELS
};

export default {
  configure,
  debug,
  info,
  warn,
  error,
  errorWithContext,
  startOperation,
  endOperation,
  measureTime,
  createContextLogger,
  structured,
  cleanOldLogs,
  getLogStats,
  whatsappEvent,
  aiCall,
  dbOperation,
  printStats,
  LOG_LEVELS
};