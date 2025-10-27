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
 * Faz uma chamada para a IA Groq
 * @param {Array} messages - Array de mensagens no formato [{ role, content }]
 * @param {Object} customConfig - Configurações personalizadas (opcional)
 * @returns {Promise<string>} Resposta da IA
 */
export async function callGroqAI(messages, customConfig = {}) {
  try {
    const config = { ...AI_CONFIG, ...customConfig };
    
    // 🔍 Log de configuração para debug
    if (process.env.DEBUG_AI === 'true') {
      console.log('🤖 Chamada Groq AI:');
      console.log(`   Modelo: ${config.model}`);
      console.log(`   Temperatura: ${config.temperature}`);
      console.log(`   Max Tokens: ${config.max_tokens}`);
      console.log(`   Mensagens: ${messages.length}`);
    }
    
    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      top_p: config.top_p,
      stream: config.stream
    });

    const response = chatCompletion.choices[0]?.message?.content || '';
    
    if (!response) {
      throw new Error('Resposta vazia da IA');
    }

    // 🔍 Log de resposta para debug
    if (process.env.DEBUG_AI === 'true') {
      console.log(`✅ Resposta gerada (${response.length} caracteres)`);
    }

    return response.trim();

  } catch (error) {
    console.error('❌ Erro ao chamar Groq AI:', error.message);
    
    // Mensagem de fallback em caso de erro
    if (error.message.includes('API key')) {
      return 'Desculpe, há um problema com a configuração da IA. Entre em contato com o suporte técnico.';
    }
    
    if (error.message.includes('rate_limit')) {
      return 'Desculpe, estou processando muitas mensagens no momento. Por favor, aguarde alguns segundos e tente novamente.';
    }
    
    return 'Desculpe, estou com dificuldades técnicas no momento. Por favor, aguarde que o Roberto irá atendê-lo em breve.';
  }
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
  
  return true;
}

/**
 * 🆕 NOVO: Permite ajustar temperatura dinamicamente se necessário
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
 * 🆕 NOVO: Retorna configurações atuais
 * @returns {Object}
 */
export function getAIConfig() {
  return { ...AI_CONFIG };
}

export default groq;