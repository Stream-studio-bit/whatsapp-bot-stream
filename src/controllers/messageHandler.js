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

// 🔥 Armazena timestamp de inicialização
const BOT_START_TIME = Date.now();

// 🔥 Set para rastrear mensagens já processadas
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
  
  // 🔥 Limpa cache de mensagens processadas
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    processedMessages.clear();
    log('INFO', '🧹 Cache de mensagens processadas limpo');
  }
}

setInterval(cleanupDebounceMap, 120000);

/**
 * 🔥 Verifica se a mensagem é RECENTE (depois do bot iniciar)
 */
function isRecentMessage(message) {
  try {
    const messageTimestamp = message.messageTimestamp;
    
    if (!messageTimestamp) {
      // Sem timestamp = assume recente (melhor processar do que perder)
      return true;
    }
    
    // Converte timestamp (pode estar em segundos ou milissegundos)
    let messageTime;
    if (typeof messageTimestamp === 'object' && messageTimestamp.low) {
      // Timestamp em formato objeto (Baileys)
      messageTime = messageTimestamp.low * 1000;
    } else if (typeof messageTimestamp === 'number') {
      // Se o número é muito pequeno, está em segundos
      messageTime = messageTimestamp < 10000000000 
        ? messageTimestamp * 1000 
        : messageTimestamp;
    } else {
      return true;
    }
    
    // 🔥 Mensagens DEPOIS do bot iniciar (mais recentes que BOT_START_TIME)
    const isRecent = messageTime >= BOT_START_TIME;
    
    if (process.env.DEBUG_MODE === 'true') {
      const messageDate = new Date(messageTime).toISOString();
      const botStartDate = new Date(BOT_START_TIME).toISOString();
      log('INFO', `📅 Mensagem: ${messageDate} | Bot: ${botStartDate} | Recente: ${isRecent}`);
    }
    
    return isRecent;
    
  } catch (error) {
    // Em caso de erro, assume que é recente para não perder mensagens
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao verificar idade da mensagem: ${error.message}`);
    }
    return true;
  }
}

/**
 * 🔥 Valida se mensagem deve ser processada
 */
function shouldProcessMessage(message) {
  try {
    // 1. Valida estrutura básica
    if (!message || !message.key) {
      return false;
    }
    
    const jid = message.key.remoteJid;
    
    // 2. Ignora mensagens de broadcast/status
    if (jid === 'status@broadcast' || jid?.includes('broadcast')) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭️ Ignorando mensagem de broadcast');
      }
      return false;
    }
    
    // 3. Ignora grupos (apenas conversas individuais)
    if (jid?.endsWith('@g.us')) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭️ Ignorando mensagem de grupo');
      }
      return false;
    }
    
    // 4. Verifica se é mensagem individual válida
    if (!jid?.endsWith('@s.whatsapp.net')) {
      return false;
    }
    
    // 5. Verifica se já foi processada
    const messageId = message.key.id;
    if (messageId && processedMessages.has(messageId)) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', '⏭️ Mensagem já processada, ignorando');
      }
      return false;
    }
    
    // 6. 🔥 Verifica se é mensagem RECENTE
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
 * 🔥 HANDLER PRINCIPAL - VERSÃO COMPATÍVEL COM DATABASE.JS
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // 🔥 VALIDAÇÃO 0: Verifica se deve processar
    if (!shouldProcessMessage(message)) {
      return;
    }
    
    // 🔥 VALIDAÇÃO 1: Mensagem válida (conteúdo)
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
      
      // 🔥 SÓ bloqueia se mensagem for RECENTE
      if (isRecentMessage(message)) {
        // Verifica se já está bloqueado para evitar bloqueios duplicados
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
        // 🔥 Mensagem antiga do owner - IGNORA completamente
        if (process.env.DEBUG_MODE === 'true') {
          log('INFO', `⏭️ Ignorando mensagem ANTIGA do owner para ${clientPhone} (histórico)`);
        }
      }
      
      return; // Para processamento (owner respondeu ou histórico)
    }

    // 🔥 VERIFICAÇÃO DE BLOQUEIO COM AUTO-DESBLOQUEIO INTEGRADO
    // A função isBotBlockedForUser() do database.js JÁ FAZ:
    // 1. Verifica se está bloqueado
    // 2. Verifica se expirou (> 60 minutos)
    // 3. Desbloqueia automaticamente se expirou
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
      return; // 🔥 PARA AQUI - NÃO PROCESSA NADA
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

    // 🔥 PASSO 1: Verifica se é primeira interação
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
        log('SUCCESS', `👤 NOVO CONTATO (sem keywords): ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch((err) => {
        log('WARNING', `⚠️ Erro ao enviar mensagem: ${err.message}`);
      });
      
      // Registra no histórico
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
      
      log('SUCCESS', `✅ Boas-vindas enviadas (LEAD)`);
      return;
    }

    // 🔥 MENSAGENS SEGUINTES
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
      
      // Envia mensagem de erro ao usuário
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
 * 🔥 Reseta o cache de mensagens processadas
 */
export function resetProcessedMessages() {
  processedMessages.clear();
  log('SUCCESS', '✅ Cache de mensagens processadas resetado');
}

/**
 * 🔥 Obtém estatísticas do handler
 */
export function getHandlerStats() {
  return {
    botStartTime: new Date(BOT_START_TIME).toISOString(),
    processedMessagesCount: processedMessages.size,
    debounceCacheSize: lastMessageTime.size
  };
}

export default {
  handleIncomingMessage,
  processMessage,
  resetProcessedMessages,
  getHandlerStats
};