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
  unblockBotForUser
} from '../services/database.js';

import {
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  shouldSendFanpageLink
} from '../services/ai.js';

import { FANPAGE_MESSAGE } from '../utils/knowledgeBase.js';

/**
 * 🔐 Verifica se o número é do dono (Roberto)
 * @param {string} jid - JID do WhatsApp
 * @returns {boolean}
 */
function isOwner(jid) {
  const phone = extractPhoneNumber(jid);
  const ownerPhone = process.env.OWNER_PHONE?.replace(/\D/g, ''); // Remove não-numéricos
  
  if (!ownerPhone) {
    log('WARNING', '⚠️ OWNER_PHONE não configurado no .env - Comandos desabilitados!');
    return false;
  }
  
  // Compara números sem formatação
  const cleanPhone = phone.replace(/\D/g, '');
  const isOwnerUser = cleanPhone === ownerPhone || cleanPhone.endsWith(ownerPhone);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🔍 Verificação de owner: ${phone} | Owner: ${ownerPhone} | Match: ${isOwnerUser}`);
  }
  
  return isOwnerUser;
}

/**
 * Processa comandos do sistema (/assumir e /liberar)
 * @returns {boolean} true se foi um comando, false se não
 */
async function handleCommand(sock, message) {
  try {
    const jid = message.key.remoteJid;
    const phone = extractPhoneNumber(jid);
    const messageText = extractMessageText(message);
    
    if (!messageText) return false;
    
    const { isCommand, command } = parseCommand(messageText);
    
    if (!isCommand) return false;
    
    const pushName = message.pushName || 'Usuário';
    
    // 🔐 VERIFICAÇÃO DE PERMISSÃO: Apenas o dono pode usar comandos
    if (!isOwner(jid)) {
      log('WARNING', `🚫 Tentativa de comando por usuário não autorizado: ${pushName} (${phone})`);
      
      await sock.sendMessage(jid, { 
        text: `❌ Desculpe, apenas o administrador pode usar comandos do sistema.` 
      });
      
      return true; // Retorna true para não processar como mensagem normal
    }
    
    // Comando: /assumir (Bloqueia bot)
    if (command === 'ASSUME') {
      blockBotForUser(jid);
      log('SUCCESS', `🔒 Bot BLOQUEADO para ${pushName} - Atendimento manual ativo`);
      
      await sock.sendMessage(jid, { 
        text: `✅ *Atendimento assumido!*\n\nO bot foi pausado para este número.\nVocê está em atendimento manual.\n\n💡 Para reativar o bot, envie:\n*${process.env.COMMAND_RELEASE || '/liberar'}*` 
      });
      
      return true;
    }
    
    // Comando: /liberar (Desbloqueia bot)
    if (command === 'RELEASE') {
      unblockBotForUser(jid);
      log('SUCCESS', `🤖 Bot LIBERADO para ${pushName} - IA reativada`);
      
      await sock.sendMessage(jid, { 
        text: `✅ *Bot liberado!*\n\nO atendimento automático foi reativado para este número.\n\n🤖 A IA voltará a responder normalmente.` 
      });
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar comando: ${error.message}`);
    return false;
  }
}

