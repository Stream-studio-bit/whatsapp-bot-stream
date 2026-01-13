// Convertido para ES Modules
/**
 * 🧠 OmniWA Bot - Configuração Groq AI
 * 
 * Responsabilidades:
 * - Configurar cliente Groq (modelo, temperatura, timeout)
 * - Fazer chamadas à IA com retry automático
 * - Monitorar estatísticas de uso da API
 * - Validar configuração da API Key
 */

import Groq from 'groq-sdk';
import config from './env.js';
import logger from '../utils/logger.js';

// Inicializa cliente Groq
const groq = new Groq({
  apiKey: config.groq.apiKey
});

/**
 * 📊 Estatísticas de chamadas da API
 */
const apiStats = {
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  totalRetries: 0,
  averageResponseTime: 0,
  lastError: null,
  lastCallTime: null
};

/**
 * ⚙️ Configurações de retry
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 segundo
  maxDelay: 10000  // 10 segundos
};

/**
 * ⏱️ Sleep/delay para retry
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 📈 Calcula delay exponencial para retry
 */
function getExponentialDelay(attempt) {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelay
  );
  // Adiciona jitter (aleatoriedade) para evitar thundering herd
  const jitter = Math.random() * 0.3 * delay;
  return Math.floor(delay + jitter);
}

/**
 * 🤖 Faz chamada à IA Groq com retry automático
 * 
 * @param {Array} messages - Array de mensagens no formato [{ role, content }]
 * @param {Object} customConfig - Configurações personalizadas (opcional)
 * @returns {Promise<string>} Resposta da IA
 */
async function callGroqAI(messages, customConfig = {}) {
  // Configuração final (merge com customConfig)
  const aiConfig = {
    model: customConfig.model || config.groq.model,
    temperature: customConfig.temperature !== undefined ? customConfig.temperature : config.groq.temperature,
    max_tokens: customConfig.max_tokens || config.groq.maxTokens,
    top_p: customConfig.top_p || 0.9,
    stream: false
  };

  const startTime = Date.now();
  
  // Validação de entrada
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new Error('Mensagens inválidas para callGroqAI');
  }
  
  apiStats.totalCalls++;
  apiStats.lastCallTime = new Date();
  
  let lastError = null;
  
  // Loop de retry
  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Log da tentativa (se debug ativado)
      if (config.debug.debugAI) {
        logger.debug(`🤖 Chamada Groq AI (Tentativa ${attempt + 1}/${RETRY_CONFIG.maxRetries}):`);
        logger.debug(`   Modelo: ${aiConfig.model}`);
        logger.debug(`   Temperatura: ${aiConfig.temperature}`);
        logger.debug(`   Max Tokens: ${aiConfig.max_tokens}`);
        logger.debug(`   Mensagens: ${messages.length}`);
      }
      
      // Faz a chamada
      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: aiConfig.model,
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.max_tokens,
        top_p: aiConfig.top_p,
        stream: aiConfig.stream
      });

      const response = chatCompletion.choices[0]?.message?.content || '';
      
      if (!response || response.trim().length === 0) {
        throw new Error('Resposta vazia da IA');
      }

      // ✅ SUCESSO!
      const responseTime = Date.now() - startTime;
      apiStats.successfulCalls++;
      
      // Atualiza média de tempo de resposta
      const totalSuccessful = apiStats.successfulCalls;
      apiStats.averageResponseTime = (
        (apiStats.averageResponseTime * (totalSuccessful - 1) + responseTime) / totalSuccessful
      );
      
      if (config.debug.debugAI) {
        logger.debug(`✅ Resposta gerada com sucesso:`);
        logger.debug(`   Tamanho: ${response.length} caracteres`);
        logger.debug(`   Tempo: ${responseTime}ms`);
        logger.debug(`   Tokens usados: ${chatCompletion.usage?.total_tokens || 'N/A'}`);
        
        if (attempt > 0) {
          logger.debug(`   ⚠️ Sucesso após ${attempt} tentativa(s) falhada(s)`);
          apiStats.totalRetries += attempt;
        }
      }

      return response.trim();

    } catch (error) {
      lastError = error;
      apiStats.lastError = {
        message: error.message,
        timestamp: new Date(),
        attempt: attempt + 1
      };
      
      // Log do erro
      logger.error(`❌ Erro na chamada Groq AI (Tentativa ${attempt + 1}/${RETRY_CONFIG.maxRetries}):`);
      logger.error(`   Erro: ${error.message}`);
      
      // Verifica se deve fazer retry
      const isLastAttempt = attempt === RETRY_CONFIG.maxRetries - 1;
      
      // Erros que NÃO devem fazer retry
      const shouldNotRetry = 
        error.message.includes('API key') ||
        error.message.includes('invalid_api_key') ||
        error.message.includes('authentication') ||
        error.message.includes('model_not_found');
      
      if (isLastAttempt || shouldNotRetry) {
        // Última tentativa ou erro não recuperável
        apiStats.failedCalls++;
        break;
      }
      
      // Calcula delay antes do retry
      const delay = getExponentialDelay(attempt);
      
      if (config.debug.debugAI) {
        logger.debug(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
      }
      
      await sleep(delay);
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  logger.error(`❌ Todas as tentativas falharam para chamada Groq AI`);
  logger.error(`   Último erro: ${lastError?.message}`);
  
  // Retorna mensagem de erro apropriada
  return getErrorMessage(lastError);
}

/**
 * 💬 Gera mensagem de erro apropriada para o usuário
 */
function getErrorMessage(error) {
  if (!error) {
    return `Desculpe, estou com dificuldades técnicas no momento. Por favor, entre em contato com ${config.platform.ownerName} para atendimento.`;
  }
  
  const errorMsg = error.message.toLowerCase();
  
  // Erro de API key
  if (errorMsg.includes('api key') || errorMsg.includes('authentication')) {
    return 'Desculpe, há um problema com a configuração da IA. Entre em contato com o suporte técnico.';
  }
  
  // Rate limit
  if (errorMsg.includes('rate_limit') || errorMsg.includes('too many requests')) {
    return 'Desculpe, estou processando muitas mensagens no momento. Por favor, aguarde alguns segundos e tente novamente.';
  }
  
  // Timeout
  if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
    return 'Desculpe, a resposta está demorando mais que o esperado. Por favor, tente novamente em alguns instantes.';
  }
  
  // Erro genérico
  return `Desculpe, estou com dificuldades técnicas no momento. Por favor, entre em contato com ${config.platform.ownerName} para atendimento.`;
}

