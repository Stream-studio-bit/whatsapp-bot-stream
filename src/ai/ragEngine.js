// Convertido para ES Modules
/**
 * ragEngine.js
 * Mecanismo de conhecimento RAG (Retrieval-Augmented Generation)
 * - Busca documentos no Supabase
 * - Recupera trechos relevantes
 * - Monta contexto para IA
 * - Garante que a IA conheça a plataforma OmniWA
 */

import supabaseClient from '../database/supabaseClient.js';
import logger from '../utils/logger.js';

// Nome da tabela de conhecimento no Supabase
const KNOWLEDGE_TABLE = 'knowledge_base';

// Configurações do RAG
const RAG_CONFIG = {
  maxResults: 5, // Máximo de documentos a retornar
  minSimilarity: 0.3, // Similaridade mínima (0 a 1)
  maxContextLength: 4000, // Máximo de caracteres no contexto
};

/**
 * Busca documentos relevantes na base de conhecimento
 * @param {string} query - Pergunta ou termo de busca
 * @param {string} category - Categoria específica (opcional: 'prospeccao', 'suporte', 'geral')
 * @returns {Promise<Array>} Lista de documentos relevantes
 */
async function searchKnowledge(query, category = null) {
  try {
    logger.debug(`Buscando conhecimento para: "${query}"${category ? ` [${category}]` : ''}`);

    // Monta a query base
    let queryBuilder = supabaseClient
      .from(KNOWLEDGE_TABLE)
      .select('id, title, content, category, keywords, created_at')
      .eq('active', true);

    // Filtra por categoria se especificada
    if (category) {
      queryBuilder = queryBuilder.eq('category', category);
    }

    // Busca por palavras-chave ou conteúdo
    const searchTerm = `%${query.toLowerCase()}%`;
    queryBuilder = queryBuilder.or(
      `title.ilike.${searchTerm},content.ilike.${searchTerm},keywords.ilike.${searchTerm}`
    );

    // Ordena por relevância (prioriza título)
    queryBuilder = queryBuilder.order('created_at', { ascending: false });

    // Limita resultados
    queryBuilder = queryBuilder.limit(RAG_CONFIG.maxResults);

    const { data, error } = await queryBuilder;

    if (error) throw error;

    if (!data || data.length === 0) {
      logger.debug('Nenhum documento encontrado');
      return [];
    }

    logger.debug(`✅ ${data.length} documento(s) encontrado(s)`);
    return data;

  } catch (error) {
    logger.error('Erro ao buscar conhecimento:', error);
    return [];
  }
}

/**
 * Monta contexto para a IA baseado nos documentos encontrados
 * @param {Array} documents - Documentos da base de conhecimento
 * @returns {string} Contexto formatado para a IA
 */
function buildContext(documents) {
  if (!documents || documents.length === 0) {
    return '';
  }

  let context = '📚 CONHECIMENTO ESPECÍFICO:\n\n';
  let totalLength = 0;

  for (const doc of documents) {
    const docText = `### ${doc.title}\n${doc.content}\n\n`;
    
    // Verifica se ainda cabe no limite
    if (totalLength + docText.length > RAG_CONFIG.maxContextLength) {
      logger.debug('Limite de contexto atingido, parando...');
      break;
    }

    context += docText;
    totalLength += docText.length;
  }

  context += '---\n\n';
  return context;
}

/**
 * Busca e monta contexto completo para a IA
 * @param {string} query - Pergunta do usuário
 * @param {string} category - Categoria (opcional)
 * @returns {Promise<string>} Contexto formatado
 */
async function getContextForQuery(query, category = null) {
  try {
    const documents = await searchKnowledge(query, category);
    
    if (documents.length === 0) {
      logger.debug('Nenhum contexto relevante encontrado');
      return '';
    }

    const context = buildContext(documents);
    logger.debug(`Contexto montado: ${context.length} caracteres`);
    
    return context;

  } catch (error) {
    logger.error('Erro ao obter contexto:', error);
    return '';
  }
}

/**
 * Retorna conhecimento essencial sobre a plataforma OmniWA
 * Baseado na documentação oficial e central de ajuda
 * @returns {string} Conhecimento base sobre o OmniWA
 */
