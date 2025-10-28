import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Inicializa cliente Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/**
 * Configurações padrão da IA
 * 
 * 🔥 TEMPERATURA AJUSTADA: 0.5 (antes: 0.7)
 * 
 * EXPLICAÇÃO:
 * - 0.0 a 0.3: Muito determinístico e focado
 * - 0.4 a 0.6: Equilibrado - criativo mas consistente ✅ (RECOMENDADO)
 * - 0.7 a 1.0: Muito criativo e imprevisível
 * 
 * Para um chatbot de atendimento, precisamos de:
 * ✅ Consistência nas respostas
 * ✅ Foco no contexto e instruções
 * ✅ Menos "criatividade" e mais "precisão"
 * ❌ Evitar respostas repetitivas ou fora do padrão
 */
export const AI_CONFIG = {
  model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
  temperature: 0.5, // 🔥 ALTERADO de 0.7 para 0.5
  max_tokens: parseInt(process.env.MAX_AI_TOKENS) || 2000,
  top_p: 0.9,
  stream: false
};

/**
 * 🔥 NOVA: Configurações de retry
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 segundo
  maxDelay: 10000  // 10 segundos
};

/**
 * 🔥 NOVA: Estatísticas de chamadas
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
 * 🔥 NOVA FUNÇÃO: Sleep/delay para retry
 * @param {number} ms - Milissegundos
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 🔥 NOVA FUNÇÃO: Calcula delay exponencial para retry
 * @param {number} attempt - Número da tentativa
 * @returns {number} Delay em milissegundos
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
 * 🔥 MELHORADA: Faz uma chamada para a IA Groq com retry automático
 * @param {Array} messages - Array de mensagens no formato [{ role, content }]
 * @param {Object} customConfig - Configurações personalizadas (opcional)
 * @returns {Promise<string>} Resposta da IA
 */
