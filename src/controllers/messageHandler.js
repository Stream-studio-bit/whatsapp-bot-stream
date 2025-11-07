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
 * 🔥 HANDLER PRINCIPAL - VERSÃO CORRIGIDA
 */
export async function handleIncomingMessage(sock, message) {
  try {
    // 🔥 VALIDAÇÃO 1: Mensagem válida
    if (!isValidMessage(message)) return;
    
    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) return;

    // 🔥 CORREÇÃO 1: BLOQUEIO AUTOMÁTICO - Owner digitou manualmente
    // fromMe=true = mensagem ENVIADA pelo owner (não recebida)
    if (message?.key?.fromMe) {
      const clientPhone = extractPhoneNumber(jid);
      
      log('INFO', `👤 Owner digitou mensagem manual para ${clientPhone}`);
      
      try {
        await blockBotForUser(jid);
        log('SUCCESS', `🔒 IA BLOQUEADA para ${clientPhone} - Owner assumiu atendimento`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao bloquear IA: ${err.message}`);
      }
      
      return; // Para processamento (owner já respondeu)
    }

    // 🔥 CORREÇÃO 2: VERIFICAR BLOQUEIO ANTES DE TUDO
    // Se IA está bloqueada, ignora QUALQUER mensagem do cliente
    let isBlocked = false;
    try {
      isBlocked = await isBotBlockedForUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar bloqueio: ${err.message}`);
      isBlocked = false;
    }

    if (isBlocked) {
      const clientPhone = extractPhoneNumber(jid);
      log('WARNING', `🚫 MENSAGEM IGNORADA - Bot bloqueado para ${clientPhone}`);
      return; // 🔥 PARA AQUI - NÃO PROCESSA NADA
    }

    // Debounce (só processa se passou tempo mínimo)
    const now = Date.now();
    const lastTime = lastMessageTime.get(jid) || 0;
    if (now - lastTime < DEBOUNCE_DELAY) return;
    lastMessageTime.set(jid, now);

    const cleanedMessage = cleanMessage(messageText);
    const pushName = message.pushName || 'Cliente';
    const phone = extractPhoneNumber(jid);
    
    log('INFO', `📩 ${pushName} (${phone}): "${cleanedMessage.substring(0, 50)}"`);

    // 🔥 PASSO 1: Verifica se é primeira interação no BANCO DE DADOS
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    
    // 🔥 CORREÇÃO 3: PRIMEIRA MENSAGEM = SEMPRE TRATADO COMO LEAD
    // Regra: TODO cliente novo recebe mensagem de Lead, independente da palavra
    if (isFirstContact) {
      // Detecta se mensagem tem keywords de interesse no bot
      const hasLeadKeywords = isNewLead(cleanedMessage);
      
      // Salva no banco
      await saveUser(jid, { 
        name: pushName,
        isNewLead: true // 🔥 SEMPRE TRUE na primeira vez
      });
      
      // Marca como lead se tiver keywords
      if (hasLeadKeywords) {
        await markAsNewLead(jid, pushName);
        log('SUCCESS', `🎯 NOVO LEAD (com keywords): ${pushName}`);
      } else {
        log('SUCCESS', `👤 NOVO CONTATO (sem keywords): ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      // 🔥 CORREÇÃO: SEMPRE passa TRUE para primeira mensagem = mensagem de Lead
      const welcomeMsg = await generateWelcomeMessage(pushName, true);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});
      
      // Registra no histórico da IA
      try {
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', welcomeMsg);
        log('SUCCESS', `📝 Histórico de boas-vindas registrado`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico da IA: ${err.message}`);
      }
      
      // Salva também no banco de dados
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

    // 🔥 MENSAGENS SEGUINTES = SEM BOAS-VINDAS
    log('INFO', `📨 Mensagem de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    // Verifica se é lead (usuário pode ter sido marcado como lead antes)
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