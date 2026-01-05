/**
 * messageController.js (ES6 Module Version)
 * 
 * 🎯 RESPONSABILIDADES:
 * 1. Recebe mensagem do WhatsApp
 * 2. Detecta se é OWNER (não processa)
 * 3. Detecta PRIMEIRA RESPOSTA do cliente (ativa IA automaticamente)
 * 4. Verifica se IA está bloqueada (atendimento manual)
 * 5. Limpa e normaliza texto
 * 6. Verifica comandos fixos
 * 7. Classifica intenção (prospecção/suporte/geral)
 * 8. Monta contexto com RAG
 * 9. Envia para IA e obtém resposta
 * 10. Formata e envia resposta ao usuário
 */

import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ==========================================
// CONFIGURAÇÃO
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Cliente Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// JID do owner (número do administrador)
const OWNER_JID = process.env.OWNER_PHONE 
  ? `${process.env.OWNER_PHONE.replace(/\D/g, '')}@s.whatsapp.net` 
  : null;

// Configurações
const CONFIG = {
  AI_MODEL: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
  AI_TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  MAX_TOKENS: parseInt(process.env.MAX_AI_TOKENS || '2000'),
  CONVERSATION_TIMEOUT_HOURS: 24
};

// ==========================================
// UTILIDADES
// ==========================================

/**
 * Logger simples
 */
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  debug: (msg) => process.env.DEBUG_MODE === 'true' && console.log(`🔍 ${msg}`)
};

/**
 * Limpa texto da mensagem
 */
function cleanMessage(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width chars
    .substring(0, 4096); // Limite do WhatsApp
}

/**
 * Extrai informações da mensagem
 */
function extractMessageInfo(msg) {
  try {
    if (!msg?.key?.remoteJid) return null;
    
    const remoteJid = msg.key.remoteJid;
    
    // Ignora status/grupos/newsletters
    if (remoteJid === 'status@broadcast' || 
        remoteJid.endsWith('@g.us') || 
        remoteJid.endsWith('@newsletter')) {
      return null;
    }
    
    // Extrai texto
    let messageText = '';
    const msgContent = msg.message;
    
    if (msgContent?.conversation) {
      messageText = msgContent.conversation;
    } else if (msgContent?.extendedTextMessage) {
      messageText = msgContent.extendedTextMessage.text;
    } else if (msgContent?.imageMessage?.caption) {
      messageText = msgContent.imageMessage.caption;
    } else if (msgContent?.videoMessage?.caption) {
      messageText = msgContent.videoMessage.caption;
    }
    
    if (!messageText || messageText.trim() === '') {
      return null;
    }
    
    const userName = msg.pushName || remoteJid.split('@')[0];
    const messageId = msg.key.id;
    
    return {
      userJid: remoteJid,
      messageText: messageText.trim(),
      userName,
      messageId
    };
    
  } catch (error) {
    log.error(`Erro ao extrair info da mensagem: ${error.message}`);
    return null;
  }
}

// ==========================================
// SUPABASE - OPERAÇÕES
// ==========================================

/**
 * Verifica se é primeira resposta após owner iniciar
 */
async function checkIfFirstResponse(userJid) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('owner_initiated, ai_activated, created_at')
      .eq('user_jid', userJid)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return false;
    
    // Owner iniciou E IA não foi ativada = primeira resposta!
    if (data.owner_initiated === true && data.ai_activated === false) {
      log.success(`Primeira resposta detectada de ${userJid}`);
      return true;
    }
    
    return false;
    
  } catch (error) {
    log.error(`Erro ao verificar primeira resposta: ${error.message}`);
    return false;
  }
}

/**
 * Verifica se IA está bloqueada para o usuário
 */
