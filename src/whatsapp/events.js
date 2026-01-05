/**
 * events.js
 * Gerencia todos os eventos do WhatsApp
 * - Nova mensagem
 * - Conexão / Reconexão
 * - QR Code
 * - Erros
 * - Status de conexão
 */

const { DisconnectReason } = require('@whiskeysockets/baileys');
const logger = require('../utils/logger');
const messageController = require('../controllers/messageController');

/**
 * Registra todos os eventos do socket WhatsApp
 * @param {Object} sock - Socket do Baileys
 * @param {Function} onDisconnect - Callback para desconexão
 */
function registerEvents(sock, onDisconnect) {
  logger.info('Registrando eventos do WhatsApp...');

  // Evento: Atualização de conexão
  sock.ev.on('connection.update', async (update) => {
    handleConnectionUpdate(update, onDisconnect);
  });

  // Evento: Nova mensagem recebida
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
  });

  // Evento: Atualização de presença (online/offline/digitando)
  sock.ev.on('presence.update', (presence) => {
    handlePresenceUpdate(presence);
  });

  // Evento: Atualização de grupos
  sock.ev.on('groups.update', (groups) => {
    handleGroupsUpdate(groups);
  });

  // Evento: Participantes de grupo adicionados/removidos
  sock.ev.on('group-participants.update', (event) => {
    handleGroupParticipantsUpdate(event);
  });

  // Evento: Bloqueio/desbloqueio de contatos
  sock.ev.on('blocklist.update', (blocklist) => {
    handleBlocklistUpdate(blocklist);
  });

  logger.info('✅ Eventos registrados com sucesso');
}

/**
 * Gerencia atualizações de conexão
 * @param {Object} update - Dados da atualização
 * @param {Function} onDisconnect - Callback de desconexão
 */
function handleConnectionUpdate(update, onDisconnect) {
  const { connection, lastDisconnect, qr } = update;

  // QR Code gerado (para primeira conexão)
  if (qr) {
    logger.info('📱 QR Code gerado. Escaneie com seu WhatsApp.');
    console.log('\n🔳 QR CODE DISPONÍVEL NO TERMINAL\n');
  }

  // Status de conexão alterado
  if (connection) {
    logger.info(`Status de conexão: ${connection}`);

    switch (connection) {
      case 'open':
        logger.info('✅ Conexão estabelecida com sucesso!');
        break;

      case 'close':
        logger.warn('⚠️ Conexão fechada');
        handleDisconnection(lastDisconnect, onDisconnect);
        break;

      case 'connecting':
        logger.info('🔄 Conectando ao WhatsApp...');
        break;

      default:
        logger.debug(`Status desconhecido: ${connection}`);
    }
  }
}

/**
 * Processa desconexão e determina ação
 * @param {Object} lastDisconnect - Informações da última desconexão
 * @param {Function} onDisconnect - Callback de desconexão
 */
function handleDisconnection(lastDisconnect, onDisconnect) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;
  const reason = lastDisconnect?.error?.output?.payload?.error || 'Desconhecido';

  logger.warn(`Motivo da desconexão: ${reason} (Código: ${statusCode})`);

  // Identifica o motivo específico
  let disconnectReason = DisconnectReason.connectionClosed;

  if (statusCode === 401) {
    disconnectReason = DisconnectReason.loggedOut;
  } else if (statusCode === 403) {
    disconnectReason = DisconnectReason.badSession;
  } else if (statusCode === 408) {
    disconnectReason = DisconnectReason.timedOut;
  } else if (statusCode === 440) {
    disconnectReason = DisconnectReason.connectionLost;
  } else if (statusCode === 515) {
    disconnectReason = DisconnectReason.restartRequired;
  }

  // Chama callback de desconexão
  onDisconnect(disconnectReason);
}

/**
 * Processa novas mensagens recebidas
 * @param {Object} sock - Socket do WhatsApp
 * @param {Object} messageUpdate - Dados da mensagem
 */
async function handleNewMessage(sock, messageUpdate) {
  try {
    const { messages, type } = messageUpdate;

    // Apenas processa mensagens novas (não notificações)
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignora mensagens sem key (inválidas)
      if (!msg.key) continue;

      // Ignora mensagens de status/transmissão
      if (msg.key.remoteJid === 'status@broadcast') continue;

      // Ignora mensagens enviadas pelo próprio bot
      if (msg.key.fromMe) continue;

      // Log da mensagem recebida
      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const sender = isGroup ? msg.key.participant : from;

      logger.info(`📩 Nova mensagem de ${sender} ${isGroup ? `no grupo ${from}` : ''}`);

      // Envia para o controller processar
      await messageController.processMessage(sock, msg);
    }
  } catch (error) {
    logger.error('Erro ao processar nova mensagem:', error);
  }
}

/**
 * Gerencia atualizações de presença
 * @param {Object} presence - Dados de presença
 */
function handlePresenceUpdate(presence) {
  const { id, presences } = presence;
  
  // Log apenas em modo debug para não poluir
  if (process.env.LOG_LEVEL === 'debug') {
    Object.keys(presences).forEach((jid) => {
      const status = presences[jid].lastKnownPresence;
      logger.debug(`Presença ${jid}: ${status}`);
    });
  }
}

/**
 * Gerencia atualizações de grupos
 * @param {Array} groups - Lista de grupos atualizados
 */
function handleGroupsUpdate(groups) {
  groups.forEach((group) => {
    logger.debug(`Grupo atualizado: ${group.id} - ${group.subject || 'Sem nome'}`);
  });
}

/**
 * Gerencia atualizações de participantes em grupos
 * @param {Object} event - Evento de participantes
 */
function handleGroupParticipantsUpdate(event) {
  const { id, participants, action } = event;

  participants.forEach((participant) => {
    switch (action) {
      case 'add':
        logger.info(`➕ Participante adicionado ao grupo ${id}: ${participant}`);
        break;
      case 'remove':
        logger.info(`➖ Participante removido do grupo ${id}: ${participant}`);
        break;
      case 'promote':
        logger.info(`⬆️ Participante promovido a admin no grupo ${id}: ${participant}`);
        break;
      case 'demote':
        logger.info(`⬇️ Participante removido de admin no grupo ${id}: ${participant}`);
        break;
      default:
        logger.debug(`Ação desconhecida em grupo ${id}: ${action}`);
    }
  });
}

/**
 * Gerencia atualizações de lista de bloqueio
 * @param {Object} blocklist - Lista de bloqueados
 */
function handleBlocklistUpdate(blocklist) {
  const { blocklist: list } = blocklist;
  
  if (list && list.length > 0) {
    logger.info(`🚫 Lista de bloqueio atualizada: ${list.length} contatos`);
  }
}

/**
 * Envia confirmação de leitura para uma mensagem
 * @param {Object} sock - Socket do WhatsApp
 * @param {Object} messageKey - Chave da mensagem
 */
async function sendReadReceipt(sock, messageKey) {
  try {
    await sock.readMessages([messageKey]);
    logger.debug('✓✓ Confirmação de leitura enviada');
  } catch (error) {
    logger.error('Erro ao enviar confirmação de leitura:', error);
  }
}

/**
 * Envia indicador de "digitando..."
 * @param {Object} sock - Socket do WhatsApp
 * @param {string} jid - JID do destinatário
 * @param {boolean} isTyping - Se está digitando
 */
async function sendTypingIndicator(sock, jid, isTyping = true) {
  try {
    await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  } catch (error) {
    logger.error('Erro ao enviar indicador de digitação:', error);
  }
}

module.exports = {
  registerEvents,
  sendReadReceipt,
  sendTypingIndicator,
};