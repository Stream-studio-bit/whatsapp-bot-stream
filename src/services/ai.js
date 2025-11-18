import { callGroqAI } from '../config/groq.js';
import { 
  getSystemPromptForProspection,
  detectInterlocutorType,
  detectBusinessSegment,
  detectHandoffRequest,
  getPitchForSegment,
  getGenericPitch,
  getPricingInfo,
  getHostingInfo,
  getFanpageMessage,
  getHandoffMessage,
  PROSPECTION_STAGES,
  BUSINESS_SEGMENTS
} from '../utils/knowledgeBase.js';
import { log } from '../utils/helpers.js';
import NodeCache from 'node-cache';

/**
 * 💾 CACHE DE HISTÓRICO DE CONVERSAS
 */
const conversationCache = new NodeCache({ 
  stdTTL: 3600,
  checkperiod: 300 
});

/**
 * 🔥 CACHE DE CONTEXTO DE PROSPECÇÃO
 */
const prospectionContextCache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 300
});

/**
 * Limite de mensagens no histórico
 */
const MAX_HISTORY_MESSAGES = 15;

/**
 * Obtém histórico de conversa
 */
function getConversationHistory(phone) {
  if (!phone) return [];
  return conversationCache.get(phone) || [];
}

/**
 * Salva histórico de conversa
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
 * 🔥 OBTÉM CONTEXTO DE PROSPECÇÃO
 */
function getProspectionContext(phone) {
  if (!phone) return null;
  
  return prospectionContextCache.get(phone) || {
    isProspecting: false,
    prospectStage: 'qualification',
    interlocutorType: null,
    businessSegment: null,
    lastResponseTime: null,
    responseTimesMs: [],
    questionsAsked: 0,
    pitchSent: false,
    pricingMentioned: false
  };
}

/**
 * 🔥 SALVA CONTEXTO DE PROSPECÇÃO
 */
