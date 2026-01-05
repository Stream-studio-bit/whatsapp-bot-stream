// src/ai/intentClassifier.js

const logger = require('../utils/logger');

/**
 * Classificador de Intenções
 * Identifica automaticamente se a mensagem é sobre:
 * - PROSPECÇÃO (vendas, interesse em conhecer o SaaS)
 * - SUPORTE (ajuda técnica, configuração, dúvidas de uso)
 * - GERAL (conversas genéricas, saudações, outros assuntos)
 */

// Palavras-chave para identificar PROSPECÇÃO
const PROSPECT_KEYWORDS = [
  // Interesse comercial
  'preço', 'valor', 'quanto custa', 'plano', 'planos', 'assinatura',
  'contratar', 'comprar', 'adquirir', 'teste grátis', 'trial',
  
  // Descoberta do produto
  'o que é', 'como funciona', 'funcionalidades', 'recursos',
  'benefícios', 'vantagens', 'diferenciais',
  
  // Interesse inicial
  'quero conhecer', 'tenho interesse', 'gostaria de saber',
  'preciso de uma solução', 'estou procurando',
  
  // Público-alvo
  'para minha loja', 'meu negócio', 'minha empresa',
  'sou lojista', 'tenho uma loja', 'vendo produtos',
  
  // Comparação
  'comparado com', 'diferença entre', 'melhor que',
  
  // Demo/Apresentação
  'demonstração', 'demo', 'apresentação', 'mostrar como funciona'
];

// Palavras-chave para identificar SUPORTE
const SUPPORT_KEYWORDS = [
  // Configuração técnica
  'configurar', 'configuração', 'como configuro', 'setup',
  'conectar whatsapp', 'qr code', 'escanear', 'código qr',
  
  // Chave de IA
  'chave de ia', 'api key', 'token', 'groq', 'openai',
  'como adiciono a chave', 'onde coloco',
  
  // Segmentação
  'segmento', 'segmentação', 'categoria da loja',
  'tipo de negócio', 'nicho',
  
  // Catálogo
  'catálogo', 'produtos', 'adicionar produto', 'importar produtos',
  'excel', 'planilha', 'csv',
  
  // Problemas técnicos
  'erro', 'bug', 'não funciona', 'não está funcionando',
  'não conecta', 'desconectou', 'caiu',
  
  // Ajuda de uso
  'como usar', 'como faço para', 'ajuda com',
  'tutorial', 'passo a passo', 'não consigo',
  
  // Split de pagamento
  'split', 'comissão', 'mercado pago', 'pagamento',
  
  // Integrações
  'integração', 'integrar', 'erp', 'pdv', 'delivery',
  'ifood', 'rappi', 'conectar sistema'
];

// Palavras-chave que indicam conversação GERAL
const GENERAL_KEYWORDS = [
  // Saudações
  'oi', 'olá', 'bom dia', 'boa tarde', 'boa noite',
  'hey', 'ola', 'oie',
  
  // Despedidas
  'tchau', 'até logo', 'até mais', 'falou', 'valeu',
  
  // Agradecimentos
  'obrigado', 'obrigada', 'vlw', 'valeu', 'agradeço',
  
  // Conversação
  'tudo bem', 'como vai', 'beleza', 'e aí'
];

/**
 * Classifica a intenção do usuário com base no conteúdo da mensagem
 * @param {string} messageText - Texto da mensagem do usuário
 * @returns {string} - Intenção identificada: 'PROSPECÇÃO', 'SUPORTE' ou 'GERAL'
 */
