import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

import qrcode from 'qrcode-terminal';

import {
  getBaileysSocketConfig,
  shouldReconnect,
  getReconnectDelay,
  getDisconnectMessage,
  baileysConfig,
} from '../config/baileys.js';

import { useSupabaseAuthState } from './sessionStore.js';
import { registerEvents } from './events.js';
import logger from '../utils/logger.js';

let sock = null;
let reconnectAttempt = 0;
let reconnectTimeout = null;
let isConnecting = false;

export async function createWhatsAppClient() {
  try {
    if (isConnecting) {
      logger.warn('⏳ Conexão já em andamento');
      return sock;
    }

    isConnecting = true;
    logger.info('🚀 Iniciando cliente WhatsApp...');

    const { version } = await fetchLatestBaileysVersion();
    const authState = useSupabaseAuthState();

    const creds = await authState.loadCreds();
    const keys = await authState.loadKeys();

    const state = {
      creds: creds || undefined,
      keys: keys || {}
    };

    sock = makeWASocket({
      ...getBaileysSocketConfig(state),
      version,
      auth: state
    });

    sock.ev.on('connection.update', (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        console.clear();
        logger.info('📲 Escaneie o QR Code abaixo:\n');
        qrcode.generate(qr, { small: true });

        logger.info(
          '🔗 Fallback QR link:\n' +
            'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' +
            encodeURIComponent(qr)
        );
      }

      if (connection === 'open') {
        logger.info('✅ WhatsApp conectado com sucesso');
        reconnectAttempt = 0;
      }

      if (connection === 'close') {
        const reason =
          lastDisconnect?.error?.output?.statusCode ??
          DisconnectReason.unknown;

        handleDisconnect(reason);
      }
    });

    sock.ev.on('creds.update', async () => {
      try {
        if (sock.authState?.creds) {
          useSupabaseAuthState.state.creds = sock.authState.creds;
          await authState.saveCreds();
        }
        if (sock.authState?.keys) {
          useSupabaseAuthState.state.keys = sock.authState.keys;
          await authState.saveKeys();
        }
        logger.debug('💾 Credenciais salvas no Supabase');
      } catch (err) {
        logger.error('Erro ao salvar credenciais', err);
      }
    });

    registerEvents(sock);

    isConnecting = false;
    return sock;
  } catch (error) {
    isConnecting = false;
    logger.error('❌ Erro ao iniciar cliente WhatsApp', error);
    throw error;
  }
}

async function handleDisconnect(reason) {
  const message = getDisconnectMessage(reason);
  logger.warn(`🔌 Desconectado: ${message}`);

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (!shouldReconnect(reason)) {
    logger.error('❌ Reconexão não permitida (logout ou sessão inválida)');
    reconnectAttempt = 0;
    return;
  }

  reconnectAttempt++;

  if (reconnectAttempt > baileysConfig.reconnect.maxRetries) {
    logger.error('❌ Limite máximo de reconexões atingido');
    reconnectAttempt = 0;
    return;
  }

  const delay = getReconnectDelay(reconnectAttempt);
  logger.info(`🔄 Tentando reconectar em ${delay}ms (tentativa ${reconnectAttempt})`);

  reconnectTimeout = setTimeout(async () => {
    try {
      await createWhatsAppClient();
    } catch (err) {
      logger.error('Erro na reconexão', err);
      await handleDisconnect(reason);
    }
  }, delay);
}

export function getWhatsAppSocket() {
  return sock;
}

export function isConnected() {
  return Boolean(sock?.user);
}

export async function disconnect() {
  try {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (sock) {
      await sock.logout();
      sock = null;
      logger.info('👋 Cliente WhatsApp desconectado');
    }
  } catch (err) {
    logger.error('Erro ao desconectar', err);
  }
}

export async function restart() {
  logger.info('♻️ Reiniciando cliente WhatsApp...');
  await disconnect();
  reconnectAttempt = 0;
  await createWhatsAppClient();
}

export function getClientInfo() {
  if (!sock?.user) {
    return { connected: false };
  }

  return {
    connected: true,
    user: {
      id: sock.user.id,
      name: sock.user.name ?? 'WhatsApp Bot',
    },
    reconnectAttempts: reconnectAttempt,
  };
}