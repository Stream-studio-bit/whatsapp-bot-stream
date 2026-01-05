// src/services/messageService.js

const logger = require('../utils/logger');
const { delay } = require('@whiskeysockets/baileys');

/**
 * 🎯 MESSAGE SERVICE
 * 
 * Responsável por ENVIAR mensagens via WhatsApp (Baileys)
 * 
 * Funcionalidades:
 * - Enviar mensagens de texto
 * - Enviar mensagens com botões
 * - Enviar mensagens com listas
 * - Enviar imagens
 * - Enviar documentos
 * - Simular digitação (typing)
 * - Marcar como lida
 * 
 * ⚠️ IMPORTANTE: Este service apenas ENVIA mensagens
 * ⚠️ NÃO contém lógica de negócio ou decisões
 */

/**
 * Envia mensagem de texto simples
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {string} text - Texto da mensagem
 * @param {Object} options - Opções adicionais
 * @returns {Promise<Object>} - Resultado do envio
 */
async function sendTextMessage(sock, userJid, text, options = {}) {
  try {
    if (!sock) {
      throw new Error('Socket não fornecido');
    }

    if (!userJid) {
      throw new Error('JID do usuário não fornecido');
    }

    if (!text || text.trim() === '') {
      throw new Error('Texto da mensagem vazio');
    }

    // Simula digitação (opcional)
    if (options.typing !== false) {
      await simulateTyping(sock, userJid, text.length);
    }

    // Envia mensagem
    const sentMessage = await sock.sendMessage(userJid, {
      text: text.trim()
    });

    logger.info(`✅ Mensagem enviada para ${userJid}: "${text.substring(0, 50)}..."`);

    return sentMessage;

  } catch (error) {
    logger.error('Erro ao enviar mensagem de texto:', error);
    throw error;
  }
}

/**
 * Envia mensagem com botões (buttons message)
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {string} text - Texto principal
 * @param {Array} buttons - Array de botões [{id, displayText}]
 * @param {string} footer - Texto do rodapé (opcional)
 * @returns {Promise<Object>}
 */
async function sendButtonMessage(sock, userJid, text, buttons, footer = '') {
  try {
    if (!sock || !userJid || !text || !buttons || buttons.length === 0) {
      throw new Error('Parâmetros inválidos para mensagem com botões');
    }

    // Formata botões no padrão do Baileys
    const formattedButtons = buttons.map((btn, index) => ({
      buttonId: btn.id || `btn_${index}`,
      buttonText: { displayText: btn.displayText || btn.text },
      type: 1
    }));

    await simulateTyping(sock, userJid, text.length);

    const sentMessage = await sock.sendMessage(userJid, {
      text: text.trim(),
      footer: footer,
      buttons: formattedButtons,
      headerType: 1
    });

    logger.info(`✅ Mensagem com botões enviada para ${userJid}`);

    return sentMessage;

  } catch (error) {
    logger.error('Erro ao enviar mensagem com botões:', error);
    
    // Fallback: envia como texto simples
    logger.warn('Enviando como texto simples (fallback)');
    return await sendTextMessage(sock, userJid, text);
  }
}

/**
 * Envia mensagem com lista (list message)
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {string} text - Texto principal
 * @param {string} buttonText - Texto do botão da lista
 * @param {Array} sections - Seções da lista
 * @param {string} footer - Rodapé (opcional)
 * @returns {Promise<Object>}
 */
async function sendListMessage(sock, userJid, text, buttonText, sections, footer = '') {
  try {
    if (!sock || !userJid || !text || !sections || sections.length === 0) {
      throw new Error('Parâmetros inválidos para mensagem com lista');
    }

    await simulateTyping(sock, userJid, text.length);

    const sentMessage = await sock.sendMessage(userJid, {
      text: text.trim(),
      footer: footer,
      title: 'Menu',
      buttonText: buttonText,
      sections: sections
    });

    logger.info(`✅ Mensagem com lista enviada para ${userJid}`);

    return sentMessage;

  } catch (error) {
    logger.error('Erro ao enviar mensagem com lista:', error);
    
    // Fallback: envia como texto simples
    logger.warn('Enviando como texto simples (fallback)');
    return await sendTextMessage(sock, userJid, text);
  }
}

/**
 * Envia imagem com legenda
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {Buffer|string} image - Buffer da imagem ou URL
 * @param {string} caption - Legenda da imagem
 * @returns {Promise<Object>}
 */