function getOmniWABaseKnowledge() {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 SOBRE A PLATAFORMA OMNIWA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 O QUE É?
OmniWA = Operação Omnichannel no WhatsApp
Site: omniwa-saas.web.app

Permite que lojistas vendam, atendam e recebam pagamentos diretamente por WhatsApp, através de um agente de IA integrado.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 MODELO DE NEGÓCIO - A MENOR TAXA DO MERCADO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ SEM MENSALIDADE FIXA
✅ SEM TAXA DE ADESÃO
✅ CONVERSAS ILIMITADAS
✅ PRODUTOS ILIMITADOS
✅ INTEGRAÇÕES ILIMITADAS

💳 TAXA: Apenas 3% por transação concluída
   → Você só paga quando vender
   → Sem vendas = Sem custos
   → Exemplo: Venda de R$ 100 = Você recebe R$ 97

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 RECURSOS E FUNCIONALIDADES PRINCIPAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 AGENTE DE IA DEDICADO
   • Treinado especificamente para o segmento do seu negócio
   • Atendimento automatizado 24 horas por dia, 7 dias por semana
   • Múltiplas conversas simultâneas (ilimitadas)
   • Contexto isolado para cada cliente

📱 WHATSAPP BUSINESS
   • Usa o PRÓPRIO número do lojista
   • Conexão via QR Code (30 segundos)
   • Cliente conversa com número que já conhece
   • Mensagens em tempo real
   • Reconexão automática se desconectar

💳 PAGAMENTOS INTEGRADOS
   • Checkout via Mercado Pago direto no WhatsApp
   • Link de pagamento enviado na conversa
   • Split automático de 3% para a plataforma
   • Recebimento: D+7 ou D+14 (conforme configuração da conta)

🔗 INTEGRAÇÕES EXTERNAS
   • ERP: Sincroniza gestão empresarial
   • PDV: Integra ponto de venda
   • Delivery: Conecta sistemas de entrega
   • Sincronização de catálogo, estoque, preços e pedidos
   • Múltiplas integrações simultâneas

🖨️ IMPRESSÃO AUTOMÁTICA
   • Pedido impresso automaticamente após confirmação
   • Compatível com impressoras térmicas (ESC/POS)
   • Geração de PDF para impressão comum

📊 DASHBOARD COMPLETO
   • Gestão de vendas e pedidos
   • Relatórios e métricas detalhadas
   • Histórico de conversas
   • Exportação de dados

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ FLUXO DE USO / ONBOARDING (5-10 MINUTOS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ CRIAR CONTA (1 minuto)
   • Cadastro rápido e gratuito
   • Escolher segmento do negócio
   • Definir credenciais

2️⃣ CONFIGURAR IA (3 minutos)
   • Inserir chave de API (OpenAI, Gemini ou Groq)
   • Personalizar tom de voz e comportamento
   • A plataforma NÃO cobra pela IA - você paga direto ao provedor

3️⃣ CONECTAR PAGAMENTO (1 minuto)
   • Mercado Pago
   • Inserir Access Token
   • Testar conexão

4️⃣ CONECTAR WHATSAPP (30 segundos)
   • Escanear QR Code
   • Conexão instantânea
   • Recomendado: WhatsApp Business (gratuito)

5️⃣ CADASTRAR PRODUTOS (variável)
   • Manual ou via importação
   • Integração com ERP (opcional)

6️⃣ COMEÇAR A VENDER! 🎉
   • IA ativada automaticamente
   • Operação 24/7 sem intervenção

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ BENEFÍCIOS E PROPOSTAS DE VALOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📲 TUDO NO WHATSAPP
   • Cliente não precisa sair do app
   • Venda, atendimento e pagamento integrados

🤖 ATENDIMENTO AUTOMATIZADO 24/7
   • Lojista não precisa estar disponível
   • Sem necessidade de atendentes
   • IA responde mesmo fora de horário

💰 REDUÇÃO DE CUSTOS
   • Sem mensalidade ou taxa fixa
   • Pague apenas quando vender (3%)
   • Controle total de custos

⚡ SIMPLIFICAÇÃO DO PROCESSO
   • Checkout via link
   • Split automático
   • Impressão automática
   • Tudo integrado

📈 ESCALABILIDADE ILIMITADA
   • Múltiplos produtos sem custo adicional
   • Conversas simultâneas ilimitadas
   • Cresce junto com seu negócio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 IDEAL PARA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Restaurantes e delivery
✅ Lojas de varejo
✅ Farmácias
✅ Pet shops
✅ Mercados e hortifrúti
✅ Serviços em geral
✅ Qualquer negócio que vende via WhatsApp

🚫 Não recomendado para:
   • Negócios que não aceitam pagamento online
   • Empresas sem presença no WhatsApp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 PROVEDORES DE IA SUPORTADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 OpenAI (GPT-4, GPT-3.5) - Mais usado
   • Melhor qualidade para atendimento
   • ~$0.03 por 1000 tokens (GPT-4)
   • ~$0.002 por 1000 tokens (GPT-3.5)

🧠 Google Gemini (Gemini Pro, Ultra)
   • Gratuito até certo limite
   • Depois pago por uso

🧠 Groq (Llama, Mixtral) - Mais rápido
   • Respostas instantâneas
   • Geralmente mais barato

💡 Custo médio: Centavos por atendimento

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 SUPORTE TÉCNICO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 WhatsApp: wa.me/5513996069536
📧 Email: suporte@omniwa.com.br
💬 Chat: Disponível no Dashboard
📚 Documentação: Central de Ajuda completa

⏱️ Tempo médio de resposta: 2-4 horas (horário comercial)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * FAQ detalhado para respostas rápidas
 * @returns {Object} Perguntas e respostas comuns
 */
function getFAQKnowledge() {
  return {
    mensalidade: "A OmniWA NÃO tem mensalidade. Você paga apenas 3% sobre vendas concluídas. Sem vendas = sem custos.",
    
    taxa: "Taxa de 3% por transação concluída. É a menor taxa do mercado. Exemplo: venda de R$ 100 = você recebe R$ 97.",
    
    limites: "Não há limites. Produtos ilimitados, conversas ilimitadas, integrações ilimitadas. Pague apenas 3% por venda.",
    
    tempo_setup: "5 a 10 minutos para configuração completa: 1min cadastro + 3min IA/pagamentos + 30s WhatsApp + cadastro de produtos.",
    
    whatsapp_pessoal: "Recomendamos WhatsApp Business (gratuito), mas pode usar pessoal. Business oferece catálogo, etiquetas e estatísticas.",
    
    celular_conectado: "Não precisa manter app aberto. Após escanear QR Code, sessão fica ativa. Recomendado manter celular ligado para estabilidade.",
    
    desconexao: "Reconexão automática. Se desconectar, sistema tenta reconectar sozinho. Mensagens ficam em fila. Você recebe notificação por email.",
    
    multiplas_lojas: "Sim. Cada loja é separada com próprio WhatsApp, catálogo e dashboard. Cada uma paga 3% sobre suas vendas.",
    
    cancelamento: "Pode cancelar quando quiser sem custos. Sem mensalidade = sem multa. Dados retidos 90 dias para reativação.",
    
    seguranca: "Criptografia AES-256, HTTPS obrigatório, backup diário, conformidade LGPD. Chaves de API criptografadas.",
    
    conversas_simultaneas: "Ilimitadas. IA gerencia centenas de conversas ao mesmo tempo. Cada uma mantém contexto isolado.",
    
    personalizar_ia: "Sim. Configure tom de voz, saudações, horário de funcionamento, políticas de entrega e promoções em Configurações → IA.",
    
    mercado_pago: "Insira Access Token em Configurações → Pagamentos. Use credenciais de PRODUÇÃO. Split de 3% automático.",
    
    prazo_recebimento: "D+7 ou D+14 conforme seu nível de conta no Mercado Pago. OmniWA não retém pagamento.",
    
    cliente_nao_paga: "Pedido fica 'Pendente'. Sem cobrança de taxa. Link expira em 24h. Pode reenviar manualmente. Taxa só cobrada se pagar.",
    
    integracoes: "ERP, PDV, Delivery, Estoque. Se tem API REST, pode integrar. Sincroniza catálogo, estoque, preços e pedidos.",
    
    custo_ia: "OmniWA não cobra pela IA. Você paga direto ao provedor: OpenAI ~$0.03/1k tokens (GPT-4), Gemini gratuito até limite, Groq mais barato.",
    
    intervencao_manual: "Sim. Pode assumir conversa a qualquer momento. Configure em Configurações → IA → Modo Manual.",
    
    backup: "Backup automático diário. Pode exportar manualmente: produtos (CSV/JSON), pedidos, transações, conversas em Configurações → Dados.",
  };
}

/**
 * Enriquece uma pergunta com conhecimento específico
 * @param {string} userQuestion - Pergunta do usuário
 * @param {string} intent - Intenção classificada ('prospeccao', 'suporte', 'geral')
 * @returns {Promise<Object>} Objeto com contexto e pergunta enriquecida
 */
async function enrichQuery(userQuestion, intent) {
  try {
    // Sempre inclui conhecimento base sobre OmniWA
    let fullContext = getOmniWABaseKnowledge();

    // Verifica se a pergunta corresponde a FAQ comum
    const faq = getFAQKnowledge();
    const questionLower = userQuestion.toLowerCase();
    
    for (const [key, answer] of Object.entries(faq)) {
      if (questionLower.includes(key) || 
          (key === 'mensalidade' && (questionLower.includes('cobr') || questionLower.includes('pag'))) ||
          (key === 'taxa' && questionLower.includes('%')) ||
          (key === 'whatsapp' && questionLower.includes('conectar'))) {
        fullContext += `\n\n💡 RESPOSTA DIRETA PARA SUA PERGUNTA:\n${answer}\n`;
        break;
      }
    }

    // Busca conhecimento específico baseado na intenção
    const categoryMap = {
      prospeccao: 'prospeccao',
      suporte: 'suporte',
      geral: null,
    };

    const category = categoryMap[intent] || null;
    const specificContext = await getContextForQuery(userQuestion, category);

    if (specificContext) {
      fullContext += '\n\n' + specificContext;
    }

    return {
      context: fullContext,
      enrichedQuery: userQuestion,
      hasSpecificKnowledge: specificContext.length > 0,
    };

  } catch (error) {
    logger.error('Erro ao enriquecer query:', error);
    return {
      context: getOmniWABaseKnowledge(),
      enrichedQuery: userQuestion,
      hasSpecificKnowledge: false,
    };
  }
}

/**
 * Extrai palavras-chave de uma pergunta
 * @param {string} text - Texto para extrair palavras-chave
 * @returns {Array<string>} Lista de palavras-chave
 */
function extractKeywords(text) {
  // Remove pontuação e converte para minúsculas
  const cleaned = text.toLowerCase().replace(/[^\w\sáàâãéèêíïóôõöúçñ]/g, '');
  
  // Remove stopwords comuns
  const stopwords = ['o', 'a', 'os', 'as', 'de', 'do', 'da', 'em', 'para', 'com', 'por', 'um', 'uma', 'e', 'é', 'ou', 'se', 'na', 'no', 'que', 'como', 'mais'];
  
  const words = cleaned.split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !stopwords.includes(word));

  // Remove duplicatas
  return [...new Set(words)];
}

/**
 * Calcula score de relevância de um documento
 * @param {Object} document - Documento da base
 * @param {string} query - Pergunta do usuário
 * @returns {number} Score de relevância (0 a 1)
 */
function calculateRelevanceScore(document, query) {
  const queryKeywords = extractKeywords(query);
  const docKeywords = extractKeywords(`${document.title} ${document.content} ${document.keywords || ''}`);

  // Conta quantas palavras-chave coincidem
  let matches = 0;
  for (const keyword of queryKeywords) {
    if (docKeywords.some(docKeyword => docKeyword.includes(keyword) || keyword.includes(docKeyword))) {
      matches++;
    }
  }

  // Calcula score normalizado
  return queryKeywords.length > 0 ? matches / queryKeywords.length : 0;
}

export {
  searchKnowledge,
  buildContext,
  getContextForQuery,
  getOmniWABaseKnowledge,
  getFAQKnowledge,
  enrichQuery,
  extractKeywords,
  calculateRelevanceScore
};

export default {
  searchKnowledge,
  buildContext,
  getContextForQuery,
  getOmniWABaseKnowledge,
  getFAQKnowledge,
  enrichQuery,
  extractKeywords,
  calculateRelevanceScore
};