function saveProspectionContext(phone, context) {
  if (!phone) return;
  prospectionContextCache.set(phone, context);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🎯 Contexto de prospecção salvo: ${phone} - Estágio: ${context.prospectStage}`);
  }
}

/**
 * 🔥 REGISTRA TEMPO DE RESPOSTA DO LEAD
 */
function recordResponseTime(phone) {
  const context = getProspectionContext(phone);
  const now = Date.now();
  
  let responseTimeSeconds = null;
  
  if (context.lastResponseTime) {
    const deltaMs = now - context.lastResponseTime;
    responseTimeSeconds = Math.floor(deltaMs / 1000);
    
    // Armazena últimos 3 tempos de resposta
    context.responseTimesMs.push(deltaMs);
    if (context.responseTimesMs.length > 3) {
      context.responseTimesMs.shift();
    }
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `⏱️ Tempo de resposta: ${responseTimeSeconds}s`);
    }
  }
  
  context.lastResponseTime = now;
  saveProspectionContext(phone, context);
  
  return responseTimeSeconds;
}

/**
 * 🔥 CALCULA TEMPO MÉDIO DE RESPOSTA
 */
function getAverageResponseTime(phone) {
  const context = getProspectionContext(phone);
  
  if (context.responseTimesMs.length === 0) {
    return null;
  }
  
  const sum = context.responseTimesMs.reduce((a, b) => a + b, 0);
  const avgMs = sum / context.responseTimesMs.length;
  
  return Math.floor(avgMs / 1000);
}

/**
 * Adiciona mensagem ao histórico
 */
export function addToHistory(phone, role, content, metadata = {}) {
  if (!phone || !role || !content) {
    log('WARNING', '⚠️ Tentativa de adicionar mensagem inválida ao histórico');
    return;
  }
  
  const history = getConversationHistory(phone);
  history.push({ 
    role, 
    content,
    timestamp: new Date().toISOString(),
    ...metadata
  });
  saveConversationHistory(phone, history);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `📝 Mensagem adicionada: ${phone} [${role}] (${content.length} chars)`);
  }
}

/**
 * 🔥 ANALISA MENSAGEM PARA CONTEXTO DE PROSPECÇÃO
 */
function analyzeProspectionMessage(message, responseTimeSeconds) {
  const analysis = {
    // Detecções temporais
    likelyChatbot: responseTimeSeconds !== null && responseTimeSeconds < 5,
    likelyAtendente: responseTimeSeconds !== null && responseTimeSeconds >= 10 && responseTimeSeconds <= 30,
    likelyDecisor: responseTimeSeconds !== null && responseTimeSeconds > 30,
    
    // Detecções de conteúdo
    interlocutorType: null,
    businessSegment: null,
    handoffRequested: false,
    
    // Sinais de interesse
    askingPrice: false,
    showingInterest: false,
    hasObjection: false,
    readyToTest: false
  };
  
  const msg = message.toLowerCase();
  
  // Detecta tipo de interlocutor
  analysis.interlocutorType = detectInterlocutorType(responseTimeSeconds, message);
  
  // Detecta segmento
  analysis.businessSegment = detectBusinessSegment(message);
  
  // Detecta solicitação de handoff
  analysis.handoffRequested = detectHandoffRequest(message);
  
  // Sinais de preço
  analysis.askingPrice = msg.includes('preço') || 
    msg.includes('preco') || 
    msg.includes('valor') || 
    msg.includes('custa') ||
    msg.includes('quanto');
  
  // Sinais de interesse
  analysis.showingInterest = msg.includes('quero') || 
    msg.includes('interessado') || 
    msg.includes('gostei') ||
    msg.includes('como faço') ||
    msg.includes('próximo passo');
  
  // Objeções
  analysis.hasObjection = msg.includes('caro') || 
    msg.includes('muito dinheiro') ||
    msg.includes('pensando') ||
    msg.includes('não sei');
  
  // Pronto para testar
  analysis.readyToTest = msg.includes('teste') || 
    msg.includes('testar') ||
    msg.includes('demonstração') ||
    msg.includes('ver funcionando');
  
  return analysis;
}

/**
 * 🔥 ATUALIZA ESTÁGIO DE PROSPECÇÃO
 */
function updateProspectionStage(phone, analysis, context) {
  const currentStage = context.prospectStage;
  let newStage = currentStage;
  
  // Handoff sempre tem prioridade
  if (analysis.handoffRequested) {
    newStage = 'handoff';
    context.prospectStage = newStage;
    saveProspectionContext(phone, context);
    return newStage;
  }
  
  // Lógica de progressão de estágios
  switch (currentStage) {
    case 'qualification':
      // Progride para discovery se identificou interlocutor
      if (analysis.interlocutorType) {
        context.interlocutorType = analysis.interlocutorType;
        
        // Se é decisor, vai direto para discovery
        if (analysis.interlocutorType === 'decisor') {
          newStage = 'discovery';
        }
        // Se é chatbot/atendente, continua tentando chegar ao decisor
      }
      break;
      
    case 'discovery':
      // Progride para presentation se identificou segmento
      if (analysis.businessSegment) {
        context.businessSegment = analysis.businessSegment;
        newStage = 'presentation';
      }
      // Ou se fez perguntas suficientes
      else if (context.questionsAsked >= 2) {
        newStage = 'presentation';
      }
      break;
      
    case 'presentation':
      // Progride para demonstration se mostrou interesse
      if (analysis.showingInterest || analysis.readyToTest) {
        newStage = 'demonstration';
      }
      // Ou se pitch foi enviado
      else if (context.pitchSent) {
        newStage = 'demonstration';
      }
      break;
      
    case 'demonstration':
      // Progride para pricing se perguntou preço
      if (analysis.askingPrice) {
        newStage = 'pricing';
      }
      break;
      
    case 'pricing':
      // Pricing já é final, aguarda handoff ou mais perguntas
      break;
  }
  
  if (newStage !== currentStage) {
    context.prospectStage = newStage;
    saveProspectionContext(phone, context);
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `📊 Estágio atualizado: ${currentStage} → ${newStage}`);
    }
  }
  
  return newStage;
}

/**
 * 🔥 GERA INSTRUÇÕES CONTEXTUAIS DE PROSPECÇÃO
 */
function getProspectionInstructions(phone, customerName, context, analysis) {
  const { prospectStage, interlocutorType, businessSegment, questionsAsked, pitchSent, pricingMentioned } = context;
  
  let instructions = '\n\n## 🎯 CONTEXTO ATUAL DA PROSPECÇÃO:\n\n';
  
  instructions += `**Estágio:** ${prospectStage.toUpperCase()}\n`;
  
  if (interlocutorType) {
    instructions += `**Interlocutor detectado:** ${interlocutorType}\n`;
  }
  
  if (businessSegment) {
    const segment = BUSINESS_SEGMENTS[businessSegment];
    instructions += `**Segmento identificado:** ${segment?.nome || businessSegment}\n`;
  }
  
  instructions += `**Perguntas feitas:** ${questionsAsked}\n\n`;
  
  // Instruções específicas por estágio
  const stageInfo = PROSPECTION_STAGES[prospectStage];
  
  if (stageInfo) {
    instructions += `**Objetivo deste estágio:** ${stageInfo.objetivo}\n\n`;
  }
  
  // Ações específicas
  switch (prospectStage) {
    case 'qualification':
      instructions += `**AÇÃO:**\n`;
      
      if (!interlocutorType) {
        instructions += `1. Você ainda não identificou o interlocutor\n`;
        instructions += `2. Observe o tempo de resposta e padrões de linguagem\n`;
        instructions += `3. Se chatbot → pedir humano educadamente\n`;
        instructions += `4. Se atendente → pedir para falar com responsável\n`;
        instructions += `5. Se decisor → partir para discovery\n\n`;
      } else if (interlocutorType === 'chatbot') {
        instructions += `✅ Chatbot confirmado! Peça direcionamento ao setor comercial.\n\n`;
      } else if (interlocutorType === 'atendente') {
        instructions += `✅ Atendente confirmado! Crie rapport e peça para falar com responsável.\n\n`;
      } else if (interlocutorType === 'decisor') {
        instructions += `✅ Decisor confirmado! Parta para DISCOVERY agora.\n\n`;
      }
      break;
      
    case 'discovery':
      instructions += `**AÇÃO:**\n`;
      
      if (!businessSegment && questionsAsked < 2) {
        instructions += `1. Faça perguntas para identificar o segmento:\n`;
        instructions += `   - "Qual é o segmento de vocês?"\n`;
        instructions += `   - "Quantos atendimentos fazem por dia?"\n`;
        instructions += `   - "Qual a maior dificuldade no atendimento atual?"\n`;
        instructions += `2. AINDA NÃO apresente solução!\n`;
        instructions += `3. Foque em entender necessidades\n\n`;
      } else {
        instructions += `✅ Informações suficientes coletadas!\n`;
        instructions += `Parta para PRESENTATION com pitch adaptado.\n\n`;
      }
      break;
      
    case 'presentation':
      instructions += `**AÇÃO:**\n`;
      
      if (!pitchSent) {
        if (businessSegment) {
          const segment = BUSINESS_SEGMENTS[businessSegment];
          instructions += `✅ Use o pitch específico para: ${segment?.nome}\n\n`;
          instructions += `**PITCH A USAR:**\n${segment?.pitch}\n\n`;
        } else {
          instructions += `⚠️ Segmento não identificado. Use pitch genérico:\n\n`;
          instructions += `${getGenericPitch()}\n\n`;
        }
        instructions += `Após enviar pitch, aguarde reação para próximo estágio.\n\n`;
      } else {
        instructions += `✅ Pitch já enviado!\n`;
        instructions += `Responda dúvidas e prepare para oferecer demonstração.\n\n`;
      }
      break;
      
    case 'demonstration':
      instructions += `**AÇÃO:**\n`;
      instructions += `1. Ofereça teste gratuito via fanpage\n`;
      instructions += `2. Mencione que IA roda localmente (importante!)\n`;
      instructions += `3. Cite upgrade 24/7 opcional (R$ 150)\n`;
      instructions += `4. Use: ${getFanpageMessage()}\n\n`;
      break;
      
    case 'pricing':
      instructions += `**AÇÃO:**\n`;
      
      if (!pricingMentioned) {
        instructions += `1. Explique modelo de precificação completo:\n`;
        instructions += `${getPricingInfo(true)}\n\n`;
        instructions += `2. Seja TRANSPARENTE sobre cashback (depende de indicações)\n`;
        instructions += `3. Mencione servidor local vs 24/7\n\n`;
      } else {
        instructions += `✅ Precificação já apresentada!\n`;
        instructions += `Responda objeções e prepare para handoff se cliente demonstrar interesse.\n\n`;
      }
      break;
      
    case 'handoff':
      instructions += `**AÇÃO:**\n`;
      instructions += `🚨 TRANSFERIR PARA ATENDIMENTO HUMANO AGORA!\n\n`;
      instructions += `Use: ${getHandoffMessage()}\n\n`;
      instructions += `Sistema bloqueará IA automaticamente após envio.\n\n`;
      break;
  }
  
  // Alertas especiais baseados na análise
  if (analysis.handoffRequested) {
    instructions += `\n🚨 **ALERTA:** Cliente solicitou atendimento humano!\n`;
    instructions += `Transfira IMEDIATAMENTE usando mensagem de handoff.\n\n`;
  }
  
  if (analysis.hasObjection && prospectStage === 'pricing') {
    instructions += `\n⚠️ **OBJEÇÃO DETECTADA:**\n`;
    instructions += `1. Valide o sentimento do cliente\n`;
    instructions += `2. Reforce valor e ROI\n`;
    instructions += `3. Destaque economia mensal (sem VPS)\n`;
    instructions += `4. Ofereça teste gratuito sem compromisso\n\n`;
  }
  
  return instructions;
}

/**
 * 🔥 PROCESSA MENSAGEM EM MODO PROSPECÇÃO
 */
export async function processProspectionMessage(phone, customerName, userMessage, isOwnerInitiated = false) {
  try {
    if (!phone || !customerName || !userMessage) {
      throw new Error('Parâmetros inválidos para processProspectionMessage');
    }
    
    log('INFO', `🎯 Processando PROSPECÇÃO: ${customerName} (${phone})`);
    
    // Registra tempo de resposta
    const responseTimeSeconds = recordResponseTime(phone);
    
    // Obtém contextos
    const history = getConversationHistory(phone);
    let context = getProspectionContext(phone);
    const isFirstMessage = history.length === 0;
    
    // Se é primeira mensagem e owner iniciou, marca como prospecção
    if (isFirstMessage && isOwnerInitiated) {
      context.isProspecting = true;
      context.prospectStage = 'qualification';
      saveProspectionContext(phone, context);
    }
    
    // Analisa mensagem
    const analysis = analyzeProspectionMessage(userMessage, responseTimeSeconds);
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `📊 Análise: interlocutor=${analysis.interlocutorType}, segmento=${analysis.businessSegment}, tempo=${responseTimeSeconds}s`);
    }
    
    // Atualiza contexto baseado na análise
    if (analysis.interlocutorType && !context.interlocutorType) {
      context.interlocutorType = analysis.interlocutorType;
    }
    
    if (analysis.businessSegment && !context.businessSegment) {
      context.businessSegment = analysis.businessSegment;
    }
    
    // Incrementa perguntas se em discovery
    if (context.prospectStage === 'discovery') {
      context.questionsAsked++;
    }
    
    saveProspectionContext(phone, context);
    
    // Atualiza estágio
    const newStage = updateProspectionStage(phone, analysis, context);
    
    // System prompt com contexto de prospecção
    const baseSystemPrompt = getSystemPromptForProspection({
      customerName,
      interlocutorType: context.interlocutorType,
      businessSegment: context.businessSegment,
      prospectionStage: newStage
    });
    
    // Instruções contextuais
    const prospectionInstructions = getProspectionInstructions(
      phone,
      customerName,
      context,
      analysis
    );
    
    // System prompt completo
    const fullSystemPrompt = `${baseSystemPrompt}${prospectionInstructions}

## 📋 INFORMAÇÕES DO LEAD:

**Nome:** ${customerName}
**Telefone:** ${phone}
**Histórico:** ${history.length} mensagens
**Tempo médio de resposta:** ${getAverageResponseTime(phone) || 'calculando'}s
**Owner iniciou conversa:** ${isOwnerInitiated ? 'SIM' : 'NÃO'}

---

**CRÍTICO:**
- Máximo 8-10 linhas por resposta
- Use 2-4 emojis apenas
- Seja direto e consultivo
- Respeite o estágio atual`;
    
    // Monta mensagens
    const messages = [
      {
        role: 'system',
        content: fullSystemPrompt
      },
      ...history.map(h => ({ role: h.role, content: h.content })),
      {
        role: 'user',
        content: userMessage
      }
    ];
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `📤 Enviando para IA: ${messages.length} mensagens | Estágio: ${newStage}`);
    }
    
    // Chama IA
    const aiResponse = await callGroqAI(messages);
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Resposta vazia da IA');
    }
    
    // Atualiza flags baseado na resposta
    if (newStage === 'presentation' && aiResponse.length > 100) {
      context.pitchSent = true;
      saveProspectionContext(phone, context);
    }
    
    if (newStage === 'pricing') {
      context.pricingMentioned = true;
      saveProspectionContext(phone, context);
    }
    
    // Adiciona ao histórico
    addToHistory(phone, 'user', userMessage, { 
      responseTime: responseTimeSeconds,
      stage: newStage
    });
    addToHistory(phone, 'assistant', aiResponse, {
      stage: newStage
    });
    
    log('SUCCESS', `✅ Resposta gerada [${newStage}]: ${customerName} - ${aiResponse.length} chars`);
    
    return {
      response: aiResponse,
      stage: newStage,
      shouldHandoff: newStage === 'handoff',
      context: context
    };
    
  } catch (error) {
    log('ERROR', `❌ Erro na prospecção: ${error.message}`);
    console.error(error);
    
    return {
      response: `Desculpe ${customerName}, estou com dificuldades técnicas. 😅\n\nMas o Roberto pode te atender: ${process.env.WHATSAPP_SUPPORT}`,
      stage: 'error',
      shouldHandoff: true,
      context: null
    };
  }
}

/**
 * Processa mensagem de LEAD (modo reativo)
 */
export async function processLeadMessage(phone, customerName, userMessage) {
  try {
    if (!phone || !customerName || !userMessage) {
      throw new Error('Parâmetros inválidos para processLeadMessage');
    }
    
    log('INFO', `🤖 Processando mensagem de LEAD (reativo): ${customerName}`);
    
    const history = getConversationHistory(phone);
    const isFirstMessage = history.length === 0;
    
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    
    const systemPrompt = `Você é o Assistente Virtual da Stream Studio.

Sua função é recepcionar o lead ${customerName} de forma amigável e profissional.

**MODO REATIVO (Lead iniciou contato):**
- Cumprimente cordialmente
- Pergunte como pode ajudar
- Apresente brevemente os serviços
- Se perguntarem sobre IA/Bot, dê informações básicas
- Para detalhes técnicos ou comerciais, ofereça contato do ${ownerName}

**IMPORTANTE:**
- Seja breve (máximo 8 linhas)
- Tom amigável e profissional
- ${isFirstMessage ? 'Cumprimente o lead' : 'Continue a conversa naturalmente'}
- Não force venda, seja receptivo

**Contato:**
WhatsApp ${ownerName}: ${process.env.WHATSAPP_SUPPORT}
Fanpage: https://bot-whatsapp-450420.web.app/`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage }
    ];
    
    const aiResponse = await callGroqAI(messages);
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Resposta vazia da IA');
    }
    
    addToHistory(phone, 'user', userMessage);
    addToHistory(phone, 'assistant', aiResponse);
    
    log('SUCCESS', `✅ Resposta gerada (reativo): ${customerName}`);
    
    return aiResponse;
    
  } catch (error) {
    log('ERROR', `❌ Erro no modo reativo: ${error.message}`);
    return `Olá ${customerName}! 👋\n\nComo posso ajudar você hoje?`;
  }
}

