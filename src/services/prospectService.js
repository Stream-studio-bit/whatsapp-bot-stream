// Convertido para ES Modules
/**
 * prospectService.js
 * Lógica de prospecção para o bot OmniWA
 * - Explicar plataforma
 * - Mostrar benefícios
 * - Guiar cadastro
 * - Responder perguntas comuns de interessados
 */

import groqClient from '../ai/groqClient.js';
import ragEngine from '../ai/ragEngine.js';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache do prompt de prospecção
let prospectPromptCache = null;

/**
 * Carrega o prompt de prospecção do arquivo
 * @returns {Promise<string>} Prompt formatado
 */
async function loadProspectPrompt() {
  try {
    if (prospectPromptCache) {
      return prospectPromptCache;
    }

    const promptPath = path.join(__dirname, '../ai/prompts/prospectPrompt.txt');
    prospectPromptCache = await fs.readFile(promptPath, 'utf-8');
    
    logger.debug('📋 Prompt de prospecção carregado');
    return prospectPromptCache;

  } catch (error) {
    logger.error('❌ Erro ao carregar prompt de prospecção:', error);
    
    // Fallback: prompt inline caso arquivo não exista
    return `
Você é um consultor comercial especializado da OmniWA, uma plataforma SaaS de vendas via WhatsApp.

MISSÃO: Apresentar a plataforma, mostrar benefícios e guiar interessados no processo de cadastro.

CARACTERÍSTICAS DA OMNIWA:
- 💰 SEM mensalidade fixa - apenas 3% por venda concluída
- 🤖 IA integrada para atendimento 24/7 automatizado
- 📱 WhatsApp Business conectado (número próprio do lojista)
- 💳 Pagamentos via Mercado Pago com split automático
- 🔗 Integrações com ERP, PDV, Delivery
- ⚡ Setup em 5-10 minutos
- 📊 Dashboard completo de gestão

DIFERENCIAIS:
✓ Menor taxa do mercado (3% vs 5-8% concorrência)
✓ Sem limites: produtos, conversas e integrações ilimitadas
✓ Você só paga quando vender
✓ Cliente não sai do WhatsApp para comprar

TOM DE VOZ:
- Consultivo e profissional
- Confiante mas nunca agressivo
- Foque em resolver dores do negócio
- Use dados concretos (taxa 3%, setup 5-10min)
- Seja objetivo e direto

FLUXO DE PROSPECÇÃO:
1. Identificar negócio e dores atuais
2. Apresentar solução específica para o segmento
3. Mostrar ROI e economia vs soluções tradicionais
4. Responder objeções com dados
5. Guiar para cadastro gratuito

OBJEÇÕES COMUNS E RESPOSTAS:
- "É caro?" → Sem mensalidade, paga só quando vender. 3% é a menor taxa do mercado.
- "É complicado?" → 5-10 minutos de setup. QR Code e pronto.
- "Já uso [concorrente]" → Compare: taxa menor, sem mensalidade, IA incluída.
- "E se não vender?" → Zero custo. Sem vendas = sem cobranças.

NUNCA:
- Forçar venda ou ser insistente
- Prometer resultados garantidos
- Falar mal da concorrência diretamente
- Dar informações técnicas incorretas

SEMPRE:
- Perguntar sobre o negócio do prospect
- Personalizar benefícios para o segmento dele
- Oferecer demonstração ou teste
- Deixar claro que cadastro é gratuito
- Fornecer link: omniwa-saas.web.app
- WhatsApp suporte: wa.me/5513996069536
`;
  }
}

/**
 * Processa mensagem de prospecção e gera resposta
 * @param {string} message - Mensagem do prospect
 * @param {Object} context - Contexto da conversa
 * @returns {Promise<string>} Resposta gerada
 */