async function isAIBlockedForUser(userJid) {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('user_jid', userJid)
      .eq('is_blocked', true)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    
    if (data) {
      // Verifica se bloqueio expirou (1 hora)
      const blockedAt = new Date(data.blocked_at);
      const now = new Date();
      const diffHours = (now - blockedAt) / (1000 * 60 * 60);
      
      if (diffHours >= 1) {
        await unblockAIForUser(userJid);
        return false;
      }
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    log.error(`Erro ao verificar bloqueio: ${error.message}`);
    return false;
  }
}

/**
 * Bloqueia IA para usuário
 */
async function blockAIForUser(userJid, reason = 'Manual') {
  try {
    const { error } = await supabase
      .from('blocked_users')
      .upsert({
        user_jid: userJid,
        is_blocked: true,
        blocked_at: new Date().toISOString(),
        blocked_by: reason,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_jid'
      });
    
    if (error) throw error;
    log.success(`IA bloqueada para ${userJid}`);
    
  } catch (error) {
    log.error(`Erro ao bloquear IA: ${error.message}`);
    throw error;
  }
}

/**
 * Desbloqueia IA para usuário
 */
async function unblockAIForUser(userJid) {
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('user_jid', userJid);
    
    if (error) throw error;
    log.success(`IA liberada para ${userJid}`);
    
  } catch (error) {
    log.error(`Erro ao liberar IA: ${error.message}`);
    throw error;
  }
}

/**
 * Salva interação no banco
 */
async function saveInteraction(userJid, userName, userMessage, botResponse, intent) {
  try {
    const { error } = await supabase
      .from('conversations')
      .insert({
        user_jid: userJid,
        user_name: userName,
        user_message: userMessage,
        bot_response: botResponse,
        intent: intent,
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;
    
  } catch (error) {
    log.error(`Erro ao salvar interação: ${error.message}`);
  }
}

/**
 * Ativa IA após primeira resposta
 */
async function activateAIForUser(sock, userJid, userName, firstMessage) {
  try {
    // 1. Marca IA como ativada
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        ai_activated: true,
        ai_activated_at: new Date().toISOString(),
        first_client_message: firstMessage,
        is_prospection: true
      })
      .eq('user_jid', userJid)
      .eq('ai_activated', false);
    
    if (updateError) {
      log.error(`Erro ao marcar IA ativada: ${updateError.message}`);
    }
    
    // 2. Carrega mensagem de prospecção inicial
    const prospectMessage = await loadProspectInitialMessage();
    
    if (prospectMessage) {
      await sendMessage(sock, userJid, prospectMessage);
      log.success(`Mensagem de prospecção enviada para ${userJid}`);
    } else {
      // Fallback
      await sendMessage(sock, userJid, 
        `Olá${userName ? ', ' + userName : ''}! 👋\n\nPrazer em continuar nossa conversa! Como posso te ajudar? 😊`
      );
    }
    
  } catch (error) {
    log.error(`Erro ao ativar IA: ${error.message}`);
  }
}

/**
 * Carrega mensagem inicial de prospecção
 */