async function sendImageMessage(sock, userJid, image, caption = '') {
  try {
    if (!sock || !userJid || !image) {
      throw new Error('Parâmetros inválidos para envio de imagem');
    }

    await simulateTyping(sock, userJid, 1000);

    const sentMessage = await sock.sendMessage(userJid, {
      image: image,
      caption: caption.trim()
    });

    logger.info(`✅ Imagem enviada para ${userJid}`);

    return sentMessage;

  } catch (error) {
    logger.error('Erro ao enviar imagem:', error);
    throw error;
  }
}

/**
 * Envia documento (PDF, Excel, etc)
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {Buffer|string} document - Buffer do documento ou URL
 * @param {string} filename - Nome do arquivo
 * @param {string} caption - Legenda (opcional)
 * @returns {Promise<Object>}
 */
async function sendDocumentMessage(sock, userJid, document, filename, caption = '') {
  try {
    if (!sock || !userJid || !document || !filename) {
      throw new Error('Parâmetros inválidos para envio de documento');
    }

    await simulateTyping(sock, userJid, 1000);

    const sentMessage = await sock.sendMessage(userJid, {
      document: document,
      fileName: filename,
      caption: caption.trim(),
      mimetype: getMimeType(filename)
    });

    logger.info(`✅ Documento enviado para ${userJid}: ${filename}`);

    return sentMessage;

  } catch (error) {
    logger.error('Erro ao enviar documento:', error);
    throw error;
  }
}

/**
 * Envia áudio
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {Buffer} audio - Buffer do áudio
 * @param {boolean} ptt - É áudio de voz? (Push-to-talk)
 * @returns {Promise<Object>}
 */
async function sendAudioMessage(sock, userJid, audio, ptt = true) {
  try {
    if (!sock || !userJid || !audio) {
      throw new Error('Parâmetros inválidos para envio de áudio');
    }

    const sentMessage = await sock.sendMessage(userJid, {
      audio: audio,
      mimetype: 'audio/mp4',
      ptt: ptt // true = áudio de voz, false = arquivo de áudio
    });

    logger.info(`✅ Áudio enviado para ${userJid}`);

    return sentMessage;

  } catch (error) {
    logger.error('Erro ao enviar áudio:', error);
    throw error;
  }
}

/**
 * Simula digitação (typing indicator)
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {number} textLength - Tamanho do texto (para calcular tempo)
 */
async function simulateTyping(sock, userJid, textLength) {
  try {
    // Calcula tempo de digitação baseado no tamanho do texto
    // Aproximadamente 50ms por caractere, mínimo 500ms, máximo 3000ms
    const typingTime = Math.min(Math.max(textLength * 50, 500), 3000);

    // Envia indicador de "digitando..."
    await sock.sendPresenceUpdate('composing', userJid);
    
    // Aguarda o tempo calculado
    await delay(typingTime);
    
    // Para o indicador
    await sock.sendPresenceUpdate('paused', userJid);

  } catch (error) {
    logger.error('Erro ao simular digitação:', error);
    // Não propaga erro - é apenas cosmético
  }
}

/**
 * Marca mensagem como lida
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do remetente
 * @param {string} messageId - ID da mensagem
 */
async function markAsRead(sock, userJid, messageId) {
  try {
    if (!sock || !userJid || !messageId) {
      return;
    }

    await sock.readMessages([{
      remoteJid: userJid,
      id: messageId,
      participant: undefined
    }]);

    logger.debug(`✅ Mensagem marcada como lida: ${messageId}`);

  } catch (error) {
    logger.error('Erro ao marcar mensagem como lida:', error);
    // Não propaga erro - é apenas cosmético
  }
}

/**
 * Envia reação a uma mensagem
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do remetente
 * @param {string} messageId - ID da mensagem
 * @param {string} emoji - Emoji da reação
 */
async function sendReaction(sock, userJid, messageId, emoji) {
  try {
    if (!sock || !userJid || !messageId || !emoji) {
      return;
    }

    await sock.sendMessage(userJid, {
      react: {
        text: emoji,
        key: {
          remoteJid: userJid,
          id: messageId
        }
      }
    });

    logger.debug(`✅ Reação enviada: ${emoji}`);

  } catch (error) {
    logger.error('Erro ao enviar reação:', error);
    // Não propaga erro - é apenas cosmético
  }
}

/**
 * Envia múltiplas mensagens com delay entre elas
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {Array<string>} messages - Array de mensagens
 * @param {number} delayBetween - Delay entre mensagens (ms)
 */
