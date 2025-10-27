import dotenv from 'dotenv';

dotenv.config();

/**
 * Verifica se está dentro do horário comercial
 * @returns {boolean}
 */
export function isBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Domingo, 6 = Sábado

  const startHour = parseInt(process.env.BUSINESS_START_HOUR) || 9;
  const endHour = parseInt(process.env.BUSINESS_END_HOUR) || 18;
  const startDay = parseInt(process.env.BUSINESS_START_DAY) || 1; // Segunda
  const endDay = parseInt(process.env.BUSINESS_END_DAY) || 5; // Sexta

  // Verifica dia da semana
  if (day < startDay || day > endDay) {
    return false;
  }

  // Verifica horário
  if (hour >= startHour && hour < endHour) {
    return true;
  }

  return false;
}

/**
 * Retorna mensagem de horário comercial
 * @returns {string}
 */
export function getBusinessHoursMessage() {
  const ownerName = process.env.OWNER_NAME || 'Roberto';
  
  return `🕐 *Horário de Atendimento*

Nosso horário comercial é:
📅 Segunda a Sexta
⏰ 9h às 18h

Você está entrando em contato fora do horário. O ${ownerName} retornará assim que possível no próximo dia útil.

Mas fique à vontade para deixar sua mensagem! 😊`;
}

/**
 * Extrai o número de telefone limpo (sem formatação)
 * @param {string} jid - JID do WhatsApp
 * @returns {string}
 */
export function extractPhoneNumber(jid) {
  return jid.split('@')[0];
}

/**
 * Formata número de telefone
 * @param {string} phone - Número do telefone
 * @returns {string}
 */
export function formatPhoneNumber(phone) {
  // Remove caracteres não numéricos
  const cleaned = phone.replace(/\D/g, '');
  
  // Formato: (XX) XXXXX-XXXX
  if (cleaned.length === 11) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  }
  
  // Formato: (XX) XXXX-XXXX
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  
  return phone;
}

/**
 * 🔥 CORRIGIDO: Verifica se é um comando do sistema
 * Aceita múltiplas variações de comandos
 * @param {string} message - Mensagem recebida
 * @returns {Object} { isCommand, command }
 */
export function parseCommand(message) {
  const msg = message.trim().toLowerCase();
  
  // Comandos do .env
  const commandAssume = (process.env.COMMAND_ASSUME || '/assumir').toLowerCase();
  const commandRelease = (process.env.COMMAND_RELEASE || '/liberar').toLowerCase();
  
  // 🔥 TODAS AS VARIAÇÕES ACEITAS PARA ASSUMIR:
  const assumeVariations = [
    commandAssume,           // /assumir (do .env)
    'assumir',              // assumir
    '/assumir',             // /assumir
    './assumir',            // ./assumir (caso digitado errado)
    'assumir atendimento',  // assumir atendimento
    'assumir atendimento manual',
    'bloquear bot',
    'pausar bot'
  ];
  
  // 🔥 TODAS AS VARIAÇÕES ACEITAS PARA LIBERAR:
  const releaseVariations = [
    commandRelease,         // /liberar (do .env)
    'liberar',             // liberar
    '/liberar',            // /liberar
    './liberar',           // ./liberar (caso digitado errado)
    'liberar bot',
    'reativar bot',
    'ativar bot',
    'desbloquear bot'
  ];
  
  // Verifica ASSUMIR
  if (assumeVariations.some(variation => msg === variation || msg.startsWith(variation + ' '))) {
    return { isCommand: true, command: 'ASSUME' };
  }
  
  // Verifica LIBERAR
  if (releaseVariations.some(variation => msg === variation || msg.startsWith(variation + ' '))) {
    return { isCommand: true, command: 'RELEASE' };
  }
  
  return { isCommand: false, command: null };
}

/**
 * Verifica se a mensagem é uma saudação inicial
 * @param {string} message - Mensagem recebida
 * @returns {boolean}
 */
export function isGreeting(message) {
  const greetings = [
    'oi', 'olá', 'ola', 'hey', 'opa', 'e ai', 'eai',
    'bom dia', 'boa tarde', 'boa noite',
    'alô', 'alo', 'oie', 'oii'
  ];
  
  const msg = message.trim().toLowerCase();
  
  return greetings.some(greeting => msg === greeting || msg.startsWith(greeting + ' '));
}

/**
 * Verifica se é um lead interessado no Chat Bot Multi-tarefas
 * @param {string} message - Mensagem recebida
 * @returns {boolean}
 */
export function isNewLead(message) {
  const keywords = [
    'chat bot',
    'chatbot',
    'bot multi',
    'multi-tarefas',
    'multi tarefas',
    'interesse',
    'saber mais',
    'tenho interesse',
    'gostaria de saber',
    'quero saber'
  ];
  
  const msg = message.trim().toLowerCase();
  
  return keywords.some(keyword => msg.includes(keyword));
}

/**
 * Limpa e normaliza mensagem
 * @param {string} message - Mensagem original
 * @returns {string}
 */
