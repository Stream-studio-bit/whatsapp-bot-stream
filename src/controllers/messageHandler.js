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
 * 🔥 Verifica se número é o owner
 */
function isOwnerPhone(phone) {
  if (!phone) return false;
  
  const ownerPhone = process.env.OWNER_PHONE?.replace(/\D/g, '');
  
  if (!ownerPhone) {
    log('WARNING', '⚠️ OWNER_PHONE não configurado no .env');
    return false;
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  return cleanPhone === ownerPhone || 
         cleanPhone.endsWith(ownerPhone) || 
         ownerPhone.endsWith(cleanPhone);
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
    const phone = extractPhoneNumber(jid);
    
    log('INFO', `⚙️ Comando detectado: ${cmd}`);
    
    if (!isOwnerPhone(phone)) {
      log('WARNING', `🚫 Comando por usuário NÃO AUTORIZADO`);
      await sock.sendMessage(jid, { 
        text: '❌ Apenas o administrador pode usar comandos.' 
      }).catch(() => {});
      return true;
    }
    
    log('SUCCESS', `✅ Comando autorizado`);
    
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
 * 🔥 HANDLER PRINCIPAL - VERSÃO CORRIGIDA
 */
export async function handleIncomingMessage(sock, message) {
  try {
    if (!isValidMessage(message)) return;
    
    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) return;

    // 🔥 DETECTA MENSAGEM MANUAL DO OWNER
    // fromMe=true significa que foi enviada pelo número conectado ao bot
    // Se for do owner, bloqueia automaticamente
    if (message?.key?.fromMe) {
      const senderPhone = extractPhoneNumber(jid);
      
      if (isOwnerPhone(senderPhone)) {
        // Owner está no chat - não faz nada (é mensagem dele mesmo)
        return;
      }
      
      // fromMe=true para outro JID = Owner enviou mensagem manual para cliente
      log('INFO', `👤 Owner enviou mensagem MANUAL para ${senderPhone}`);
      
      try {
        await blockBotForUser(jid);
        log('SUCCESS', `🔒 Bot BLOQUEADO automaticamente (owner assumiu)`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear: ${err.message}`);
      }
      
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
      log('WARNING', `🚫 Bot bloqueado - Atendimento manual ativo`);
      return;
    }

    // PASSO 3: Verifica primeira interação no BANCO DE DADOS
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
      
      // Boas-vindas genéricas (sem diferenciação)
      const welcomeMsg = await generateWelcomeMessage(pushName, false);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});
      
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