/**
 * textCleaner.js
 * Utilitário para limpar e normalizar mensagens
 * - Remove ruídos (emojis excessivos, espaços, caracteres especiais)
 * - Normaliza texto para processamento pela IA
 * - Extrai informações úteis (números, emails, links)
 * - Sanitiza entrada do usuário
 */

const logger = require('./logger');

/**
 * Remove emojis do texto
 * @param {string} text - Texto com emojis
 * @param {boolean} keepSomeEmojis - Manter alguns emojis importantes
 * @returns {string} Texto sem emojis
 */
function removeEmojis(text, keepSomeEmojis = false) {
  if (!text) return '';
  
  // Remove a maioria dos emojis (unicode ranges)
  let cleaned = text.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Símbolos diversos
  cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transporte
  cleaned = cleaned.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Bandeiras
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, ''); // Símbolos diversos
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, ''); // Dingbats
  cleaned = cleaned.replace(/[\u{FE00}-\u{FE0F}]/gu, ''); // Seletores de variação
  cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Símbolos suplementares
  cleaned = cleaned.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Símbolos estendidos A
  cleaned = cleaned.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Símbolos estendidos B
  
  // Remove emojis compostos (com ZWJ - Zero Width Joiner)
  cleaned = cleaned.replace(/[\u{200D}]/gu, '');
  
  if (keepSomeEmojis) {
    // Mantém emojis básicos e úteis que podem ser importantes para contexto
    // (implementação simplificada - você pode expandir conforme necessário)
    return cleaned;
  }
  
  return cleaned.trim();
}

/**
 * Remove espaços extras e normaliza quebras de linha
 * @param {string} text - Texto com espaços extras
 * @returns {string} Texto normalizado
 */
function normalizeWhitespace(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove espaços no início e fim
  cleaned = cleaned.trim();
  
  // Substitui múltiplos espaços por um único
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Normaliza quebras de linha (máximo 2 consecutivas)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Remove espaços antes de pontuação
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');
  
  // Adiciona espaço após pontuação se necessário
  cleaned = cleaned.replace(/([.,!?;:])([^\s])/g, '$1 $2');
  
  return cleaned.trim();
}

/**
 * Remove URLs do texto
 * @param {string} text - Texto com URLs
 * @param {boolean} replaceWithPlaceholder - Substituir por placeholder
 * @returns {string} Texto sem URLs
 */
function removeUrls(text, replaceWithPlaceholder = false) {
  if (!text) return '';
  
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const placeholder = replaceWithPlaceholder ? '[LINK]' : '';
  
  return text.replace(urlRegex, placeholder).trim();
}

/**
 * Extrai URLs do texto
 * @param {string} text - Texto com possíveis URLs
 * @returns {Array<string>} Lista de URLs encontradas
 */
function extractUrls(text) {
  if (!text) return [];
  
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const matches = text.match(urlRegex);
  
  return matches || [];
}

/**
 * Remove menções (@usuario) do texto
 * @param {string} text - Texto com menções
 * @returns {string} Texto sem menções
 */
function removeMentions(text) {
  if (!text) return '';
  
  return text.replace(/@\w+/g, '').trim();
}

/**
 * Remove hashtags do texto
 * @param {string} text - Texto com hashtags
 * @returns {string} Texto sem hashtags
 */
