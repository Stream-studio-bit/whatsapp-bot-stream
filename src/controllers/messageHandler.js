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

/**
 * 🔥 DEBOUNCE MAP - Previne processamento duplicado de bursts (Extra opcional)
 * Armazena timestamp da última mensagem por JID
 */
const lastMessageTime = new Map();
const DEBOUNCE_DELAY = 500; // 500ms

/**
 * 🔥 Limpa entradas antigas do debounce map (executado periodicamente)
 */
function cleanupDebounceMap() {
  const now = Date.now();
  const MAX_AGE = 60000; // 1 minuto
  
  for (const [jid, timestamp] of lastMessageTime.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastMessageTime.delete(jid);
    }
  }
}

// Limpa debounce map a cada 2 minutos
setInterval(cleanupDebounceMap, 120000);

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
 * 🔥 DIRETRIZ 1: Não reinicializa socket
 * 🔥 DIRETRIZ 3: Isolamento de bloqueio (só manipula database)
 * 🔥 DIRETRIZ 6: Confirmações não bloqueantes
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
    
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    log('INFO', `⚙️ Comando detectado: ${cmd} de ${pushName} (${phone}) às ${timestamp}`);
    
    // 🔥 VERIFICAÇÃO DE PERMISSÃO: Apenas o dono pode usar comandos
    if (!isOwner(jid)) {
      log('WARNING', `🚫 Tentativa de comando por usuário NÃO AUTORIZADO: ${pushName} (${phone})`);
      
      // 🔥 DIRETRIZ 6: Envio não bloqueante
      await sock.sendMessage(jid, { 
        text: `❌ Desculpe, apenas o administrador pode usar comandos do sistema.` 
      }).catch(() => {});
      
      return true;
    }
    
    log('SUCCESS', `✅ Comando autorizado de owner: ${pushName}`);
    
    // ============================================
    // Comando: /assumir (Bloqueia bot)
    // 🔥 DIRETRIZ 3: Isolamento de bloqueio
    // ============================================
    if (cmd === 'ASSUME' || cmd === 'ASSUMIR') {
      log('INFO', `🔒 Executando bloqueio para ${jid}...`);
      
      try {
        // 🔥 CORREÇÃO CRÍTICA: APENAS atualiza banco, NUNCA mexe no socket
        // 🔥 DIRETRIZ 3: blockBotForUser só manipula database.js
        await blockBotForUser(jid);
        
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear bot no banco para ${phone}: ${err?.message || err}`);
        
        // 🔥 DIRETRIZ 6: Confirmação não bloqueante
        await sock.sendMessage(jid, { 
          text: `❌ Erro ao bloquear bot. Tente novamente.` 
        }).catch(() => {});
        
        return true;
      }
      
      const user = await getUser(jid);
      const userName = user?.name || pushName;
      
      log('SUCCESS', `🔒 Bot BLOQUEADO para ${userName} (${phone}) - Atendimento manual ativo`);
      
      // 🔥 DIRETRIZ 6: Envio não bloqueante com ephemeralExpiration
      await sock.sendMessage(jid, { 
        text: `✅ *Atendimento assumido!*

🚫 O bot foi pausado para este número.
👤 Você está em atendimento manual com: *${userName}*

⏰ O bloqueio expirará automaticamente após 1 hora sem mensagens.

💡 Para reativar o bot manualmente, envie:
*${process.env.COMMAND_RELEASE || '/liberar'}*` 
      }, { ephemeralExpiration: 0 }).catch(() => {});
      
      // Retorna true para indicar que foi comando e que não se deve prosseguir
      return true;
    }
    
    // ============================================
    // Comando: /liberar (Desbloqueia bot)
    // 🔥 DIRETRIZ 3: Isolamento de bloqueio
    // ============================================
    if (cmd === 'RELEASE' || cmd === 'LIBERAR') {
      log('INFO', `🔓 Verificando status de bloqueio para ${jid}...`);
      
      // 🔥 CORREÇÃO: Verifica se já está desbloqueado
      let isBlocked = false;
      try {
        isBlocked = await isBotBlockedForUser(jid);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao checar bloqueio para ${phone}: ${err?.message || err}`);
      }
      
      log('INFO', `📊 Status atual: ${isBlocked ? '🔒 Bloqueado' : '🔓 Ativo'}`);
      
      if (!isBlocked) {
        log('INFO', `ℹ️ Bot já estava ativo para ${phone}`);
        
        // 🔥 DIRETRIZ 6: Envio não bloqueante
        await sock.sendMessage(jid, { 
          text: `ℹ️ *Bot já está ativo*

🤖 O bot já estava respondendo automaticamente para este número.
Nenhuma ação necessária.` 
        }, { ephemeralExpiration: 0 }).catch(() => {});
        
        return true;
      }
      
      log('INFO', `🔓 Executando desbloqueio para ${jid}...`);
      
      try {
        // 🔥 CORREÇÃO CRÍTICA: APENAS atualiza banco, NUNCA mexe no socket
        // 🔥 DIRETRIZ 3: unblockBotForUser só manipula database.js
        await unblockBotForUser(jid);
        
      } catch (err) {
        log('WARNING', `⚠️ Falha ao liberar bot no banco para ${phone}: ${err?.message || err}`);
        
        // 🔥 DIRETRIZ 6: Confirmação não bloqueante
        await sock.sendMessage(jid, { 
          text: `❌ Erro ao liberar bot. Tente novamente.` 
        }).catch(() => {});
        
        return true;
      }
      
      const user = await getUser(jid);
      const userName = user?.name || pushName;
      
      log('SUCCESS', `🤖 Bot LIBERADO para ${userName} (${phone}) - IA reativada`);
      
      // 🔥 DIRETRIZ 6: Envio não bloqueante com ephemeralExpiration
      await sock.sendMessage(jid, { 
        text: `✅ *Bot liberado!*

🤖 O atendimento automático foi reativado.
👤 Cliente: *${userName}*
📱 Próximas mensagens serão processadas pela IA.

💡 Para assumir novamente, envie:
*${process.env.COMMAND_ASSUME || '/assumir'}*` 
      }, { ephemeralExpiration: 0 }).catch(() => {});
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    // 🔥 DIRETRIZ 7: Logs não bloqueantes
    log('WARNING', `⚠️ Erro ao processar comando: ${error.message}`);
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * 🔥 HANDLER PRINCIPAL DE MENSAGENS - TOTALMENTE REESCRITO
 * Processa todas as mensagens recebidas e decide a ação
 * 🔥 DIRETRIZ 1: Nunca mexe no socket além de enviar mensagens
 * 🔥 DIRETRIZ 4: Verifica bloqueio logo no início
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // ============================================
    // PASSO 1: VALIDAÇÕES RÁPIDAS E FIRA DE LOOP
    // 🔥 DIRETRIZ 2: Evita loops de eventos
    // ============================================
    if (!isValidMessage(message)) {
      return;
    }

    // 🔥 DIRETRIZ 2: PREVENÇÃO DE LOOP - ignora mensagens enviadas pelo próprio bot
    if (message?.key?.fromMe) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', `ℹ️ Ignorando mensagem originada pelo próprio bot (fromMe).`);
      }
      return;
    }

    const jid = message.key.remoteJid;
    const phone = extractPhoneNumber(jid);
    const messageText = extractMessageText(message);

    if (!messageText) {
      return;
    }

    // 🔥 EXTRA OPCIONAL: DEBOUNCE - Previne burst de mensagens
    const now = Date.now();
    const lastTime = lastMessageTime.get(jid) || 0;
    
    if (now - lastTime < DEBOUNCE_DELAY) {
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', `⏱️ Mensagem ignorada (debounce): ${jid}`);
      }
      return;
    }
    
    lastMessageTime.set(jid, now);

    const cleanedMessage = cleanMessage(messageText);
    const pushName = message.pushName || 'Cliente';
    
    // 🔥 DIRETRIZ 7: Log descritivo com timestamp
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const preview = cleanedMessage.substring(0, 50) + (cleanedMessage.length > 50 ? '...' : '');
    log('INFO', `📩 [${timestamp}] ${pushName} (${phone}): "${preview}"`);

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
    // PASSO 3: 🔥 DIRETRIZ 4 - VERIFICA BLOQUEIO ANTES DO PROCESSAMENTO
    // CRÍTICO: Esta verificação DEVE vir ANTES de qualquer processamento
    // ============================================
    let isBlocked = false;
    try {
      isBlocked = await isBotBlockedForUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar bloqueio para ${phone}: ${err?.message || err}`);
      // Em caso de erro ao checar, assumimos não bloqueado para não travar conversas
      isBlocked = false;
    }

    if (isBlocked) {
      log('WARNING', `🚫 Bot bloqueado para ${pushName} (${phone}) - Atendimento manual ativo`);
      return; // 🔥 DIRETRIZ 1: Apenas retorna, não toca no socket
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
      
      // 🔥 DIRETRIZ 6: Envio não bloqueante
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});
      
      // 🔥 CORREÇÃO: Salva boas-vindas no histórico para evitar saudação duplicada
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
        
        log('INFO', `💾 Histórico de boas-vindas salvo para ${pushName}`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico de boas-vindas: ${err?.message || err}`);
      }
      
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
      
      // 🔥 DIRETRIZ 6: Envio não bloqueante
      await sock.sendMessage(jid, { text: aiResponse }).catch(() => {});
      
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
        
        // 🔥 DIRETRIZ 6: Envio não bloqueante
        await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});
        
        log('SUCCESS', `✅ Boas-vindas enviadas para cliente recorrente: ${user.name}`);
        return;
      }
      
      // Mensagem normal de cliente recorrente
      await saveUser(jid, { name: pushName });
      
      // 🔥 CORREÇÃO: simulateTyping otimizado
      await simulateTyping(sock, jid, 1500);
      
      const aiResponse = await processClientMessage(phone, user.name, cleanedMessage);
      
      // 🔥 DIRETRIZ 6: Envio não bloqueante
      await sock.sendMessage(jid, { text: aiResponse }).catch(() => {});
      
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
      
      // 🔥 DIRETRIZ 6: Envio não bloqueante
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});
      
      log('SUCCESS', `✅ Boas-vindas enviadas para novo cliente: ${pushName}`);
      return;
    }
    
    // Mensagem normal de novo cliente
    // 🔥 CORREÇÃO: simulateTyping otimizado
    await simulateTyping(sock, jid, 1500);
    
    const aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
    
    // 🔥 DIRETRIZ 6: Envio não bloqueante
    await sock.sendMessage(jid, { text: aiResponse }).catch(() => {});
    
    log('SUCCESS', `✅ Resposta IA enviada para novo cliente: ${pushName}`);

  } catch (error) {
    // 🔥 DIRETRIZ 7: Logs não bloqueantes
    log('WARNING', `⚠️ Erro ao processar mensagem: ${error.message}`);
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error.stack);
    }
  }
}

/**
 * 🔥 VERSÃO FINAL: Wrapper de processamento
 * NÃO FAZ VALIDAÇÃO DE SOCKET - confia no evento do Baileys
 */
export async function processMessage(sock, message) {
  try {
    await handleIncomingMessage(sock, message);
  } catch (error) {
    // 🔥 DIRETRIZ 7: Silencia erros de conexão, não interrompe fluxo
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ Erro crítico: ${error.message}`);
      if (process.env.DEBUG_MODE === 'true') {
        console.error(error.stack);
      }
    }
  }
}

export default {
  handleIncomingMessage,
  processMessage
};