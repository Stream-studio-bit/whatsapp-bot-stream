import { 
  isValidMessage, 
  extractMessageText, 
  cleanMessage, 
  isGreeting, 
  isNewLead,
  simulateTyping,
  log,
  extractPhoneNumber,
  detectOwnerInitiatedConversation,
  calculateResponseTime,
  detectHumanHandoffRequest
} from '../utils/helpers.js';

import {
  saveUser,
  getUser,
  isExistingUser,
  hasOngoingConversation,
  markAsNewLead,
  isLeadUser,
  isBotBlockedForUser,
  blockBotForUser,
  unblockBotForUser,
  saveConversationHistory,
  incrementOwnerMessageCount,
  getOwnerMessageCount,
  recordResponseTime,
  getLastResponseTime,
  setOwnerProspecting,
} from '../services/database.js';

import {
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  shouldSendFanpageLink,
  addToHistory,
  getSalesStats,
  analyzeProspectionMessage
} from '../services/ai.js';

import {
  detectInterlocutorType
} from '../utils/knowledgeBase.js';

const lastMessageTime = new Map();
const DEBOUNCE_DELAY = 500;

// 🔥 Timestamp de inicialização
const BOT_START_TIME = Date.now();

// 🔥 Cache de mensagens processadas
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

// 🔥 NOVO: Cache de timestamps de última mensagem (para detectar chatbot)
const lastUserMessageTimestamp = new Map();

/**
 * Limpa maps antigos
 */
function cleanupDebounceMap() {
  const now = Date.now();
  const MAX_AGE = 60000;
  
  for (const [jid, timestamp] of lastMessageTime.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastMessageTime.delete(jid);
    }
  }
  
  // Limpa cache de mensagens
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    processedMessages.clear();
    log('INFO', '🧹 Cache de mensagens processadas limpo');
  }

  // Limpa cache de timestamps
  for (const [jid, timestamp] of lastUserMessageTimestamp.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastUserMessageTimestamp.delete(jid);
    }
  }
}

setInterval(cleanupDebounceMap, 120000);

/**
 * Verifica se a mensagem é RECENTE
 */
