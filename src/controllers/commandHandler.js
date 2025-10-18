import { 
  parseCommand, 
  extractPhoneNumber, 
  log,
  extractMessageText,
  cleanMessage
} from '../utils/helpers.js';

import {
  blockBotForUser,
  unblockBotForUser,
  isBotBlockedForUser,
  getUser,
  getStats,
  printStats,
  getAllUsers,
  getBlockedUsers
} from '../services/database.js';

import dotenv from 'dotenv';

dotenv.config();

/**
 * Número do Roberto (quem pode usar comandos)
 */
const OWNER_NUMBER = process.env.OWNER_PHONE.replace(/\D/g, '');

/**
 * Verifica se a mensagem vem do Roberto
 * @param {Object} message - Mensagem do WhatsApp
 * @returns {boolean}
 */
function isFromOwner(message) {
  const senderJid = message.key.remoteJid;
  const senderPhone = extractPhoneNumber(senderJid);
  
  return senderPhone === OWNER_NUMBER;
}

/**
 * Handler de comandos administrativos
 * Processa comandos enviados pelo Roberto
 */
export async function handleCommand(sock, message) {
  try {
    // Só processa se for do Roberto
    if (!isFromOwner(message)) {
      return false; // Não é comando
    }

    const messageText = extractMessageText(message);
    if (!messageText) {
      return false;
    }

    const cleanedMessage = cleanMessage(messageText);
    const { isCommand, command } = parseCommand(cleanedMessage);

    if (!isCommand) {
      return false; // Não é um comando válido
    }

    const jid = message.key.remoteJid;

    // ============================================
    // COMANDO: /assumir (Bloqueia bot - atendimento manual)
    // ============================================
    if (command === 'ASSUME') {
      blockBotForUser(jid);
      
      const user = getUser(jid);
      const userName = user?.name || 'Cliente';
      
      const confirmMsg = `✅ *Atendimento Manual Ativado*

🚫 O bot foi *bloqueado* para este cliente
👤 Cliente: ${userName}
🤖 Bot não responderá mais automaticamente

Para liberar o bot novamente, digite: *${process.env.COMMAND_RELEASE}*`;

      await sock.sendMessage(jid, { text: confirmMsg });
      
      log('SUCCESS', `✅ Roberto assumiu atendimento de: ${userName}`);
      return true;
    }

    // ============================================
    // COMANDO: /liberar (Desbloqueia bot - volta automático)
    // ============================================
    if (command === 'RELEASE') {
      if (!isBotBlockedForUser(jid)) {
        const alreadyActiveMsg = `ℹ️ *Bot já está ativo*

O bot já está respondendo automaticamente para este cliente.`;
        
        await sock.sendMessage(jid, { text: alreadyActiveMsg });
        return true;
      }
      
      unblockBotForUser(jid);
      
      const user = getUser(jid);
      const userName = user?.name || 'Cliente';
      
      const confirmMsg = `✅ *Bot Liberado*

🤖 O bot voltou a responder *automaticamente*
👤 Cliente: ${userName}
📱 Próximas mensagens serão processadas pela IA

Para assumir novamente, digite: *${process.env.COMMAND_ASSUME}*`;

      await sock.sendMessage(jid, { text: confirmMsg });
      
      log('SUCCESS', `✅ Bot liberado para: ${userName}`);
      return true;
    }

    return false;

  } catch (error) {
    log('ERROR', `❌ Erro ao processar comando: ${error.message}`);
    return false;
  }
}

/**
 * Handler especial quando Roberto envia QUALQUER mensagem
 * Automaticamente assume o atendimento
 */
export async function handleOwnerMessage(sock, message) {
  try {
    // Verifica se é do Roberto
    if (!isFromOwner(message)) {
      return false;
    }

    const jid = message.key.remoteJid;
    const messageText = extractMessageText(message);
    
    if (!messageText) {
      return false;
    }

    // Verifica se é um comando (comandos não bloqueiam automaticamente)
    const { isCommand } = parseCommand(cleanMessage(messageText));
    if (isCommand) {
      return false; // Comandos são processados separadamente
    }

    // Se o bot já está bloqueado, não faz nada
    if (isBotBlockedForUser(jid)) {
      return false;
    }

    // ============================================
    // AUTO-BLOQUEIO: Roberto enviou mensagem = assume atendimento
    // ============================================
    blockBotForUser(jid);
    
    const user = getUser(jid);
    const userName = user?.name || 'Cliente';
    
    log('WARNING', `🚫 AUTO-BLOQUEIO: Roberto iniciou atendimento manual com ${userName}`);
    
    return true;

  } catch (error) {
    log('ERROR', `❌ Erro ao processar mensagem do Roberto: ${error.message}`);
    return false;
  }
}

/**
 * Comandos administrativos extras (via console ou mensagens)
 */

/**
 * Mostra estatísticas do bot
 */
export function showStats() {
  printStats();
}

/**
 * Lista todos os usuários bloqueados (em atendimento manual)
 */
export function listBlockedUsers() {
  const blocked = getBlockedUsers();
  
  if (blocked.length === 0) {
    console.log('\n✅ Nenhum usuário em atendimento manual no momento.\n');
    return;
  }
  
  console.log('\n🚫 ═══════════════════════════════════════════');
  console.log('🚫 USUÁRIOS EM ATENDIMENTO MANUAL');
  console.log('🚫 ═══════════════════════════════════════════');
  
  blocked.forEach((user, index) => {
    const blockedTime = new Date(user.blockedAt).toLocaleString('pt-BR');
    console.log(`${index + 1}. ${user.phone} - Bloqueado em: ${blockedTime}`);
  });
  
  console.log('🚫 ═══════════════════════════════════════════\n');
}

/**
 * Lista todos os usuários cadastrados
 */
export function listAllUsers() {
  const users = getAllUsers();
  
  if (users.length === 0) {
    console.log('\n❌ Nenhum usuário cadastrado ainda.\n');
    return;
  }
  
  console.log('\n👥 ═══════════════════════════════════════════');
  console.log('👥 TODOS OS USUÁRIOS');
  console.log('👥 ═══════════════════════════════════════════');
  
  users.forEach((user, index) => {
    const type = user.isNewLead ? '🎯 LEAD' : '🔄 CLIENTE';
    const lastMsg = new Date(user.lastInteraction).toLocaleString('pt-BR');
    console.log(`${index + 1}. ${type} - ${user.name} (${user.phone})`);
    console.log(`   Última mensagem: ${lastMsg}`);
    console.log(`   Total de mensagens: ${user.messageCount}`);
    console.log('');
  });
  
  console.log('👥 ═══════════════════════════════════════════\n');
}

export default {
  handleCommand,
  handleOwnerMessage,
  showStats,
  listBlockedUsers,
  listAllUsers
};