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
  saveConversationHistory,
  getBlockTimestamp
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

// ⏰ CONFIGURAÇÃO: Tempo de bloqueio automático (em minutos, padrão 60)
const AUTO_UNBLOCK_TIME_MINUTES = parseInt(process.env.AUTO_UNBLOCK_TIME || "60", 10);
const AUTO_UNBLOCK_TIME = AUTO_UNBLOCK_TIME_MINUTES * 60 * 1000; // converte para milissegundos

const BOT_START_TIME = Date.now();
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

function cleanupDebounceMap() {
  const now = Date.now();
  const MAX_AGE = 60000;
  
  for (const [jid, timestamp] of lastMessageTime.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastMessageTime.delete(jid);
    }
  }
  
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    processedMessages.clear();
    log('INFO', '🧹 Cache de mensagens processadas limpo');
  }
}

setInterval(cleanupDebounceMap, 120000);

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

function shouldProcessMessage(message) {
  try {
    if (!message || !message.key) {
      return false;
    }
    
    const jid = message.key.remoteJid;
    
    if (jid === 'status@broadcast' || jid?.includes('broadcast')) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭️ Ignorando mensagem de broadcast');
      }
      return false;
    }
    
    if (jid?.endsWith('@g.us')) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭️ Ignorando mensagem de grupo');
      }
      return false;
    }
    
    if (!jid?.endsWith('@s.whatsapp.net')) {
      return false;
    }
    
    const messageId = message.key.id;
    if (messageId && processedMessages.has(messageId)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭️ Mensagem já processada, ignorando');
      }
      return false;
    }
    
    if (!isRecentMessage(message)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭️ Ignorando mensagem antiga (anterior à inicialização)');
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
 * 🔥 NOVA FUNÇÃO: Verifica e desbloqueia automaticamente se expirou
 */
async function checkAndAutoUnblock(jid) {
  try {
    const isBlocked = await isBotBlockedForUser(jid);
    
    if (!isBlocked) {
      return false; // Não está bloqueado
    }
    
    // Obtém timestamp do bloqueio
    const blockTimestamp = await getBlockTimestamp(jid);
    
    if (!blockTimestamp) {
      // Sem timestamp = bloqueio antigo, desbloqueia
      await unblockBotForUser(jid);
      const phone = extractPhoneNumber(jid);
      log('SUCCESS', `🔓 AUTO-DESBLOQUEIO: ${phone} (sem timestamp)`);
      return false;
    }
    
    const now = Date.now();
    const timeSinceBlock = now - blockTimestamp;
    
    // Se passou mais que o tempo configurado, desbloqueia
    if (timeSinceBlock > AUTO_UNBLOCK_TIME) {
      await unblockBotForUser(jid);
      const phone = extractPhoneNumber(jid);
      const hoursBlocked = (timeSinceBlock / (60 * 60 * 1000)).toFixed(1);
      log('SUCCESS', `🔓 AUTO-DESBLOQUEIO: ${phone} (bloqueado por ${hoursBlocked}h)`);
      return false;
    }
    
    // Ainda bloqueado
    const remainingTime = AUTO_UNBLOCK_TIME - timeSinceBlock;
    const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
    
    if (process.env.DEBUG_MODE === 'true') {
      const phone = extractPhoneNumber(jid);
      log('INFO', `🔒 ${phone} ainda bloqueado (${remainingMinutes}min restantes)`);
    }
    
    return true;
    
  } catch (error) {
    log('WARNING', `⚠️ Erro ao verificar auto-desbloqueio: ${error.message}`);
    return false; // Em caso de erro, não bloqueia
  }
}

/**
 * 🔥 HANDLER PRINCIPAL - VERSÃO COM AUTO-DESBLOQUEIO
 */
export async function handleIncomingMessage(sock, message) {
  try {
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
    
    const messageId = message.key.id;
    if (messageId) {
      processedMessages.add(messageId);
    }

    // 🔥 BLOQUEIO OWNER (somente mensagens recentes)
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
          log('INFO', `⏭️ Ignorando mensagem ANTIGA do owner para ${clientPhone} (histórico)`);
        }
      }
      
      return;
    }

    // 🔥 VERIFICAÇÃO DE BLOQUEIO COM AUTO-DESBLOQUEIO
    const isStillBlocked = await checkAndAutoUnblock(jid);

    if (isStillBlocked) {
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

    // PRIMEIRA INTERAÇÃO = SEMPRE LEAD
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    
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
        log('SUCCESS', `👤 NOVO CONTATO (sem keywords): ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch((err) => {
        log('WARNING', `⚠️ Erro ao enviar mensagem: ${err.message}`);
      });
      
      try {
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', welcomeMsg);
        log('SUCCESS', `📝 Histórico registrado`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico da IA: ${err.message}`);
      }
      
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico no DB: ${err.message}`);
      }
      
      log('SUCCESS', `✅ Boas-vindas enviadas (LEAD)`);
      return;
    }

    // MENSAGENS SEGUINTES
    log('INFO', `📨 Mensagem de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    const isLead = await isLeadUser(jid);
    
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    try {
      if (isLead) {
        aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
        
        if (shouldSendFanpageLink(cleanedMessage)) {
          await simulateTyping(sock, jid, 1000);
          await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch((err) => {
            log('WARNING', `⚠️ Erro ao enviar fanpage: ${err.message}`);
          });
        }
        
        log('SUCCESS', `✅ Resposta IA (LEAD)`);
      } else {
        aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
        log('SUCCESS', `✅ Resposta IA (CLIENTE)`);
      }
      
      if (aiResponse) {
        await sock.sendMessage(jid, { text: aiResponse }).catch((err) => {
          log('WARNING', `⚠️ Erro ao enviar resposta: ${err.message}`);
        });
      }
      
    } catch (error) {
      log('WARNING', `⚠️ Erro ao gerar resposta da IA: ${error.message}`);
      
      const errorMsg = `Desculpe ${pushName}, estou com dificuldades técnicas no momento. 😅\n\nPor favor, aguarde que logo você será atendido!`;
      await sock.sendMessage(jid, { text: errorMsg }).catch(() => {});
    }

  } catch (error) {
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ Erro ao processar mensagem: ${error.message}`);
      if (process.env.DEBUG_MODE === 'true') {
        console.error('Stack trace:', error.stack);
      }
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

export function resetProcessedMessages() {
  processedMessages.clear();
  log('SUCCESS', '✅ Cache de mensagens processadas resetado');
}

export function getHandlerStats() {
  return {
    botStartTime: new Date(BOT_START_TIME).toISOString(),
    processedMessagesCount: processedMessages.size,
    debounceCacheSize: lastMessageTime.size,
    autoUnblockTime: `${AUTO_UNBLOCK_TIME_MINUTES} minutos`
  };
}

export default {
  handleIncomingMessage,
  processMessage,
  resetProcessedMessages,
  getHandlerStats
};
