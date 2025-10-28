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
 * 🔥 MELHORADA: Verifica se o número é do dono (Roberto)
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
  
  // 🔥 CORREÇÃO: Normaliza ambos os números para comparação
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Verifica se é exatamente igual OU se termina com o número (compatibilidade com prefixos)
  const isOwnerUser = cleanPhone === ownerPhone || cleanPhone.endsWith(ownerPhone);
  
  if (process.env.DEBUG_MODE === 'true') {
    log('INFO', `🔍 Verificação de owner:`);
    log('INFO', `   Telefone recebido: ${phone} (limpo: ${cleanPhone})`);
    log('INFO', `   Owner configurado: ${ownerPhone}`);
    log('INFO', `   É owner? ${isOwnerUser ? '✅ SIM' : '❌ NÃO'}`);
  }
  
  return isOwnerUser;
}

/**
 * 🔥 MELHORADA: Processa comandos do sistema (/assumir e /liberar)
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
    
    log('INFO', `⚙️ Comando detectado: ${command} de ${pushName} (${phone})`);
    
    // 🔥 VERIFICAÇÃO DE PERMISSÃO: Apenas o dono pode usar comandos
    if (!isOwner(jid)) {
      log('WARNING', `🚫 Tentativa de comando por usuário NÃO AUTORIZADO: ${pushName} (${phone})`);
      
      await sock.sendMessage(jid, { 
        text: `❌ Desculpe, apenas o administrador pode usar comandos do sistema.` 
      });
      
      return true; // Retorna true para não processar como mensagem normal
    }
    
    log('SUCCESS', `✅ Comando autorizado de owner: ${pushName}`);
    
    // ============================================
    // Comando: /assumir (Bloqueia bot)
    // ============================================
    if (command === 'ASSUME') {
      blockBotForUser(jid);
      
      const user = getUser(jid);
      const userName = user?.name || pushName;
      
      log('SUCCESS', `🔒 Bot BLOQUEADO para ${userName} (${phone}) - Atendimento manual ativo`);
      
      await sock.sendMessage(jid, { 
        text: `✅ *Atendimento assumido!*

🚫 O bot foi pausado para este número.
👤 Você está em atendimento manual com: *${userName}*

⏰ O bloqueio expirará automaticamente após 1 hora sem mensagens.

💡 Para reativar o bot manualmente, envie:
*${process.env.COMMAND_RELEASE || '/liberar'}*` 
      });
      
      return true;
    }
    
    // ============================================
    // Comando: /liberar (Desbloqueia bot)
    // ============================================
    if (command === 'RELEASE') {
      // Verifica se já estava desbloqueado
      if (!isBotBlockedForUser(jid)) {
        log('INFO', `ℹ️ Bot já estava ativo para ${phone}`);
        
        await sock.sendMessage(jid, { 
          text: `ℹ️ *Bot já está ativo*

🤖 O bot já estava respondendo automaticamente para este número.
Nenhuma ação necessária.` 
        });
        
        return true;
      }
      
      unblockBotForUser(jid);
      
      const user = getUser(jid);
      const userName = user?.name || pushName;
      
      log('SUCCESS', `🤖 Bot LIBERADO para ${userName} (${phone}) - IA reativada`);
      
      await sock.sendMessage(jid, { 
        text: `✅ *Bot liberado!*

🤖 O atendimento automático foi reativado.
👤 Cliente: *${userName}*
📱 Próximas mensagens serão processadas pela IA.

💡 Para assumir novamente, envie:
*${process.env.COMMAND_ASSUME || '/assumir'}*` 
      });
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao processar comando: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * 🔥 HANDLER PRINCIPAL DE MENSAGENS
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
    
    log('INFO', `📩 Mensagem recebida de ${pushName} (${phone}): "${cleanedMessage.substring(0, 50)}${cleanedMessage.length > 50 ? '...' : ''}"`);

    // ============================================
    // PASSO 2: PROCESSA COMANDOS PRIMEIRO (PRIORIDADE MÁXIMA)
    // ============================================
    const isCommandProcessed = await handleCommand(sock, message);
    if (isCommandProcessed) {
      log('INFO', `⚙️ Comando processado com sucesso para ${pushName}`);
      return; // Comando executado, não continua processamento
    }

    // ============================================
    // PASSO 3: Verifica se bot está bloqueado
    // 🔥 CORREÇÃO: A verificação de expiração agora está dentro de isBotBlockedForUser()
    // ============================================
    if (isBotBlockedForUser(jid)) {
      log('WARNING', `🚫 Bot bloqueado para ${pushName} (${phone}) - Atendimento manual ativo`);
      return; // Não responde - Roberto está atendendo
    }

    // ============================================
    // PASSO 4: NOVO LEAD? (Interessado no bot)
    // ============================================
    if (isNewLead(cleanedMessage)) {
      log('SUCCESS', `🎯 NOVO LEAD detectado: ${pushName} (${phone})`);
      
      markAsNewLead(jid, pushName);
      
      await simulateTyping(sock, jid, 2000);
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      await sock.sendMessage(jid, { text: welcomeMsg });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 5: LEAD CONHECIDO? (Continuação)
    // ============================================
    if (isLeadUser(jid)) {
      log('INFO', `🎯 Mensagem de LEAD existente: ${pushName} (${phone})`);
      
      saveUser(jid, { name: pushName });
      
      await simulateTyping(sock, jid, 3000);
      const aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
      await sock.sendMessage(jid, { text: aiResponse });
      
      // Verifica se deve enviar link da fanpage
      if (shouldSendFanpageLink(cleanedMessage)) {
        await simulateTyping(sock, jid, 1500);
        await sock.sendMessage(jid, { text: FANPAGE_MESSAGE });
        log('INFO', `📱 Link da fanpage enviado para ${pushName}`);
      }
      
      log('SUCCESS', `✅ Resposta IA enviada para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 6: CLIENTE EXISTENTE COM CONVERSA ATIVA
    // ============================================
    if (isExistingUser(jid) && hasOngoingConversation(jid)) {
      const user = getUser(jid);
      log('INFO', `🔄 Cliente RECORRENTE: ${user.name} (${phone})`);
      
      // Se for uma saudação, envia boas-vindas
      if (isGreeting(cleanedMessage)) {
        log('INFO', `👋 Saudação detectada de cliente recorrente: ${user.name}`);
        
        saveUser(jid, { name: pushName });
        
        await simulateTyping(sock, jid, 2000);
        const welcomeMsg = await generateWelcomeMessage(user.name, false);
        await sock.sendMessage(jid, { text: welcomeMsg });
        
        log('SUCCESS', `✅ Boas-vindas enviadas para cliente recorrente: ${user.name}`);
        return;
      }
      
      // Mensagem normal de cliente recorrente
      saveUser(jid, { name: pushName });
      
      await simulateTyping(sock, jid, 2500);
      const aiResponse = await processClientMessage(phone, user.name, cleanedMessage);
      await sock.sendMessage(jid, { text: aiResponse });
      
      log('SUCCESS', `✅ Resposta IA enviada para cliente: ${user.name}`);
      return;
    }

    // ============================================
    // PASSO 7: PRIMEIRO CONTATO ou CONVERSA ANTIGA
    // ============================================
    log('INFO', `🆕 Primeiro contato ou conversa antiga: ${pushName} (${phone})`);
    
    saveUser(jid, { name: pushName, isNewLead: false });
    
    // Se for uma saudação, envia boas-vindas
    if (isGreeting(cleanedMessage)) {
      await simulateTyping(sock, jid, 2000);
      const welcomeMsg = await generateWelcomeMessage(pushName, false);
      await sock.sendMessage(jid, { text: welcomeMsg });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para novo cliente: ${pushName}`);
      return;
    }
    
    // Mensagem normal de novo cliente
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