function classifyIntent(messageText) {
  try {
    if (!messageText || typeof messageText !== 'string') {
      logger.warn('Mensagem inválida recebida no classificador');
      return 'GERAL';
    }

    // Normaliza o texto (lowercase, remove acentos extras)
    const normalizedText = messageText
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remove acentos

    // Conta quantas palavras-chave de cada categoria aparecem
    let prospectScore = 0;
    let supportScore = 0;
    let generalScore = 0;

    // Verifica PROSPECÇÃO
    PROSPECT_KEYWORDS.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        prospectScore++;
      }
    });

    // Verifica SUPORTE
    SUPPORT_KEYWORDS.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        supportScore++;
      }
    });

    // Verifica GERAL
    GENERAL_KEYWORDS.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        generalScore++;
      }
    });

    // Lógica de decisão
    // Se a mensagem é muito curta (menos de 10 caracteres), provavelmente é saudação
    if (normalizedText.length < 10 && generalScore > 0) {
      logger.info('Intenção classificada: GERAL (mensagem curta)');
      return 'GERAL';
    }

    // Se tem score de suporte maior, é SUPORTE
    if (supportScore > prospectScore && supportScore > generalScore) {
      logger.info(`Intenção classificada: SUPORTE (score: ${supportScore})`);
      return 'SUPORTE';
    }

    // Se tem score de prospecção maior, é PROSPECÇÃO
    if (prospectScore > supportScore && prospectScore > generalScore) {
      logger.info(`Intenção classificada: PROSPECÇÃO (score: ${prospectScore})`);
      return 'PROSPECÇÃO';
    }

    // Se tem apenas palavras de GERAL, retorna GERAL
    if (generalScore > 0 && prospectScore === 0 && supportScore === 0) {
      logger.info('Intenção classificada: GERAL (apenas saudações)');
      return 'GERAL';
    }

    // Se há empate entre PROSPECÇÃO e SUPORTE, usa contexto adicional
    if (prospectScore > 0 && supportScore > 0) {
      // Frases que indicam início de interesse = PROSPECÇÃO
      if (
        normalizedText.includes('quero') ||
        normalizedText.includes('preciso') ||
        normalizedText.includes('gostaria')
      ) {
        logger.info('Intenção classificada: PROSPECÇÃO (contexto de interesse)');
        return 'PROSPECÇÃO';
      }
      
      // Palavras técnicas fortes = SUPORTE
      if (
        normalizedText.includes('erro') ||
        normalizedText.includes('configurar') ||
        normalizedText.includes('conectar')
      ) {
        logger.info('Intenção classificada: SUPORTE (contexto técnico)');
        return 'SUPORTE';
      }
    }

    // Default: se não identificou nada específico, retorna GERAL
    logger.info('Intenção classificada: GERAL (padrão)');
    return 'GERAL';

  } catch (error) {
    logger.error('Erro ao classificar intenção:', error);
    return 'GERAL'; // Fallback seguro
  }
}

/**
 * Retorna informações detalhadas sobre a classificação
 * @param {string} messageText - Texto da mensagem
 * @returns {Object} - Objeto com intenção e scores
 */
function getDetailedClassification(messageText) {
  try {
    const normalizedText = messageText
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let prospectScore = 0;
    let supportScore = 0;
    let generalScore = 0;

    const prospectMatches = [];
    const supportMatches = [];
    const generalMatches = [];

    // Conta e armazena matches
    PROSPECT_KEYWORDS.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        prospectScore++;
        prospectMatches.push(keyword);
      }
    });

    SUPPORT_KEYWORDS.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        supportScore++;
        supportMatches.push(keyword);
      }
    });

    GENERAL_KEYWORDS.forEach(keyword => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        generalScore++;
        generalMatches.push(keyword);
      }
    });

    const intent = classifyIntent(messageText);

    return {
      intent,
      scores: {
        prospect: prospectScore,
        support: supportScore,
        general: generalScore
      },
      matches: {
        prospect: prospectMatches,
        support: supportMatches,
        general: generalMatches
      }
    };
  } catch (error) {
    logger.error('Erro ao obter classificação detalhada:', error);
    return {
      intent: 'GERAL',
      scores: { prospect: 0, support: 0, general: 0 },
      matches: { prospect: [], support: [], general: [] }
    };
  }
}

module.exports = {
  classifyIntent,
  getDetailedClassification
};