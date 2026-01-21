import { DisconnectReason } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import messageController from '../controllers/messageController.js';

export function registerEvents(sock, onDisconnect) {
  logger.info('Registrando eventos do WhatsApp...');

  sock.ev.on('connection.update', async (update) => {
    handleConnectionUpdate(update, onDisconnect);
  });

  sock.ev.on('messages.upsert', async (m) => {
    await handleNewMessage(sock, m);
  });

  sock.ev.on('presence.update', (presence) => {
    handlePresenceUpdate(presence);
  });

  sock.ev.on('groups.update', (groups) => {
    handleGroupsUpdate(groups);
  });

  sock.ev.on('group-participants.update', (event) => {
    handleGroupParticipantsUpdate(event);
  });

  sock.ev.on('blocklist.update', (blocklist) => {
    handleBlocklistUpdate(blocklist);
  });

  logger.info('✅ Eventos registrados com sucesso');
}

function handleConnectionUpdate(update, onDisconnect) {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    logger.info('📱 QR Code gerado. Escaneie com seu WhatsApp.');
    console.log('\n📳 QR CODE DISPONÍVEL NO TERMINAL\n');
  }

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

function handleDisconnection(lastDisconnect, onDisconnect) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;
  const reason = lastDisconnect?.error?.output?.payload?.error || 'Desconhecido';

  logger.warn(`Motivo da desconexão: ${reason} (Código: ${statusCode})`);

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

  if (onDisconnect) {
    onDisconnect(disconnectReason);
  }
}

async function handleNewMessage(sock, messageUpdate) {
  try {
    const { messages, type } = messageUpdate;

    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.key) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;
      if (msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const sender = isGroup ? msg.key.participant : from;

      logger.info(`📩 Nova mensagem de ${sender} ${isGroup ? `no grupo ${from}` : ''}`);

      await messageController.processMessage(sock, msg);
    }
  } catch (error) {
    logger.error('Erro ao processar nova mensagem:', error);
  }
}

function handlePresenceUpdate(presence) {
  const { id, presences } = presence;
  
  if (process.env.LOG_LEVEL === 'debug') {
    Object.keys(presences).forEach((jid) => {
      const status = presences[jid].lastKnownPresence;
      logger.debug(`Presença ${jid}: ${status}`);
    });
  }
}

function handleGroupsUpdate(groups) {
  groups.forEach((group) => {
    logger.debug(`Grupo atualizado: ${group.id} - ${group.subject || 'Sem nome'}`);
  });
}

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

function handleBlocklistUpdate(blocklist) {
  const { blocklist: list } = blocklist;
  
  if (list && list.length > 0) {
    logger.info(`🚫 Lista de bloqueio atualizada: ${list.length} contatos`);
  }
}

export async function sendReadReceipt(sock, messageKey) {
  try {
    await sock.readMessages([messageKey]);
    logger.debug('✓✓ Confirmação de leitura enviada');
  } catch (error) {
    logger.error('Erro ao enviar confirmação de leitura:', error);
  }
}

export async function sendTypingIndicator(sock, jid, isTyping = true) {
  try {
    await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  } catch (error) {
    logger.error('Erro ao enviar indicador de digitação:', error);
  }
}