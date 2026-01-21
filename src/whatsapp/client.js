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

// ✅ IMPORTAÇÃO CORRIGIDA
import { useSupabaseAuthState } from './supabaseAuthState.js';
import { supabaseSession } from '../database/supabaseClient.js';
import { registerEvents } from './events.js';
import logger from '../utils/logger.js';

const SESSION_ID = process.env.SESSION_ID || 'omniwa_bot_session';

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
    
    // ✅ USA A IMPLEMENTAÇÃO CORRETA
    const { state, saveCreds } = await useSupabaseAuthState(supabaseSession, SESSION_ID);

    sock = makeWASocket({
      ...getBaileysSocketConfig(state),
      version,
      auth: state
    });

    // ✅ SALVA CREDENCIAIS CORRETAMENTE
    sock.ev.on('creds.update', saveCreds);

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
        isConnecting = false;
      }

      if (connection === 'close') {
        isConnecting = false;
        const reason =
          lastDisconnect?.error?.output?.statusCode ??
          DisconnectReason.unknown;

        handleDisconnect(reason);
      }
    });

    registerEvents(sock);

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