export async function callGroqAI(messages, customConfig = {}) {
  const config = { ...AI_CONFIG, ...customConfig };
  const startTime = Date.now();
  
  // Validação de entrada
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new Error('Mensagens inválidas para callGroqAI');
  }
  
  apiStats.totalCalls++;
  apiStats.lastCallTime = new Date();
  
  // 🔥 RETRY LOGIC
  let lastError = null;
  
  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Log da tentativa
      if (process.env.DEBUG_AI === 'true') {
        console.log(`🤖 Chamada Groq AI (Tentativa ${attempt + 1}/${RETRY_CONFIG.maxRetries}):`);
        console.log(`   Modelo: ${config.model}`);
        console.log(`   Temperatura: ${config.temperature}`);
        console.log(`   Max Tokens: ${config.max_tokens}`);
        console.log(`   Mensagens: ${messages.length}`);
      }
      
      // Faz a chamada
      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        top_p: config.top_p,
        stream: config.stream
      });

      const response = chatCompletion.choices[0]?.message?.content || '';
      
      if (!response || response.trim().length === 0) {
        throw new Error('Resposta vazia da IA');
      }

      // Sucesso!
      const responseTime = Date.now() - startTime;
      apiStats.successfulCalls++;
      
      // Atualiza média de tempo de resposta
      const totalSuccessful = apiStats.successfulCalls;
      apiStats.averageResponseTime = (
        (apiStats.averageResponseTime * (totalSuccessful - 1) + responseTime) / totalSuccessful
      );
      
      if (process.env.DEBUG_AI === 'true') {
        console.log(`✅ Resposta gerada com sucesso:`);
        console.log(`   Tamanho: ${response.length} caracteres`);
        console.log(`   Tempo: ${responseTime}ms`);
        console.log(`   Tokens usados: ${chatCompletion.usage?.total_tokens || 'N/A'}`);
        
        if (attempt > 0) {
          console.log(`   ⚠️ Sucesso após ${attempt} tentativa(s) falhada(s)`);
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
      console.error(`❌ Erro na chamada Groq AI (Tentativa ${attempt + 1}/${RETRY_CONFIG.maxRetries}):`);
      console.error(`   Erro: ${error.message}`);
      
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
      
      if (process.env.DEBUG_AI === 'true') {
        console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
      }
      
      await sleep(delay);
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  console.error(`❌ Todas as tentativas falharam para chamada Groq AI`);
  console.error(`   Último erro: ${lastError?.message}`);
  
  // Retorna mensagem de erro apropriada
  return getErrorMessage(lastError);
}

/**
 * 🔥 NOVA FUNÇÃO: Gera mensagem de erro apropriada
 * @param {Error} error - Erro capturado
 * @returns {string} Mensagem para o usuário
 */
function getErrorMessage(error) {
  if (!error) {
    return 'Desculpe, estou com dificuldades técnicas no momento. Por favor, aguarde que o Roberto irá atendê-lo em breve.';
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
  return 'Desculpe, estou com dificuldades técnicas no momento. Por favor, aguarde que o Roberto irá atendê-lo em breve.';
}

/**
 * Valida se a API Key está configurada
 * @returns {boolean}
 */
export function validateGroqConfig() {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'sua_chave_groq_aqui') {
    console.error('❌ ERRO: Chave da API Groq não configurada!');
    console.error('📝 Configure a variável GROQ_API_KEY no arquivo .env');
    console.error('🔗 Obtenha sua chave em: https://console.groq.com/keys');
    return false;
  }
  
  console.log('✅ Groq AI configurado com sucesso!');
  console.log(`📊 Modelo: ${AI_CONFIG.model}`);
  console.log(`🌡️  Temperatura: ${AI_CONFIG.temperature}`);
  console.log(`📝 Max Tokens: ${AI_CONFIG.max_tokens}`);
  console.log(`🔄 Max Retries: ${RETRY_CONFIG.maxRetries}`);
  
  return true;
}

/**
 * Permite ajustar temperatura dinamicamente se necessário
 * @param {number} newTemperature - Nova temperatura (0.0 a 1.0)
 */
export function setTemperature(newTemperature) {
  if (newTemperature < 0 || newTemperature > 1) {
    console.warn('⚠️ Temperatura deve estar entre 0.0 e 1.0');
    return false;
  }
  
  AI_CONFIG.temperature = newTemperature;
  console.log(`🌡️ Temperatura ajustada para: ${newTemperature}`);
  return true;
}

/**
 * Retorna configurações atuais
 * @returns {Object}
 */
export function getAIConfig() {
  return { ...AI_CONFIG };
}

/**
 * 🔥 NOVA FUNÇÃO: Obtém estatísticas de uso da API
 * @returns {Object}
 */
export function getAPIStats() {
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
 * 🔥 NOVA FUNÇÃO: Mostra estatísticas no console
 */
export function showAPIStats() {
  const stats = getAPIStats();
  
  console.log('\n🤖 ╔═══════════════════════════════════════════╗');
  console.log('🤖 ESTATÍSTICAS DA API GROQ');
  console.log('🤖 ╚═══════════════════════════════════════════╝');
  console.log(`📞 Total de chamadas: ${stats.totalCalls}`);
  console.log(`✅ Chamadas bem-sucedidas: ${stats.successfulCalls}`);
  console.log(`❌ Chamadas falhadas: ${stats.failedCalls}`);
  console.log(`📊 Taxa de sucesso: ${stats.successRate}`);
  console.log(`🔄 Total de retries: ${stats.totalRetries}`);
  console.log(`⚡ Tempo médio de resposta: ${stats.averageResponseTime}`);
  
  if (stats.lastCallTime) {
    console.log(`🕐 Última chamada: ${stats.lastCallTime.toLocaleString('pt-BR')}`);
  }
  
  if (stats.lastError) {
    console.log(`\n⚠️ Último erro:`);
    console.log(`   Mensagem: ${stats.lastError.message}`);
    console.log(`   Timestamp: ${stats.lastError.timestamp.toLocaleString('pt-BR')}`);
    console.log(`   Tentativa: ${stats.lastError.attempt}`);
  }
  
  console.log('🤖 ╚═══════════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVA FUNÇÃO: Reseta estatísticas
 */
export function resetAPIStats() {
  apiStats.totalCalls = 0;
  apiStats.successfulCalls = 0;
  apiStats.failedCalls = 0;
  apiStats.totalRetries = 0;
  apiStats.averageResponseTime = 0;
  apiStats.lastError = null;
  apiStats.lastCallTime = null;
  
  console.log('✅ Estatísticas da API resetadas');
}

/**
 * 🔥 NOVA FUNÇÃO: Testa conexão com a API
 * @returns {Promise<boolean>}
 */
export async function testAPIConnection() {
  console.log('\n🧪 Testando conexão com Groq API...\n');
  
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
      console.log('✅ Conexão com Groq API bem-sucedida!');
      console.log(`   Resposta recebida: "${response}"\n`);
      return true;
    } else {
      console.log('❌ Conexão falhou: resposta vazia\n');
      return false;
    }
  } catch (error) {
    console.log(`❌ Conexão falhou: ${error.message}\n`);
    return false;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Ajusta configurações de retry
 * @param {Object} newConfig - Novas configurações
 */
export function setRetryConfig(newConfig) {
  if (newConfig.maxRetries !== undefined) {
    RETRY_CONFIG.maxRetries = newConfig.maxRetries;
  }
  if (newConfig.baseDelay !== undefined) {
    RETRY_CONFIG.baseDelay = newConfig.baseDelay;
  }
  if (newConfig.maxDelay !== undefined) {
    RETRY_CONFIG.maxDelay = newConfig.maxDelay;
  }
  
  console.log('✅ Configurações de retry atualizadas:');
  console.log(`   Max Retries: ${RETRY_CONFIG.maxRetries}`);
  console.log(`   Base Delay: ${RETRY_CONFIG.baseDelay}ms`);
  console.log(`   Max Delay: ${RETRY_CONFIG.maxDelay}ms`);
}

/**
 * 🔥 NOVA FUNÇÃO: Obtém configurações de retry atuais
 * @returns {Object}
 */
export function getRetryConfig() {
  return { ...RETRY_CONFIG };
}

export default groq;