export function cleanMessage(message) {
  return message
    .trim()
    .replace(/\s+/g, ' ') // Remove espaços múltiplos
    .replace(/[\r\n]+/g, ' '); // Remove quebras de linha
}

/**
 * Gera timestamp legível
 * @returns {string}
 */
export function getTimestamp() {
  const now = new Date();
  return now.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Delay/Sleep function
 * @param {number} ms - Milissegundos
 * @returns {Promise}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simula digitação (typing indicator)
 * @param {Object} sock - Socket do Baileys
 * @param {string} jid - JID do destinatário
 * @param {number} duration - Duração em ms (padrão: 2000ms)
 */
export async function simulateTyping(sock, jid, duration = 2000) {
  try {
    // Envia status "digitando"
    await sock.sendPresenceUpdate('composing', jid);
    
    // Aguarda duração
    await sleep(duration);
    
    // Para de "digitar"
    await sock.sendPresenceUpdate('paused', jid);
  } catch (error) {
    console.error('Erro ao simular digitação:', error.message);
  }
}

/**
 * Valida se é uma mensagem válida para processar
 * @param {Object} message - Objeto da mensagem
 * @returns {boolean}
 */
export function isValidMessage(message) {
  // Ignora mensagens sem conteúdo
  if (!message?.message) return false;
  
  // Ignora mensagens de status
  if (message.key?.remoteJid === 'status@broadcast') return false;
  
  // Ignora mensagens de grupos (opcional)
  if (message.key?.remoteJid?.endsWith('@g.us')) return false;
  
  // Ignora mensagens próprias
  if (message.key?.fromMe) return false;
  
  return true;
}

/**
 * Extrai texto da mensagem (suporta diferentes tipos)
 * @param {Object} message - Objeto da mensagem
 * @returns {string|null}
 */
export function extractMessageText(message) {
  try {
    const messageContent = message.message;
    
    // Mensagem de texto simples
    if (messageContent.conversation) {
      return messageContent.conversation;
    }
    
    // Mensagem de texto estendida
    if (messageContent.extendedTextMessage?.text) {
      return messageContent.extendedTextMessage.text;
    }
    
    // Mensagem de imagem com legenda
    if (messageContent.imageMessage?.caption) {
      return messageContent.imageMessage.caption;
    }
    
    // Mensagem de vídeo com legenda
    if (messageContent.videoMessage?.caption) {
      return messageContent.videoMessage.caption;
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao extrair texto:', error.message);
    return null;
  }
}

/**
 * Calcula diferença de dias entre duas datas
 * @param {Date} date1 - Data mais recente
 * @param {Date} date2 - Data mais antiga
 * @returns {number} Dias de diferença
 */
export function daysDifference(date1, date2) {
  const diffTime = Math.abs(date1 - date2);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Formata log para console
 * @param {string} type - Tipo (INFO, ERROR, SUCCESS, WARNING)
 * @param {string} message - Mensagem
 */
export function log(type, message) {
  const timestamp = getTimestamp();
  const colors = {
    INFO: '\x1b[36m',    // Ciano
    ERROR: '\x1b[31m',   // Vermelho
    SUCCESS: '\x1b[32m', // Verde
    WARNING: '\x1b[33m', // Amarelo
    RESET: '\x1b[0m'
  };
  
  const color = colors[type] || colors.INFO;
  console.log(`${color}[${timestamp}] [${type}]${colors.RESET} ${message}`);
}

/**
 * Mensagem de boas-vindas para novo lead
 * @param {string} customerName - Nome do cliente
 * @returns {string}
 */
export function getNewLeadWelcome(customerName) {
  return `Olá ${customerName}! 👋

Sou o *Assistente Virtual da Stream Studio* e estou aqui para tirar suas dúvidas sobre o *Chat Bot Multi-tarefas* para delivery! 🤖

Pode me perguntar à vontade sobre:
- Funcionalidades do bot
- Preços e formas de pagamento
- Como funciona a instalação
- Suporte técnico
- E muito mais!

Como posso ajudar você? 😊`;
}

/**
 * Mensagem de boas-vindas para cliente existente
 * @param {string} customerName - Nome do cliente
 * @returns {string}
 */
export function getReturningClientWelcome(customerName) {
  const ownerName = process.env.OWNER_NAME || 'Roberto';
  
  return `Olá *${customerName}*! 👋

Eu sou o *Assistente Virtual*, desenvolvido pela *Stream Studio*, e vou iniciar seu atendimento ok.

Você já possui algum projeto em andamento, ou alguma conversa já iniciada?

✅ *Se sim*, basta aguardar que o ${ownerName} logo irá te atender.

❓ *Se ainda não*, me conte, como posso ajudar?`;
}

export default {
  isBusinessHours,
  getBusinessHoursMessage,
  extractPhoneNumber,
  formatPhoneNumber,
  parseCommand,
  isGreeting,
  isNewLead,
  cleanMessage,
  getTimestamp,
  sleep,
  simulateTyping,
  isValidMessage,
  extractMessageText,
  daysDifference,
  log,
  getNewLeadWelcome,
  getReturningClientWelcome
};