function isRecentMessage(message) {
  try {
    const messageTimestamp = message.messageTimestamp;
    
    if (!messageTimestamp) {
      return true;
    }
    
    let messageTime;
    if (typeof messageTimestamp === 'object' && messageTimestamp.low) {
      messageTime = messageTimestamp.low * 1000;
    } else if (typeof messageTimestamp === 'number') {
      messageTime = messageTimestamp < 10000000000 
        ? messageTimestamp * 1000 
        : messageTimestamp;
    } else {
      return true;
    }
    
    const isRecent = messageTime >= BOT_START_TIME;
    
    if (process.env.DEBUG_MODE === 'true') {
      const messageDate = new Date(messageTime).toISOString();
      const botStartDate = new Date(BOT_START_TIME).toISOString();
      log('INFO', `📅 Mensagem: ${messageDate} | Bot: ${botStartDate} | Recente: ${isRecent}`);
    }
    
    return isRecent;
    
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao verificar idade da mensagem: ${error.message}`);
    }
    return true;
  }
}

/**
 * Valida se mensagem deve ser processada
 */
function shouldProcessMessage(message) {
  try {
    if (!message || !message.key) {
      return false;
    }
    
    const jid = message.key.remoteJid;
    
    // Ignora broadcast
    if (jid === 'status@broadcast' || jid?.includes('broadcast')) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭ Ignorando broadcast');
      }
      return false;
    }
    
    // Ignora grupos
    if (jid?.endsWith('@g.us')) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭ Ignorando grupo');
      }
      return false;
    }
    
    // Valida conversa individual
    if (!jid?.endsWith('@s.whatsapp.net')) {
      return false;
    }
    
    // Verifica se já foi processada
    const messageId = message.key.id;
    if (messageId && processedMessages.has(messageId)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭ Mensagem já processada');
      }
      return false;
    }
    
    // Verifica se é recente
    if (!isRecentMessage(message)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭ Ignorando mensagem antiga');
      }
      return false;
    }
    
    return true;
    
  } catch (error) {
    log('WARNING', `⚠️ Erro ao validar mensagem: ${error.message}`);
    return false;
  }
}

/**
 * 🔥 NOVO: Calcula tempo de resposta do lead (para detectar chatbot)
 */
function calculateLeadResponseTime(jid) {
  const now = Date.now();
  const lastTimestamp = lastUserMessageTimestamp.get(jid);
  
  if (!lastTimestamp) {
    return null; // Primeira mensagem, não há tempo de resposta
  }
  
  const responseTimeMs = now - lastTimestamp;
  const responseTimeSec = Math.floor(responseTimeMs / 1000);
  
  return responseTimeSec;
}

/**
 * 🔥 HANDLER PRINCIPAL - VERSÃO COM PROSPECÇÃO ATIVA E BLOQUEIO INTELIGENTE
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // 🔥 Validação inicial
    if (!shouldProcessMessage(message)) {
      return;
    }
    
    if (!isValidMessage(message)) {
      return;
    }
    
    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) {
      return;
    }
    
    // Marca como processada
    const messageId = message.key.id;
    if (messageId) {
      processedMessages.add(messageId);
    }

    // ==========================================
    // 🔥 SISTEMA DE BLOQUEIO INTELIGENTE
    // ==========================================
    
    if (message?.key?.fromMe) {
      // 🔥 CORREÇÃO CRÍTICA: Usar remoteJid para identificar destinatário ESPECÍFICO
      const targetJid = message.key.remoteJid;
      const clientPhone = extractPhoneNumber(targetJid);
      
      if (isRecentMessage(message)) {
        try {
          // 🔥 NOVA LÓGICA: Incrementa contador de mensagens do owner
          const ownerMsgCount = await incrementOwnerMessageCount(targetJid);
          
          log('INFO', `👤 Owner enviou mensagem para ${clientPhone} (contador: ${ownerMsgCount})`);
          
          // 🔥 PRIMEIRA MENSAGEM: Marca como prospecção ativa, mas NÃO bloqueia
          if (ownerMsgCount === 1) {
            await setOwnerProspecting(targetJid, true);
            log('SUCCESS', `🎯 Prospecção ativa iniciada para ${clientPhone} - IA PERMANECE ATIVA`);
          }
          
          // 🔥 SEGUNDA MENSAGEM: Bloqueia IA APENAS para este JID específico
          else if (ownerMsgCount === 2) {
            await blockBotForUser(targetJid);
            log('SUCCESS', `🔒 IA BLOQUEADA para ${clientPhone} - Owner assumiu (2ª mensagem)`);
          }
          
          // Mensagens adicionais apenas reforçam o bloqueio
          else {
            const isAlreadyBlocked = await isBotBlockedForUser(targetJid);
            if (!isAlreadyBlocked) {
              await blockBotForUser(targetJid);
              log('SUCCESS', `🔒 IA BLOQUEADA para ${clientPhone} - Owner assumiu`);
            } else {
              if (process.env.DEBUG_MODE === 'true') {
                log('INFO', `ℹ️ IA já estava bloqueada para ${clientPhone}`);
              }
            }
          }
          
        } catch (err) {
          log('WARNING', `⚠️ Erro ao processar mensagem do owner: ${err.message}`);
        }
      } else {
        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', `⏭ Ignorando mensagem ANTIGA do owner para ${clientPhone}`);
        }
      }
      
      return; // Owner não gera resposta da IA
    }

    // ==========================================
    // 🔥 VERIFICAÇÃO DE BLOQUEIO (IA desabilitada para este JID?)
    // ==========================================
    
    let isBlocked = false;
    try {
      isBlocked = await isBotBlockedForUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar bloqueio: ${err.message}`);
      isBlocked = false;
    }

    if (isBlocked) {
      const clientPhone = extractPhoneNumber(jid);
      log('WARNING', `🚫 MENSAGEM IGNORADA - Bot bloqueado para ${clientPhone} (Owner em atendimento)`);
      return;
    }

    // ==========================================
    // 🔥 DETECÇÃO DE SOLICITAÇÃO DE ATENDIMENTO HUMANO
    // ==========================================
    
    const wantsHumanHandoff = detectHumanHandoffRequest(messageText);
    
    if (wantsHumanHandoff) {
      const clientPhone = extractPhoneNumber(jid);
      const pushName = message.pushName || 'Cliente';
      
      log('INFO', `🤝 ${pushName} solicitou atendimento humano - Transferindo...`);
      
      // Bloqueia IA e notifica
      await blockBotForUser(jid);
      
      const handoffMessage = `Claro, ${pushName}! Vou transferir você para o Roberto agora mesmo 😊\n\nEle já está ciente da nossa conversa e vai te atender em instantes!\n\nFoi um prazer conversar com você! 🤖💙`;
      
      await sock.sendMessage(jid, { text: handoffMessage }).catch((err) => {
        log('WARNING', `⚠️ Erro ao enviar mensagem de handoff: ${err.message}`);
      });
      
      log('SUCCESS', `✅ Handoff realizado para ${clientPhone}`);
      return;
    }

    // Debounce
    const now = Date.now();
    const lastTime = lastMessageTime.get(jid) || 0;
    if (now - lastTime < DEBOUNCE_DELAY) {
      return;
    }
    lastMessageTime.set(jid, now);

    const cleanedMessage = cleanMessage(messageText);
    const pushName = message.pushName || 'Cliente';
    const phone = extractPhoneNumber(jid);
    
    log('INFO', `📩 ${pushName} (${phone}): "${cleanedMessage.substring(0, 50)}${cleanedMessage.length > 50 ? '...' : ''}"`);

    // ==========================================
    // 🔥 CÁLCULO DE TEMPO DE RESPOSTA (Detectar Chatbot)
    // ==========================================
    
    const responseTime = calculateLeadResponseTime(jid);
    
    if (responseTime !== null) {
      // Registra no banco para análise posterior
      try {
        await recordResponseTime(jid, responseTime);
        
        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', `⏱️ Tempo de resposta: ${responseTime}s`);
        }
      } catch (err) {
        log('WARNING', `⚠️ Erro ao registrar tempo de resposta: ${err.message}`);
      }
    }
    
    // Atualiza timestamp da última mensagem do usuário
    lastUserMessageTimestamp.set(jid, now);

    // ==========================================
    // 🔥 VERIFICAÇÃO: Primeira interação
    // ==========================================
    
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    
    // ==========================================
    // 🔥 DETECÇÃO DE PROSPECÇÃO ATIVA
    // ==========================================
    
    let isOwnerProspecting = false;
    try {
      const user = await getUser(jid);
      isOwnerProspecting = user?.isOwnerProspecting || false;
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar prospecção: ${err.message}`);
    }
    
    if (isOwnerProspecting) {
      log('INFO', `🎯 MODO PROSPECÇÃO ATIVA para ${phone}`);
    }
    
    // ==========================================
    // 🔥 PRIMEIRA MENSAGEM
    // ==========================================
    
    if (isFirstContact) {
      const hasLeadKeywords = isNewLead(cleanedMessage);
      
      await saveUser(jid, { 
        name: pushName,
        isNewLead: true
      });
      
      if (hasLeadKeywords) {
        await markAsNewLead(jid, pushName);
        log('SUCCESS', `🎯 NOVO LEAD (com keywords): ${pushName}`);
      } else {
        log('SUCCESS', `👤 NOVO CONTATO: ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      // 🔥 Se owner iniciou prospecção, IA usa abordagem reveladora
      const isProspectionMode = isOwnerProspecting;
      
      const welcomeMsg = await generateWelcomeMessage(
        pushName, 
        true, // sempre lead na primeira mensagem
        isProspectionMode, // indica se é prospecção ativa
        responseTime // passa tempo de resposta para análise
      );
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch((err) => {
        log('WARNING', `⚠️ Erro ao enviar mensagem: ${err.message}`);
      });
      
      // Registra no histórico da IA
      try {
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', welcomeMsg);
        log('SUCCESS', `📝 Histórico registrado`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico da IA: ${err.message}`);
      }
      
      // Salva no banco
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico no DB: ${err.message}`);
      }
      
      if (isProspectionMode) {
        log('SUCCESS', `✅ Boas-vindas enviadas (PROSPECÇÃO ATIVA - Revelação IA)`);
      } else {
        log('SUCCESS', `✅ Boas-vindas enviadas (LEAD - Vendas Consultivas Ativas)`);
      }
      
      // 🔥 Log de estatísticas de vendas
      if (process.env.DEBUG_MODE === 'true') {
        try {
          const salesStats = getSalesStats();
          log('INFO', `📊 Leads Ativos: ${salesStats.totalLeads} | Em Descoberta: ${salesStats.byStage.discovery}`);
        } catch (err) {
          // Ignora erro de stats
        }
      }
      
      return;
    }

    // ==========================================
    // 🔥 MENSAGENS SEGUINTES - PROCESSO DE VENDAS/PROSPECÇÃO
    // ==========================================
    
    log('INFO', `🔨 Processando mensagem de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    const isLead = await isLeadUser(jid);
    
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    try {
      if (isLead) {
        // 🔥 PROCESSAMENTO DE LEAD COM VENDAS CONSULTIVAS / PROSPECÇÃO
        
        // 🔥 NOVO: Detecta tipo de interlocutor se for prospecção ativa
        let interlocutorType = null;
        
        if (isOwnerProspecting && responseTime !== null) {
          try {
            interlocutorType = await detectInterlocutorType(
              phone,
              responseTime,
              cleanedMessage
            );
            
            log('INFO', `🕵️ Interlocutor detectado: ${interlocutorType}`);
          } catch (err) {
            log('WARNING', `⚠️ Erro ao detectar interlocutor: ${err.message}`);
          }
        }
        
        // 🔥 Processa mensagem com contexto de prospecção
        aiResponse = await processLeadMessage(
          phone, 
          pushName, 
          cleanedMessage,
          {
            isProspecting: isOwnerProspecting,
            interlocutorType: interlocutorType,
            responseTime: responseTime
          }
        );
        
        // 🔥 Verifica se deve enviar link da fanpage
        if (shouldSendFanpageLink(cleanedMessage) || 
            cleanedMessage.toLowerCase().includes('quero') ||
            cleanedMessage.toLowerCase().includes('interesse') ||
            cleanedMessage.toLowerCase().includes('teste') ||
            cleanedMessage.toLowerCase().includes('demonstra')) {
          
          await simulateTyping(sock, jid, 1000);
          
          await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch((err) => {
            log('WARNING', `⚠️ Erro ao enviar fanpage: ${err.message}`);
          });
          
          log('SUCCESS', `📱 Link da fanpage enviado`);
        }
        
        if (isOwnerProspecting) {
          log('SUCCESS', `✅ Resposta IA gerada (PROSPECÇÃO ATIVA)`);
        } else {
          log('SUCCESS', `✅ Resposta IA gerada (LEAD - Vendas Consultivas)`);
        }
        
      } else {
        // 🔥 PROCESSAMENTO DE CLIENTE EXISTENTE
        aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
        log('SUCCESS', `✅ Resposta IA gerada (CLIENTE)`);
      }
      
      if (aiResponse) {
        await sock.sendMessage(jid, { text: aiResponse }).catch((err) => {
          log('WARNING', `⚠️ Erro ao enviar resposta: ${err.message}`);
        });
      }
      
      // 🔥 Log de estatísticas após cada interação (debug)
      if (process.env.DEBUG_MODE === 'true' && isLead) {
        try {
          const salesStats = getSalesStats();
          log('INFO', `📊 Vendas | Descoberta: ${salesStats.byStage.discovery} | Recomendação: ${salesStats.byStage.recommendation} | Fechamento: ${salesStats.byStage.closing}`);
        } catch (err) {
          // Ignora erro de stats
        }
      }
      
    } catch (error) {
      log('WARNING', `⚠️ Erro ao gerar resposta da IA: ${error.message}`);
      
      // Mensagem de erro ao usuário
      const errorMsg = `Desculpe ${pushName}, estou com dificuldades técnicas no momento. 😅\n\nPor favor, aguarde que logo você será atendido!`;
      await sock.sendMessage(jid, { text: errorMsg }).catch(() => {});
    }

  } catch (error) {
    // Log de erro sem expor detalhes sensíveis
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ Erro ao processar mensagem: ${error.message}`);
      if (process.env.DEBUG_MODE === 'true') {
        console.error('Stack trace:', error.stack);
      }
    }
  }
}