/**
 * Processa mensagem de CLIENTE EXISTENTE
 */
export async function processClientMessage(phone, customerName, userMessage) {
  try {
    if (!phone || !customerName || !userMessage) {
      throw new Error('Parâmetros inválidos');
    }
    
    log('INFO', `🤖 Processando mensagem de CLIENTE: ${customerName}`);
    
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    const history = getConversationHistory(phone);
    const isFirstMessage = history.length === 0;
    
    const systemPrompt = `Você é o Assistente Virtual da Stream Studio.

O cliente ${customerName} já é conhecido e pode ter projetos em andamento.

**Função:**
- Ser cordial e receptivo
- Perguntar sobre projetos em andamento
- Informar que ${ownerName} logo atenderá
- Para questões técnicas/comerciais → encaminhar ao ${ownerName}

**Tom:** Amigável e profissional
**Tamanho:** Máximo 6 linhas
**Cumprimento:** ${isFirstMessage ? 'Sim' : 'Não (já cumprimentou)'}

Contato ${ownerName}: ${process.env.WHATSAPP_SUPPORT}`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage }
    ];
    
    const aiResponse = await callGroqAI(messages);
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Resposta vazia');
    }
    
    addToHistory(phone, 'user', userMessage);
    addToHistory(phone, 'assistant', aiResponse);
    
    log('SUCCESS', `✅ Resposta gerada para cliente ${customerName}`);
    
    return aiResponse;
    
  } catch (error) {
    log('ERROR', `❌ Erro: ${error.message}`);
    return `Olá ${customerName}! 👋\n\nO Roberto logo irá te atender!`;
  }
}

