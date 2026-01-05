/**
 * ⚙️ OmniWA Bot - Configuração de Variáveis de Ambiente
 * 
 * Responsabilidades:
 * - Carregar variáveis do arquivo .env
 * - Validar variáveis obrigatórias
 * - Fornecer valores padrão quando apropriado
 * - Exportar configuração organizada para toda aplicação
 */

require('dotenv').config();

/**
 * Valida se uma variável obrigatória existe
 */
function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ Variável de ambiente obrigatória não encontrada: ${key}`);
  }
  return value;
}

/**
 * Retorna variável ou valor padrão
 */
function getEnv(key, defaultValue) {
  return process.env[key] || defaultValue;
}

/**
 * Converte string para boolean
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

/**
 * Converte string para número
 */
function parseNumber(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ================================
// 🧠 CONFIGURAÇÕES DA IA (GROQ)
// ================================
const groq = {
  apiKey: requireEnv('GROQ_API_KEY'),
  model: getEnv('AI_MODEL', 'llama-3.3-70b-versatile'),
  temperature: parseFloat(getEnv('AI_TEMPERATURE', '0.7')),
  maxTokens: parseNumber(process.env.MAX_AI_TOKENS, 2000),
  timeout: parseNumber(process.env.AI_TIMEOUT, 30) * 1000 // converter para ms
};

// ================================
// 🗄️ CONFIGURAÇÕES DO SUPABASE
// ================================
const supabase = {
  url: requireEnv('SUPABASE_URL'),
  projectId: requireEnv('SUPABASE_PROJECT_ID'),
  anonKey: requireEnv('SUPABASE_ANON_KEY'),
  serviceKey: getEnv('SUPABASE_SERVICE_KEY', null)
};

// ================================
// 📱 CONFIGURAÇÕES DO WHATSAPP (BAILEYS)
// ================================
const whatsapp = {
  sessionName: getEnv('SESSION_NAME', 'omniwa-bot-session'),
  reconnectTimeout: parseNumber(process.env.RECONNECT_TIMEOUT, 5000),
  maxReconnectAttempts: parseNumber(process.env.MAX_RECONNECT_ATTEMPTS, 10)
};

// ================================
// 🏢 INFORMAÇÕES DA PLATAFORMA
// ================================
const platform = {
  name: getEnv('PLATFORM_NAME', 'OmniWA'),
  url: getEnv('PLATFORM_URL', 'https://omniwa-saas.web.app/'),
  botName: getEnv('BOT_NAME', 'Assistente OmniWA'),
  ownerName: getEnv('OWNER_NAME', 'Suporte'),
  ownerPhone: getEnv('OWNER_PHONE', ''),
  whatsappSupport: getEnv('WHATSAPP_SUPPORT', '')
};

// ================================
// ⏰ HORÁRIO DE ATENDIMENTO
// ================================
const businessHours = {
  startHour: parseNumber(process.env.BUSINESS_START_HOUR, 9),
  endHour: parseNumber(process.env.BUSINESS_END_HOUR, 18),
  startDay: parseNumber(process.env.BUSINESS_START_DAY, 1), // 1 = Segunda
  endDay: parseNumber(process.env.BUSINESS_END_DAY, 5), // 5 = Sexta
  timezone: getEnv('TIMEZONE', 'America/Sao_Paulo')
};

// ================================
// 🎯 CONFIGURAÇÕES DO BOT
// ================================
const bot = {
  conversationTimeoutDays: parseNumber(process.env.CONVERSATION_TIMEOUT_DAYS, 7),
  welcomeNewLead: parseBoolean(process.env.WELCOME_NEW_LEAD, true),
  welcomeReturningClient: parseBoolean(process.env.WELCOME_RETURNING_CLIENT, true)
};

// ================================
// 🎮 COMANDOS
// ================================
const commands = {
  assume: getEnv('COMMAND_ASSUME', '/assumir'),
  release: getEnv('COMMAND_RELEASE', '/liberar'),
  menu: getEnv('COMMAND_MENU', '/menu'),
  help: getEnv('COMMAND_HELP', '/ajuda'),
  about: getEnv('COMMAND_ABOUT', '/sobre'),
  plans: getEnv('COMMAND_PLANS', '/planos')
};

// ================================
// 🔧 SERVIDOR HTTP
// ================================
const server = {
  port: parseNumber(process.env.PORT, 3000),
  appUrl: getEnv('APP_URL', '')
};

// ================================
// 🐛 DEBUG E LOGS
// ================================
const debug = {
  logLevel: getEnv('LOG_LEVEL', 'info'),
  debugMode: parseBoolean(process.env.DEBUG_MODE, false),
  debugAI: parseBoolean(process.env.DEBUG_AI, false),
  debugWhatsapp: parseBoolean(process.env.DEBUG_WHATSAPP, false)
};

// ================================
// 🚀 AMBIENTE
// ================================
const environment = {
  nodeEnv: getEnv('NODE_ENV', 'development'),
  hostingPlatform: getEnv('HOSTING_PLATFORM', 'supabase'),
  isProduction: getEnv('NODE_ENV', 'development') === 'production',
  isDevelopment: getEnv('NODE_ENV', 'development') === 'development'
};

// ================================
// 📚 RAG (RETRIEVAL-AUGMENTED GENERATION)
// ================================
const rag = {
  maxDocuments: parseNumber(process.env.RAG_MAX_DOCUMENTS, 5),
  similarityThreshold: parseFloat(getEnv('RAG_SIMILARITY_THRESHOLD', '0.7'))
};

// ================================
// 📦 EXPORTAÇÃO FINAL
// ================================
const config = {
  groq,
  supabase,
  whatsapp,
  platform,
  businessHours,
  bot,
  commands,
  server,
  debug,
  environment,
  rag
};

/**
 * Valida configuração completa
 */
function validateConfig() {
  const errors = [];

  // Validações críticas
  if (!config.groq.apiKey) {
    errors.push('GROQ_API_KEY é obrigatória');
  }

  if (!config.supabase.url) {
    errors.push('SUPABASE_URL é obrigatória');
  }

  if (!config.supabase.anonKey) {
    errors.push('SUPABASE_ANON_KEY é obrigatória');
  }

  // Validações de valores
  if (config.groq.temperature < 0 || config.groq.temperature > 2) {
    errors.push('AI_TEMPERATURE deve estar entre 0 e 2');
  }

  if (config.rag.similarityThreshold < 0 || config.rag.similarityThreshold > 1) {
    errors.push('RAG_SIMILARITY_THRESHOLD deve estar entre 0 e 1');
  }

  if (errors.length > 0) {
    throw new Error(`❌ Erros na configuração:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return true;
}

// Valida ao carregar
validateConfig();

// Exporta configuração
module.exports = config;