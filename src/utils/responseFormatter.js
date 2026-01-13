// Convertido para ES Modules
/**
 * responseFormatter.js
 * Formata respostas da IA antes de enviar ao usuário
 * - Remove frases repetidas
 * - Ajusta tamanho para WhatsApp
 * - Adiciona formatação (negrito, itálico, etc)
 * - Estrutura melhor a resposta
 * - Remove redundâncias
 */

import logger from './logger.js';

// Configurações de formatação
const FORMAT_CONFIG = {
  maxMessageLength: 4096, // Limite do WhatsApp
  maxParagraphLength: 500, // Tamanho ideal de parágrafo
  preferredLineLength: 65, // Caracteres por linha (legibilidade)
  splitOnNewlines: true, // Dividir em múltiplas mensagens se muito longo
};

/**
 * Remove frases ou blocos repetidos
 * @param {string} text - Texto original
 * @returns {string} Texto sem repetições
 */
function removeDuplicates(text) {
  if (!text) return '';
  
  // Divide em linhas
  const lines = text.split('\n');
  const uniqueLines = [];
  const seen = new Set();
  
  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    
    // Ignora linhas vazias (mas mantém uma)
    if (normalized === '') {
      if (uniqueLines.length > 0 && uniqueLines[uniqueLines.length - 1] !== '') {
        uniqueLines.push('');
      }
      continue;
    }
    
    // Adiciona apenas se não viu antes
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueLines.push(line);
    }
  }
  
  return uniqueLines.join('\n').trim();
}

/**
 * Remove redundâncias comuns da IA
 * @param {string} text - Texto original
 * @returns {string} Texto sem redundâncias
 */
function removeRedundancies(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove frases redundantes comuns de IA
  const redundantPhrases = [
    /Claro,?\s+/gi,
    /Com certeza[,!]?\s+/gi,
    /Sem problemas?[,!]?\s+/gi,
    /É isso aí[,!]?\s+/gi,
    /Perfeito[,!]?\s+Então\s+/gi,
    /Entendi[,!]?\s+Vamos lá[,!]?\s+/gi,
    /Vou te ajudar com isso[.,!]?\s+/gi,
    /Deixa eu te explicar[.,!]?\s+/gi,
  ];
  
  redundantPhrases.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove múltiplos espaços e linhas vazias excessivas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  
  return cleaned.trim();
}

/**
 * Adiciona formatação WhatsApp (negrito, itálico)
 * @param {string} text - Texto original
 * @param {Object} options - Opções de formatação
 * @returns {string} Texto formatado
 */
function applyWhatsAppFormatting(text, options = {}) {
  if (!text) return '';
  
  const defaults = {
    boldTitles: true,
    italicEmphasis: false,
    monospaceCode: false,
  };
  
  const opts = { ...defaults, ...options };
  let formatted = text;
  
  // Títulos em negrito (# Título ou ### Seção)
  if (opts.boldTitles) {
    formatted = formatted.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');
  }
  
  // Ênfase em itálico (palavras entre asteriscos simples já existentes)
  // Não precisa fazer nada, WhatsApp já interpreta
  
  // Código em monospace (palavras entre crases)
  // Não precisa fazer nada, WhatsApp já interpreta
  
  return formatted;
}

/**
 * Estrutura melhor a resposta com seções
 * @param {string} text - Texto original
 * @returns {string} Texto estruturado
 */
function structureResponse(text) {
  if (!text) return '';
  
  let structured = text;
  
  // Adiciona quebra de linha antes de listas numeradas
  structured = structured.replace(/([^\n])\n(\d+[\.)]\s)/g, '$1\n\n$2');
  
  // Adiciona quebra de linha antes de bullets
  structured = structured.replace(/([^\n])\n([•\-\*]\s)/g, '$1\n\n$2');
  
  // Adiciona quebra de linha antes de títulos
  structured = structured.replace(/([^\n])\n(\*[^*]+\*)\n/g, '$1\n\n$2\n');
  
  // Remove linhas vazias triplas ou mais
  structured = structured.replace(/\n{3,}/g, '\n\n');
  
  return structured.trim();
}

