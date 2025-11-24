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
 * 🔥 CORREÇÃO: Verifica se é um comando do sistema
 * Aceita múltiplas variações de comandos de forma mais robusta
 * @param {string} message - Mensagem recebida
 * @returns {Object} { isCommand, command, argument }
 */
export function parseCommand(message) {
  if (!message || typeof message !== 'string') {
    return { isCommand: false, command: null, argument: null };
  }
  
  // Normaliza a mensagem: trim + lowercase
  const msg = message.trim().toLowerCase();
  
  // Se mensagem vazia, não é comando
  if (msg.length === 0) {
    return { isCommand: false, command: null, argument: null };
  }
  
  // 🔥 COMANDOS CONFIGURÁVEIS DO .ENV
  const commandAssume = (process.env.COMMAND_ASSUME || '/assumir').toLowerCase();
  const commandRelease = (process.env.COMMAND_RELEASE || '/liberar').toLowerCase();
  // 🔥 TODAS AS VARIAÇÕES ACEITAS PARA ASSUMIR
  const assumeVariations = [
    // Do .env
    commandAssume,
    // Sem barra
    commandAssume.replace(/^[\/\.]+/, ''),
    // Com barra
    '/' + commandAssume.replace(/^[\/\.]+/, ''),
    // Com ponto-barra (erro comum)
    './' + commandAssume.replace(/^[\/\.]+/, ''),
    // Variações em português
    'assumir',
    '/assumir',
    './assumir',
    'assumir atendimento',
    '/assumir atendimento',
    'assumir manual',
    '/assumir manual',
    'bloquear bot',
    '/bloquear bot',
    'pausar bot',
    '/pausar bot',
    'bloquear',
    '/bloquear'
  ];
  
  // 🔥 TODAS AS VARIAÇÕES ACEITAS PARA LIBERAR
  const releaseVariations = [
    // Do .env
    commandRelease,
    // Sem barra
    commandRelease.replace(/^[\/\.]+/, ''),
    // Com barra
    '/' + commandRelease.replace(/^[\/\.]+/, ''),
    // Com ponto-barra (erro comum)
    './' + commandRelease.replace(/^[\/\.]+/, ''),
    // Variações em português
    'liberar',
    '/liberar',
    './liberar',
    'liberar bot',
    '/liberar bot',
    'reativar bot',
    '/reativar bot',
    'ativar bot',
    '/ativar bot',
    'desbloquear bot',
    '/desbloquear bot',
    'desbloquear',
    '/desbloquear',
    'ativar',
    '/ativar'
  ];
  
  // 🔥 Remove duplicatas e normaliza todas as variações
  const uniqueAssumeVariations = [...new Set(assumeVariations.map(v => v.toLowerCase().trim()))];
  const uniqueReleaseVariations = [...new Set(releaseVariations.map(v => v.toLowerCase().trim()))];
  
  // 🔥 VERIFICA ASSUMIR (com argumento opcional: número de telefone)
  for (const variation of uniqueAssumeVariations) {
    if (msg === variation || msg.startsWith(variation + ' ')) {
      // Extrai argumento (número de telefone, se fornecido)
      const parts = message.trim().split(/\s+/);
      const argument = parts.length > 1 ? parts[1] : null;
      
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', `🎯 Comando ASSUME detectado: "${message}" → matched with "${variation}"${argument ? ` [arg: ${argument}]` : ''}`);
      }
      return { isCommand: true, command: 'ASSUME', argument };
    }
  }
  
  // 🔥 VERIFICA LIBERAR (com argumento opcional: número de telefone)
  for (const variation of uniqueReleaseVariations) {
    if (msg === variation || msg.startsWith(variation + ' ')) {
      // Extrai argumento (número de telefone, se fornecido)
      const parts = message.trim().split(/\s+/);
      const argument = parts.length > 1 ? parts[1] : null;
      
      if (process.env.DEBUG_MODE === 'true') {
        log('INFO', `🎯 Comando RELEASE detectado: "${message}" → matched with "${variation}"${argument ? ` [arg: ${argument}]` : ''}`);
      }
      return { isCommand: true, command: 'RELEASE', argument };
    }
  }
  
  // Não é comando
  if (process.env.DEBUG_MODE === 'true' && (msg.includes('assumir') || msg.includes('liberar') || msg.includes('bloquear'))) {
    log('WARNING', `⚠️ Mensagem contém palavra-chave mas não é comando: "${message}"`);
  }
  
  return { isCommand: false, command: null, argument: null };
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
 * 🔥 CORREÇÃO: Verifica se é um lead interessado no Chat Bot Multi-tarefas
 * Detecta keywords de interesse, mas não é mais usado para definir tipo de saudação
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
    'quero saber',
    'delivery',
    'automação',
    'automatizar',
    'whatsapp bot',
    'agente ia',
    'inteligência artificial',
    'ia para whatsapp'
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
  if (!message || typeof message !== 'string') {
    return '';
  }
  
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
 * 🔥 CORREÇÃO: Simula digitação (typing indicator) com timeout de segurança
 * @param {Object} sock - Socket do Baileys
 * @param {string} jid - JID do destinatário
 * @param {number} duration - Duração em ms (padrão: 1500ms, máximo: 1500ms)
 */