/**
 * ✅ Valida se a configuração está correta
 */
function validateGroqConfig() {
  try {
    if (!config.groq.apiKey || config.groq.apiKey === 'sua_chave_groq_aqui') {
      logger.error('❌ ERRO: Chave da API Groq não configurada!');
      logger.error('📝 Configure a variável GROQ_API_KEY no arquivo .env');
      logger.error('🔗 Obtenha sua chave em: https://console.groq.com/keys');
      return false;
    }
    
    logger.info('✅ Groq AI configurado com sucesso!');
    logger.info(`📊 Modelo: ${config.groq.model}`);
    logger.info(`🌡️  Temperatura: ${config.groq.temperature}`);
    logger.info(`📝 Max Tokens: ${config.groq.maxTokens}`);
    logger.info(`🔄 Max Retries: ${RETRY_CONFIG.maxRetries}`);
    
    return true;
  } catch (error) {
    logger.error('❌ Erro ao validar configuração Groq:', error);
    return false;
  }
}

/**
 * 🔧 Permite ajustar temperatura dinamicamente
 */
function setTemperature(newTemperature) {
  if (newTemperature < 0 || newTemperature > 2) {
    logger.warn('⚠️ Temperatura deve estar entre 0.0 e 2.0');
    return false;
  }
  
  config.groq.temperature = newTemperature;
  logger.info(`🌡️ Temperatura ajustada para: ${newTemperature}`);
  return true;
}

/**
 * 📊 Obtém estatísticas de uso da API
 */
function getAPIStats() {
  const successRate = apiStats.totalCalls > 0
    ? ((apiStats.successfulCalls / apiStats.totalCalls) * 100).toFixed(1)
    : 0;
  
  return {
    totalCalls: apiStats.totalCalls,
    successfulCalls: apiStats.successfulCalls,
    failedCalls: apiStats.failedCalls,
    successRate: `${successRate}%`,
    totalRetries: apiStats.totalRetries,
    averageResponseTime: `${Math.round(apiStats.averageResponseTime)}ms`,
    lastCallTime: apiStats.lastCallTime,
    lastError: apiStats.lastError
  };
}

/**
 * 📈 Mostra estatísticas no console
 */