/**
 * Adiciona emojis contextuais (opcional)
 * @param {string} text - Texto original
 * @param {string} context - Contexto ('prospeccao', 'suporte', 'geral')
 * @returns {string} Texto com emojis
 */
function addContextualEmojis(text, context = 'geral') {
  if (!text) return '';
  
  let withEmojis = text;
  
  // Mapeia palavras-chave para emojis por contexto
  const emojiMap = {
    prospeccao: {
      'taxa': '💰',
      'grátis': '🎁',
      'sem custo': '✅',
      'funcionalidade': '⚡',
      'benefício': '✨',
      'venda': '🛍️',
      'cliente': '👤',
      'whatsapp': '📱',
    },
    suporte: {
      'passo': '▶️',
      'configurar': '⚙️',
      'conectar': '🔗',
      'problema': '🔧',
      'solução': '✅',
      'atenção': '⚠️',
      'importante': '❗',
      'dica': '💡',
    },
    geral: {
      'atenção': '⚠️',
      'importante': '❗',
      'dica': '💡',
      'sucesso': '✅',
    },
  };
  
  const contextEmojis = emojiMap[context] || emojiMap.geral;
  
  // Adiciona emojis apenas no início de linhas importantes
  // (evita poluir demais)
  for (const [keyword, emoji] of Object.entries(contextEmojis)) {
    const pattern = new RegExp(`^(${keyword})`, 'gmi');
    withEmojis = withEmojis.replace(pattern, `${emoji} $1`);
  }
  
  return withEmojis;
}

/**
 * Divide texto longo em múltiplas mensagens
 * @param {string} text - Texto longo
 * @param {number} maxLength - Tamanho máximo por mensagem
 * @returns {Array<string>} Array de mensagens
 */
function splitLongMessage(text, maxLength = FORMAT_CONFIG.maxMessageLength) {
  if (!text || text.length <= maxLength) {
    return [text];
  }
  
  const messages = [];
  const paragraphs = text.split('\n\n');
  let currentMessage = '';
  
  for (const paragraph of paragraphs) {
    // Se o parágrafo sozinho é maior que o limite
    if (paragraph.length > maxLength) {
      // Salva mensagem atual se existir
      if (currentMessage) {
        messages.push(currentMessage.trim());
        currentMessage = '';
      }
      
      // Divide o parágrafo por frases
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      
      for (const sentence of sentences) {
        if (currentMessage.length + sentence.length > maxLength) {
          messages.push(currentMessage.trim());
          currentMessage = sentence;
        } else {
          currentMessage += sentence;
        }
      }
    } else {
      // Verifica se cabe na mensagem atual
      if (currentMessage.length + paragraph.length + 2 > maxLength) {
        messages.push(currentMessage.trim());
        currentMessage = paragraph;
      } else {
        currentMessage += (currentMessage ? '\n\n' : '') + paragraph;
      }
    }
  }
  
  // Adiciona última mensagem
  if (currentMessage) {
    messages.push(currentMessage.trim());
  }
  
  return messages;
}

/**
 * Limpa markdown excessivo ou mal formatado
 * @param {string} text - Texto com markdown
 * @returns {string} Texto com markdown limpo
 */