/**
 * Processa mensagem (wrapper)
 */
export async function processMessage(sock, message) {
  try {
    await handleIncomingMessage(sock, message);
  } catch (error) {
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ Erro crítico: ${error.message}`);
    }
  }
}

/**
 * Reseta cache de mensagens processadas
 */
export function resetProcessedMessages() {
  processedMessages.clear();
  lastUserMessageTimestamp.clear();
  log('SUCCESS', '✅ Cache de mensagens processadas resetado');
}

/**
 * Obtém estatísticas do handler
 */
export function getHandlerStats() {
  return {
    botStartTime: new Date(BOT_START_TIME).toISOString(),
    processedMessagesCount: processedMessages.size,
    debounceCacheSize: lastMessageTime.size,
    responseTimeCacheSize: lastUserMessageTimestamp.size
  };
}

/**
 * 🔥 NOVO: Mostra estatísticas completas (handler + vendas)
 */
export function showCompleteStats() {
  const handlerStats = getHandlerStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS COMPLETAS DO SISTEMA');
  console.log('📊 ╚═══════════════════════════════════════╝');
  console.log('');
  console.log('🤖 HANDLER:');
  console.log(`   Início do Bot: ${handlerStats.botStartTime}`);
  console.log(`   Mensagens processadas: ${handlerStats.processedMessagesCount}`);
  console.log(`   Cache de debounce: ${handlerStats.debounceCacheSize}`);
  console.log(`   Cache de tempo de resposta: ${handlerStats.responseTimeCacheSize}`);
  console.log('');
  
  try {
    const salesStats = getSalesStats();
    console.log('💰 VENDAS:');
    console.log(`   Total de Leads: ${salesStats.totalLeads}`);
    console.log(`   Em Descoberta: ${salesStats.byStage.discovery}`);
    console.log(`   Em Recomendação: ${salesStats.byStage.recommendation}`);
    console.log(`   Com Objeção: ${salesStats.byStage.objection}`);
    console.log(`   Em Fechamento: ${salesStats.byStage.closing}`);
    console.log('');
    console.log('📋 PLANOS:');
    console.log(`   🌟 Básico: ${salesStats.byPlan.basico}`);
    console.log(`   🚀 Completo: ${salesStats.byPlan.completo}`);
    console.log(`   ❓ Indeciso: ${salesStats.byPlan.indeciso}`);
    console.log(`   ➖ Nenhum: ${salesStats.byPlan.none}`);
  } catch (err) {
    console.log('⚠️ Não foi possível obter estatísticas de vendas');
  }
  
  console.log('📊 ╚═══════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVO: Comando para visualizar estado atual de um cliente
 */
export async function showClientStatus(phone) {
  if (!phone) {
    console.log('❌ Telefone não informado');
    return;
  }
  
  console.log(`\n👤 STATUS DO CLIENTE: ${phone}`);
  console.log('═'.repeat(50));
  
  try {
    const { getSalesContextDetails } = await import('../services/ai.js');
    const details = getSalesContextDetails(phone);
    
    if (!details) {
      console.log('❌ Cliente não encontrado no sistema');
      return;
    }
    
    console.log('📊 CONTEXTO DE VENDAS:');
    console.log(`   Estágio: ${details.salesContext.stage}`);
    console.log(`   Plano Recomendado: ${details.salesContext.recommendedPlan || 'Nenhum'}`);
    console.log(`   Perguntas Feitas: ${details.salesContext.questionsAsked}`);
    console.log(`   Plano Mencionado: ${details.salesContext.planMentioned ? 'Sim' : 'Não'}`);
    console.log(`   Necessidades Detectadas: ${details.salesContext.detectedNeeds.length}`);
    console.log(`   Objeções: ${details.salesContext.objections.length}`);
    
    // 🔥 NOVO: Informações de prospecção
    if (details.salesContext.isProspecting) {
      console.log('');
      console.log('🎯 PROSPECÇÃO ATIVA:');
      console.log(`   Interlocutor: ${details.salesContext.interlocutorType || 'Desconhecido'}`);
      console.log(`   Segmento: ${details.salesContext.businessSegment || 'Não identificado'}`);
    }
    
    console.log('');
    console.log('💬 HISTÓRICO:');
    console.log(`   Total de mensagens: ${details.historySize}`);
    console.log('   Últimas 3 mensagens:');
    details.lastMessages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. [${msg.role}]: ${msg.preview}`);
    });
    
  } catch (err) {
    console.log(`❌ Erro ao obter status: ${err.message}`);
  }
  
  console.log('═'.repeat(50) + '\n');
}

