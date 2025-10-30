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
  
  // 🔥 CORREÇÃO: Validação robusta contra grupos/jids inválidos
  if (!phone) return false;
  
  const ownerPhone = process.env.OWNER_PHONE?.replace(/\D/g, '');
  
  if (!ownerPhone) {
    log('WARNING', '⚠️ OWNER_PHONE não configurado no .env - Comandos desabilitados!');
    return false;
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  
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
    
    // 🔥 CORREÇÃO: Normaliza comando para uppercase
    const cmd = command?.toUpperCase?.() || '';
    
    const pushName = message.pushName || 'Usuário';
    
    log('INFO', `⚙️ Comando detectado: ${cmd} de ${pushName} (${phone})`);
    
    // 🔥 VERIFICAÇÃO DE PERMISSÃO: Apenas o dono pode usar comandos
    if (!isOwner(jid)) {
      log('WARNING', `🚫 Tentativa de comando por usuário NÃO AUTORIZADO: ${pushName} (${phone})`);
      
      await sock.sendMessage(jid, { 
        text: `❌ Desculpe, apenas o administrador pode usar comandos do sistema.` 
      });
      
      return true;
    }
    
    log('SUCCESS', `✅ Comando autorizado de owner: ${pushName}`);
    
    // ============================================
    // Comando: /assumir (Bloqueia bot)
    // ============================================
    if (cmd === 'ASSUME' || cmd === 'ASSUMIR') {
      // 🔥 CORREÇÃO: Adiciona await
      await blockBotForUser(jid);
      
      // 🔥 CORREÇÃO: Adiciona await
      const user = await getUser(jid);
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
    if (cmd === 'RELEASE' || cmd === 'LIBERAR') {
      // 🔥 CORREÇÃO: Adiciona await
      if (!(await isBotBlockedForUser(jid))) {
        log('INFO', `ℹ️ Bot já estava ativo para ${phone}`);
        
        await sock.sendMessage(jid, { 
          text: `ℹ️ *Bot já está ativo*

🤖 O bot já estava respondendo automaticamente para este número.
Nenhuma ação necessária.` 
        });
        
        return true;
      }
      
      // 🔥 CORREÇÃO: Adiciona await
      await unblockBotForUser(jid);
      
      // 🔥 CORREÇÃO: Adiciona await
      const user = await getUser(jid);
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
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * 🔥 HANDLER PRINCIPAL DE MENSAGENS - CORRIGIDO
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
      return;
    }

    // ============================================
    // PASSO 3: Verifica se bot está bloqueado
    // 🔥 CORREÇÃO: Adiciona await
    // ============================================
    if (await isBotBlockedForUser(jid)) {
      log('WARNING', `🚫 Bot bloqueado para ${pushName} (${phone}) - Atendimento manual ativo`);
      return;
    }

    // ============================================
    // PASSO 4: NOVO LEAD? (Interessado no bot)
    // 🔥 CORREÇÃO: Adiciona await
    // ============================================
    if (!(await isLeadUser(jid)) && isNewLead(cleanedMessage)) {
      log('SUCCESS', `🎯 NOVO LEAD detectado: ${pushName} (${phone})`);
      
      // 🔥 CORREÇÃO: Adiciona await
      await markAsNewLead(jid, pushName);
      
      await simulateTyping(sock, jid, 2000);
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      await sock.sendMessage(jid, { text: welcomeMsg });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 5: LEAD CONHECIDO? (Continuação)
    // 🔥 CORREÇÃO: Adiciona await
    // ============================================
    if (await isLeadUser(jid)) {
      log('INFO', `🎯 Mensagem de LEAD existente: ${pushName} (${phone})`);
      
      // 🔥 CORREÇÃO: Adiciona await
      await saveUser(jid, { name: pushName });
      
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
    // 🔥 CORREÇÃO: Adiciona await
    // ============================================
    if (await isExistingUser(jid) && await hasOngoingConversation(jid)) {
      // 🔥 CORREÇÃO: Adiciona await
      const user = await getUser(jid);
      log('INFO', `🔄 Cliente RECORRENTE: ${user.name} (${phone})`);
      
      if (isGreeting(cleanedMessage)) {
        log('INFO', `👋 Saudação detectada de cliente recorrente: ${user.name}`);
        
        // 🔥 CORREÇÃO: Adiciona await
        await saveUser(jid, { name: pushName });
        
        await simulateTyping(sock, jid, 2000);
        const welcomeMsg = await generateWelcomeMessage(user.name, false);
        await sock.sendMessage(jid, { text: welcomeMsg });
        
        log('SUCCESS', `✅ Boas-vindas enviadas para cliente recorrente: ${user.name}`);
        return;
      }
      
      // Mensagem normal de cliente recorrente
      // 🔥 CORREÇÃO: Adiciona await
      await saveUser(jid, { name: pushName });
      
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
    
    // 🔥 CORREÇÃO: Adiciona await
    await saveUser(jid, { name: pushName, isNewLead: false });
    
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
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }
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