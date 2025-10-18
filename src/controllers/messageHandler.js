import { 
  isValidMessage, 
  extractMessageText, 
  cleanMessage, 
  isGreeting, 
  isNewLead,
  simulateTyping,
  log,
  extractPhoneNumber,
  isBusinessHours,
  getBusinessHoursMessage
} from '../utils/helpers.js';

import {
  saveUser,
  getUser,
  isExistingUser,
  hasOngoingConversation,
  markAsNewLead,
  isLeadUser,
  isBotBlockedForUser
} from '../services/database.js';

import {
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  shouldSendFanpageLink
} from '../services/ai.js';

import { FANPAGE_MESSAGE } from '../utils/knowledgeBase.js';

/**
 * HANDLER PRINCIPAL DE MENSAGENS
 * Processa todas as mensagens recebidas e decide a ação
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // Valida se é uma mensagem processável
    if (!isValidMessage(message)) {
      return;
    }

    const jid = message.key.remoteJid;
    const phone = extractPhoneNumber(jid);
    const messageText = extractMessageText(message);

    if (!messageText) {
      return;
    }

    const cleanedMessage = cleanMessage(messageText);
    
    // Obtém nome do contato
    const pushName = message.pushName || 'Cliente';
    
    log('INFO', `📩 Mensagem recebida de ${pushName} (${phone}): "${cleanedMessage}"`);

    // ============================================
    // VERIFICAÇÃO 1: BOT BLOQUEADO? (Atendimento Manual)
    // ============================================
    if (isBotBlockedForUser(jid)) {
      log('WARNING', `🚫 Bot bloqueado para ${pushName} - Atendimento manual ativo`);
      return; // Não responde - Roberto está atendendo
    }

    // ============================================
    // VERIFICAÇÃO 2: NOVO LEAD? (Interessado no bot)
    // ============================================
    if (isNewLead(cleanedMessage)) {
      log('SUCCESS', `🎯 NOVO LEAD detectado: ${pushName}`);
      
      // Marca como lead
      markAsNewLead(jid, pushName);
      
      // Envia boas-vindas
      await simulateTyping(sock, jid, 2000);
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      await sock.sendMessage(jid, { text: welcomeMsg });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // VERIFICAÇÃO 3: LEAD CONHECIDO? (Continuação)
    // ============================================
    if (isLeadUser(jid)) {
      log('INFO', `🎯 Mensagem de LEAD existente: ${pushName}`);
      
      // Atualiza última interação
      saveUser(jid, { name: pushName });
      
      // Processa com IA especializada em vendas
      await simulateTyping(sock, jid, 3000);
      const aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
      await sock.sendMessage(jid, { text: aiResponse });
      
      // Se mencionou fanpage, envia link
      if (shouldSendFanpageLink(cleanedMessage)) {
        await simulateTyping(sock, jid, 1500);
        await sock.sendMessage(jid, { text: FANPAGE_MESSAGE });
      }
      
      log('SUCCESS', `✅ Resposta IA enviada para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // VERIFICAÇÃO 4: CLIENTE EXISTENTE COM CONVERSA ATIVA
    // ============================================
    if (isExistingUser(jid) && hasOngoingConversation(jid)) {
      const user = getUser(jid);
      log('INFO', `🔄 Cliente RECORRENTE: ${user.name} (última msg: ${user.lastInteraction.toLocaleDateString()})`);
      
      // Se é uma saudação inicial
      if (isGreeting(cleanedMessage)) {
        log('INFO', `👋 Saudação detectada de cliente recorrente: ${user.name}`);
        
        // Atualiza última interação
        saveUser(jid, { name: pushName });
        
        // Envia boas-vindas para cliente
        await simulateTyping(sock, jid, 2000);
        const welcomeMsg = await generateWelcomeMessage(user.name, false);
        await sock.sendMessage(jid, { text: welcomeMsg });
        
        log('SUCCESS', `✅ Boas-vindas enviadas para cliente recorrente: ${user.name}`);
        return;
      }
      
      // Conversa em andamento - processa com IA
      saveUser(jid, { name: pushName });
      
      await simulateTyping(sock, jid, 2500);
      const aiResponse = await processClientMessage(phone, user.name, cleanedMessage);
      await sock.sendMessage(jid, { text: aiResponse });
      
      log('SUCCESS', `✅ Resposta IA enviada para cliente: ${user.name}`);
      return;
    }

    // ============================================
    // VERIFICAÇÃO 5: PRIMEIRO CONTATO ou CONVERSA ANTIGA
    // ============================================
    log('INFO', `🆕 Primeiro contato ou conversa antiga: ${pushName}`);
    
    // Salva novo usuário
    saveUser(jid, { name: pushName, isNewLead: false });
    
    // Se é uma saudação
    if (isGreeting(cleanedMessage)) {
      await simulateTyping(sock, jid, 2000);
      const welcomeMsg = await generateWelcomeMessage(pushName, false);
      await sock.sendMessage(jid, { text: welcomeMsg });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para novo cliente: ${pushName}`);
      return;
    }
    
    // Se não é saudação, processa com IA
    await simulateTyping(sock, jid, 2500);
    const aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
    await sock.sendMessage(jid, { text: aiResponse });
    
    log('SUCCESS', `✅ Resposta IA enviada para novo cliente: ${pushName}`);

  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
    console.error(error);
  }
}

/**
 * Handler para mensagens fora do horário comercial
 */
export async function handleOutOfHoursMessage(sock, message) {
  try {
    if (!isValidMessage(message)) {
      return;
    }

    const jid = message.key.remoteJid;
    const phone = extractPhoneNumber(jid);
    
    // Verifica se já enviou mensagem de horário comercial recentemente
    // Para não enviar múltiplas vezes
    const user = getUser(jid);
    if (user && user.lastInteraction) {
      const now = new Date();
      const diff = (now - user.lastInteraction) / 1000 / 60; // Minutos
      
      // Se enviou mensagem há menos de 30 minutos, não envia novamente
      if (diff < 30) {
        return;
      }
    }
    
    const pushName = message.pushName || 'Cliente';
    
    log('WARNING', `🕐 Mensagem fora do horário de ${pushName}`);
    
    // Salva interação
    saveUser(jid, { name: pushName });
    
    // Envia mensagem de horário comercial
    const outOfHoursMsg = getBusinessHoursMessage();
    await simulateTyping(sock, jid, 2000);
    await sock.sendMessage(jid, { text: outOfHoursMsg });
    
    log('INFO', `✅ Mensagem de horário enviada para ${pushName}`);
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem fora do horário: ${error.message}`);
  }
}

/**
 * Processa mensagem - AGORA 24/7 SEMPRE ATIVO
 */
export async function processMessage(sock, message) {
  try {
    // Bot SEMPRE ativo - sem verificação de horário
    await handleIncomingMessage(sock, message);
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
  }
}

export default {
  handleIncomingMessage,
  handleOutOfHoursMessage,
  processMessage
};