/**
 * Gera mensagem de boas-vindas
 */
export async function generateWelcomeMessage(customerName, isLead = false) {
  try {
    const ownerName = process.env.OWNER_NAME || 'Roberto';
    
    if (isLead) {
      return `Olá ${customerName}! 👋

Sou o *Assistente Virtual da Stream Studio* 🤖

Posso te ajudar com:
- Agente IA para WhatsApp
- Desenvolvimento de sites
- Design e logomarcas
- Suporte técnico

Como posso ajudar você? 😊`;
    } else {
      return `Olá *${customerName}*! 👋

Que bom te ver por aqui!

É sobre algum projeto em andamento?

✅ *Se sim* → O *${ownerName}* logo te atende
❓ *Se não* → Me conte, como posso ajudar?`;
    }
  } catch (error) {
    log('ERROR', `❌ Erro ao gerar boas-vindas: ${error.message}`);
    return `Olá ${customerName}! 👋\n\nComo posso ajudar você hoje?`;
  }
}

/**
 * Limpa histórico e contexto
 */
export function clearConversationHistory(phone) {
  if (!phone) return;
  
  conversationCache.del(phone);
  prospectionContextCache.del(phone);
  log('INFO', `🗑️ Histórico e contexto limpos: ${phone}`);
}

/**
 * Obtém tamanho do histórico
 */
