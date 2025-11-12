import { callGroqAI } from '../config/groq.js';
import { 
  getSystemPromptForCustomer, 
  FANPAGE_MESSAGE,
  detectRecommendedPlan,
  getSalesScript,
  getPlansComparison,
  getPlanDetails,
  PRICING_PLANS,
  SALES_SCRIPTS
} from '../utils/knowledgeBase.js';
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
 * 🔥 NOVO: CACHE DE CONTEXTO DE VENDAS
 * Armazena informações sobre o processo de venda de cada cliente
 */
const salesContextCache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 300
});

/**
 * Limite de mensagens no histórico
 */
const MAX_HISTORY_MESSAGES = 10;

/**
 * Obtém histórico de conversa do usuário
 */
function getConversationHistory(phone) {
  if (!phone) return [];
  return conversationCache.get(phone) || [];
}

/**
 * Salva histórico de conversa do usuário
 */
function saveConversationHistory(phone, history) {
  if (!phone) return;
  
  const limitedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  conversationCache.set(phone, limitedHistory);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `💾 Histórico salvo: ${phone} (${limitedHistory.length} mensagens)`);
  }
}

/**
 * 🔥 NOVO: Obtém contexto de vendas do usuário
 */
function getSalesContext(phone) {
  if (!phone) return null;
  return salesContextCache.get(phone) || {
    stage: 'discovery', // discovery, recommendation, objection, closing
    recommendedPlan: null,
    detectedNeeds: [],
    objections: [],
    questionsAsked: 0,
    planMentioned: false
  };
}

/**
 * 🔥 NOVO: Salva contexto de vendas
 */
function saveSalesContext(phone, context) {
  if (!phone) return;
  salesContextCache.set(phone, context);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `📊 Contexto de vendas salvo: ${phone} - Estágio: ${context.stage}`);
  }
}

/**
 * 🔥 NOVO: Atualiza estágio de vendas
 */
