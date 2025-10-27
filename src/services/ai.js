import { callGroqAI } from '../config/groq.js';
import { getSystemPromptForCustomer, FANPAGE_MESSAGE } from '../utils/knowledgeBase.js';
import { log } from '../utils/helpers.js';
import NodeCache from 'node-cache';

/**
 * CACHE DE HISTÓRICO DE CONVERSAS
 * Armazena o histórico de mensagens com a IA para cada usuário
 * TTL: 1 hora (3600 segundos)
 */
const conversationCache = new NodeCache({ 
  stdTTL: 3600,
  checkperiod: 300 
});

/**
 * Limite de mensagens no histórico (para não ultrapassar limite de tokens)
 */
const MAX_HISTORY_MESSAGES = 10;

/**
 * Obtém histórico de conversa do usuário
 * @param {string} phone - Número do telefone
 * @returns {Array}
 */
function getConversationHistory(phone) {
  return conversationCache.get(phone) || [];
}

/**
 * Salva histórico de conversa do usuário
 * @param {string} phone - Número do telefone
 * @param {Array} history - Histórico de mensagens
 */
function saveConversationHistory(phone, history) {
  // Limita o tamanho do histórico
  const limitedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  conversationCache.set(phone, limitedHistory);
}

/**
 * Adiciona mensagem ao histórico
 * @param {string} phone - Número do telefone
 * @param {string} role - Papel (user ou assistant)
 * @param {string} content - Conteúdo da mensagem
 */
function addToHistory(phone, role, content) {
  const history = getConversationHistory(phone);
  history.push({ role, content });
  saveConversationHistory(phone, history);
}

/**
 * Limpa histórico de conversa de um usuário
 * @param {string} phone - Número do telefone
 */
export function clearConversationHistory(phone) {
  conversationCache.del(phone);
  log('INFO', `🗑️ Histórico de conversa limpo para: ${phone}`);
}

/**
 * 🔥 NOVO: Gera instruções de contextualização dinâmicas
 * @param {boolean} isFirstMessage - Se é a primeira mensagem
 * @param {string} customerName - Nome do cliente
 * @returns {string}
 */
function getContextInstructions(isFirstMessage, customerName) {
  if (isFirstMessage) {
    return `
## 📍 CONTEXTO ATUAL:
Esta é a **PRIMEIRA MENSAGEM** do cliente ${customerName}.

**VOCÊ DEVE:**
✅ Cumprimentar o cliente pelo nome
✅ Se apresentar como Assistente Virtual da Stream Studio
✅ Ser caloroso e acolhedor

**EXEMPLO:**
"Olá ${customerName}! 👋 Sou o Assistente Virtual da Stream Studio..."
`;
  } else {
    return `
## 📍 CONTEXTO ATUAL:
Esta é uma **CONTINUAÇÃO** de conversa com ${customerName}.

**HISTÓRICO DISPONÍVEL:**
O histórico completo está acima. Leia TODO o histórico antes de responder.

**VOCÊ DEVE:**
✅ Continuar naturalmente a partir do contexto anterior
✅ Referenciar informações já mencionadas
✅ Ser progressivo: cada resposta avança a conversa
✅ NÃO repetir informações já fornecidas

**VOCÊ NÃO DEVE:**
❌ Cumprimentar novamente ("Olá", "Oi", etc.)
❌ Se reapresentar
❌ Repetir informações do histórico
❌ Recomeçar a conversa do zero

**EXEMPLO CORRETO:**
Cliente: "Qual o preço?"
Você: "O bot está em promoção: R$ 499,00..." ← ✅ Direto ao ponto

Cliente: "Posso parcelar?"
Você: "Sim! Você pode parcelar em até 5x..." ← ✅ Continua naturalmente
`;
  }
}

/**
 * Processa mensagem com a IA para NOVO LEAD (interessado no bot)
 * @param {string} phone - Número do telefone
 * @param {string} customerName - Nome do cliente
 * @param {string} userMessage - Mensagem do usuário
 * @returns {Promise<string>} Resposta da IA
 */