async function loadProspectInitialMessage() {
  try {
    const promptPath = join(__dirname, '../ai/prompts/prospectPrompt.txt');
    const content = await readFile(promptPath, 'utf-8');
    
    // Extrai apenas a mensagem inicial (entre as linhas específicas)
    const lines = content.split('\n');
    const startIdx = lines.findIndex(l => l.includes('"A Stream Studio desenvolveu'));
    const endIdx = lines.findIndex(l => l.includes('O que acha de experimentar'));
    
    if (startIdx === -1 || endIdx === -1) {
      return null;
    }
    
    const message = lines
      .slice(startIdx, endIdx + 1)
      .join('\n')
      .replace(/^["']|["']$/g, '') // Remove aspas iniciais/finais
      .trim();
    
    return message;
    
  } catch (error) {
    log.error(`Erro ao carregar mensagem de prospecção: ${error.message}`);
    return null;
  }
}

// ==========================================
// WHATSAPP - ENVIO DE MENSAGENS
// ==========================================

/**
 * Envia mensagem de texto
 */
async function sendMessage(sock, userJid, text) {
  try {
    // Simula digitação
    await sock.sendPresenceUpdate('composing', userJid);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Envia mensagem
    await sock.sendMessage(userJid, { text });
    
    // Para digitação
    await sock.sendPresenceUpdate('paused', userJid);
    
  } catch (error) {
    log.error(`Erro ao enviar mensagem: ${error.message}`);
    throw error;
  }
}

/**
 * Marca mensagem como lida
 */
async function markAsRead(sock, userJid, messageId) {
  try {
    await sock.readMessages([{
      remoteJid: userJid,
      id: messageId
    }]);
  } catch (error) {
    log.debug(`Erro ao marcar como lida: ${error.message}`);
  }
}

/**
 * Notifica owner sobre ativação da IA
 */
async function notifyOwner(sock, ownerJid, clientJid, clientName) {
  try {
    const clientPhone = clientJid.replace('@s.whatsapp.net', '');
    const name = clientName ? ` (${clientName})` : '';
    
    const message = `🤖 *IA ATIVADA AUTOMATICAMENTE*

Cliente: ${clientPhone}${name}

O cliente respondeu sua mensagem inicial.
A IA assumiu automaticamente o atendimento.

💡 Use /assumir ${clientPhone} para retomar controle manual`;
    
    await sendMessage(sock, ownerJid, message);
    
  } catch (error) {
    log.error(`Erro ao notificar owner: ${error.message}`);
  }
}

// ==========================================
// IA - CLASSIFICAÇÃO E RESPOSTA
// ==========================================

/**
 * Classifica intenção da mensagem
 */
function classifyIntent(text) {
  const lower = text.toLowerCase();
  
  // Palavras-chave de prospecção
  const prospectKeywords = [
    'preço', 'quanto custa', 'valor', 'plano', 'teste', 'demo',
    'funciona', 'como funciona', 'quero conhecer', 'interessado',
    'vender', 'automatizar', 'whatsapp', 'bot'
  ];
  
  // Palavras-chave de suporte
  const supportKeywords = [
    'erro', 'não funciona', 'problema', 'ajuda', 'suporte',
    'configurar', 'conectar', 'desconectou', 'qr code',
    'não responde', 'travou', 'bug'
  ];
  
  const hasProspect = prospectKeywords.some(kw => lower.includes(kw));
  const hasSupport = supportKeywords.some(kw => lower.includes(kw));
  
  if (hasSupport) return 'SUPORTE';
  if (hasProspect) return 'PROSPECÇÃO';
  return 'GERAL';
}

/**
 * Carrega prompt do sistema baseado na intenção
 */
async function loadSystemPrompt(intent) {
  try {
    let filename = 'generalPrompt.txt';
    
    if (intent === 'PROSPECÇÃO') {
      filename = 'prospectPrompt.txt';
    } else if (intent === 'SUPORTE') {
      filename = 'supportPrompt.txt';
    }
    
    const promptPath = join(__dirname, '../ai/prompts', filename);
    const content = await readFile(promptPath, 'utf-8');
    
    return content;
    
  } catch (error) {
    log.error(`Erro ao carregar prompt: ${error.message}`);
    return 'Você é um assistente útil e amigável.';
  }
}

/**
 * Obtém resposta da IA (Groq)
 */
async function getAIResponse(systemPrompt, userMessage, conversationHistory = []) {
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];
    
    const completion = await groq.chat.completions.create({
      model: CONFIG.AI_MODEL,
      messages: messages,
      temperature: CONFIG.AI_TEMPERATURE,
      max_tokens: CONFIG.MAX_TOKENS,
      top_p: 1,
      stream: false
    });
    
    const response = completion.choices[0]?.message?.content || '';
    
    if (!response) {
      return 'Desculpe, não consegui processar sua mensagem. Tente novamente.';
    }
    
    return response;
    
  } catch (error) {
    log.error(`Erro na IA: ${error.message}`);
    
    if (error.status === 429) {
      return 'Estou processando muitas requisições. Aguarde alguns segundos e tente novamente.';
    }
    
    if (error.status === 401) {
      log.error('API Key do Groq inválida');
      return 'Erro de autenticação. Entre em contato com o suporte.';
    }
    
    return 'Desculpe, ocorreu um erro. Tente novamente em instantes.';
  }
}

