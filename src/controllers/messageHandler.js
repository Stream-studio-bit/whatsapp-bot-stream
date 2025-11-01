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

// 🔥 Rastreia APENAS primeira interação GERAL (independente de ser LEAD)
const firstContactSent = new Map();

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
 * 🔥 NOVA FUNÇÃO: Detecta mensagem MANUAL do owner
 * Baileys: fromMe=true pode ser bot OU owner manual
 * Diferença: Mensagens do bot têm messageTimestamp muito próximo do processamento
 */
function isOwnerManualMessage(message) {
  if (!message?.key?.fromMe) return false;
  
  const jid = message.key.remoteJid;
  if (!isOwner(jid)) return false;
  
  // Se não tem texto, ignora (pode ser mídia/status)
  const text = extractMessageText(message);
  if (!text) return false;
  
  // Heurística: Mensagens do bot são processadas instantaneamente
  // Mensagens manuais têm delay entre timestamp e recebimento
  const msgTimestamp = message.messageTimestamp * 1000;
  const now = Date.now();
  const delay = now - msgTimestamp;
  
  // Se delay < 2s, provavelmente é do bot
  // Se delay >= 2s, provavelmente é manual
  const isManual = delay >= 2000;
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🕐 Delay msg: ${delay}ms - Manual: ${isManual}`);
  }
  
  return isManual;
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
      
      await sock.sendMessage(jid, { 
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
        
        await sock.sendMessage(jid, { 
          text: `✅ *Atendimento assumido!*\n\n🚫 Bot pausado.\n⏰ Expira em 1 hora.` 
        }).catch(() => {});
        
        return true;
        
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear: ${err.message}`);
        
        await sock.sendMessage(jid, { 
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
        await sock.sendMessage(jid, { 
          text: 'ℹ️ Bot já está ativo.' 
        }).catch(() => {});
        
        return true;
      }
      
      try {
        await unblockBotForUser(jid);
        
        log('SUCCESS', `🔓 Bot LIBERADO via comando`);
        
        await sock.sendMessage(jid, { 
          text: `✅ *Bot liberado!*\n\n🤖 Atendimento automático reativado.` 
        }).catch(() => {});
        
        return true;
        
      } catch (err) {
        log('WARNING', `⚠️ Erro ao liberar: ${err.message}`);
        
        await sock.sendMessage(jid, { 
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
 * 🔥 HANDLER PRINCIPAL - CORRIGIDO
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // Validações básicas
    if (!isValidMessage(message)) return;
    
    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) return;

    // 🔥 BLOQUEIO AUTOMÁTICO: Detecta mensagem MANUAL do owner
    if (isOwnerManualMessage(message)) {
      log('INFO', `👤 Owner enviou mensagem MANUAL para ${extractPhoneNumber(jid)}`);
      
      try {
        await blockBotForUser(jid);
        log('SUCCESS', `🔒 Bot BLOQUEADO automaticamente (owner assumiu)`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear: ${err.message}`);
      }
      
      return; // Não processa mensagens do owner
    }

    // Ignora mensagens próprias do bot
    if (message?.key?.fromMe) {
      return;
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

    // PASSO 1: Comandos têm prioridade
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

    // 🔥 PASSO 3: BOAS-VINDAS (APENAS PRIMEIRA INTERAÇÃO GERAL)
    const isFirstContact = !firstContactSent.has(jid);
    
    if (isFirstContact) {
      // Verifica se é LEAD (para personalizar boas-vindas)
      const isLead = isNewLead(cleanedMessage);
      
      await saveUser(jid, { 
        name: pushName,
        isNewLead: isLead
      });
      
      if (isLead) {
        await markAsNewLead(jid, pushName);
        log('SUCCESS', `🎯 NOVO LEAD: ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      const welcomeMsg = await generateWelcomeMessage(pushName, isLead);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});
      
      // 🔥 MARCA COMO "JÁ TEVE PRIMEIRO CONTATO"
      firstContactSent.set(jid, now);
      
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico: ${err.message}`);
      }
      
      log('SUCCESS', `✅ Boas-vindas enviadas (primeira interação)`);
      return;
    }

    // 🔥 PASSO 4: MENSAGENS SUBSEQUENTES
    log('INFO', `📨 Mensagem de ${pushName} (já teve contato inicial)`);
    
    // Atualiza dados do usuário
    await saveUser(jid, { name: pushName });
    
    // Verifica se é LEAD (pode ter sido marcado anteriormente)
    const isLead = await isLeadUser(jid);
    
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    if (isLead) {
      aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
      
      if (shouldSendFanpageLink(cleanedMessage)) {
        await simulateTyping(sock, jid, 1000);
        await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch(() => {});
      }
      
      log('SUCCESS', `✅ Resposta IA para LEAD`);
    } else {
      aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
      log('SUCCESS', `✅ Resposta IA para CLIENTE`);
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