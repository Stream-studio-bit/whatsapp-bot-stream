/**
 * groqClient.js
 * Faz chamada direta ao Groq (IA)
 * Retorna a resposta da IA sem pós-processamento
 */

const Groq = require('groq-sdk');
const { groqConfig } = require('../../config/groq');
const logger = require('../utils/logger');

// Inicializa o cliente Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Envia uma mensagem para a IA e retorna a resposta
 * @param {string} userMessage - Mensagem do usuário
 * @param {string} systemPrompt - Prompt do sistema (instruções para IA)
 * @param {Array} conversationHistory - Histórico de mensagens (opcional)
 * @returns {Promise<string>} Resposta da IA
 */
async function sendMessage(userMessage, systemPrompt, conversationHistory = []) {
  try {
    logger.debug('Enviando mensagem para Groq...');

    // Monta o array de mensagens
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Chama a API do Groq
    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: groqConfig.model,
      temperature: groqConfig.temperature,
      max_tokens: groqConfig.maxTokens,
      top_p: groqConfig.topP,
      stream: false,
    });

    // Extrai a resposta
    const response = chatCompletion.choices[0]?.message?.content || '';

    if (!response) {
      logger.warn('Groq retornou resposta vazia');
      return 'Desculpe, não consegui processar sua mensagem. Tente novamente.';
    }

    logger.debug(`✅ Resposta recebida do Groq (${response.length} caracteres)`);
    return response;

  } catch (error) {
    logger.error('Erro ao chamar Groq:', error);
    
    // Tratamento de erros específicos
    if (error.status === 429) {
      return 'Estou processando muitas requisições no momento. Por favor, aguarde alguns segundos e tente novamente.';
    }
    
    if (error.status === 401) {
      logger.error('❌ API Key do Groq inválida');
      return 'Erro de autenticação com a IA. Entre em contato com o suporte.';
    }
    
    if (error.status === 500 || error.status === 503) {
      return 'O serviço de IA está temporariamente indisponível. Tente novamente em alguns instantes.';
    }

    return 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
  }
}

/**
 * Envia uma mensagem com streaming (resposta em tempo real)
 * @param {string} userMessage - Mensagem do usuário
 * @param {string} systemPrompt - Prompt do sistema
 * @param {Function} onChunk - Callback chamado para cada pedaço da resposta
 * @param {Array} conversationHistory - Histórico de mensagens (opcional)
 * @returns {Promise<string>} Resposta completa da IA
 */
async function sendMessageStream(userMessage, systemPrompt, onChunk, conversationHistory = []) {
  try {
    logger.debug('Enviando mensagem para Groq com streaming...');

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const stream = await groq.chat.completions.create({
      messages: messages,
      model: groqConfig.model,
      temperature: groqConfig.temperature,
      max_tokens: groqConfig.maxTokens,
      top_p: groqConfig.topP,
      stream: true,
    });

    let fullResponse = '';

    // Processa cada chunk do streaming
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        fullResponse += content;
        
        // Chama callback com o pedaço recebido
        if (onChunk) {
          onChunk(content);
        }
      }
    }

    logger.debug(`✅ Streaming concluído (${fullResponse.length} caracteres)`);
    return fullResponse;

  } catch (error) {
    logger.error('Erro ao chamar Groq com streaming:', error);
    throw error;
  }
}

/**
 * Conta tokens de uma mensagem (estimativa)
 * @param {string} text - Texto para contar tokens
 * @returns {number} Quantidade estimada de tokens
 */
function estimateTokens(text) {
  // Estimativa aproximada: 1 token ≈ 4 caracteres em português
  return Math.ceil(text.length / 4);
}

/**
 * Verifica se o tamanho da conversa está dentro do limite
 * @param {Array} conversationHistory - Histórico de mensagens
 * @param {string} newMessage - Nova mensagem a adicionar
 * @returns {boolean} True se está dentro do limite
 */
function isWithinTokenLimit(conversationHistory, newMessage) {
  let totalTokens = estimateTokens(newMessage);

  for (const msg of conversationHistory) {
    totalTokens += estimateTokens(msg.content);
  }

  const limit = groqConfig.maxTokens * 0.8; // 80% do limite para segurança
  return totalTokens < limit;
}

/**
 * Trunca o histórico de conversa para caber no limite de tokens
 * @param {Array} conversationHistory - Histórico completo
 * @param {number} maxMessages - Máximo de mensagens a manter
 * @returns {Array} Histórico truncado
 */
function truncateHistory(conversationHistory, maxMessages = 10) {
  if (conversationHistory.length <= maxMessages) {
    return conversationHistory;
  }

  // Mantém apenas as N mensagens mais recentes
  return conversationHistory.slice(-maxMessages);
}

/**
 * Valida a configuração do cliente Groq
 * @returns {Object} Status da validação
 */
function validateConfig() {
  const issues = [];

  if (!process.env.GROQ_API_KEY) {
    issues.push('GROQ_API_KEY não configurada');
  }

  if (!groqConfig.model) {
    issues.push('Modelo não configurado');
  }

  if (groqConfig.temperature < 0 || groqConfig.temperature > 2) {
    issues.push('Temperature deve estar entre 0 e 2');
  }

  if (groqConfig.maxTokens < 1) {
    issues.push('maxTokens deve ser maior que 0');
  }

  return {
    valid: issues.length === 0,
    issues: issues,
  };
}

/**
 * Testa a conexão com o Groq
 * @returns {Promise<boolean>} True se conectou com sucesso
 */
async function testConnection() {
  try {
    logger.info('Testando conexão com Groq...');

    const response = await sendMessage(
      'Olá',
      'Você é um assistente útil. Responda apenas "Conexão OK".',
      []
    );

    const success = response.toLowerCase().includes('ok') || response.toLowerCase().includes('conexão');
    
    if (success) {
      logger.info('✅ Conexão com Groq estabelecida com sucesso');
    } else {
      logger.warn('⚠️ Resposta inesperada do Groq:', response);
    }

    return success;
  } catch (error) {
    logger.error('❌ Falha ao testar conexão com Groq:', error);
    return false;
  }
}

module.exports = {
  sendMessage,
  sendMessageStream,
  estimateTokens,
  isWithinTokenLimit,
  truncateHistory,
  validateConfig,
  testConnection,
};