export async function processLeadMessage(phone, customerName, userMessage) {
  try {
    log('INFO', `🤖 Processando mensagem de LEAD: ${customerName}`);
    
    // Obtém histórico
    const history = getConversationHistory(phone);
    
    // 🔥 NOVO: Verifica se é primeira mensagem
    const isFirstMessage = history.length === 0;
    
    log('INFO', `📊 Histórico: ${history.length} mensagens | Primeira mensagem: ${isFirstMessage}`);
    
    // System prompt base
    const baseSystemPrompt = getSystemPromptForCustomer(customerName);
    
    // 🔥 NOVO: Adiciona instruções de contextualização
    const contextInstructions = getContextInstructions(isFirstMessage, customerName);
    
    // System prompt completo
    const fullSystemPrompt = `${baseSystemPrompt}

${contextInstructions}

## 🎯 REGRAS DE SAUDAÇÃO:

**QUANDO SAUDAR:**
✅ Apenas na primeira mensagem (histórico vazio)
✅ Quando cliente envia saudação explícita ("Oi", "Olá", "Bom dia")

**QUANDO NÃO SAUDAR:**
❌ Em qualquer continuação de conversa
❌ Quando cliente faz pergunta direta
❌ Quando já cumprimentou antes no histórico

**IMPORTANTE:**
- Se há histórico, NÃO cumprimente novamente
- Continue a conversa naturalmente
- Faça referência ao que já foi discutido`;
    
    // Monta array de mensagens
    const messages = [
      {
        role: 'system',
        content: fullSystemPrompt
      },
      ...history,
      {
        role: 'user',
        content: userMessage
      }
    ];
    
    // Chama a IA
    const aiResponse = await callGroqAI(messages);
    
    // Adiciona ao histórico
    addToHistory(phone, 'user', userMessage);
    addToHistory(phone, 'assistant', aiResponse);
    
    log('SUCCESS', `✅ Resposta gerada para ${customerName} (${isFirstMessage ? 'PRIMEIRA' : 'CONTINUAÇÃO'})`);
    
    return aiResponse;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem de lead: ${error.message}`);
    return `Desculpe ${customerName}, estou com dificuldades técnicas no momento. 😅\n\nMas não se preocupe! O Roberto pode te atender direto pelo WhatsApp: ${process.env.WHATSAPP_SUPPORT}`;
  }
}

/**
 * Processa mensagem com a IA para CLIENTE EXISTENTE
 * @param {string} phone - Número do telefone
 * @param {string} customerName - Nome do cliente
 * @param {string} userMessage - Mensagem do usuário
 * @returns {Promise<string>} Resposta da IA
 */
export async function processClientMessage(phone, customerName, userMessage) {
  try {
    log('INFO', `🤖 Processando mensagem de CLIENTE: ${customerName}`);
    
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    
    // Obtém histórico
    const history = getConversationHistory(phone);
    
    // 🔥 NOVO: Verifica se é primeira mensagem
    const isFirstMessage = history.length === 0;
    
    log('INFO', `📊 Histórico: ${history.length} mensagens | Primeira mensagem: ${isFirstMessage}`);
    
    // 🔥 NOVO: Adiciona instruções de contextualização
    const contextInstructions = getContextInstructions(isFirstMessage, customerName);
    
    // System prompt para clientes existentes (mais genérico)
    const systemPrompt = `Você é o Assistente Virtual da Stream Studio.

O cliente ${customerName} já é um cliente conhecido e pode ter projetos em andamento com o ${ownerName}.

Sua função é:
1. Ser cordial e receptivo
2. Perguntar se ele tem algum projeto em andamento
3. Se sim, informar que o ${ownerName} logo irá atendê-lo
4. Se não, perguntar como pode ajudar
5. Responder dúvidas gerais sobre a empresa
6. Sempre que apropriado, informar que o ${ownerName} pode dar mais detalhes

**IMPORTANTE:**
- Seja breve e objetivo (máximo 5 linhas)
- Não faça promessas sobre projetos ou prazos
- Para questões técnicas específicas, sempre encaminhe para o ${ownerName}
- Use um tom amigável mas profissional

**CONTATO:**
WhatsApp do Roberto: ${process.env.WHATSAPP_SUPPORT}

${contextInstructions}

## 🎯 REGRAS DE SAUDAÇÃO:

**QUANDO SAUDAR:**
✅ Apenas na primeira mensagem (histórico vazio)
✅ Quando cliente envia saudação explícita ("Oi", "Olá", "Bom dia")

**QUANDO NÃO SAUDAR:**
❌ Em qualquer continuação de conversa
❌ Quando cliente faz pergunta direta
❌ Quando já cumprimentou antes no histórico

**USO DO HISTÓRICO:**
- SEMPRE leia TODO o histórico antes de responder
- Não repita informações já fornecidas
- Faça referência ao que já foi discutido
- Seja progressivo: cada resposta avança a conversa`;
    
    // Monta array de mensagens
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...history,
      {
        role: 'user',
        content: userMessage
      }
    ];
    
    // Chama a IA
    const aiResponse = await callGroqAI(messages);
    
    // Adiciona ao histórico
    addToHistory(phone, 'user', userMessage);
    addToHistory(phone, 'assistant', aiResponse);
    
    log('SUCCESS', `✅ Resposta gerada para cliente ${customerName} (${isFirstMessage ? 'PRIMEIRA' : 'CONTINUAÇÃO'})`);
    
    return aiResponse;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem de cliente: ${error.message}`);
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    return `Desculpe ${customerName}, estou com dificuldades técnicas no momento. 😅\n\nO ${ownerName} logo irá te atender!`;
  }
}