/**
 * Busca contexto de conversas anteriores
 */
async function getConversationHistory(userJid, limit = 5) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('user_message, bot_response')
      .eq('user_jid', userJid)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    if (!data || data.length === 0) return [];
    
    // Formata para o padrão do Groq
    const history = [];
    data.reverse().forEach(conv => {
      if (conv.user_message) {
        history.push({ role: 'user', content: conv.user_message });
      }
      if (conv.bot_response) {
        history.push({ role: 'assistant', content: conv.bot_response });
      }
    });
    
    return history;
    
  } catch (error) {
    log.error(`Erro ao buscar histórico: ${error.message}`);
    return [];
  }
}

// ==========================================
// COMANDOS ADMINISTRATIVOS
// ==========================================

/**
 * Processa comando /assumir
 */
async function handleAssumeCommand(sock, ownerJid, messageText) {
  try {
    const match = messageText.match(/\/assumir\s+(\d+)/);
    
    if (!match) {
      await sendMessage(sock, ownerJid,
        '❌ Formato incorreto.\n\nUso: /assumir [número]\nExemplo: /assumir 5513996069536'
      );
      return;
    }
    
    const targetPhone = match[1];
    const targetJid = `${targetPhone}@s.whatsapp.net`;
    
    await blockAIForUser(targetJid, 'Owner - Comando /assumir');
    
    await sendMessage(sock, ownerJid,
      `✅ IA BLOQUEADA para ${targetPhone}\n\n🤝 Você está em atendimento manual.\n\n💡 Use /liberar ${targetPhone} para devolver ao bot.`
    );
    
    await sendMessage(sock, targetJid,
      '👤 Um atendente humano assumiu esta conversa. Aguarde!'
    );
    
    log.success(`IA bloqueada para ${targetJid} por comando do owner`);
    
  } catch (error) {
    log.error(`Erro em /assumir: ${error.message}`);
    await sendMessage(sock, ownerJid, '❌ Erro ao bloquear IA. Tente novamente.');
  }
}

/**
 * Processa comando /liberar
 */
async function handleReleaseCommand(sock, ownerJid, messageText) {
  try {
    const match = messageText.match(/\/liberar\s+(\d+)/);
    
    if (!match) {
      await sendMessage(sock, ownerJid,
        '❌ Formato incorreto.\n\nUso: /liberar [número]\nExemplo: /liberar 5513996069536'
      );
      return;
    }
    
    const targetPhone = match[1];
    const targetJid = `${targetPhone}@s.whatsapp.net`;
    
    await unblockAIForUser(targetJid);
    
    await sendMessage(sock, ownerJid,
      `✅ IA LIBERADA para ${targetPhone}\n\n🤖 Bot voltou ao atendimento automático.`
    );
    
    await sendMessage(sock, targetJid,
      '🤖 Atendimento automático reativado. Continue conversando normalmente!'
    );
    
    log.success(`IA liberada para ${targetJid} por comando do owner`);
    
  } catch (error) {
    log.error(`Erro em /liberar: ${error.message}`);
    await sendMessage(sock, ownerJid, '❌ Erro ao liberar IA. Tente novamente.');
  }
}

// ==========================================
// PROCESSAMENTO PRINCIPAL
// ==========================================

/**
 * 🎯 FUNÇÃO PRINCIPAL - Processa mensagem recebida
 */