function removeHashtags(text) {
  if (!text) return '';
  
  return text.replace(/#\w+/g, '').trim();
}

/**
 * Extrai números de telefone do texto
 * @param {string} text - Texto com possíveis telefones
 * @returns {Array<string>} Lista de telefones encontrados
 */
function extractPhoneNumbers(text) {
  if (!text) return [];
  
  const phoneRegex = /(?:\+?55\s?)?(?:\(?[1-9]{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}/g;
  const matches = text.match(phoneRegex);
  
  return matches ? matches.map(p => p.trim()) : [];
}

/**
 * Extrai emails do texto
 * @param {string} text - Texto com possíveis emails
 * @returns {Array<string>} Lista de emails encontrados
 */
function extractEmails(text) {
  if (!text) return [];
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  
  return matches || [];
}

/**
 * Extrai valores monetários do texto
 * @param {string} text - Texto com valores
 * @returns {Array<Object>} Lista de valores encontrados
 */
function extractMoneyValues(text) {
  if (!text) return [];
  
  const values = [];
  
  // Padrão: R$ 100,00 ou R$100 ou 100 reais
  const moneyRegex = /(?:R\$\s?)?([\d.]+(?:,\d{2})?)\s?(?:reais?)?/gi;
  let match;
  
  while ((match = moneyRegex.exec(text)) !== null) {
    const valueStr = match[1].replace('.', '').replace(',', '.');
    const value = parseFloat(valueStr);
    
    if (!isNaN(value) && value > 0) {
      values.push({
        original: match[0],
        value: value,
        formatted: `R$ ${value.toFixed(2).replace('.', ',')}`,
      });
    }
  }
  
  return values;
}

/**
 * Remove caracteres especiais, mantendo pontuação básica
 * @param {string} text - Texto com caracteres especiais
 * @returns {string} Texto limpo
 */
function removeSpecialCharacters(text) {
  if (!text) return '';
  
  // Mantém letras, números, espaços e pontuação básica
  return text.replace(/[^\w\sáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ.,!?;:()\-]/g, '').trim();
}

/**
 * Normaliza acentuação (remove acentos)
 * @param {string} text - Texto com acentos
 * @returns {string} Texto sem acentos
 */
function removeAccents(text) {
  if (!text) return '';
  
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Converte para minúsculas e normaliza
 * @param {string} text - Texto original
 * @returns {string} Texto em minúsculas normalizado
 */
function toLowerCase(text) {
  if (!text) return '';
  
  return text.toLowerCase().trim();
}

/**
 * Converte primeira letra de cada sentença para maiúscula
 * @param {string} text - Texto original
 * @returns {string} Texto capitalizado
 */
function capitalizeSentences(text) {
  if (!text) return '';
  
  return text.replace(/(^\w|\.\s+\w)/g, letter => letter.toUpperCase());
}

/**
 * Remove palavras de parada (stopwords) - português
 * @param {string} text - Texto original
 * @returns {string} Texto sem stopwords
 */
function removeStopwords(text) {
  if (!text) return '';
  
  const stopwords = [
    'a', 'o', 'e', 'de', 'da', 'do', 'em', 'um', 'uma', 'os', 'as',
    'dos', 'das', 'para', 'com', 'por', 'no', 'na', 'nos', 'nas',
    'ao', 'aos', 'à', 'às', 'pelo', 'pela', 'pelos', 'pelas',
    'num', 'numa', 'uns', 'umas', 'que', 'se', 'lhe', 'lhes',
    'me', 'te', 'nos', 'vos', 'meu', 'minha', 'seu', 'sua',
    'este', 'esse', 'aquele', 'isto', 'isso', 'aquilo',
  ];
  
  const words = text.toLowerCase().split(/\s+/);
  const filtered = words.filter(word => !stopwords.includes(word));
  
  return filtered.join(' ');
}

/**
 * Detecta e remove spam/mensagens repetitivas
 * @param {string} text - Texto a verificar
 * @returns {Object} Resultado da análise
 */
function detectSpam(text) {
  if (!text) return { isSpam: false, reason: null };
  
  // Verifica caracteres repetidos excessivamente
  if (/(.)\1{5,}/g.test(text)) {
    return { isSpam: true, reason: 'Caracteres repetidos excessivamente' };
  }
  
  // Verifica CAPS LOCK excessivo (mais de 70% em maiúsculas)
  const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (uppercaseRatio > 0.7 && text.length > 20) {
    return { isSpam: true, reason: 'CAPS LOCK excessivo' };
  }
  
  // Verifica excesso de pontuação/emojis
  const punctuationRatio = (text.match(/[!?.]{3,}/g) || []).length;
  if (punctuationRatio > 3) {
    return { isSpam: true, reason: 'Pontuação excessiva' };
  }
  
  // Verifica palavras suspeitas de spam
  const spamKeywords = [
    'ganhe dinheiro', 'clique aqui', 'promoção imperdível',
    'retire seu prêmio', 'você ganhou', 'parabéns você foi',
  ];
  
  const textLower = text.toLowerCase();
  for (const keyword of spamKeywords) {
    if (textLower.includes(keyword)) {
      return { isSpam: true, reason: 'Conteúdo suspeito de spam' };
    }
  }
  
  return { isSpam: false, reason: null };
}

/**
 * Limpa mensagem para processamento pela IA
 * (Remove ruídos mas mantém contexto)
 * @param {string} text - Mensagem original
 * @param {Object} options - Opções de limpeza
 * @returns {string} Mensagem limpa
 */
function cleanForAI(text, options = {}) {
  if (!text) return '';
  
  const defaults = {
    removeEmojis: true,
    removeUrls: false,
    removeMentions: true,
    removeHashtags: true,
    keepCase: false,
  };
  
  const opts = { ...defaults, ...options };
  
  let cleaned = text;
  
  // Remove emojis (mas mantém alguns se configurado)
  if (opts.removeEmojis) {
    cleaned = removeEmojis(cleaned, false);
  }
  
  // Remove URLs (mas extrai antes se necessário)
  if (opts.removeUrls) {
    cleaned = removeUrls(cleaned, true);
  }
  
  // Remove menções
  if (opts.removeMentions) {
    cleaned = removeMentions(cleaned);
  }
  
  // Remove hashtags
  if (opts.removeHashtags) {
    cleaned = removeHashtags(cleaned);
  }
  
  // Normaliza espaços
  cleaned = normalizeWhitespace(cleaned);
  
  // Converte para minúsculas se necessário
  if (!opts.keepCase) {
    cleaned = toLowerCase(cleaned);
  }
  
  return cleaned.trim();
}

/**
 * Sanitiza entrada do usuário (remove conteúdo perigoso)
 * @param {string} text - Texto a sanitizar
 * @returns {string} Texto sanitizado
 */
function sanitizeInput(text) {
  if (!text) return '';
  
  let sanitized = text;
  
  // Remove scripts e HTML
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove caracteres de controle
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Remove SQL injection básico
  sanitized = sanitized.replace(/('|(--)|;|\/\*|\*\/|xp_|sp_|exec|execute|union|select|insert|update|delete|drop|create|alter)/gi, '');
  
  // Normaliza
  sanitized = normalizeWhitespace(sanitized);
  
  return sanitized.trim();
}

/**
 * Trunca texto mantendo palavras completas
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Tamanho máximo
 * @param {string} suffix - Sufixo (padrão: '...')
 * @returns {string} Texto truncado
 */
function truncate(text, maxLength = 100, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  
  // Encontra o último espaço antes do limite
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + suffix;
  }
  
  return truncated + suffix;
}

/**
 * Extrai palavras-chave do texto
 * @param {string} text - Texto original
 * @param {number} limit - Número máximo de palavras
 * @returns {Array<string>} Lista de palavras-chave
 */
function extractKeywords(text, limit = 10) {
  if (!text) return [];
  
  // Limpa e prepara texto
  let cleaned = cleanForAI(text, { removeEmojis: true, removeUrls: true });
  cleaned = removeStopwords(cleaned);
  
  // Divide em palavras
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  
  // Conta frequência
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  // Ordena por frequência e retorna top N
  const sorted = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
  
  return sorted;
}

/**
 * Limpa mensagem completa (pipeline completo)
 * @param {string} text - Mensagem original
 * @param {Object} options - Opções personalizadas
 * @returns {Object} Resultado da limpeza
 */
function cleanMessage(text, options = {}) {
  if (!text) {
    return {
      original: '',
      cleaned: '',
      sanitized: '',
      metadata: {
        isEmpty: true,
      },
    };
  }
  
  try {
    logger.debug('🧹 Limpando mensagem:', text.substring(0, 50) + '...');
    
    // Sanitiza primeiro (segurança)
    const sanitized = sanitizeInput(text);
    
    // Detecta spam
    const spamCheck = detectSpam(sanitized);
    
    // Extrai informações úteis antes de limpar
    const urls = extractUrls(sanitized);
    const emails = extractEmails(sanitized);
    const phones = extractPhoneNumbers(sanitized);
    const money = extractMoneyValues(sanitized);
    
    // Limpa para processamento
    const cleaned = cleanForAI(sanitized, options);
    
    // Extrai palavras-chave
    const keywords = extractKeywords(cleaned, 5);
    
    const result = {
      original: text,
      cleaned,
      sanitized,
      metadata: {
        isEmpty: cleaned.length === 0,
        isSpam: spamCheck.isSpam,
        spamReason: spamCheck.reason,
        length: cleaned.length,
        wordCount: cleaned.split(/\s+/).length,
        hasUrls: urls.length > 0,
        hasEmails: emails.length > 0,
        hasPhones: phones.length > 0,
        hasMoneyValues: money.length > 0,
        extracted: {
          urls,
          emails,
          phones,
          money,
        },
        keywords,
      },
    };
    
    logger.debug('✅ Mensagem limpa com sucesso');
    return result;
    
  } catch (error) {
    logger.error('❌ Erro ao limpar mensagem:', error);
    return {
      original: text,
      cleaned: text,
      sanitized: text,
      metadata: {
        error: error.message,
      },
    };
  }
}

module.exports = {
  removeEmojis,
  normalizeWhitespace,
  removeUrls,
  extractUrls,
  removeMentions,
  removeHashtags,
  extractPhoneNumbers,
  extractEmails,
  extractMoneyValues,
  removeSpecialCharacters,
  removeAccents,
  toLowerCase,
  capitalizeSentences,
  removeStopwords,
  detectSpam,
  cleanForAI,
  sanitizeInput,
  truncate,
  extractKeywords,
  cleanMessage,
};