function updateSalesStage(phone, newStage, additionalData = {}) {
  const context = getSalesContext(phone);
  context.stage = newStage;
  
  // Merge additional data
  Object.assign(context, additionalData);
  
  saveSalesContext(phone, context);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🎯 Estágio atualizado para: ${newStage}`);
  }
}

/**
 * Adiciona mensagem ao histórico
 */
export function addToHistory(phone, role, content) {
  if (!phone || !role || !content) {
    log('WARNING', '⚠️ Tentativa de adicionar mensagem inválida ao histórico');
    return;
  }
  
  const history = getConversationHistory(phone);
  history.push({ role, content });
  saveConversationHistory(phone, history);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `📝 Mensagem adicionada: ${phone} [${role}] (${content.length} chars)`);
  }
}

/**
 * Limpa histórico de conversa
 */
export function clearConversationHistory(phone) {
  if (!phone) return;
  
  conversationCache.del(phone);
  salesContextCache.del(phone);
  log('INFO', `🗑️ Histórico e contexto limpos para: ${phone}`);
}

/**
 * Obtém tamanho do histórico
 */
export function getHistorySize(phone) {
  const history = getConversationHistory(phone);
  return history.length;
}

/**
 * Verifica se usuário tem histórico ativo
 */
export function hasActiveHistory(phone) {
  return conversationCache.has(phone);
}

/**
 * 🔥 NOVO: Analisa mensagem do cliente para contexto de vendas
 */
function analyzeMessageForSales(message, currentContext) {
  const analysis = {
    hasQuestion: false,
    hasPriceQuestion: false,
    hasComparisonQuestion: false,
    hasObjection: false,
    showsInterest: false,
    mentionsPlan: false,
    detectedPlan: null
  };
  
  const msg = message.toLowerCase();
  
  // Detecta perguntas
  analysis.hasQuestion = msg.includes('?') || 
    msg.includes('qual') || 
    msg.includes('como') || 
    msg.includes('quanto');
  
  // Detecta pergunta sobre preço
  analysis.hasPriceQuestion = msg.includes('preço') || 
    msg.includes('preco') || 
    msg.includes('valor') || 
    msg.includes('custa') || 
    msg.includes('quanto é') ||
    msg.includes('quanto e');
  
  // Detecta comparação entre planos
  analysis.hasComparisonQuestion = msg.includes('diferença') || 
    msg.includes('diferenca') || 
    msg.includes('comparar') || 
    msg.includes('qual melhor') ||
    msg.includes('qual escolher');
  
  // Detecta objeções comuns
  analysis.hasObjection = msg.includes('caro') || 
    msg.includes('muito dinheiro') || 
    msg.includes('não tenho') ||
    msg.includes('nao tenho') ||
    msg.includes('pensando');
  
  // Detecta sinais de interesse
  analysis.showsInterest = msg.includes('quero') || 
    msg.includes('interessado') || 
    msg.includes('gostei') || 
    msg.includes('vou querer') ||
    msg.includes('como faço') ||
    msg.includes('como faco') ||
    msg.includes('próximo passo') ||
    msg.includes('proximo passo');
  
  // Detecta menção a planos
  analysis.mentionsPlan = msg.includes('básico') || 
    msg.includes('basico') || 
    msg.includes('completo') || 
    msg.includes('r$ 299') ||
    msg.includes('r$ 499');
  
  // Detecta qual plano seria ideal
  analysis.detectedPlan = detectRecommendedPlan(message);
  
  return analysis;
}

/**
 * 🔥 NOVO: Gera instruções contextuais de vendas
 */
function getSalesContextInstructions(phone, customerName, salesContext, messageAnalysis) {
  const { stage, recommendedPlan, questionsAsked, planMentioned } = salesContext;
  
  let instructions = '\n\n## 🎯 CONTEXTO ATUAL DA VENDA:\n\n';
  
  // Estágio da venda
  switch (stage) {
    case 'discovery':
      instructions += `**Estágio:** DESCOBERTA (${questionsAsked}/3 perguntas feitas)\n\n`;
      
      if (questionsAsked === 0) {
        instructions += `**Ação:** Cumprimente ${customerName} e faça 2-3 perguntas para entender:\n`;
        instructions += `- Tipo de negócio e se já funciona\n`;
        instructions += `- Volume de pedidos por dia\n`;
        instructions += `- Necessidades específicas (pizzaria? vários bairros? fidelização?)\n\n`;
        instructions += `**Importante:** NÃO mencione preços ainda! Foque em entender necessidades.\n`;
      } else if (questionsAsked < 3 && !messageAnalysis.detectedPlan) {
        instructions += `**Ação:** Continue a descoberta. Faça mais 1-2 perguntas para clarificar necessidades.\n`;
        instructions += `Ainda não recomende plano - precise melhor o perfil do cliente.\n`;
      } else {
        instructions += `**Ação:** Você tem informações suficientes! Parta para RECOMENDAÇÃO.\n`;
        if (messageAnalysis.detectedPlan) {
          instructions += `**Plano detectado:** ${messageAnalysis.detectedPlan}\n`;
        }
      }
      break;
      
    case 'recommendation':
      instructions += `**Estágio:** RECOMENDAÇÃO\n`;
      instructions += `**Plano recomendado:** ${recommendedPlan || 'A definir'}\n\n`;
      
      if (!planMentioned) {
        instructions += `**Ação:** AGORA sim, recomende o plano ${recommendedPlan || 'adequado'}!\n`;
        instructions += `- Explique POR QUÊ é ideal para ele\n`;
        instructions += `- Destaque 3-4 benefícios principais\n`;
        instructions += `- Mencione valor E economia\n`;
        instructions += `- Use o script de recomendação apropriado\n`;
      } else {
        if (messageAnalysis.hasObjection) {
          instructions += `**Ação:** Cliente tem objeção! Trate com empatia:\n`;
          instructions += `1. Valide o sentimento\n`;
          instructions += `2. Apresente contra-argumento com dados\n`;
          instructions += `3. Reforce valor e ROI\n`;
        } else if (messageAnalysis.hasComparisonQuestion) {
          instructions += `**Ação:** Cliente quer comparar planos. Use a função getPlansComparison().\n`;
          instructions += `Explique de forma clara e direta as diferenças.\n`;
        } else if (messageAnalysis.showsInterest) {
          instructions += `**Ação:** Cliente demonstrou interesse! Parta para FECHAMENTO.\n`;
        } else {
          instructions += `**Ação:** Responda dúvidas e reforce benefícios do plano recomendado.\n`;
        }
      }
      break;
      
    case 'objection':
      instructions += `**Estágio:** TRATAMENTO DE OBJEÇÕES\n`;
      instructions += `**Plano recomendado:** ${recommendedPlan}\n\n`;
      instructions += `**Ação:** Continue tratando objeções com:\n`;
      instructions += `- Empatia e validação\n`;
      instructions += `- Dados concretos (ROI, economia)\n`;
      instructions += `- Prova social ou garantias\n`;
      instructions += `- Oferta de teste gratuito\n`;
      break;
      
    case 'closing':
      instructions += `**Estágio:** FECHAMENTO\n`;
      instructions += `**Plano escolhido:** ${recommendedPlan}\n\n`;
      instructions += `**Ação:** Conduza ao fechamento:\n`;
      instructions += `1. Parabenize a escolha\n`;
      instructions += `2. Reforce 2-3 benefícios principais\n`;
      instructions += `3. Passe próximos passos claros\n`;
      instructions += `4. Mencione bônus Instagram\n`;
      instructions += `5. Envie link da fanpage\n`;
      break;
  }
  
  // Análise da mensagem atual
  if (messageAnalysis.hasPriceQuestion && stage === 'discovery') {
    instructions += `\n⚠️ **Alerta:** Cliente perguntou sobre preço MAS ainda está em descoberta!\n`;
    instructions += `Diga que vai recomendar o melhor plano APÓS entender as necessidades dele.\n`;
  }
  
  if (messageAnalysis.hasComparisonQuestion) {
    instructions += `\n📊 **Comparação solicitada:** Use a comparação clara entre Básico e Completo.\n`;
  }
  
  return instructions;
}

/**
 * 🔥 MELHORADO: Processa mensagem de LEAD com vendas consultivas
 */
export async function processLeadMessage(phone, customerName, userMessage) {
  try {
    if (!phone || !customerName || !userMessage) {
      throw new Error('Parâmetros inválidos para processLeadMessage');
    }
    
    log('INFO', `🤖 Processando mensagem de LEAD: ${customerName} (${phone})`);
    
    // Obtém contextos
    const history = getConversationHistory(phone);
    const salesContext = getSalesContext(phone);
    const isFirstMessage = history.length === 0;
    
    // Analisa mensagem para contexto de vendas
    const messageAnalysis = analyzeMessageForSales(userMessage, salesContext);
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `📊 Análise: ${JSON.stringify(messageAnalysis)}`);
      log('INFO', `🎯 Estágio: ${salesContext.stage} | Plano: ${salesContext.recommendedPlan || 'nenhum'}`);
    }
    
    // Atualiza contexto de vendas baseado na análise
    if (isFirstMessage) {
      salesContext.stage = 'discovery';
      salesContext.questionsAsked = 0;
    } else if (messageAnalysis.detectedPlan && salesContext.stage === 'discovery') {
      // Tem informação suficiente para recomendar
      salesContext.stage = 'recommendation';
      salesContext.recommendedPlan = messageAnalysis.detectedPlan;
      salesContext.detectedNeeds.push(messageAnalysis.detectedPlan);
    } else if (salesContext.stage === 'discovery') {
      // Ainda em descoberta
      salesContext.questionsAsked++;
    }
    
    if (messageAnalysis.hasObjection && salesContext.stage === 'recommendation') {
      salesContext.stage = 'objection';
      salesContext.objections.push(userMessage);
    }
    
    if (messageAnalysis.showsInterest && 
        (salesContext.stage === 'recommendation' || salesContext.stage === 'objection')) {
      salesContext.stage = 'closing';
    }
    
    if (messageAnalysis.mentionsPlan) {
      salesContext.planMentioned = true;
    }
    
    saveSalesContext(phone, salesContext);
    
    // System prompt base
    const baseSystemPrompt = getSystemPromptForCustomer(customerName);
    
    // Instruções contextuais de vendas
    const salesInstructions = getSalesContextInstructions(
      phone, 
      customerName, 
      salesContext, 
      messageAnalysis
    );
    
    // System prompt completo
    const fullSystemPrompt = `${baseSystemPrompt}${salesInstructions}

## 📋 INFORMAÇÕES ADICIONAIS DO CLIENTE:

**Nome:** ${customerName}
**Histórico:** ${history.length} mensagens anteriores
**Estágio da venda:** ${salesContext.stage}
${salesContext.recommendedPlan ? `**Plano recomendado:** ${salesContext.recommendedPlan}` : ''}

---

**Lembre-se:**
- Use o histórico para criar continuidade
- Não repita informações já ditas
- Seja progressivo em cada resposta
- Máximo 10 linhas por resposta
- Use 2-4 emojis moderadamente`;
    
    // Monta mensagens
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
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `📤 Enviando para IA: ${messages.length} mensagens`);
    }
    
    // Chama a IA
    const aiResponse = await callGroqAI(messages);
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Resposta vazia da IA');
    }
    
    // Adiciona ao histórico
    addToHistory(phone, 'user', userMessage);
    addToHistory(phone, 'assistant', aiResponse);
    
    log('SUCCESS', `✅ Resposta gerada: ${customerName} [${salesContext.stage}] - ${aiResponse.length} chars`);
    
    return aiResponse;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem de lead: ${error.message}`);
    console.error(error);
    
    return `Desculpe ${customerName}, estou com dificuldades técnicas no momento. 😅\n\nMas não se preocupe! O Roberto pode te atender direto pelo WhatsApp: ${process.env.WHATSAPP_SUPPORT}`;
  }
}

