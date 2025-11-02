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
  addToHistory
} from '../services/ai.js';

import { FANPAGE_MESSAGE } from '../utils/knowledgeBase.js';

const lastMessageTime = new Map();
const DEBOUNCE_DELAY = 500;

function cleanupDebounceMap() {
  const now = Date.now();
  const MAX_AGE = 60000;
  
  for (const [jid, timestamp] of lastMessageTime.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastMessageTime.delete(jid);
    }
  }
}

setInterval(cleanupDebounceMap, 120000);

/**
 * 🔥 HANDLER PRINCIPAL - VERSÃO CORRIGIDA
 */
export async function handleIncomingMessage(sock, message) {
  try {
    if (!isValidMessage(message)) return;
    
    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) return;

    // 🔥 BLOQUEIO AUTOMÁTICO DA IA: OWNER DIGITOU MANUALMENTE
    // fromMe=true significa que a mensagem FOI ENVIADA pelo owner
    // Nesse caso, BLOQUEIA A IA para aquele cliente (owner assumiu atendimento)
    if (message?.key?.fromMe) {
      const clientPhone = extractPhoneNumber(jid);
      
      log('INFO', `👤 Owner digitou mensagem manual para ${clientPhone}`);
      
      try {
        await blockBotForUser(jid);
        log('SUCCESS', `🔒 IA BLOQUEADA para ${clientPhone} - Owner assumiu atendimento manual`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear IA: ${err.message}`);
      }
      
      return; // Para processamento (owner já respondeu, IA não deve agir)
    }

    // Debounce
    const now = Date.now();
    const lastTime = lastMessageTime.get(jid) || 0;
    if (now - lastTime < DEBOUNCE_DELAY) return;
    lastMessageTime.set(jid, now);

    const cleanedMessage = cleanMessage(messageText);
    const pushName = message.pushName || 'Cliente';
    const phone = extractPhoneNumber(jid);
    
    log('INFO', `📩 ${pushName} (${phone}): "${cleanedMessage.substring(0, 50)}"`);

    // PASSO 1: Verifica bloqueio
    let isBlocked = false;
    try {
      isBlocked = await isBotBlockedForUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar bloqueio: ${err.message}`);
      isBlocked = false;
    }

    if (isBlocked) {
      log('WARNING', `🚫 Bot bloqueado - Atendimento manual ativo para ${phone}`);
      return;
    }

    // PASSO 2: Verifica primeira interação no BANCO DE DADOS
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    
    // 🔥 PRIMEIRA MENSAGEM = BOAS-VINDAS ÚNICA
    if (isFirstContact) {
      const hasLeadKeywords = isNewLead(cleanedMessage);
      
      await saveUser(jid, { 
        name: pushName,
        isNewLead: hasLeadKeywords
      });
      
      if (hasLeadKeywords) {
        await markAsNewLead(jid, pushName);
        log('SUCCESS', `🎯 NOVO LEAD: ${pushName}`);
      } else {
        log('SUCCESS', `👤 NOVO CLIENTE: ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      // 🔥 CORREÇÃO: Passa TRUE se for Lead, FALSE se for Cliente
      const welcomeMsg = await generateWelcomeMessage(pushName, hasLeadKeywords);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});
      
      // 🔥 REGISTRA BOAS-VINDAS NO HISTÓRICO DA IA
      try {
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', welcomeMsg);
        log('SUCCESS', `📝 Histórico de boas-vindas registrado`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico da IA: ${err.message}`);
      }
      
      // Salva também no banco de dados
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico no DB: ${err.message}`);
      }
      
      log('SUCCESS', `✅ Boas-vindas enviadas (${hasLeadKeywords ? 'LEAD' : 'CLIENTE'})`);
      return;
    }

    // 🔥 MENSAGENS SEGUINTES = SEM BOAS-VINDAS
    log('INFO', `📨 Mensagem de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    const isLead = await isLeadUser(jid);
    
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    if (isLead) {
      aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
      
      if (shouldSendFanpageLink(cleanedMessage)) {
        await simulateTyping(sock, jid, 1000);
        await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch(() => {});
      }
      
      log('SUCCESS', `✅ Resposta IA (LEAD)`);
    } else {
      aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
      log('SUCCESS', `✅ Resposta IA (CLIENTE)`);
    }
    
    await sock.sendMessage(jid, { text: aiResponse }).catch(() => {});

  } catch (error) {
    log('WARNING', `⚠️ Erro ao processar mensagem: ${error.message}`);
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }
  }
}

export async function processMessage(sock, message) {
  try {
    await handleIncomingMessage(sock, message);
  } catch (error) {
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ Erro crítico: ${error.message}`);
    }
  }
}

export default {
  handleIncomingMessage,
  processMessage
};