export async function processMessage(sock, message) {
  try {
    // Extrai informações da mensagem
    const messageInfo = extractMessageInfo(message);
    
    if (!messageInfo) {
      log.debug('Mensagem ignorada (sem conteúdo ou inválida)');
      return;
    }
    
    const { userJid, messageText, userName, messageId } = messageInfo;
    
    log.info(`📨 Mensagem de ${userName} (${userJid}): "${messageText.substring(0, 50)}..."`);
    
    // Marca como lida
    await markAsRead(sock, userJid, messageId);
    
    // 🔥 PASSO 1: Verifica se é o OWNER
    if (OWNER_JID && userJid === OWNER_JID) {
      log.info('🔵 Mensagem do OWNER detectada');
      
      // Verifica comandos administrativos
      if (messageText.startsWith('/assumir')) {
        await handleAssumeCommand(sock, userJid, messageText);
        return;
      }
      
      if (messageText.startsWith('/liberar')) {
        await handleReleaseCommand(sock, userJid, messageText);
        return;
      }
      
      // Ignora outras mensagens do owner
      return;
    }
    
    // 🔥 PASSO 2: Verifica primeira resposta após owner
    const isFirstResponse = await checkIfFirstResponse(userJid);
    
    if (isFirstResponse) {
      log.info(`🎯 PRIMEIRA RESPOSTA detectada de ${userJid}`);
      
      await activateAIForUser(sock, userJid, userName, messageText);
      
      if (OWNER_JID) {
        await notifyOwner(sock, OWNER_JID, userJid, userName);
      }
      
      // Salva interação
      await saveInteraction(userJid, userName, messageText, 'Mensagem inicial de prospecção enviada', 'PROSPECÇÃO');
      
      return; // Não processa mais nada nesta primeira resposta
    }
    
    // 🔥 PASSO 3: Verifica se IA está bloqueada
    const isBlocked = await isAIBlockedForUser(userJid);
    
    if (isBlocked) {
      log.info(`🚫 IA bloqueada para ${userJid} - Atendimento manual ativo`);
      return;
    }
    
    // Limpa texto
    const cleanedText = cleanMessage(messageText);
    
    if (!cleanedText) {
      log.debug('Mensagem vazia após limpeza');
      return;
    }
    
    // Classifica intenção
    const intent = classifyIntent(cleanedText);
    log.info(`🎯 Intenção: ${intent}`);
    
    // Carrega prompt do sistema
    const systemPrompt = await loadSystemPrompt(intent);
    
    // Busca histórico de conversas
    const history = await getConversationHistory(userJid, 5);
    
    // Obtém resposta da IA
    log.info('🤖 Consultando IA...');
    const aiResponse = await getAIResponse(systemPrompt, cleanedText, history);
    
    if (!aiResponse) {
      log.error('IA não retornou resposta válida');
      await sendMessage(sock, userJid,
        'Desculpe, estou com dificuldades. Tente novamente em instantes.'
      );
      return;
    }
    
    log.success(`Resposta da IA: "${aiResponse.substring(0, 100)}..."`);
    
    // Envia resposta
    await sendMessage(sock, userJid, aiResponse);
    
    // Salva interação
    await saveInteraction(userJid, userName, cleanedText, aiResponse, intent);
    
    log.success(`Mensagem processada com sucesso para ${userName}`);
    
  } catch (error) {
    log.error(`Erro ao processar mensagem: ${error.message}`);
    
    if (process.env.DEBUG_MODE === 'true') {
      console.error(error);
    }
    
    // Tenta enviar mensagem de erro
    try {
      const userJid = message.key?.remoteJid;
      if (userJid) {
        await sendMessage(sock, userJid,
          'Desculpe, ocorreu um erro. Por favor, tente novamente.'
        );
      }
    } catch (sendError) {
      log.error(`Erro ao enviar mensagem de erro: ${sendError.message}`);
    }
  }
}

// ==========================================
// EXPORTAÇÕES AUXILIARES
// ==========================================

export {
  blockAIForUser,
  unblockAIForUser,
  isAIBlockedForUser,
  checkIfFirstResponse,
  activateAIForUser,
  handleAssumeCommand,
  handleReleaseCommand
};