async function handleProspectMessage(message, context = {}) {
  try {
    logger.info(`💼 Processando mensagem de prospecção: "${message.substring(0, 50)}..."`);

    // Carrega prompt base
    const systemPrompt = await loadProspectPrompt();

    // Enriquece com conhecimento específico via RAG
    const { context: ragContext } = await ragEngine.enrichQuery(message, 'prospeccao');

    // Monta histórico da conversa se existir
    let conversationHistory = '';
    if (context.history && context.history.length > 0) {
      conversationHistory = '\n\nHISTÓRICO DA CONVERSA:\n';
      context.history.forEach(msg => {
        conversationHistory += `${msg.role === 'user' ? 'Prospect' : 'Você'}: ${msg.content}\n`;
      });
    }

    // Adiciona informações do prospect se disponíveis
    let prospectInfo = '';
    if (context.prospectData) {
      prospectInfo = '\n\nINFORMAÇÕES DO PROSPECT:\n';
      if (context.prospectData.name) prospectInfo += `Nome: ${context.prospectData.name}\n`;
      if (context.prospectData.business) prospectInfo += `Negócio: ${context.prospectData.business}\n`;
      if (context.prospectData.segment) prospectInfo += `Segmento: ${context.prospectData.segment}\n`;
      if (context.prospectData.currentSolution) prospectInfo += `Solução atual: ${context.prospectData.currentSolution}\n`;
    }

    // Monta mensagem completa para a IA
    const fullPrompt = `${systemPrompt}\n\n${ragContext}${prospectInfo}${conversationHistory}`;

    // Chama IA para gerar resposta
    const response = await groqClient.chat(fullPrompt, message);

    logger.info('✅ Resposta de prospecção gerada com sucesso');
    return response;

  } catch (error) {
    logger.error('❌ Erro ao processar mensagem de prospecção:', error);
    throw error;
  }
}

/**
 * Identifica estágio do prospect no funil
 * @param {string} message - Mensagem do prospect
 * @param {Object} context - Contexto da conversa
 * @returns {string} Estágio identificado
 */
function identifyProspectStage(message, context = {}) {
  const messageLower = message.toLowerCase();

  // Estágio 1: Descoberta (primeira interação)
  if (!context.stage || context.messageCount <= 2) {
    return 'discovery';
  }

  // Estágio 2: Interesse (fazendo perguntas)
  const interestKeywords = ['como funciona', 'quanto custa', 'taxa', 'preço', 'planos', 'funcionalidades'];
  if (interestKeywords.some(kw => messageLower.includes(kw))) {
    return 'interest';
  }

  // Estágio 3: Consideração (comparando, objeções)
  const considerationKeywords = ['mas', 'porém', 'já uso', 'diferença', 'comparar', 'melhor que'];
  if (considerationKeywords.some(kw => messageLower.includes(kw))) {
    return 'consideration';
  }

  // Estágio 4: Decisão (pronto para cadastrar)
  const decisionKeywords = ['cadastr', 'comec', 'quero', 'como faço', 'registr', 'criar conta'];
  if (decisionKeywords.some(kw => messageLower.includes(kw))) {
    return 'decision';
  }

  // Estágio 5: Conversão (pediu link, está cadastrando)
  const conversionKeywords = ['link', 'site', 'endereço', 'url', 'cadastrei', 'registrei'];
  if (conversionKeywords.some(kw => messageLower.includes(kw))) {
    return 'conversion';
  }

  // Padrão: continua no estágio atual ou volta para interesse
  return context.stage || 'interest';
}

/**
 * Gera resposta personalizada por estágio do funil
 * @param {string} stage - Estágio do prospect
 * @param {Object} prospectData - Dados do prospect
 * @returns {Object} Sugestões de resposta
 */
function getStageGuidance(stage, prospectData = {}) {
  const guidance = {
    discovery: {
      focus: 'Entender o negócio e identificar dores',
      questions: [
        'Qual é o seu tipo de negócio?',
        'Como você vende hoje via WhatsApp?',
        'Quais são seus maiores desafios no atendimento?',
      ],
      objective: 'Coletar informações e qualificar prospect',
    },

    interest: {
      focus: 'Apresentar solução e benefícios específicos',
      highlights: [
        'Taxa de apenas 3% (menor do mercado)',
        'Sem mensalidade fixa - paga só quando vender',
        'IA atende 24/7 automaticamente',
        'Setup em 5-10 minutos',
      ],
      objective: 'Mostrar valor e diferenciais',
    },

    consideration: {
      focus: 'Superar objeções e comparar com alternativas',
      tactics: [
        'Usar dados concretos (economia vs concorrência)',
        'Casos de sucesso do segmento',
        'Demonstração ou teste gratuito',
        'Garantia sem risco (sem mensalidade)',
      ],
      objective: 'Eliminar barreiras e dúvidas',
    },

    decision: {
      focus: 'Facilitar ação e guiar cadastro',
      actions: [
        'Enviar link de cadastro: omniwa-saas.web.app',
        'Explicar passo a passo do onboarding',
        'Oferecer suporte durante configuração',
        'Mencionar WhatsApp de suporte: wa.me/5513996069536',
      ],
      objective: 'Converter em usuário cadastrado',
    },

    conversion: {
      focus: 'Garantir sucesso na implementação',
      actions: [
        'Acompanhar setup passo a passo',
        'Resolver dúvidas técnicas',
        'Garantir primeira venda bem-sucedida',
        'Solicitar feedback',
      ],
      objective: 'Ativar e reter novo cliente',
    },
  };

  return guidance[stage] || guidance.interest;
}