async function sendMultipleMessages(sock, userJid, messages, delayBetween = 1000) {
  try {
    if (!sock || !userJid || !messages || messages.length === 0) {
      throw new Error('Parâmetros inválidos para envio múltiplo');
    }

    const results = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      // Envia mensagem
      const result = await sendTextMessage(sock, userJid, message);
      results.push(result);
      
      // Aguarda delay se não for a última mensagem
      if (i < messages.length - 1) {
        await delay(delayBetween);
      }
    }

    logger.info(`✅ ${messages.length} mensagens enviadas para ${userJid}`);

    return results;

  } catch (error) {
    logger.error('Erro ao enviar múltiplas mensagens:', error);
    throw error;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Envia mensagem de boas-vindas quando IA assume
 * Usado quando owner faz primeiro contato e depois IA assume
 * 
 * @param {Object} sock - Socket do Baileys
 * @param {string} userJid - JID do destinatário
 * @param {string} userName - Nome do usuário
 */
async function sendAITakeoverMessage(sock, userJid, userName = '') {
  try {
    const greeting = userName ? `Olá, ${userName}!` : 'Olá!';
    
    const message = `
${greeting} 👋

Prazer em continuar nossa conversa! Sou o assistente virtual da OmniWA.

Estou aqui para:
✅ Apresentar nossa plataforma
✅ Tirar suas dúvidas
✅ Ajudar com o que precisar

Como posso te ajudar? 😊
    `.trim();

    await sendTextMessage(sock, userJid, message);
    
    logger.info(`✅ Mensagem de takeover da IA enviada para ${userJid}`);

  } catch (error) {
    logger.error('Erro ao enviar mensagem de takeover:', error);
    throw error;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Notifica que IA foi ativada após resposta do cliente
 * @param {Object} sock - Socket do Baileys
 * @param {string} ownerJid - JID do owner
 * @param {string} clientJid - JID do cliente
 * @param {string} clientName - Nome do cliente
 */
async function notifyOwnerAIActivated(sock, ownerJid, clientJid, clientName = '') {
  try {
    const clientPhone = clientJid.replace('@s.whatsapp.net', '');
    const name = clientName ? ` (${clientName})` : '';
    
    const message = `
🤖 *IA ATIVADA AUTOMATICAMENTE*

Cliente: ${clientPhone}${name}

O cliente respondeu sua mensagem inicial.
A IA assumiu automaticamente o atendimento.

💡 Use /assumir ${clientPhone} para retomar controle manual
    `.trim();

    await sendTextMessage(sock, ownerJid, message, { typing: false });
    
    logger.info(`✅ Owner notificado sobre ativação da IA para ${clientJid}`);

  } catch (error) {
    logger.error('Erro ao notificar owner:', error);
    // Não propaga erro - é apenas notificação
  }
}

/**
 * Determina MIME type baseado na extensão do arquivo
 * @param {string} filename - Nome do arquivo
 * @returns {string} - MIME type
 */
function getMimeType(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  
  const mimeTypes = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed'
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Valida se JID está no formato correto
 * @param {string} jid - JID a validar
 * @returns {boolean}
 */
function isValidJid(jid) {
  if (!jid || typeof jid !== 'string') {
    return false;
  }

  // JID deve ter formato: número@s.whatsapp.net ou número@g.us
  return /^\d+@(s\.whatsapp\.net|g\.us)$/.test(jid);
}

/**
 * Extrai número do telefone do JID
 * @param {string} jid - JID completo
 * @returns {string} - Número sem formatação
 */
function extractPhoneFromJid(jid) {
  if (!jid) return '';
  return jid.split('@')[0];
}

/**
 * Formata número para JID
 * @param {string} phone - Número do telefone
 * @returns {string} - JID formatado
 */
function formatToJid(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  return `${cleanPhone}@s.whatsapp.net`;
}

module.exports = {
  // Envio de mensagens
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendImageMessage,
  sendDocumentMessage,
  sendAudioMessage,
  sendMultipleMessages,
  
  // Interações
  simulateTyping,
  markAsRead,
  sendReaction,
  
  // 🔥 NOVAS FUNÇÕES - Integração com fluxo owner → IA
  sendAITakeoverMessage,
  notifyOwnerAIActivated,
  
  // Utilitários
  isValidJid,
  extractPhoneFromJid,
  formatToJid,
  getMimeType
};