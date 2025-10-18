import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Inicializa cliente Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/**
 * Configurações padrão da IA
 */
export const AI_CONFIG = {
  model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
  temperature: 0.7,
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

    return response.trim();

  } catch (error) {
    console.error('❌ Erro ao chamar Groq AI:', error.message);
    
    // Mensagem de fallback em caso de erro
    if (error.message.includes('API key')) {
      return 'Desculpe, há um problema com a configuração da IA. Entre em contato com o suporte técnico.';
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
  return true;
}

export default groq;