/**
 * 🔥 NOVO: Lista conversas onde owner está prospectando
 */
export async function listOwnerConversations() {
  console.log('\n🎯 CONVERSAS DE PROSPECÇÃO ATIVA');
  console.log('═'.repeat(60));
  
  try {
    const { getAllProspectingConversations } = await import('../services/database.js');
    const conversations = await getAllProspectingConversations();
    
    if (!conversations || conversations.length === 0) {
      console.log('   Nenhuma prospecção ativa no momento');
      console.log('═'.repeat(60) + '\n');
      return;
    }
    
    conversations.forEach((conv, idx) => {
      console.log(`\n${idx + 1}. ${conv.phone} (${conv.name || 'Nome não disponível'})`);
      console.log(`   Mensagens do owner: ${conv.ownerMessageCount}`);
      console.log(`   IA bloqueada: ${conv.isBotBlocked ? 'Sim' : 'Não'}`);
      console.log(`   Último contato: ${conv.lastContact ? new Date(conv.lastContact).toLocaleString() : 'N/A'}`);
    });
    
    console.log('\n═'.repeat(60));
    console.log(`Total: ${conversations.length} prospecção(ões) ativa(s)\n`);
    
  } catch (err) {
    console.log(`❌ Erro ao listar conversas: ${err.message}`);
    console.log('═'.repeat(60) + '\n');
  }
}

export default {
  handleIncomingMessage,
  processMessage,
  resetProcessedMessages,
  getHandlerStats,
  showCompleteStats,
  showClientStatus,
  listOwnerConversations
};