/**
 * Processa mensagem de CLIENTE EXISTENTE
 */
export async function processClientMessage(phone, customerName, userMessage) {
  try {
    if (!phone || !customerName || !userMessage) {
      throw new Error('Parâmetros inválidos para processClientMessage');
    }
    
    log('INFO', `🤖 Processando mensagem de CLIENTE: ${customerName} (${phone})`);
    
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    const history = getConversationHistory(phone);
    const isFirstMessage = history.length === 0;
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `📊 Histórico: ${history.length} mensagens`);
    }
    
    // System prompt para clientes existentes
    const systemPrompt = `Você é o Assistente Virtual da Stream Studio.

O cliente ${customerName} já é um cliente conhecido e pode ter projetos em andamento com o ${ownerName}.

Sua função é:
1. Ser cordial e receptivo
2. Perguntar se ele tem algum projeto em andamento ou dúvida sobre algo já contratado
3. Se sim, informar que o ${ownerName} logo irá atendê-lo
4. Se não, perguntar como pode ajudar
5. Responder dúvidas gerais sobre a empresa
6. Para questões técnicas ou comerciais complexas, sempre encaminhe para o ${ownerName}

**IMPORTANTE:**
- Seja breve e objetivo (máximo 5 linhas)
- Não faça promessas sobre projetos ou prazos
- Use um tom amigável mas profissional
- ${isFirstMessage ? 'Cumprimente o cliente' : 'Continue a conversa naturalmente'}

**CONTATO:**
WhatsApp do ${ownerName}: ${process.env.WHATSAPP_SUPPORT}

**USO DO HISTÓRICO:**
- SEMPRE leia TODO o histórico antes de responder
- Não repita informações já fornecidas
- Faça referência ao que já foi discutido
- ${isFirstMessage ? '' : 'NÃO cumprimente novamente se já cumprimentou'}`;
    
    // Monta mensagens
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
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Resposta vazia da IA');
    }
    
    // Adiciona ao histórico
    addToHistory(phone, 'user', userMessage);
    addToHistory(phone, 'assistant', aiResponse);
    
    log('SUCCESS', `✅ Resposta gerada para cliente ${customerName} - ${aiResponse.length} chars`);
    
    return aiResponse;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem de cliente: ${error.message}`);
    console.error(error);
    
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    return `Desculpe ${customerName}, estou com dificuldades técnicas no momento. 😅\n\nO ${ownerName} logo irá te atender!`;
  }
}

/**
 * 🔥 MELHORADO: Gera mensagem de boas-vindas
 */
export async function generateWelcomeMessage(customerName, isLead = false) {
  try {
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    
    if (isLead) {
      // Para novos leads (SEMPRE na primeira mensagem)
      return `Olá ${customerName}! 👋

