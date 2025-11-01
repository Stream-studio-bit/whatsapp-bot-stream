import { 
  isValidMessage, 
  extractMessageText, 
  cleanMessage, 
  isGreeting, 
  isNewLead,
  simulateTyping,
  log,
  extractPhoneNumber,
  parseCommand
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
  shouldSendFanpageLink
} from '../services/ai.js';

import { FANPAGE_MESSAGE } from '../utils/knowledgeBase.js';

const lastMessageTime = new Map();
const DEBOUNCE_DELAY = 500;

// 🔥 RASTREIA MENSAGENS ENVIADAS PELO BOT
const botSentMessages = new Set();

function cleanupDebounceMap() {
  const now = Date.now();
  const MAX_AGE = 60000;
  
  for (const [jid, timestamp] of lastMessageTime.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastMessageTime.delete(jid);
    }
  }
  
  // Limpa mensagens antigas (> 5 min)
  const oldMessages = Array.from(botSentMessages).filter(id => {
    const timestamp = parseInt(id.split('-')[1] || '0');
    return now - timestamp > 300000;
  });
  oldMessages.forEach(id => botSentMessages.delete(id));
}

setInterval(cleanupDebounceMap, 120000);

/**
 * 🔥 Verifica se é owner
 */
function isOwner(jid) {
  const phone = extractPhoneNumber(jid);
  if (!phone) return false;
  
  const ownerPhone = process.env.OWNER_PHONE?.replace(/\D/g, '');
  
  if (!ownerPhone) {
    log('WARNING', '⚠️ OWNER_PHONE não configurado no .env');
    return false;
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  const isMatch = 
    cleanPhone === ownerPhone ||
    cleanPhone.endsWith(ownerPhone) ||
    ownerPhone.endsWith(cleanPhone);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🔍 Owner check: ${cleanPhone} vs ${ownerPhone} = ${isMatch}`);
  }
  
  return isMatch;
}

/**
 * 🔥 SOLUÇÃO DEFINITIVA: Rastreia mensagens enviadas pelo bot
 * Se fromMe=true mas NÃO está no Set, é mensagem MANUAL do owner
 */
function isOwnerManualMessage(message) {
  if (!message?.key?.fromMe) return false;
  
  const jid = message.key.remoteJid;
  if (!isOwner(jid)) return false;
  
  const text = extractMessageText(message);
  if (!text) return false;
  
  const messageId = message.key.id;
  
  // Se o bot enviou, estará no Set
  const isBotMessage = botSentMessages.has(messageId);
  
  // Remove do Set após verificação (evita memory leak)
  if (isBotMessage) {
    botSentMessages.delete(messageId);
  }
  
  const isManual = !isBotMessage;
  
  if (isManual) {
    log('INFO', `🕵️ Mensagem MANUAL detectada (ID: ${messageId})`);
  }
  
  return isManual;
}

/**
 * 🔥 Wrapper para sendMessage que registra IDs
 */
async function sendBotMessage(sock, jid, content) {
  const sent = await sock.sendMessage(jid, content);
  
  // Registra ID da mensagem enviada pelo bot
  if (sent?.key?.id) {
    botSentMessages.add(sent.key.id);
    
    if (process.env.DEBUG_MODE === 'true') {
      log('INFO', `📤 Bot enviou mensagem ID: ${sent.key.id}`);
    }
  }
  
  return sent;
}

/**
 * 🔥 Processa comandos /assumir e /liberar
 */
async function handleCommand(sock, message) {
  try {
    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) return false;
    
    const { isCommand, command } = parseCommand(messageText);
    
    if (!isCommand) return false;
    
    const cmd = command?.toUpperCase() || '';
    const pushName = message.pushName || 'Usuário';
    
    log('INFO', `⚙️ Comando detectado: ${cmd} de ${pushName}`);
    
    if (!isOwner(jid)) {
      log('WARNING', `🚫 Comando por usuário NÃO AUTORIZADO`);
      await sendBotMessage(sock, jid, { 
        text: '❌ Apenas o administrador pode usar comandos.' 
      }).catch(() => {});
      return true;
    }
    
    log('SUCCESS', `✅ Comando autorizado de owner`);
    
    // COMANDO: /assumir
    if (cmd === 'ASSUME' || cmd === 'ASSUMIR') {
      try {
        await blockBotForUser(jid);
        log('SUCCESS', `🔒 Bot BLOQUEADO via comando`);
        
        await sendBotMessage(sock, jid, { 
          text: `✅ *Atendimento assumido!*\n\n🚫 Bot pausado.\n⏰ Expira em 1 hora.` 
        }).catch(() => {});
        
        return true;
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear: ${err.message}`);
        await sendBotMessage(sock, jid, { 
          text: '❌ Erro ao bloquear bot.' 
        }).catch(() => {});
        return true;
      }
    }
    
    // COMANDO: /liberar
    if (cmd === 'RELEASE' || cmd === 'LIBERAR') {
      let isBlocked = false;
      try {
        isBlocked = await isBotBlockedForUser(jid);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao checar bloqueio: ${err.message}`);
      }
      
      if (!isBlocked) {
        await sendBotMessage(sock, jid, { 
          text: 'ℹ️ Bot já está ativo.' 
        }).catch(() => {});
        return true;
      }
      
      try {
        await unblockBotForUser(jid);
        log('SUCCESS', `🔓 Bot LIBERADO via comando`);
        
        await sendBotMessage(sock, jid, { 
          text: `✅ *Bot liberado!*\n\n🤖 Atendimento automático reativado.` 
        }).catch(() => {});
        
        return true;
      } catch (err) {
        log('WARNING', `⚠️ Erro ao liberar: ${err.message}`);
        await sendBotMessage(sock, jid, { 
          text: '❌ Erro ao liberar bot.' 
        }).catch(() => {});
        return true;
      }
    }
    
    return false;
    
  } catch (error) {
    log('WARNING', `⚠️ Erro ao processar comando: ${error.message}`);
    return false;
  }
}

/**
 * 🔥 HANDLER PRINCIPAL
 */
export async function handleIncomingMessage(sock, message) {
  try {
    if (!isValidMessage(message)) return;
    
    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) return;

    // 🔥 BLOQUEIO AUTOMÁTICO: Owner enviou mensagem manual
    if (isOwnerManualMessage(message)) {
      log('INFO', `👤 Owner enviou mensagem MANUAL para ${extractPhoneNumber(jid)}`);
      
      try {
        await blockBotForUser(jid);
        log('SUCCESS', `🔒 Bot BLOQUEADO automaticamente (owner assumiu)`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear: ${err.message}`);
      }
      
      return;
    }

    // Ignora mensagens do bot
    if (message?.key?.fromMe) return;

    // Debounce
    const now = Date.now();
    const lastTime = lastMessageTime.get(jid) || 0;
    if (now - lastTime < DEBOUNCE_DELAY) return;
    lastMessageTime.set(jid, now);

    const cleanedMessage = cleanMessage(messageText);
    const pushName = message.pushName || 'Cliente';
    const phone = extractPhoneNumber(jid);
    
    log('INFO', `📩 ${pushName} (${phone}): "${cleanedMessage.substring(0, 50)}"`);

    // PASSO 1: Comandos
    const isCommandProcessed = await handleCommand(sock, message);
    if (isCommandProcessed) {
      log('INFO', `⚙️ Comando processado`);
      return;
    }

    // PASSO 2: Verifica bloqueio
    let isBlocked = false;
    try {
      isBlocked = await isBotBlockedForUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar bloqueio: ${err.message}`);
      isBlocked = false;
    }

    if (isBlocked) {
      log('WARNING', `🚫 Bot bloqueado para ${pushName} - Atendimento manual`);
      return;
    }

    // PASSO 3: Verifica primeira interação
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    
    // 🔥 PRIMEIRA MENSAGEM
    if (isFirstContact) {
      const isLead = isNewLead(cleanedMessage);
      
      await saveUser(jid, { 
        name: pushName,
        isNewLead: isLead
      });
      
      if (isLead) {
        await markAsNewLead(jid, pushName);
        log('SUCCESS', `🎯 NOVO LEAD: ${pushName}`);
      } else {
        log('SUCCESS', `👤 NOVO CLIENTE: ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      const welcomeMsg = await generateWelcomeMessage(pushName, false);
      
      await sendBotMessage(sock, jid, { text: welcomeMsg }).catch(() => {});
      
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico: ${err.message}`);
      }
      
      log('SUCCESS', `✅ Boas-vindas enviadas`);
      return;
    }

    // 🔥 MENSAGENS SUBSEQUENTES
    log('INFO', `📨 Mensagem subsequente de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    const wasMarkedAsLead = await isLeadUser(jid);
    
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    if (wasMarkedAsLead) {
      aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
      
      if (shouldSendFanpageLink(cleanedMessage)) {
        await simulateTyping(sock, jid, 1000);
        await sendBotMessage(sock, jid, { text: FANPAGE_MESSAGE }).catch(() => {});
      }
      
      log('SUCCESS', `✅ Resposta IA (LEAD)`);
    } else {
      aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
      log('SUCCESS', `✅ Resposta IA (CLIENTE)`);
    }
    
    await sendBotMessage(sock, jid, { text: aiResponse }).catch(() => {});

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