function cleanMarkdown(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove asteriscos órfãos (sem par)
  // Conta asteriscos em cada linha
  const lines = cleaned.split('\n');
  const cleanedLines = lines.map(line => {
    const asteriskCount = (line.match(/\*/g) || []).length;
    // Se ímpar, remove todos os asteriscos desta linha
    if (asteriskCount % 2 !== 0) {
      return line.replace(/\*/g, '');
    }
    return line;
  });
  
  cleaned = cleanedLines.join('\n');
  
  // Remove underscores órfãos
  cleaned = cleaned.replace(/(?<!_)_(?!_)/g, '');
  
  // Remove hashtags markdown (#) no início se não for título
  cleaned = cleaned.replace(/^#{4,}\s+/gm, '');
  
  return cleaned;
}

/**
 * Remove prefixos comuns de IA que não agregam
 * @param {string} text - Texto original
 * @returns {string} Texto sem prefixos desnecessários
 */
function removeAIPrefixes(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove prefixos comuns no início da mensagem
  const prefixes = [
    /^Aqui está\s+/i,
    /^Segue\s+/i,
    /^Veja\s+/i,
    /^Olha só\s+/i,
    /^Então\s+/i,
    /^Bom,?\s+/i,
    /^Certo,?\s+/i,
  ];
  
  prefixes.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  return cleaned.trim();
}

/**
 * Adiciona CTAs (Call-to-Action) apropriados
 * @param {string} text - Texto original
 * @param {string} intent - Intenção ('prospeccao', 'suporte', 'geral')
 * @returns {string} Texto com CTA
 */
function addCTA(text, intent = 'geral') {
  if (!text) return '';
  
  // Verifica se já tem CTA (termina com ? ou !)
  const hasCTA = /[?!]$/.test(text.trim());
  if (hasCTA) return text;
  
  const ctas = {
    prospeccao: '\n\n💬 Ficou com alguma dúvida? Estou aqui para ajudar!',
    suporte: '\n\n❓ Conseguiu resolver? Precisa de mais ajuda?',
    geral: '\n\n💬 Posso ajudar com mais alguma coisa?',
  };
  
  const cta = ctas[intent] || ctas.geral;
  
  // Adiciona CTA apenas se a mensagem não for muito curta
  if (text.length > 100) {
    return text + cta;
  }
  
  return text;
}

/**
 * Formata números e valores para melhor legibilidade
 * @param {string} text - Texto original
 * @returns {string} Texto com números formatados
 */
function formatNumbers(text) {
  if (!text) return '';
  
  let formatted = text;
  
  // Formata valores monetários
  // R$100 -> R$ 100,00
  formatted = formatted.replace(/R\$\s?(\d+)(?![\d,.])/g, (match, num) => {
    return `R$ ${parseInt(num).toLocaleString('pt-BR')},00`;
  });
  
  // Formata percentuais
  // 3% -> 3%
  formatted = formatted.replace(/(\d+)\s?%/g, '$1%');
  
  // Formata números grandes
  // 1000 -> 1.000
  formatted = formatted.replace(/\b(\d{4,})\b/g, (match) => {
    return parseInt(match).toLocaleString('pt-BR');
  });
  
  return formatted;
}

/**
 * Melhora a legibilidade geral
 * @param {string} text - Texto original
 * @returns {string} Texto mais legível
 */
function improveReadability(text) {
  if (!text) return '';
  
  let improved = text;
  
  // Adiciona espaço após pontuação se não houver
  improved = improved.replace(/([.,!?;:])([^\s\n])/g, '$1 $2');
  
  // Remove espaços antes de pontuação
  improved = improved.replace(/\s+([.,!?;:])/g, '$1');
  
  // Normaliza aspas
  improved = improved.replace(/[""]/g, '"');
  improved = improved.replace(/['']/g, "'");
  
  // Normaliza reticências
  improved = improved.replace(/\.{2,}/g, '...');
  
  // Remove espaços no início/fim de linhas
  improved = improved.split('\n').map(line => line.trim()).join('\n');
  
  return improved.trim();
}

/**
 * Remove disclaimers desnecessários da IA
 * @param {string} text - Texto original
 * @returns {string} Texto sem disclaimers
 */
function removeDisclaimers(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove disclaimers comuns
  const disclaimers = [
    /Como (?:uma )?IA[,\s]+(?:eu )?(?:não posso|não tenho|não sou capaz)[^.!?]+[.!?]/gi,
    /(?:É importante|Vale ressaltar|Importante destacar) (?:lembrar )?que (?:sou|eu sou) (?:uma )?(?:IA|inteligência artificial)[^.!?]+[.!?]/gi,
    /Lembre-se de que (?:sou|eu sou) (?:uma )?(?:IA|inteligência artificial)[^.!?]+[.!?]/gi,
    /Não sou um (?:advogado|médico|profissional)[^.!?]+[.!?]/gi,
  ];
  
  disclaimers.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove linhas vazias extras criadas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned.trim();
}

/**
 * Formata resposta completa (pipeline completo)
 * @param {string} text - Resposta original da IA
 * @param {Object} options - Opções de formatação
 * @returns {Object} Resposta formatada
 */
function formatResponse(text, options = {}) {
  if (!text) {
    return {
      original: '',
      formatted: '',
      messages: [''],
      metadata: {
        isEmpty: true,
      },
    };
  }
  
  try {
    logger.debug('✨ Formatando resposta:', text.substring(0, 50) + '...');
    
    const defaults = {
      intent: 'geral',
      addCTA: true,
      addEmojis: false,
      splitIfLong: true,
      applyWhatsAppFormat: true,
    };
    
    const opts = { ...defaults, ...options };
    
    let formatted = text;
    
    // 1. Remove disclaimers desnecessários
    formatted = removeDisclaimers(formatted);
    
    // 2. Remove prefixos desnecessários
    formatted = removeAIPrefixes(formatted);
    
    // 3. Remove redundâncias
    formatted = removeRedundancies(formatted);
    
    // 4. Remove duplicatas
    formatted = removeDuplicates(formatted);
    
    // 5. Limpa markdown
    formatted = cleanMarkdown(formatted);
    
    // 6. Melhora legibilidade
    formatted = improveReadability(formatted);
    
    // 7. Formata números
    formatted = formatNumbers(formatted);
    
    // 8. Estrutura melhor
    formatted = structureResponse(formatted);
    
    // 9. Aplica formatação WhatsApp
    if (opts.applyWhatsAppFormat) {
      formatted = applyWhatsAppFormatting(formatted);
    }
    
    // 10. Adiciona emojis contextuais (opcional)
    if (opts.addEmojis) {
      formatted = addContextualEmojis(formatted, opts.intent);
    }
    
    // 11. Adiciona CTA
    if (opts.addCTA) {
      formatted = addCTA(formatted, opts.intent);
    }
    
    // 12. Divide em múltiplas mensagens se necessário
    let messages = [formatted];
    if (opts.splitIfLong && formatted.length > FORMAT_CONFIG.maxMessageLength) {
      messages = splitLongMessage(formatted);
      logger.debug(`📨 Mensagem dividida em ${messages.length} partes`);
    }
    
    const result = {
      original: text,
      formatted,
      messages,
      metadata: {
        isEmpty: formatted.length === 0,
        originalLength: text.length,
        formattedLength: formatted.length,
        compressionRatio: ((text.length - formatted.length) / text.length * 100).toFixed(2),
        messageCount: messages.length,
        wasCompressed: formatted.length < text.length,
        wasSplit: messages.length > 1,
      },
    };
    
    logger.debug('✅ Resposta formatada com sucesso', {
      original: result.metadata.originalLength,
      formatted: result.metadata.formattedLength,
      messages: result.metadata.messageCount,
    });
    
    return result;
    
  } catch (error) {
    logger.error('❌ Erro ao formatar resposta:', error);
    return {
      original: text,
      formatted: text,
      messages: [text],
      metadata: {
        error: error.message,
      },
    };
  }
}

/**
 * Formata resposta rápida (sem pipeline completo)
 * @param {string} text - Texto original
 * @returns {string} Texto formatado basicamente
 */
function quickFormat(text) {
  if (!text) return '';
  
  let formatted = text;
  formatted = removeRedundancies(formatted);
  formatted = improveReadability(formatted);
  formatted = cleanMarkdown(formatted);
  
  return formatted.trim();
}

export {
  removeDuplicates,
  removeRedundancies,
  applyWhatsAppFormatting,
  structureResponse,
  addContextualEmojis,
  splitLongMessage,
  cleanMarkdown,
  removeAIPrefixes,
  addCTA,
  formatNumbers,
  improveReadability,
  removeDisclaimers,
  formatResponse,
  quickFormat,
  FORMAT_CONFIG
};

export default {
  removeDuplicates,
  removeRedundancies,
  applyWhatsAppFormatting,
  structureResponse,
  addContextualEmojis,
  splitLongMessage,
  cleanMarkdown,
  removeAIPrefixes,
  addCTA,
  formatNumbers,
  improveReadability,
  removeDisclaimers,
  formatResponse,
  quickFormat,
  FORMAT_CONFIG
};