/**
 * Gera resposta de boas-vindas inteligente com IA
 * @param {string} customerName - Nome do cliente
 * @param {boolean} isLead - Se é um novo lead
 * @returns {Promise<string>}
 */
export async function generateWelcomeMessage(customerName, isLead = false) {
  try {
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    
    if (isLead) {
      // Para novos leads interessados no bot
      return `Olá ${customerName}! 👋

Sou o *Assistente Virtual da Stream Studio* e estou aqui para tirar suas dúvidas sobre o *Chat Bot Multi-tarefas* para delivery! 🤖

Pode me perguntar à vontade sobre:
- Funcionalidades do bot
- Preços e formas de pagamento
- Como funciona a instalação
- Suporte técnico
- E muito mais!

Como posso ajudar você? 😊`;
    } else {
      // Para clientes existentes
      return `Olá *${customerName}*! 👋

Eu sou o *Assistente Virtual*, desenvolvido pela *Stream Studio*, e vou iniciar seu atendimento ok.

Você já possui algum projeto em andamento, ou alguma conversa já iniciada?

✅ *Se sim*, basta aguardar que o *${ownerName}* logo irá te atender.

❓ *Se ainda não*, me conte, como posso ajudar?`;
    }
  } catch (error) {
    log('ERROR', `❌ Erro ao gerar boas-vindas: ${error.message}`);
    return `Olá ${customerName}! 👋\n\nComo posso ajudar você hoje?`;
  }
}

/**
 * Verifica se a mensagem menciona interesse em ver a fanpage
 * @param {string} message - Mensagem do usuário
 * @returns {boolean}
 */
export function shouldSendFanpageLink(message) {
  const keywords = [
    'fanpage',
    'site',
    'página',
    'pagina',
    'demonstração',
    'demonstracao',
    'ver mais',
    'conhecer',
    'acessar',
    'link',
    'endereço',
    'endereco'
  ];
  
  const msg = message.toLowerCase();
  return keywords.some(keyword => msg.includes(keyword));
}

/**
 * Verifica se deve encaminhar para o Roberto (questões complexas)
 * @param {string} message - Mensagem do usuário
 * @returns {boolean}
 */
export function shouldForwardToOwner(message) {
  const keywords = [
    'falar com',
    'quero falar',
    'atendimento humano',
    'pessoa',
    'alguém',
    'alguem',
    'urgente',
    'problema',
    'reclamação',
    'reclamacao',
    'roberto'
  ];
  
  const msg = message.toLowerCase();
  return keywords.some(keyword => msg.includes(keyword));
}

/**
 * Obtém estatísticas de uso da IA
 * @returns {Object}
 */
export function getAIStats() {
  const keys = conversationCache.keys();
  
  return {
    activeConversations: keys.length,
    totalMessages: keys.reduce((total, key) => {
      const history = conversationCache.get(key);
      return total + history.length;
    }, 0)
  };
}

export default {
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  clearConversationHistory,
  shouldSendFanpageLink,
  shouldForwardToOwner,
  getAIStats
};