export async function simulateTyping(sock, jid, duration = 1500) {
  try {
    // 🔥 CORREÇÃO: Limita duração máxima para evitar delays longos
    const safeDuration = Math.min(duration, 1500);
    
    // 🔥 CORREÇÃO: Verifica se socket está ativo antes de enviar
    if (!sock?.ws || sock.ws.readyState !== 1) {
      return; // Socket não está pronto, ignora typing
    }
    
    // Envia status "digitando" com timeout de segurança
    const typingPromise = sock.sendPresenceUpdate('composing', jid);
    await Promise.race([
      typingPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Typing timeout')), 3000))
    ]).catch(() => {
      // Ignora erro de timeout
    });
    
    // Aguarda duração (reduzida)
    await sleep(safeDuration);
    
    // Para de "digitar" com timeout de segurança
    if (!sock?.ws || sock.ws.readyState !== 1) {
      return; // Socket caiu durante o delay
    }
    
    const pausePromise = sock.sendPresenceUpdate('paused', jid);
    await Promise.race([
      pausePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Pause timeout')), 3000))
    ]).catch(() => {
      // Ignora erro de timeout
    });
    
  } catch (error) {
    // 🔥 CORREÇÃO: Não loga erros de conexão (muito verboso)
    if (!error.message.includes('Connection') && !error.message.includes('timeout')) {
      console.error('Erro ao simular digitação:', error.message);
    }
  }
}

/**
 * 🔥 CORREÇÃO: Valida se é uma mensagem válida para processar
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
  
  // 🔥 CORREÇÃO: NÃO ignora fromMe aqui (será tratado no messageHandler)
  // Motivo: Precisamos detectar quando owner envia mensagem para bloquear bot
  // A validação de fromMe agora é feita no messageHandler.js linha 63
  
  return true;
}

/**
 * 🔥 CORREÇÃO 5: Extrai texto da mensagem (suporta diferentes tipos)
 * LOGGING DETALHADO IMPLEMENTADO CONFORME PROMPT
 * @param {Object} message - Objeto da mensagem
 * @returns {string|null}
 */
