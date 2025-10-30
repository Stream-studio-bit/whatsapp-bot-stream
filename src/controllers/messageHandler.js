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
 * 🔥 TOTALMENTE REESCRITA: Processa comandos do sistema (/assumir e /liberar)
 * ⚠️ CRÍTICO: Esta função NUNCA deve tocar no socket além de enviar mensagens
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
      
      // 🔥 CORREÇÃO: Envia mensagem de forma segura (sem await desnecessário)
      await sock.sendMessage(jid, { 
        text: `❌ Desculpe, apenas o administrador pode usar comandos do sistema.` 
      }).catch(err => {
        log('ERROR', `❌ Erro ao enviar mensagem de não autorizado: ${err.message}`);
      });
      
      return true;
    }
    
    log('SUCCESS', `✅ Comando autorizado de owner: ${pushName}`);
    
    // ============================================
    // Comando: /assumir (Bloqueia bot)
    // ============================================
    if (cmd === 'ASSUME' || cmd === 'ASSUMIR') {
      // 🔥 CORREÇÃO CRÍTICA: APENAS atualiza banco, NUNCA mexe no socket
      const blockResult = await blockBotForUser(jid);
      
      if (!blockResult) {
        log('ERROR', `❌ Falha ao bloquear bot para ${phone}`);
        await sock.sendMessage(jid, { 
          text: `❌ Erro ao bloquear bot. Tente novamente.` 
        }).catch(() => {});
        return true;
      }
      
      const user = await getUser(jid);
      const userName = user?.name || pushName;
      
      log('SUCCESS', `🔒 Bot BLOQUEADO para ${userName} (${phone}) - Atendimento manual ativo`);
      
      // 🔥 CORREÇÃO: Envia confirmação de forma segura
      await sock.sendMessage(jid, { 
        text: `✅ *Atendimento assumido!*

🚫 O bot foi pausado para este número.
👤 Você está em atendimento manual com: *${userName}*

⏰ O bloqueio expirará automaticamente após 1 hora sem mensagens.

💡 Para reativar o bot manualmente, envie:
*${process.env.COMMAND_RELEASE || '/liberar'}*` 
      }).catch(err => {
        log('ERROR', `❌ Erro ao enviar confirmação de bloqueio: ${err.message}`);
      });
      
      return true;
    }
    
    // ============================================
    // Comando: /liberar (Desbloqueia bot)
    // ============================================
    if (cmd === 'RELEASE' || cmd === 'LIBERAR') {
      // 🔥 CORREÇÃO: Verifica se já está desbloqueado
      const isBlocked = await isBotBlockedForUser(jid);
      
      if (!isBlocked) {
        log('INFO', `ℹ️ Bot já estava ativo para ${phone}`);
        
        await sock.sendMessage(jid, { 
          text: `ℹ️ *Bot já está ativo*

🤖 O bot já estava respondendo automaticamente para este número.
Nenhuma ação necessária.` 
        }).catch(() => {});
        
        return true;
      }
      
      // 🔥 CORREÇÃO CRÍTICA: APENAS atualiza banco, NUNCA mexe no socket
      const unblockResult = await unblockBotForUser(jid);
      
      if (!unblockResult) {
        log('ERROR', `❌ Falha ao liberar bot para ${phone}`);
        await sock.sendMessage(jid, { 
          text: `❌ Erro ao liberar bot. Tente novamente.` 
        }).catch(() => {});
        return true;
      }
      
      const user = await getUser(jid);
      const userName = user?.name || pushName;
      
      log('SUCCESS', `🤖 Bot LIBERADO para ${userName} (${phone}) - IA reativada`);
      
      // 🔥 CORREÇÃO: Envia confirmação de forma segura
      await sock.sendMessage(jid, { 
        text: `✅ *Bot liberado!*

🤖 O atendimento automático foi reativado.
👤 Cliente: *${userName}*
📱 Próximas mensagens serão processadas pela IA.

💡 Para assumir novamente, envie:
*${process.env.COMMAND_ASSUME || '/assumir'}*` 
      }).catch(err => {
        log('ERROR', `❌ Erro ao enviar confirmação de liberação: ${err.message}`);
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
 * 🔥 HANDLER PRINCIPAL DE MENSAGENS - TOTALMENTE REESCRITO
 * Processa todas as mensagens recebidas e decide a ação
 * ⚠️ CRÍTICO: Nunca mexe no socket além de enviar mensagens
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
    // 🔥 CORREÇÃO: Comandos são processados de forma isolada
    // ============================================
    const isCommandProcessed = await handleCommand(sock, message);
    if (isCommandProcessed) {
      log('INFO', `⚙️ Comando processado com sucesso para ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 3: Verifica se bot está bloqueado
    // 🔥 CORREÇÃO: Apenas consulta banco, não mexe no socket
    // ============================================
    const isBlocked = await isBotBlockedForUser(jid);
    if (isBlocked) {
      log('WARNING', `🚫 Bot bloqueado para ${pushName} (${phone}) - Atendimento manual ativo`);
      return; // 🔥 Apenas retorna, não toca no socket
    }

    // ============================================
    // PASSO 4: NOVO LEAD? (Interessado no bot)
    // ============================================
    const isLead = await isLeadUser(jid);
    
    if (!isLead && isNewLead(cleanedMessage)) {
      log('SUCCESS', `🎯 NOVO LEAD detectado: ${pushName} (${phone})`);
      
      await markAsNewLead(jid, pushName);
      
      // 🔥 CORREÇÃO: simulateTyping otimizado (máx 1500ms)
      await simulateTyping(sock, jid, 1500);
      
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(err => {
        log('ERROR', `❌ Erro ao enviar boas-vindas para LEAD: ${err.message}`);
      });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 5: LEAD CONHECIDO? (Continuação)
    // ============================================
    if (isLead) {
      log('INFO', `🎯 Mensagem de LEAD existente: ${pushName} (${phone})`);
      
      await saveUser(jid, { name: pushName });
      
      // 🔥 CORREÇÃO: simulateTyping otimizado (máx 1500ms)
      await simulateTyping(sock, jid, 1500);
      
      const aiResponse = await processLeadMessage(phone, pushName, cleanedMessage);
      
      await sock.sendMessage(jid, { text: aiResponse }).catch(err => {
        log('ERROR', `❌ Erro ao enviar resposta IA para LEAD: ${err.message}`);
      });
      
      // Verifica se deve enviar link da fanpage
      if (shouldSendFanpageLink(cleanedMessage)) {
        await simulateTyping(sock, jid, 1000);
        await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch(() => {});
        log('INFO', `📱 Link da fanpage enviado para ${pushName}`);
      }
      
      log('SUCCESS', `✅ Resposta IA enviada para LEAD: ${pushName}`);
      return;
    }

    // ============================================
    // PASSO 6: CLIENTE EXISTENTE COM CONVERSA ATIVA
    // ============================================
    const isExisting = await isExistingUser(jid);
    const hasConversation = await hasOngoingConversation(jid);
    
    if (isExisting && hasConversation) {
      const user = await getUser(jid);
      log('INFO', `🔄 Cliente RECORRENTE: ${user.name} (${phone})`);
      
      if (isGreeting(cleanedMessage)) {
        log('INFO', `👋 Saudação detectada de cliente recorrente: ${user.name}`);
        
        await saveUser(jid, { name: pushName });
        
        // 🔥 CORREÇÃO: simulateTyping otimizado
        await simulateTyping(sock, jid, 1500);
        
        const welcomeMsg = await generateWelcomeMessage(user.name, false);
        
        await sock.sendMessage(jid, { text: welcomeMsg }).catch(err => {
          log('ERROR', `❌ Erro ao enviar boas-vindas: ${err.message}`);
        });
        
        log('SUCCESS', `✅ Boas-vindas enviadas para cliente recorrente: ${user.name}`);
        return;
      }
      
      // Mensagem normal de cliente recorrente
      await saveUser(jid, { name: pushName });
      
      // 🔥 CORREÇÃO: simulateTyping otimizado
      await simulateTyping(sock, jid, 1500);
      
      const aiResponse = await processClientMessage(phone, user.name, cleanedMessage);
      
      await sock.sendMessage(jid, { text: aiResponse }).catch(err => {
        log('ERROR', `❌ Erro ao enviar resposta IA: ${err.message}`);
      });
      
      log('SUCCESS', `✅ Resposta IA enviada para cliente: ${user.name}`);
      return;
    }

    // ============================================
    // PASSO 7: PRIMEIRO CONTATO ou CONVERSA ANTIGA
    // ============================================
    log('INFO', `🆕 Primeiro contato ou conversa antiga: ${pushName} (${phone})`);
    
    await saveUser(jid, { name: pushName, isNewLead: false });
    
    // Se for uma saudação, envia boas-vindas
    if (isGreeting(cleanedMessage)) {
      // 🔥 CORREÇÃO: simulateTyping otimizado
      await simulateTyping(sock, jid, 1500);
      
      const welcomeMsg = await generateWelcomeMessage(pushName, false);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(err => {
        log('ERROR', `❌ Erro ao enviar boas-vindas: ${err.message}`);
      });
      
      log('SUCCESS', `✅ Boas-vindas enviadas para novo cliente: ${pushName}`);
      return;
    }
    
    // Mensagem normal de novo cliente
    // 🔥 CORREÇÃO: simulateTyping otimizado
    await simulateTyping(sock, jid, 1500);
    
    const aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
    
    await sock.sendMessage(jid, { text: aiResponse }).catch(err => {
      log('ERROR', `❌ Erro ao enviar resposta IA: ${err.message}`);
    });
    
    log('SUCCESS', `✅ Resposta IA enviada para novo cliente: ${pushName}`);

  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }
  }
}

/**
 * 🔥 CORREÇÃO: Wrapper seguro para processamento de mensagens
 * Processa mensagem - SEMPRE ATIVO 24/7
 */
export async function processMessage(sock, message) {
  try {
    // 🔥 CORREÇÃO: Verifica se socket está válido antes de processar
    if (!sock?.ws || sock.ws.readyState !== 1) {
      log('WARNING', '⚠️ Socket inválido - mensagem ignorada');
      return;
    }
    
    await handleIncomingMessage(sock, message);
    
  } catch (error) {
    // 🔥 CORREÇÃO: Não loga erros de conexão (muito verboso)
    if (!error.message.includes('Connection')) {
      log('ERROR', `❌ Erro ao processar mensagem: ${error.message}`);
    }
  }
}

export default {
  handleIncomingMessage,
  processMessage
};