/**
 * Extrai informações do prospect da conversa
 * @param {string} message - Mensagem do prospect
 * @param {Object} currentData - Dados atuais do prospect
 * @returns {Object} Dados atualizados
 */
function extractProspectData(message, currentData = {}) {
  const messageLower = message.toLowerCase();
  const extracted = { ...currentData };

  // Identifica segmento de negócio
  const segments = {
    restaurante: ['restaurante', 'comida', 'delivery', 'lanchonete', 'pizzaria'],
    varejo: ['loja', 'varejo', 'comércio', 'boutique', 'magazine'],
    farmacia: ['farmácia', 'drogaria', 'medicamento'],
    pet: ['pet', 'animais', 'veterinário', 'ração'],
    mercado: ['mercado', 'supermercado', 'hortifruti', 'açougue'],
    servico: ['serviço', 'prestador', 'consultoria', 'manutenção'],
  };

  for (const [segment, keywords] of Object.entries(segments)) {
    if (keywords.some(kw => messageLower.includes(kw))) {
      extracted.segment = segment;
      break;
    }
  }

  // Identifica soluções atuais
  const solutions = ['ifood', 'rappi', 'uber eats', 'whatsapp', 'instagram', 'site'];
  for (const solution of solutions) {
    if (messageLower.includes(solution)) {
      extracted.currentSolution = extracted.currentSolution || [];
      if (!extracted.currentSolution.includes(solution)) {
        extracted.currentSolution.push(solution);
      }
    }
  }

  // Identifica dores mencionadas
  const pains = {
    custo: ['caro', 'taxa alta', 'mensalidade', 'custa muito'],
    atendimento: ['atender', 'responder', 'disponível', 'horário'],
    pagamento: ['pagamento', 'receber', 'cobrar', 'pix'],
    gestao: ['organizar', 'controlar', 'gerenciar', 'pedidos'],
  };

  for (const [pain, keywords] of Object.entries(pains)) {
    if (keywords.some(kw => messageLower.includes(kw))) {
      extracted.pains = extracted.pains || [];
      if (!extracted.pains.includes(pain)) {
        extracted.pains.push(pain);
      }
    }
  }

  // Detecta urgência
  const urgencyKeywords = ['urgente', 'rápido', 'agora', 'hoje', 'imediato'];
  if (urgencyKeywords.some(kw => messageLower.includes(kw))) {
    extracted.urgency = 'high';
  }

  return extracted;
}

/**
 * Gera resposta rápida para perguntas frequentes
 * @param {string} message - Mensagem do prospect
 * @returns {string|null} Resposta rápida ou null
 */
function getQuickResponse(message) {
  const messageLower = message.toLowerCase();

  // Preço/Taxa
  if (messageLower.includes('quanto cust') || messageLower.includes('preço') || messageLower.includes('taxa')) {
    return '💰 *Modelo de cobrança transparente:*\n\n' +
           '✅ SEM mensalidade fixa\n' +
           '✅ SEM taxa de adesão\n' +
           '✅ Apenas 3% por venda concluída\n\n' +
           '📊 Exemplo: vendeu R$ 100 = você recebe R$ 97\n\n' +
           'Sem vendas = sem custos! Você só paga quando realmente vender. 🎯';
  }

  // Tempo de setup
  if (messageLower.includes('quanto tempo') || messageLower.includes('demora')) {
    return '⚡ *Setup super rápido - 5 a 10 minutos:*\n\n' +
           '1️⃣ Cadastro: 1 minuto\n' +
           '2️⃣ Configurar IA: 3 minutos\n' +
           '3️⃣ Conectar pagamento: 1 minuto\n' +
           '4️⃣ Conectar WhatsApp: 30 segundos\n' +
           '5️⃣ Cadastrar produtos: conforme quantidade\n\n' +
           '✅ Pronto! Já pode começar a vender!';
  }

  // Como funciona
  if (messageLower.includes('como funciona')) {
    return '🔄 *Funcionamento simples:*\n\n' +
           '1. Cliente envia mensagem no seu WhatsApp\n' +
           '2. IA atende automaticamente 24/7\n' +
           '3. Cliente escolhe produtos e fecha pedido\n' +
           '4. Sistema gera link de pagamento (Mercado Pago)\n' +
           '5. Cliente paga direto no WhatsApp\n' +
           '6. Pedido é confirmado e impresso automaticamente\n' +
           '7. Você recebe o valor (menos 3%) em D+7 ou D+14\n\n' +
           '🎯 Tudo automático, sem você precisar intervir!';
  }

  // Link de cadastro
  if (messageLower.includes('cadastr') || messageLower.includes('criar conta') || messageLower.includes('registr')) {
    return '🚀 *Vamos começar!*\n\n' +
           'Acesse: https://omniwa-saas.web.app\n\n' +
           '✅ Cadastro gratuito\n' +
           '✅ Setup guiado\n' +
           '✅ Suporte completo\n\n' +
           'Após cadastrar, eu te ajudo com qualquer dúvida!\n\n' +
           '📱 WhatsApp suporte: https://wa.me/5513996069536';
  }

  return null;
}