/**
 * HANDLER PRINCIPAL DE MENSAGENS
 * Processa todas as mensagens recebidas e decide a ação
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // ============================================
    // PASSO 1: Valida se é uma mensagem processável
    // ============================================
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
    const pushName = message.pushName || 'Cliente';
    
    log('INFO', `📩 Mensagem recebida de ${pushName} (${phone}): "${cleanedMessage}"`);

    // ============================================
    // PASSO 2: PROCESSA COMANDOS PRIMEIRO (PRIORIDADE MÁXIMA)
    // ============================================
    const isCommandProcessed = await handleCommand(sock, message);
    if (isCommandProcessed) {
      log('INFO', `⚙️ Comando processado para ${pushName}`);
      return; // Comando executado, não continua processamento
    }

    // ============================================
    // PASSO 3: Verifica expiração de bloqueio (1 hora)
    // ============================================
    const user = getUser(jid);
    if (user?.blockedAt) {
      const now = new Date();
      const diffMinutes = (now - new Date(user.blockedAt)) / 1000 / 60;
      if (diffMinutes > 60) {
        unblockBotForUser(jid);
        log('INFO', `🤖 Bot reativado automaticamente para ${pushName} após 1h sem interação`);
      }
    }

    // ============================================
    // PASSO 4: Verifica se bot está bloqueado
    // ============================================
    if (isBotBlockedForUser(jid)) {
      log('WARNING', `🚫 Bot bloqueado para ${pushName} - Atendimento manual ativo`);
      return; // Não responde - Roberto está atendendo
    }

    // ============================================
    // PASSO 5: NOVO LEAD? (Interessado no bot)
    // ============================================
    if (isNewLead(cleanedMessage)) {
      log('SUCCESS', `🎯 NOVO LEAD detectado: ${pushName}`);
      
      markAsNewLead(jid, pushName);
      
      await simulateTyping(sock, jid, 2000);
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      await sock.sendMessage(jid, { text: welcomeMsg });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 6: LEAD CONHECIDO? (Continuação)
    // ============================================
    if (isLeadUser(jid)) {
      log('INFO', `🎯 Mensagem de LEAD existente: ${pushName}`);
      
      saveUser(jid, { name: pushName });
      
      await simulateTyping(sock, jid, 3000);
      const aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
      await sock.sendMessage(jid, { text: aiResponse });
      
      if (shouldSendFanpageLink(cleanedMessage)) {
        await simulateTyping(sock, jid, 1500);
        await sock.sendMessage(jid, { text: FANPAGE_MESSAGE });
      }
      
      log('SUCCESS', `✅ Resposta IA enviada para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 7: CLIENTE EXISTENTE COM CONVERSA ATIVA
    // ============================================
    if (isExistingUser(jid) && hasOngoingConversation(jid)) {
      const user = getUser(jid);
      log('INFO', `🔄 Cliente RECORRENTE: ${user.name}`);
      
      if (isGreeting(cleanedMessage)) {
        log('INFO', `👋 Saudação detectada de cliente recorrente: ${user.name}`);
        
        saveUser(jid, { name: pushName });
        
        await simulateTyping(sock, jid, 2000);
        const welcomeMsg = await generateWelcomeMessage(user.name, false);
        await sock.sendMessage(jid, { text: welcomeMsg });
        
        log('SUCCESS', `✅ Boas-vindas enviadas para cliente recorrente: ${user.name}`);
        return;
      }
      
      saveUser(jid, { name: pushName });
      
      await simulateTyping(sock, jid, 2500);
      const aiResponse = await processClientMessage(phone, user.name, cleanedMessage);
      await sock.sendMessage(jid, { text: aiResponse });
      
      log('SUCCESS', `✅ Resposta IA enviada para cliente: ${user.name}`);
      return;
    }

    // ============================================
    // PASSO 8: PRIMEIRO CONTATO ou CONVERSA ANTIGA
    // ============================================
    log('INFO', `🆕 Primeiro contato ou conversa antiga: ${pushName}`);
    
    saveUser(jid, { name: pushName, isNewLead: false });
    
    if (isGreeting(cleanedMessage)) {
      await simulateTyping(sock, jid, 2000);
      const welcomeMsg = await generateWelcomeMessage(pushName, false);
      await sock.sendMessage(jid, { text: welcomeMsg });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para novo cliente: ${pushName}`);
      return;
    }
    
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
 * Processa mensagem - SEMPRE ATIVO 24/7
 */
export async function processMessage(sock, message) {
  try {
    await handleIncomingMessage(sock, message);
  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
  }
}

export default {
  handleIncomingMessage,
  processMessage
};