Sou o *Assistente Virtual da Stream Studio* e darei inicio ao seu atendimento ok! 🤖

Pode me perguntar à vontade sobre:
- O *Chat Bot Multi-tarefas* (temos 2 planos!)
- Desenvolvimento de sites, aplicativos
- Design, criação de logomarca
- Suporte técnico
- E muito mais!

Como posso ajudar você? 😊`;
    } else {
      // Para clientes recorrentes
      return `Olá *${customerName}*! 👋

Que bom te ver por aqui! 

Como posso ajudar hoje? É sobre algum projeto em andamento, ou alguma conversa já iniciada?

✅ *Se sim*, basta aguardar que o *${ownerName}* logo irá te atender.

❓ *Se não for*, me conte, como posso ajudar?`;
    }
  } catch (error) {
    log('ERROR', `❌ Erro ao gerar boas-vindas: ${error.message}`);
    return `Olá ${customerName}! 👋\n\nComo posso ajudar você hoje?`;
  }
}

/**
 * Verifica se deve enviar link da fanpage
 */
export function shouldSendFanpageLink(message) {
  if (!message || typeof message !== 'string') return false;
  
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
    'endereco',
    'quero ver',
    'mostrar',
    'próximo passo',
    'proximo passo',
    'como faço',
    'como faco'
  ];
  
  const msg = message.toLowerCase();
  return keywords.some(keyword => msg.includes(keyword));
}

/**
 * Verifica se deve encaminhar para o Roberto
 */
export function shouldForwardToOwner(message) {
  if (!message || typeof message !== 'string') return false;
  
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
 */
export function getAIStats() {
  const conversationKeys = conversationCache.keys();
  const salesKeys = salesContextCache.keys();
  
  let totalMessages = 0;
  const conversations = conversationKeys.map(phone => {
    const history = conversationCache.get(phone);
    const messageCount = history.length;
    totalMessages += messageCount;
    
    const salesContext = salesContextCache.get(phone);
    
    return {
      phone,
      messageCount,
      salesStage: salesContext?.stage || 'unknown',
      recommendedPlan: salesContext?.recommendedPlan || 'none'
    };
  });
  
  // Conta por estágio de venda
  const stageCount = {
    discovery: 0,
    recommendation: 0,
    objection: 0,
    closing: 0,
    unknown: 0
  };
  
  conversations.forEach(conv => {
    stageCount[conv.salesStage] = (stageCount[conv.salesStage] || 0) + 1;
  });
  
  return {
    activeConversations: conversationKeys.length,
    totalMessages,
    averageMessagesPerConversation: conversationKeys.length > 0 
      ? (totalMessages / conversationKeys.length).toFixed(1) 
      : 0,
    salesStages: stageCount,
    conversations
  };
}

/**
 * 🔥 NOVO: Obtém estatísticas de vendas
 */
export function getSalesStats() {
  const keys = salesContextCache.keys();
  
  const stats = {
    totalLeads: keys.length,
    byStage: {
      discovery: 0,
      recommendation: 0,
      objection: 0,
      closing: 0
    },
    byPlan: {
      basico: 0,
      completo: 0,
      indeciso: 0,
      none: 0
    },
    averageQuestionsAsked: 0
  };
  
  let totalQuestions = 0;
  
  keys.forEach(phone => {
    const context = salesContextCache.get(phone);
    if (context) {
      stats.byStage[context.stage] = (stats.byStage[context.stage] || 0) + 1;
      
      if (context.recommendedPlan) {
        stats.byPlan[context.recommendedPlan] = (stats.byPlan[context.recommendedPlan] || 0) + 1;
      } else {
        stats.byPlan.none++;
      }
      
      totalQuestions += context.questionsAsked || 0;
    }
  });
  
  stats.averageQuestionsAsked = keys.length > 0 
    ? (totalQuestions / keys.length).toFixed(1) 
    : 0;
  
  return stats;
}

/**
 * Limpa históricos expirados
 */
export function cleanExpiredHistories() {
  const conversationKeys = conversationCache.keys();
  const salesKeys = salesContextCache.keys();
  let cleaned = 0;
  
  conversationKeys.forEach(phone => {
    const ttl = conversationCache.getTtl(phone);
    if (!ttl || ttl === 0) {
      conversationCache.del(phone);
      cleaned++;
    }
  });
  
  salesKeys.forEach(phone => {
    const ttl = salesContextCache.getTtl(phone);
    if (!ttl || ttl === 0) {
      salesContextCache.del(phone);
    }
  });
  
  if (cleaned > 0) {
    log('SUCCESS', `✅ ${cleaned} histórico(s) expirado(s) removido(s)`);
  }
  
  return cleaned;
}

/**
 * Lista conversas ativas
 */
export function listActiveConversations() {
  const stats = getAIStats();
  
  console.log('\n💬 ╔═══════════════════════════════════════════╗');
  console.log('💬 CONVERSAS ATIVAS COM IA');
  console.log('💬 ╚═══════════════════════════════════════════╝');
  console.log(`Total: ${stats.activeConversations}`);
  console.log(`Mensagens totais: ${stats.totalMessages}`);
  console.log(`Média por conversa: ${stats.averageMessagesPerConversation}`);
  console.log('');
  console.log('📊 Por Estágio de Venda:');
  console.log(`   🔍 Descoberta: ${stats.salesStages.discovery}`);
  console.log(`   💡 Recomendação: ${stats.salesStages.recommendation}`);
  console.log(`   ⚠️ Objeção: ${stats.salesStages.objection}`);
  console.log(`   ✅ Fechamento: ${stats.salesStages.closing}`);
  console.log('');
  
  if (stats.conversations.length > 0) {
    console.log('Detalhes:');
    stats.conversations.forEach((conv, index) => {
      console.log(`${index + 1}. ${conv.phone}`);
      console.log(`   Mensagens: ${conv.messageCount} | Estágio: ${conv.salesStage} | Plano: ${conv.recommendedPlan}`);
      console.log('');
    });
  }
  
  console.log('💬 ╚═══════════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVO: Mostra estatísticas de vendas
 */
export function showSalesStats() {
  const stats = getSalesStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS DE VENDAS');
  console.log('📊 ╚═══════════════════════════════════════════╝');
  console.log(`Total de Leads: ${stats.totalLeads}`);
  console.log('');
  console.log('Por Estágio:');
  console.log(`   🔍 Descoberta: ${stats.byStage.discovery}`);
  console.log(`   💡 Recomendação: ${stats.byStage.recommendation}`);
  console.log(`   ⚠️ Objeção: ${stats.byStage.objection}`);
  console.log(`   ✅ Fechamento: ${stats.byStage.closing}`);
  console.log('');
  console.log('Por Plano Recomendado:');
  console.log(`   🌟 Básico: ${stats.byPlan.basico}`);
  console.log(`   🚀 Completo: ${stats.byPlan.completo}`);
  console.log(`   ❓ Indeciso: ${stats.byPlan.indeciso}`);
  console.log(`   ➖ Nenhum: ${stats.byPlan.none}`);
  console.log('');
  console.log(`Média de perguntas feitas: ${stats.averageQuestionsAsked}`);
  console.log('📊 ╚═══════════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVO: Reseta contexto de vendas de um usuário
 */
export function resetSalesContext(phone) {
  if (!phone) return false;
  
  const existed = salesContextCache.has(phone);
  salesContextCache.del(phone);
  
  if (existed) {
    log('INFO', `🔄 Contexto de vendas resetado: ${phone}`);
  }
  
  return existed;
}

/**
 * 🔥 NOVO: Obtém detalhes do contexto de vendas (para debug)
 */
export function getSalesContextDetails(phone) {
  if (!phone) return null;
  
  const context = getSalesContext(phone);
  const history = getConversationHistory(phone);
  
  return {
    phone,
    salesContext: context,
    historySize: history.length,
    lastMessages: history.slice(-3).map(msg => ({
      role: msg.role,
      preview: msg.content.substring(0, 50) + '...'
    }))
  };
}

/**
 * 🔥 NOVO: Força mudança de estágio de vendas (útil para testes)
 */
export function forceSalesStage(phone, stage, planOverride = null) {
  if (!phone || !stage) return false;
  
  const validStages = ['discovery', 'recommendation', 'objection', 'closing'];
  if (!validStages.includes(stage)) {
    log('WARNING', `⚠️ Estágio inválido: ${stage}`);
    return false;
  }
  
  const context = getSalesContext(phone);
  context.stage = stage;
  
  if (planOverride) {
    context.recommendedPlan = planOverride;
  }
  
  saveSalesContext(phone, context);
  log('SUCCESS', `✅ Estágio forçado para: ${stage} ${planOverride ? `(Plano: ${planOverride})` : ''}`);
  
  return true;
}

/**
 * 🔥 NOVO: Exporta dados de vendas para análise
 */
export function exportSalesData() {
  const keys = salesContextCache.keys();
  
  const data = keys.map(phone => {
    const context = salesContextCache.get(phone);
    const history = getConversationHistory(phone);
    
    return {
      phone,
      stage: context.stage,
      recommendedPlan: context.recommendedPlan,
      questionsAsked: context.questionsAsked,
      detectedNeeds: context.detectedNeeds,
      objections: context.objections,
      planMentioned: context.planMentioned,
      messageCount: history.length,
      exportedAt: new Date().toISOString()
    };
  });
  
  return {
    exportDate: new Date().toISOString(),
    totalLeads: keys.length,
    leads: data
  };
}

export default {
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  clearConversationHistory,
  shouldSendFanpageLink,
  shouldForwardToOwner,
  getAIStats,
  getSalesStats,
  getHistorySize,
  hasActiveHistory,
  cleanExpiredHistories,
  listActiveConversations,
  showSalesStats,
  addToHistory,
  resetSalesContext,
  getSalesContextDetails,
  forceSalesStage,
  exportSalesData
};