export function getHistorySize(phone) {
  const history = getConversationHistory(phone);
  return history.length;
}

/**
 * Verifica histórico ativo
 */
export function hasActiveHistory(phone) {
  return conversationCache.has(phone);
}

/**
 * 🔥 OBTÉM ESTATÍSTICAS DE PROSPECÇÃO
 */
export function getProspectionStats() {
  const keys = prospectionContextCache.keys();
  
  const stats = {
    totalProspections: 0,
    activeProspections: 0,
    byStage: {
      qualification: 0,
      discovery: 0,
      presentation: 0,
      demonstration: 0,
      pricing: 0,
      handoff: 0
    },
    byInterlocutor: {
      chatbot: 0,
      atendente: 0,
      decisor: 0,
      unknown: 0
    },
    bySegment: {},
    averageQuestionsAsked: 0
  };
  
  let totalQuestions = 0;
  
  keys.forEach(phone => {
    const context = prospectionContextCache.get(phone);
    if (context) {
      stats.totalProspections++;
      
      if (context.isProspecting) {
        stats.activeProspections++;
      }
      
      if (context.prospectStage) {
        stats.byStage[context.prospectStage] = (stats.byStage[context.prospectStage] || 0) + 1;
      }
      
      const interlocutor = context.interlocutorType || 'unknown';
      stats.byInterlocutor[interlocutor] = (stats.byInterlocutor[interlocutor] || 0) + 1;
      
      if (context.businessSegment) {
        stats.bySegment[context.businessSegment] = (stats.bySegment[context.businessSegment] || 0) + 1;
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
 * Obtém estatísticas gerais
 */
export function getAIStats() {
  const conversationKeys = conversationCache.keys();
  
  let totalMessages = 0;
  const conversations = conversationKeys.map(phone => {
    const history = conversationCache.get(phone);
    const messageCount = history.length;
    totalMessages += messageCount;
    
    const prospectionContext = prospectionContextCache.get(phone);
    
    return {
      phone,
      messageCount,
      isProspecting: prospectionContext?.isProspecting || false,
      prospectStage: prospectionContext?.prospectStage || 'unknown',
      interlocutorType: prospectionContext?.interlocutorType || 'unknown',
      businessSegment: prospectionContext?.businessSegment || 'unknown'
    };
  });
  
  return {
    activeConversations: conversationKeys.length,
    totalMessages,
    averageMessagesPerConversation: conversationKeys.length > 0 
      ? (totalMessages / conversationKeys.length).toFixed(1) 
      : 0,
    conversations
  };
}

/**
 * 🔥 MOSTRA ESTATÍSTICAS DE PROSPECÇÃO
 */
export function showProspectionStats() {
  const stats = getProspectionStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS DE PROSPECÇÃO');
  console.log('📊 ╚═══════════════════════════════════════════════╝');
  console.log(`🎯 Total de prospecções: ${stats.totalProspections}`);
  console.log(`⚡ Prospecções ativas: ${stats.activeProspections}`);
  console.log('');
  console.log('📊 Por Estágio:');
  console.log(`   🔍 Qualificação: ${stats.byStage.qualification}`);
  console.log(`   💡 Descoberta: ${stats.byStage.discovery}`);
  console.log(`   🎯 Apresentação: ${stats.byStage.presentation}`);
  console.log(`   🎁 Demonstração: ${stats.byStage.demonstration}`);
  console.log(`   💰 Precificação: ${stats.byStage.pricing}`);
  console.log(`   🤝 Transferência: ${stats.byStage.handoff}`);
  console.log('');
  console.log('👤 Por Tipo de Interlocutor:');
  console.log(`   🤖 Chatbot: ${stats.byInterlocutor.chatbot}`);
  console.log(`   👨‍💼 Atendente: ${stats.byInterlocutor.atendente}`);
  console.log(`   👔 Decisor: ${stats.byInterlocutor.decisor}`);
  console.log(`   ❓ Desconhecido: ${stats.byInterlocutor.unknown}`);
  
  if (Object.keys(stats.bySegment).length > 0) {
    console.log('');
    console.log('🏢 Por Segmento:');
    Object.entries(stats.bySegment).forEach(([segment, count]) => {
      const segmentInfo = BUSINESS_SEGMENTS[segment];
      const name = segmentInfo?.nome || segment;
      console.log(`   • ${name}: ${count}`);
    });
  }
  
  console.log('');
  console.log(`📊 Média de perguntas por prospecção: ${stats.averageQuestionsAsked}`);
  console.log('📊 ╚═══════════════════════════════════════════════╝\n');
}

/**
 * Lista conversas ativas
 */
export function listActiveConversations() {
  const stats = getAIStats();
  
  console.log('\n💬 ╔═══════════════════════════════════════════════╗');
  console.log('💬 CONVERSAS ATIVAS COM IA');
  console.log('💬 ╚═══════════════════════════════════════════════╝');
  console.log(`Total: ${stats.activeConversations}`);
  console.log(`Mensagens totais: ${stats.totalMessages}`);
  console.log(`Média por conversa: ${stats.averageMessagesPerConversation}`);
  console.log('');
  
  if (stats.conversations.length > 0) {
    console.log('Detalhes:');
    stats.conversations.forEach((conv, index) => {
      console.log(`${index + 1}. ${conv.phone}`);
      console.log(`   Mensagens: ${conv.messageCount}`);
      console.log(`   Prospecção: ${conv.isProspecting ? 'SIM' : 'NÃO'}`);
      console.log(`   Estágio: ${conv.prospectStage}`);
      console.log(`   Interlocutor: ${conv.interlocutorType}`);
      console.log(`   Segmento: ${conv.businessSegment}`);
      console.log('');
    });
  }
  
  console.log('💬 ╚═══════════════════════════════════════════════╝\n');
}

/**
 * Limpa históricos expirados
 */
export function cleanExpiredHistories() {
  const conversationKeys = conversationCache.keys();
  const prospectionKeys = prospectionContextCache.keys();
  let cleaned = 0;
  
  conversationKeys.forEach(phone => {
    const ttl = conversationCache.getTtl(phone);
    if (!ttl || ttl === 0) {
      conversationCache.del(phone);
      cleaned++;
    }
  });
  
  prospectionKeys.forEach(phone => {
    const ttl = prospectionContextCache.getTtl(phone);
    if (!ttl || ttl === 0) {
      prospectionContextCache.del(phone);
    }
  });
  
  if (cleaned > 0) {
    log('SUCCESS', `✅ ${cleaned} histórico(s) expirado(s) removido(s)`);
  }
  
  return cleaned;
}

/**
 * 🔥 RESETA CONTEXTO DE PROSPECÇÃO
 */
export function resetProspectionContext(phone) {
  if (!phone) return false;
  
  const existed = prospectionContextCache.has(phone);
  prospectionContextCache.del(phone);
  
  if (existed) {
    log('INFO', `🔄 Contexto de prospecção resetado: ${phone}`);
  }
  
  return existed;
}

/**
 * 🔥 OBTÉM DETALHES DO CONTEXTO (DEBUG)
 */
export function getProspectionContextDetails(phone) {
  if (!phone) return null;
  
  const context = getProspectionContext(phone);
  const history = getConversationHistory(phone);
  
  return {
    phone,
    prospectionContext: context,
    historySize: history.length,
    averageResponseTime: getAverageResponseTime(phone),
    lastMessages: history.slice(-3).map(msg => ({
      role: msg.role,
      preview: msg.content.substring(0, 60) + '...',
      timestamp: msg.timestamp
    }))
  };
}

/**
 * 🔥 FORÇA MUDANÇA DE ESTÁGIO (TESTES)
 */
export function forceProspectionStage(phone, stage) {
  if (!phone || !stage) return false;
  
  const validStages = Object.keys(PROSPECTION_STAGES);
  if (!validStages.includes(stage)) {
    log('WARNING', `⚠️ Estágio inválido: ${stage}`);
    return false;
  }
  
  const context = getProspectionContext(phone);
  context.prospectStage = stage;
  saveProspectionContext(phone, context);
  
  log('SUCCESS', `✅ Estágio forçado para: ${stage}`);
  return true;
}

/**
 * 🔥 ATUALIZA INFORMAÇÕES DE PROSPECÇÃO MANUALMENTE
 */
export function updateProspectionInfo(phone, updates = {}) {
  if (!phone) return false;
  
  const context = getProspectionContext(phone);
  
  if (updates.interlocutorType) {
    context.interlocutorType = updates.interlocutorType;
    log('INFO', `👤 Interlocutor atualizado: ${updates.interlocutorType}`);
  }
  
  if (updates.businessSegment) {
    context.businessSegment = updates.businessSegment;
    log('INFO', `🏢 Segmento atualizado: ${updates.businessSegment}`);
  }
  
  if (updates.prospectStage) {
    context.prospectStage = updates.prospectStage;
    log('INFO', `📊 Estágio atualizado: ${updates.prospectStage}`);
  }
  
  if (updates.isProspecting !== undefined) {
    context.isProspecting = updates.isProspecting;
    log('INFO', `🎯 Prospecção ${updates.isProspecting ? 'ativada' : 'desativada'}`);
  }
  
  saveProspectionContext(phone, context);
  return true;
}

/**
 * 🔥 EXPORTA DADOS DE PROSPECÇÃO
 */
export function exportProspectionData() {
  const keys = prospectionContextCache.keys();
  
  const data = keys.map(phone => {
    const context = prospectionContextCache.get(phone);
    const history = getConversationHistory(phone);
    
    return {
      phone,
      isProspecting: context.isProspecting,
      prospectStage: context.prospectStage,
      interlocutorType: context.interlocutorType,
      businessSegment: context.businessSegment,
      questionsAsked: context.questionsAsked,
      pitchSent: context.pitchSent,
      pricingMentioned: context.pricingMentioned,
      averageResponseTime: getAverageResponseTime(phone),
      messageCount: history.length,
      exportedAt: new Date().toISOString()
    };
  });
  
  return {
    exportDate: new Date().toISOString(),
    totalProspections: keys.length,
    prospections: data
  };
}

/**
 * 🔥 VERIFICA SE DEVE ENVIAR FANPAGE
 */
export function shouldSendFanpageLink(message) {
  if (!message || typeof message !== 'string') return false;
  
  const keywords = [
    'fanpage',
    'site',
    'página',
    'demonstração',
    'ver mais',
    'conhecer',
    'acessar',
    'link',
    'endereço',
    'quero ver',
    'mostrar',
    'próximo passo',
    'como faço'
  ];
  
  const msg = message.toLowerCase();
  return keywords.some(keyword => msg.includes(keyword));
}

/**
 * 🔥 VERIFICA SE DEVE ENCAMINHAR PARA OWNER
 */
export function shouldForwardToOwner(message) {
  if (!message || typeof message !== 'string') return false;
  
  return detectHandoffRequest(message);
}

/**
 * 🔥 MARCA INÍCIO DE PROSPECÇÃO PELO OWNER
 */
export function markOwnerProspecting(phone, isProspecting = true) {
  if (!phone) return false;
  
  const context = getProspectionContext(phone);
  context.isProspecting = isProspecting;
  
  if (isProspecting) {
    context.prospectStage = 'qualification';
    context.questionsAsked = 0;
  }
  
  saveProspectionContext(phone, context);
  
  if (isProspecting) {
    log('SUCCESS', `🎯 Prospecção iniciada: ${phone}`);
  } else {
    log('INFO', `📴 Prospecção desativada: ${phone}`);
  }
  
  return true;
}

/**
 * 🔥 VERIFICA SE ESTÁ EM MODO PROSPECÇÃO
 */
export function isProspecting(phone) {
  if (!phone) return false;
  
  const context = getProspectionContext(phone);
  return context.isProspecting === true;
}

/**
 * 🔥 OBTÉM ESTÁGIO ATUAL DE PROSPECÇÃO
 */
export function getCurrentProspectionStage(phone) {
  if (!phone) return null;
  
  const context = getProspectionContext(phone);
  return context.prospectStage;
}

/**
 * 🔥 LISTA PROSPECÇÕES POR ESTÁGIO
 */
export function listProspectionsByStage(stage = null) {
  const keys = prospectionContextCache.keys();
  
  const prospections = keys
    .map(phone => {
      const context = prospectionContextCache.get(phone);
      const history = getConversationHistory(phone);
      
      return {
        phone,
        stage: context.prospectStage,
        interlocutorType: context.interlocutorType,
        businessSegment: context.businessSegment,
        messageCount: history.length,
        isActive: context.isProspecting
      };
    })
    .filter(p => !stage || p.stage === stage)
    .filter(p => p.isActive);
  
  return prospections;
}

export default {
  processProspectionMessage,
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  clearConversationHistory,
  addToHistory,
  getHistorySize,
  hasActiveHistory,
  getAIStats,
  getProspectionStats,
  showProspectionStats,
  listActiveConversations,
  cleanExpiredHistories,
  resetProspectionContext,
  getProspectionContextDetails,
  forceProspectionStage,
  updateProspectionInfo,
  exportProspectionData,
  shouldSendFanpageLink,
  shouldForwardToOwner,
  markOwnerProspecting,
  isProspecting,
  getCurrentProspectionStage,
  listProspectionsByStage
};