function showAPIStats() {
  const stats = getAPIStats();
  
  logger.info('🤖 ╔═══════════════════════════════════════════╗');
  logger.info('🤖 ESTATÍSTICAS DA API GROQ');
  logger.info('🤖 ╚═══════════════════════════════════════════╝');
  logger.info(`📞 Total de chamadas: ${stats.totalCalls}`);
  logger.info(`✅ Chamadas bem-sucedidas: ${stats.successfulCalls}`);
  logger.info(`❌ Chamadas falhadas: ${stats.failedCalls}`);
  logger.info(`📊 Taxa de sucesso: ${stats.successRate}`);
  logger.info(`🔄 Total de retries: ${stats.totalRetries}`);
  logger.info(`⚡ Tempo médio de resposta: ${stats.averageResponseTime}`);
  
  if (stats.lastCallTime) {
    logger.info(`🕐 Última chamada: ${stats.lastCallTime.toLocaleString('pt-BR')}`);
  }
  
  if (stats.lastError) {
    logger.info(`\n⚠️ Último erro:`);
    logger.info(`   Mensagem: ${stats.lastError.message}`);
    logger.info(`   Timestamp: ${stats.lastError.timestamp.toLocaleString('pt-BR')}`);
    logger.info(`   Tentativa: ${stats.lastError.attempt}`);
  }
  
  logger.info('🤖 ╚═══════════════════════════════════════════╝\n');
}

/**
 * 🔄 Reseta estatísticas
 */
function resetAPIStats() {
  apiStats.totalCalls = 0;
  apiStats.successfulCalls = 0;
  apiStats.failedCalls = 0;
  apiStats.totalRetries = 0;
  apiStats.averageResponseTime = 0;
  apiStats.lastError = null;
  apiStats.lastCallTime = null;
  
  logger.info('✅ Estatísticas da API resetadas');
}

/**
 * 🧪 Testa conexão com a API
 */
async function testAPIConnection() {
  logger.info('\n🧪 Testando conexão com Groq API...\n');
  
  try {
    const testMessages = [
      {
        role: 'system',
        content: 'Você é um assistente de teste. Responda apenas com "OK".'
      },
      {
        role: 'user',
        content: 'teste'
      }
    ];
    
    const response = await callGroqAI(testMessages, { max_tokens: 10 });
    
    if (response && response.length > 0) {
      logger.info('✅ Conexão com Groq API bem-sucedida!');
      logger.info(`   Resposta recebida: "${response}"\n`);
      return true;
    } else {
      logger.error('❌ Conexão falhou: resposta vazia\n');
      return false;
    }
  } catch (error) {
    logger.error(`❌ Conexão falhou: ${error.message}\n`);
    return false;
  }
}

/**
 * 🔧 Ajusta configurações de retry
 */
function setRetryConfig(newConfig) {
  if (newConfig.maxRetries !== undefined) {
    RETRY_CONFIG.maxRetries = newConfig.maxRetries;
  }
  if (newConfig.baseDelay !== undefined) {
    RETRY_CONFIG.baseDelay = newConfig.baseDelay;
  }
  if (newConfig.maxDelay !== undefined) {
    RETRY_CONFIG.maxDelay = newConfig.maxDelay;
  }
  
  logger.info('✅ Configurações de retry atualizadas:');
  logger.info(`   Max Retries: ${RETRY_CONFIG.maxRetries}`);
  logger.info(`   Base Delay: ${RETRY_CONFIG.baseDelay}ms`);
  logger.info(`   Max Delay: ${RETRY_CONFIG.maxDelay}ms`);
}

/**
 * 📋 Obtém configurações de retry atuais
 */
function getRetryConfig() {
  return { ...RETRY_CONFIG };
}

/**
 * 📦 Inicializa e valida a configuração do Groq
 */
async function loadGroqConfig() {
  const isValid = validateGroqConfig();
  
  if (!isValid) {
    throw new Error('Configuração do Groq inválida');
  }
  
  // Teste de conexão (opcional, apenas em modo debug)
  if (config.debug.debugAI) {
    await testAPIConnection();
  }
  
  return true;
}

export {
  groq,
  callGroqAI,
  loadGroqConfig,
  validateGroqConfig,
  setTemperature,
  getAPIStats,
  showAPIStats,
  resetAPIStats,
  testAPIConnection,
  setRetryConfig,
  getRetryConfig
};