/**
 * Formata resposta de prospecção com CTAs apropriados
 * @param {string} response - Resposta base da IA
 * @param {string} stage - Estágio do prospect
 * @returns {string} Resposta formatada com CTA
 */
function formatProspectResponse(response, stage) {
  let formattedResponse = response;

  // Adiciona CTA específico por estágio
  const ctas = {
    discovery: '\n\n💬 Me conta mais sobre seu negócio para eu poder te ajudar melhor!',
    interest: '\n\n✨ Quer saber mais sobre alguma funcionalidade específica?',
    consideration: '\n\n🎯 Posso te mostrar como seria no seu caso específico. Qual sua maior dúvida?',
    decision: '\n\n🚀 Pronto para começar? Te envio o link de cadastro e te acompanho no setup!',
    conversion: '\n\n💪 Estou aqui para garantir que tudo funcione perfeitamente! Como posso ajudar?',
  };

  if (ctas[stage]) {
    formattedResponse += ctas[stage];
  }

  return formattedResponse;
}

/**
 * Avalia qualificação do prospect (lead scoring)
 * @param {Object} prospectData - Dados do prospect
 * @param {Object} context - Contexto da conversa
 * @returns {Object} Score e classificação
 */
function scoreProspect(prospectData, context) {
  let score = 0;
  const factors = [];

  // Segmento identificado (+20)
  if (prospectData.segment) {
    score += 20;
    factors.push('Segmento identificado');
  }

  // Dores claras (+15)
  if (prospectData.pains && prospectData.pains.length > 0) {
    score += 15;
    factors.push(`${prospectData.pains.length} dor(es) identificada(s)`);
  }

  // Engajamento alto (+25)
  if (context.messageCount >= 5) {
    score += 25;
    factors.push('Alto engajamento');
  }

  // Perguntas sobre preço/cadastro (+20)
  if (context.askedAboutPricing || context.askedAboutSignup) {
    score += 20;
    factors.push('Interesse em contratar');
  }

  // Urgência alta (+10)
  if (prospectData.urgency === 'high') {
    score += 10;
    factors.push('Urgência detectada');
  }

  // Conhece solução atual (+10)
  if (prospectData.currentSolution && prospectData.currentSolution.length > 0) {
    score += 10;
    factors.push('Usa soluções similares');
  }

  // Classificação
  let classification;
  if (score >= 80) classification = 'hot';
  else if (score >= 50) classification = 'warm';
  else if (score >= 30) classification = 'cold';
  else classification = 'unqualified';

  return {
    score,
    classification,
    factors,
    recommendation: getRecommendationByScore(classification),
  };
}

/**
 * Recomendação de ação baseada no score
 * @param {string} classification - Classificação do lead
 * @returns {string} Recomendação
 */
function getRecommendationByScore(classification) {
  const recommendations = {
    hot: 'Priorizar! Enviar link de cadastro imediatamente e oferecer suporte premium.',
    warm: 'Nutrir com mais informações e casos de sucesso. Superar objeções.',
    cold: 'Continuar educando sobre benefícios. Identificar dores mais claramente.',
    unqualified: 'Qualificar melhor: segmento, necessidades, orçamento.',
  };

  return recommendations[classification] || recommendations.cold;
}

export {
  handleProspectMessage,
  identifyProspectStage,
  getStageGuidance,
  extractProspectData,
  getQuickResponse,
  formatProspectResponse,
  scoreProspect
};