export function extractMessageText(message) {
  try {
    // 🔥 LOG: Função chamada
    log('INFO', '🔍 extractMessageText() chamada');
    
    const messageContent = message.message;
    
    // 🔥 LOG: Mostra estrutura da mensagem (primeiros 200 caracteres)
    try {
      const messageStructure = JSON.stringify(messageContent);
      const truncated = messageStructure.length > 200 
        ? messageStructure.substring(0, 200) + '...' 
        : messageStructure;
      log('INFO', `📦 Estrutura da mensagem: ${truncated}`);
    } catch (e) {
      log('WARNING', '⚠️ Não foi possível serializar estrutura da mensagem');
    }
    
    // Mensagem de texto simples
    if (messageContent.conversation) {
      log('SUCCESS', '📝 Texto extraído de conversation');
      return messageContent.conversation;
    }
    
    // Mensagem de texto estendida
    if (messageContent.extendedTextMessage?.text) {
      log('SUCCESS', '📝 Texto extraído de extendedTextMessage');
      return messageContent.extendedTextMessage.text;
    }
    
    // Mensagem de imagem com legenda
    if (messageContent.imageMessage?.caption) {
      log('SUCCESS', '📝 Texto extraído de caption de imagem');
      return messageContent.imageMessage.caption;
    }
    
    // Mensagem de vídeo com legenda
    if (messageContent.videoMessage?.caption) {
      log('SUCCESS', '📝 Texto extraído de caption de vídeo');
      return messageContent.videoMessage.caption;
    }
    
    // 🔥 LOG: Nenhum texto encontrado
    log('WARNING', '❌ Nenhum texto encontrado na mensagem');
    return null;
    
  } catch (error) {
    log('ERROR', `❌ Erro ao extrair texto: ${error.message}`);
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

// ==========================================
// 🔥 NOVAS FUNÇÕES PARA PROSPECÇÃO ATIVA
// ==========================================

/**
 * 🔥 NOVA FUNÇÃO: Detecta se owner iniciou a conversa
 * Verifica se a primeira mensagem da thread foi do owner (fromMe: true)
 * @param {Object} message - Objeto da mensagem do Baileys
 * @returns {boolean} True se owner iniciou, false caso contrário
 */
export function detectOwnerInitiatedConversation(message) {
  try {
    // Se a mensagem atual é do owner, assume que ele iniciou
    if (message?.key?.fromMe === true) {
      return true;
    }
    
    // Se temos histórico de mensagens, verifica a primeira
    // Nota: Esta função depende de contexto adicional que pode ser
    // injetado via database. Por ora, retorna false se não for fromMe.
    return false;
    
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao detectar início de conversa: ${error.message}`);
    }
    return false;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Calcula tempo de resposta entre mensagens
 * Usado para detectar chatbot (respostas < 5 segundos) vs humano (> 30 segundos)
 * @param {number} previousTimestamp - Timestamp da mensagem anterior (em ms)
 * @param {number} currentTimestamp - Timestamp da mensagem atual (em ms)
 * @returns {number} Tempo de resposta em segundos
 */
export function calculateResponseTime(previousTimestamp, currentTimestamp) {
  try {
    // Valida inputs
    if (!previousTimestamp || !currentTimestamp) {
      return null;
    }
    
    if (typeof previousTimestamp !== 'number' || typeof currentTimestamp !== 'number') {
      return null;
    }
    
    // Calcula diferença
    const differenceMs = Math.abs(currentTimestamp - previousTimestamp);
    const differenceSeconds = Math.floor(differenceMs / 1000);
    
    // Valida resultado (não pode ser negativo ou absurdo)
    if (differenceSeconds < 0 || differenceSeconds > 86400) { // máx 24h
      return null;
    }
    
    return differenceSeconds;
    
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao calcular tempo de resposta: ${error.message}`);
    }
    return null;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Detecta solicitação de atendimento humano
 * Analisa mensagem procurando sinais de que cliente quer falar com pessoa real
 * @param {string} message - Mensagem do cliente
 * @returns {boolean} True se cliente solicitou atendimento humano
 */
export function detectHumanHandoffRequest(message) {
  try {
    if (!message || typeof message !== 'string') {
      return false;
    }
    
    // Normaliza mensagem
    const msg = message.toLowerCase().trim();
    
    // 🔥 KEYWORDS DE SOLICITAÇÃO DE ATENDIMENTO HUMANO
    const handoffKeywords = [
      // Diretas
      'atendente',
      'atendente humano',
      'pessoa de verdade',
      'pessoa real',
      'falar com alguém',
      'falar com uma pessoa',
      'falar com humano',
      'quero falar com',
      'preciso falar com',
      'gostaria de falar com',
      
      // Rejeição ao bot
      'não quero robô',
      'não quero bot',
      'não é robô',
      'você é robô',
      'é um robô',
      'não gosto de robô',
      'não gosto de bot',
      'prefiro pessoa',
      
      // Solicitações específicas
      'falar com responsável',
      'falar com dono',
      'falar com gerente',
      'transferir para',
      'me transfere',
      'transfira para',
      
      // Menções ao owner
      'falar com roberto',
      'chamar roberto',
      'roberto está',
      'cadê o roberto',
      'cadê roberto',
      
      // Expressões de frustração
      'não estou entendendo',
      'não está entendendo',
      'isso não funciona',
      'quero cancelar',
      'quero reclamar'
    ];
    
    // Verifica se alguma keyword está presente
    const hasHandoffKeyword = handoffKeywords.some(keyword => msg.includes(keyword));
    
    if (hasHandoffKeyword && process.env.DEBUG_MODE === 'true') {
      log('INFO', `🤝 Solicitação de handoff detectada: "${message.substring(0, 50)}..."`);
    }
    
    return hasHandoffKeyword;
    
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao detectar handoff: ${error.message}`);
    }
    return false;
  }
}

/**
 * 🔥 NOVA FUNÇÃO: Valida se número de telefone é válido
 * Usado para validar argumentos de comandos como /assumir 5511999999999
 * @param {string} phone - Número de telefone
 * @returns {boolean} True se válido
 */
export function isValidPhoneNumber(phone) {
  try {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    
    // Remove caracteres não numéricos
    const cleaned = phone.replace(/\D/g, '');
    
    // Telefone brasileiro deve ter 10-13 dígitos
    // 10-11: DDD + número
    // 12-13: Código país + DDD + número
    if (cleaned.length >= 10 && cleaned.length <= 13) {
      return true;
    }
    
    return false;
    
  } catch (error) {
    return false;
  }
}
/**
 * 🔥 NOVA FUNÇÃO: Normaliza número de telefone para JID
 * Converte número de telefone para formato JID do WhatsApp
 * @param {string} phone - Número de telefone
 * @returns {string|null} JID formatado ou null se inválido
 */
export function phoneToJid(phone) {
  try {
    if (!phone || typeof phone !== 'string') {
      return null;
    }
    
    // Remove caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');
    
    // Se não tem código do país, adiciona 55 (Brasil)
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = '55' + cleaned;
    }
    
    // Valida tamanho final
    if (!isValidPhoneNumber(cleaned)) {
      return null;
    }
    
    // Retorna JID formatado
    return `${cleaned}@s.whatsapp.net`;
    
  } catch (error) {
    if (process.env.DEBUG_MODE === 'true') {
      log('WARNING', `⚠️ Erro ao converter telefone para JID: ${error.message}`);
    }
    return null;
  }
}

/**
 * 🔥 REMOVIDO: getNewLeadWelcome() e getReturningClientWelcome()
 * Motivo: Função generateWelcomeMessage() no ai.js agora controla todas as boas-vindas
 */

/**
 * 🔥 NOVA FUNÇÃO: Testa a função parseCommand
 * Útil para debug durante desenvolvimento
 */
export function testParseCommand() {
  console.log('\n🧪 ╔══════════════════════════════════════╗');
  console.log('🧪 TESTANDO FUNÇÃO parseCommand()');
  console.log('🧪 ╚══════════════════════════════════════╝\n');
  
  const testCases = [
    '/assumir',
    'assumir',
    './assumir',
    'assumir atendimento',
    'ASSUMIR',
    '/ASSUMIR',
    'bloquear bot',
    '/assumir 5511999999999', // com argumento
    '/liberar',
    'liberar',
    './liberar',
    'liberar bot',
    'LIBERAR',
    '/LIBERAR',
    'ativar bot',
    '/liberar 5511888888888', // com argumento
    'ola tudo bem', // não é comando
    'como faço para assumir?', // não é comando (tem mais palavras antes)
    'quero bloquear', // não é comando (tem palavra antes)
  ];
  
  testCases.forEach((testCase, index) => {
    const result = parseCommand(testCase);
    const emoji = result.isCommand ? '✅' : '❌';
    console.log(`${emoji} Teste ${index + 1}: "${testCase}"`);
    console.log(`   → isCommand: ${result.isCommand}, command: ${result.command || 'null'}, argument: ${result.argument || 'null'}\n`);
  });
  
  console.log('🧪 ╚══════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVA FUNÇÃO: Testa detecção de handoff
 * Útil para debug durante desenvolvimento
 */
export function testHandoffDetection() {
  console.log('\n🧪 ╔══════════════════════════════════════╗');
  console.log('🧪 TESTANDO FUNÇÃO detectHumanHandoffRequest()');
  console.log('🧪 ╚══════════════════════════════════════╝\n');
  
  const testCases = [
    'quero falar com uma pessoa',
    'não quero robô',
    'você é um robô?',
    'falar com o responsável',
    'cadê o Roberto',
    'me transfere para o gerente',
    'não estou entendendo nada',
    'oi tudo bem', // não deve detectar
    'quanto custa', // não deve detectar
    'gostei do produto', // não deve detectar
  ];
  
  testCases.forEach((testCase, index) => {
    const result = detectHumanHandoffRequest(testCase);
    const emoji = result ? '🤝' : '🤖';
    console.log(`${emoji} Teste ${index + 1}: "${testCase}"`);
    console.log(`   → Handoff solicitado: ${result ? 'SIM' : 'NÃO'}\n`);
  });
  
  console.log('🧪 ╚══════════════════════════════════════╝\n');
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
  detectOwnerInitiatedConversation,
  calculateResponseTime,
  detectHumanHandoffRequest,
  isValidPhoneNumber,
  phoneToJid,
  testParseCommand,
  testHandoffDetection
};