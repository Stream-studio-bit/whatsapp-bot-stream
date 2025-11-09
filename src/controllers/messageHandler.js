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

// 🔥 CORREÇÃO #1: Timestamp mais permissivo
const BOT_START_TIME = Date.now();
const MESSAGE_AGE_THRESHOLD = 300000; // 5 minutos (era 10 segundos)

// 🔥 CORREÇÃO #2: Cache unificado
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
    const oldSize = processedMessages.size;
    const iterator = processedMessages.values();
    for (let i = 0; i < 500; i++) {
      const { value } = iterator.next();
      if (value) processedMessages.delete(value);
    }
    log('INFO', `🧹 Cache reduzido: ${oldSize} → ${processedMessages.size}`);
  }
}

setInterval(cleanupDebounceMap, 120000);

/**
 * 🔥 CORREÇÃO #3: Verificação de idade mais permissiva
 */
function isRecentMessage(message) {
  try {
    const messageTimestamp = message.messageTimestamp;
    
    if (!messageTimestamp) {
      return true; // Sem timestamp = aceita
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
    
    const now = Date.now();
    const messageAge = now - messageTime;
    
    // 🔥 MUDANÇA: Aceita mensagens até MESSAGE_AGE_THRESHOLD
    // Isso permite processar mensagens enviadas enquanto bot estava offline
    if (messageAge > MESSAGE_AGE_THRESHOLD) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', `⏰ Mensagem muito antiga: ${Math.round(messageAge/1000)}s atrás`);
      }
      return false;
    }
    
    return true;
    
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao verificar idade: ${error.message}`);
    }
    return true; // Em caso de erro, aceita
  }
}

/**
 * 🔥 Valida se mensagem deve ser processada
 */
function shouldProcessMessage(message) {
  try {
    if (!message || !message.key) {
      return false;
    }
    
    const jid = message.key.remoteJid;
    
    // Ignora broadcast/status
    if (jid === 'status@broadcast' || jid?.includes('broadcast')) {
      return false;
    }
    
    // Ignora grupos
    if (jid?.endsWith('@g.us')) {
      return false;
    }
    
    // Apenas conversas individuais
    if (!jid?.endsWith('@s.whatsapp.net')) {
      return false;
    }
    
    // Verifica cache
    const messageId = message.key.id;
    if (messageId && processedMessages.has(messageId)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⭕️ Mensagem já processada');
      }
      return false;
    }
    
    // 🔥 CORREÇÃO #4: Verifica idade APENAS para fromMe
    // Mensagens de usuários sempre são processadas
    if (message?.key?.fromMe && !isRecentMessage(message)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⭕️ Mensagem do owner antiga, ignorando');
      }
      return false;
    }
    
    return true;
    
  } catch (error) {
    log('WARNING', `⚠️ Erro ao validar: ${error.message}`);
    return false;
  }
}

/**
 * 🔥 HANDLER PRINCIPAL - VERSÃO CORRIGIDA
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // Validação inicial
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

    // 🔥 CORREÇÃO #5: Bloqueio INTELIGENTE do owner
    if (message?.key?.fromMe) {
      const clientPhone = extractPhoneNumber(jid);
      
      // Só bloqueia se for mensagem RECENTE
      if (isRecentMessage(message)) {
        const isAlreadyBlocked = await isBotBlockedForUser(jid);
        
        if (!isAlreadyBlocked) {
          log('INFO', `👤 Owner respondeu ${clientPhone} - Bloqueando IA`);
          
          try {
            await blockBotForUser(jid);
            log('SUCCESS', `🔒 IA bloqueada para ${clientPhone}`);
          } catch (err) {
            log('WARNING', `⚠️ Erro ao bloquear: ${err.message}`);
          }
        }
      } else {
        // Mensagem antiga do owner - apenas ignora
        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', `⏰ Mensagem antiga do owner para ${clientPhone}, ignorando`);
        }
      }
      
      return; // Não processa mensagens do owner
    }

    // Verifica bloqueio
    let isBlocked = false;
    try {
      isBlocked = await isBotBlockedForUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar bloqueio: ${err.message}`);
      isBlocked = false;
    }

    if (isBlocked) {
      const clientPhone = extractPhoneNumber(jid);
      log('WARNING', `🚫 Bot bloqueado para ${clientPhone} - Ignorando`);
      return;
    }

    // Debounce
    const now = Date.now();
    const lastTime = lastMessageTime.get(jid) || 0;
    if (now - lastTime < DEBOUNCE_DELAY) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏱️ Debounce ativo, aguardando...');
      }
      return;
    }
    lastMessageTime.set(jid, now);

    const cleanedMessage = cleanMessage(messageText);
    const pushName = message.pushName || 'Cliente';
    const phone = extractPhoneNumber(jid);
    
    log('INFO', `📩 ${pushName} (${phone}): "${cleanedMessage.substring(0, 50)}${cleanedMessage.length > 50 ? '...' : ''}"`);

    // 🔥 CORREÇÃO #6: Tratamento de primeira interação
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    
    // PRIMEIRA MENSAGEM
    if (isFirstContact) {
      const hasLeadKeywords = isNewLead(cleanedMessage);
      
      await saveUser(jid, { 
        name: pushName,
        isNewLead: true
      });
      
      if (hasLeadKeywords) {
        await markAsNewLead(jid, pushName);
        log('SUCCESS', `🎯 NOVO LEAD: ${pushName}`);
      } else {
        log('SUCCESS', `👤 NOVO CONTATO: ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      // 🔥 CORREÇÃO #7: Valida se função existe
      let welcomeMsg;
      try {
        welcomeMsg = await generateWelcomeMessage(pushName, true);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao gerar boas-vindas: ${err.message}`);
        // Fallback manual
        welcomeMsg = `Olá ${pushName}! 👋\n\nSeja bem-vindo(a) à Stream Studio!\n\nComo posso ajudar você hoje?`;
      }
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch((err) => {
        log('WARNING', `⚠️ Erro ao enviar: ${err.message}`);
      });
      
      // Registra histórico
      try {
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', welcomeMsg);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico IA: ${err.message}`);
      }
      
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar no DB: ${err.message}`);
      }
      
      log('SUCCESS', `✅ Boas-vindas enviadas`);
      return;
    }

    // MENSAGENS SEGUINTES
    log('INFO', `📨 Processando mensagem de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    const isLead = await isLeadUser(jid);
    
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    try {
      // 🔥 CORREÇÃO #8: Valida funções da IA
      if (isLead) {
        if (typeof processLeadMessage !== 'function') {
          throw new Error('processLeadMessage não está disponível');
        }
        aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
        
        if (shouldSendFanpageLink(cleanedMessage)) {
          await simulateTyping(sock, jid, 1000);
          await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch((err) => {
            log('WARNING', `⚠️ Erro ao enviar fanpage: ${err.message}`);
          });
        }
        
        log('SUCCESS', `✅ Resposta gerada (LEAD)`);
      } else {
        if (typeof processClientMessage !== 'function') {
          throw new Error('processClientMessage não está disponível');
        }
        aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
        log('SUCCESS', `✅ Resposta gerada (CLIENTE)`);
      }
      
      if (aiResponse && aiResponse.trim()) {
        await sock.sendMessage(jid, { text: aiResponse }).catch((err) => {
          log('WARNING', `⚠️ Erro ao enviar resposta: ${err.message}`);
        });
        log('SUCCESS', `📤 Resposta enviada com sucesso`);
      } else {
        log('WARNING', '⚠️ IA retornou resposta vazia');
        throw new Error('Resposta da IA está vazia');
      }
      
    } catch (error) {
      log('WARNING', `⚠️ Erro na IA: ${error.message}`);
      
      if (process.env.DEBUG_MODE === 'true') {
        console.error('Stack trace:', error.stack);
      }
      
      // 🔥 CORREÇÃO #9: Mensagem de erro mais informativa
      const errorMsg = `Desculpe ${pushName}, estou com dificuldades técnicas no momento. 😅\n\n` +
                      `Por favor, aguarde alguns instantes que logo você será atendido!\n\n` +
                      `Se preferir, pode enviar sua mensagem que assim que possível retornarei.`;
      
      try {
        await sock.sendMessage(jid, { text: errorMsg });
        log('SUCCESS', '📤 Mensagem de erro enviada');
      } catch (sendErr) {
        log('WARNING', `⚠️ Não foi possível enviar mensagem de erro: ${sendErr.message}`);
      }
    }

  } catch (error) {
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ Erro ao processar: ${error.message}`);
      if (process.env.DEBUG_MODE === 'true') {
        console.error('Stack completo:', error.stack);
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
  log('SUCCESS', '✅ Cache resetado');
}

export function getHandlerStats() {
  return {
    botStartTime: new Date(BOT_START_TIME).toISOString(),
    processedMessagesCount: processedMessages.size,
    debounceCacheSize: lastMessageTime.size,
    messageAgeThreshold: `${MESSAGE_AGE_THRESHOLD}ms (${MESSAGE_AGE_THRESHOLD/60000} minutos)`
  };
}

export default {
  handleIncomingMessage,
  processMessage,
  resetProcessedMessages,
  getHandlerStats
};