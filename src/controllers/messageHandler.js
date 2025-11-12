import { 
  isValidMessage, 
  extractMessageText, 
  cleanMessage, 
  isGreeting, 
  isNewLead,
  simulateTyping,
  log,
  extractPhoneNumber
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
  saveConversationHistory
} from '../services/database.js';

import {
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  shouldSendFanpageLink,
  addToHistory,
  getSalesStats
} from '../services/ai.js';

import { FANPAGE_MESSAGE } from '../utils/knowledgeBase.js';

const lastMessageTime = new Map();
const DEBOUNCE_DELAY = 500;

// 🔥 Timestamp de inicialização
const BOT_START_TIME = Date.now();

// 🔥 Cache de mensagens processadas
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

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
        log('INFO', '⭐ Ignorando broadcast');
      }
      return false;
    }
    
    // Ignora grupos
    if (jid?.endsWith('@g.us')) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⭐ Ignorando grupo');
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
        log('INFO', '⭐ Mensagem já processada');
      }
      return false;
    }
    
    // Verifica se é recente
    if (!isRecentMessage(message)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⭐ Ignorando mensagem antiga');
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
 * 🔥 HANDLER PRINCIPAL - VERSÃO COM VENDAS CONSULTIVAS
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

    // 🔥 BLOQUEIO APENAS PARA MENSAGENS RECENTES DO OWNER
    if (message?.key?.fromMe) {
      const clientPhone = extractPhoneNumber(jid);
      
      if (isRecentMessage(message)) {
        const isAlreadyBlocked = await isBotBlockedForUser(jid);
        
        if (!isAlreadyBlocked) {
          log('INFO', `👤 Owner enviou mensagem RECENTE para ${clientPhone} - Bloqueando IA`);
          
          try {
            await blockBotForUser(jid);
            log('SUCCESS', `🔒 IA BLOQUEADA para ${clientPhone} - Owner assumiu atendimento`);
          } catch (err) {
            log('WARNING', `⚠️ Erro ao bloquear IA: ${err.message}`);
          }
        } else {
          if (process.env.DEBUG_MODE === 'true') {
            log('INFO', `ℹ️ IA já estava bloqueada para ${clientPhone}`);
          }
        }
      } else {
        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', `⭐ Ignorando mensagem ANTIGA do owner para ${clientPhone}`);
        }
      }
      
      return;
    }

    // 🔥 VERIFICAÇÃO DE BLOQUEIO COM AUTO-DESBLOQUEIO
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

    // 🔥 VERIFICAÇÃO: Primeira interação
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    
    // 🔥 PRIMEIRA MENSAGEM = SEMPRE LEAD
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
      
      // 🔥 Sempre usa mensagem de LEAD na primeira interação
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      
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
      
      log('SUCCESS', `✅ Boas-vindas enviadas (LEAD - Vendas Consultivas Ativas)`);
      
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

    // 🔥 MENSAGENS SEGUINTES - PROCESSO DE VENDAS
    log('INFO', `🔨 Processando mensagem de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    const isLead = await isLeadUser(jid);
    
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    try {
      if (isLead) {
        // 🔥 PROCESSAMENTO DE LEAD COM VENDAS CONSULTIVAS
        aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
        
        // 🔥 Verifica se deve enviar link da fanpage
        // (geralmente quando cliente pede mais informações ou demonstração)
        if (shouldSendFanpageLink(cleanedMessage) || 
            cleanedMessage.toLowerCase().includes('quero') ||
            cleanedMessage.toLowerCase().includes('interesse')) {
          
          // Aguarda um pouco antes de enviar fanpage
          await simulateTyping(sock, jid, 1000);
          
          await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch((err) => {
            log('WARNING', `⚠️ Erro ao enviar fanpage: ${err.message}`);
          });
          
          log('SUCCESS', `📱 Link da fanpage enviado`);
        }
        
        log('SUCCESS', `✅ Resposta IA gerada (LEAD - Vendas Consultivas)`);
        
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
  log('SUCCESS', '✅ Cache de mensagens processadas resetado');
}

/**
 * Obtém estatísticas do handler
 */
export function getHandlerStats() {
  return {
    botStartTime: new Date(BOT_START_TIME).toISOString(),
    processedMessagesCount: processedMessages.size,
    debounceCacheSize: lastMessageTime.size
  };
}

/**
 * 🔥 NOVO: Mostra estatísticas completas (handler + vendas)
 */
export function showCompleteStats() {
  const handlerStats = getHandlerStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS COMPLETAS DO SISTEMA');
  console.log('📊 ╚═══════════════════════════════════════════╝');
  console.log('');
  console.log('🤖 HANDLER:');
  console.log(`   Início do Bot: ${handlerStats.botStartTime}`);
  console.log(`   Mensagens processadas: ${handlerStats.processedMessagesCount}`);
  console.log(`   Cache de debounce: ${handlerStats.debounceCacheSize}`);
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
  
  console.log('📊 ╚═══════════════════════════════════════════╝\n');
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

export default {
  handleIncomingMessage,
  processMessage,
  resetProcessedMessages,
  getHandlerStats,
  showCompleteStats,
  showClientStatus
};