// Convertido para ES Modules
/**
 * supportService.js
 * Lógica de suporte técnico para o bot OmniWA
 * - Ajudar lojista a configurar tudo
 * - Conectar WhatsApp
 * - Definir segmentação
 * - Inserir chave de IA
 * - Gerenciar catálogo
 * - Resolver problemas técnicos
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

// Cache do prompt de suporte
let supportPromptCache = null;

/**
 * Carrega o prompt de suporte do arquivo
 * @returns {Promise<string>} Prompt formatado
 */
async function loadSupportPrompt() {
  try {
    if (supportPromptCache) {
      return supportPromptCache;
    }

    const promptPath = path.join(__dirname, '../ai/prompts/supportPrompt.txt');
    supportPromptCache = await fs.readFile(promptPath, 'utf-8');
    
    logger.debug('📋 Prompt de suporte carregado');
    return supportPromptCache;

  } catch (error) {
    logger.error('❌ Erro ao carregar prompt de suporte:', error);
    
    // Fallback: prompt inline caso arquivo não exista
    return `
Você é um especialista em suporte técnico da OmniWA, focado em ajudar lojistas a configurar e usar a plataforma.

MISSÃO: Resolver problemas, guiar configurações e garantir que o lojista tenha sucesso com a plataforma.

ÁREAS DE SUPORTE:

1️⃣ ONBOARDING E CONFIGURAÇÃO INICIAL
   - Criar conta e escolher segmento
   - Inserir chave de API da IA (OpenAI, Gemini, Groq)
   - Conectar Mercado Pago (Access Token)
   - Conectar WhatsApp via QR Code
   - Configurações básicas

2️⃣ WHATSAPP
   - Como conectar: Dashboard → WhatsApp → Escanear QR Code
   - Diferença: WhatsApp Business vs Pessoal (recomendado Business)
   - Reconexão automática se desconectar
   - Mensagens em fila se offline temporariamente
   - Não precisa manter app aberto após QR Code
   - Manter celular ligado para estabilidade

3️⃣ INTELIGÊNCIA ARTIFICIAL
   - Provedores: OpenAI (GPT-4, GPT-3.5), Google Gemini, Groq
   - Onde conseguir chave API:
     * OpenAI: platform.openai.com/api-keys
     * Gemini: ai.google.dev
     * Groq: console.groq.com
   - Configurar tom de voz e comportamento
   - Personalizar saudações e despedidas
   - Definir horário de funcionamento
   - OmniWA NÃO cobra pela IA - lojista paga direto ao provedor
   - Custo médio: centavos por atendimento

4️⃣ PAGAMENTOS (MERCADO PAGO)
   - Como conectar: Dashboard → Pagamentos → Inserir Access Token
   - Onde conseguir token: mercadopago.com.br/developers
   - Usar credenciais de PRODUÇÃO (não teste)
   - Split automático de 3% para plataforma
   - Recebimento: D+7 ou D+14 (conforme conta Mercado Pago)
   - OmniWA não retém pagamento
   - Testar conexão após configurar

5️⃣ CATÁLOGO DE PRODUTOS
   - Cadastro manual: Dashboard → Produtos → Adicionar
   - Importação em lote: CSV ou API
   - Campos: nome, descrição, preço, estoque, imagem, categoria
   - Produtos ilimitados sem custo adicional
   - Sincronização com ERP/PDV (se integrado)
   - Edição e desativação de produtos

6️⃣ INTEGRAÇÕES EXTERNAS
   - ERP: Sincroniza gestão empresarial
   - PDV: Integra ponto de venda
   - Delivery: Conecta sistemas de entrega
   - Sincronização automática de catálogo, estoque, preços
   - Dashboard → Integrações → Configurar API

7️⃣ GESTÃO E DASHBOARD
   - Acompanhar vendas e pedidos em tempo real
   - Relatórios e métricas detalhadas
   - Histórico completo de conversas
   - Exportação de dados (CSV, JSON)
   - Configurações de notificações

8️⃣ IMPRESSÃO AUTOMÁTICA
   - Configurar impressora térmica (ESC/POS)
   - Gerar PDF para impressão comum
   - Pedido impresso automaticamente após confirmação
   - Dashboard → Configurações → Impressão

9️⃣ PROBLEMAS COMUNS E SOLUÇÕES

   🔴 WhatsApp desconectando:
   - Verificar se celular está ligado e com internet
   - Não usar mesmo número em outro dispositivo
   - Reconectar via QR Code no Dashboard
   - Reconexão automática ativa

   🔴 IA não respondendo:
   - Verificar se chave API está válida
   - Conferir saldo/créditos no provedor
   - Testar chave no dashboard
   - Verificar logs de erro

   🔴 Pagamento não funcionando:
   - Confirmar Access Token de PRODUÇÃO
   - Verificar se conta Mercado Pago está ativa
   - Testar conexão no Dashboard
   - Conferir se split está configurado

   🔴 Produtos não aparecem:
   - Verificar se produtos estão ativos
   - Conferir estoque disponível
   - Limpar cache do WhatsApp
   - Ressincronizar catálogo

   🔴 Cliente não recebe mensagem:
   - Verificar se WhatsApp está conectado
   - Cliente pode ter bloqueado o número
   - Verificar se número está correto (com DDI +55)
   - Checar fila de mensagens no Dashboard

TOM DE VOZ:
- Paciente e didático
- Técnico mas acessível
- Passo a passo claro
- Empático com dificuldades
- Proativo em antecipar problemas

FORMATO DE RESPOSTA:
- Use emojis para organizar visualmente
- Divida em passos numerados quando for tutorial
- Ofereça alternativas quando possível
- Sempre pergunte se resolveu ou se precisa de mais ajuda
- Se não souber, seja honesto e escale para suporte humano

NUNCA:
- Culpar o lojista pelo erro
- Dar informações técnicas incorretas
- Prometer funcionalidades que não existem
- Ignorar problemas recorrentes

SEMPRE:
- Validar cada passo da configuração
- Oferecer ajuda adicional
- Documentar problemas para melhorias
- Fornecer links relevantes da documentação
- Mencionar suporte humano quando necessário

LINKS ÚTEIS:
- Dashboard: omniwa-saas.web.app
- WhatsApp suporte: wa.me/5513996069536
- Documentação: Central de Ajuda no Dashboard
- Email: suporte@omniwa.com.br

ESCALAÇÃO PARA SUPORTE HUMANO:
- Problemas técnicos complexos não resolvidos
- Bugs ou erros do sistema
- Questões financeiras (pagamentos, cobranças)
- Solicitações especiais ou customizações
- Após 3 tentativas sem sucesso
`;
  }
}

/**
 * Processa mensagem de suporte e gera resposta
 * @param {string} message - Mensagem do lojista
 * @param {Object} context - Contexto da conversa
 * @returns {Promise<string>} Resposta gerada
 */
async function handleSupportMessage(message, context = {}) {
  try {
    logger.info(`🛠️ Processando mensagem de suporte: "${message.substring(0, 50)}..."`);

    // Carrega prompt base
    const systemPrompt = await loadSupportPrompt();

    // Enriquece com conhecimento específico via RAG
    const { context: ragContext } = await ragEngine.enrichQuery(message, 'suporte');

    // Monta histórico da conversa se existir
    let conversationHistory = '';
    if (context.history && context.history.length > 0) {
      conversationHistory = '\n\nHISTÓRICO DA CONVERSA:\n';
      context.history.forEach(msg => {
        conversationHistory += `${msg.role === 'user' ? 'Lojista' : 'Você'}: ${msg.content}\n`;
      });
    }

    // Adiciona informações do lojista se disponíveis
    let userInfo = '';
    if (context.userData) {
      userInfo = '\n\nINFORMAÇÕES DO LOJISTA:\n';
      if (context.userData.name) userInfo += `Nome: ${context.userData.name}\n`;
      if (context.userData.business) userInfo += `Negócio: ${context.userData.business}\n`;
      if (context.userData.segment) userInfo += `Segmento: ${context.userData.segment}\n`;
      if (context.userData.setupStage) userInfo += `Etapa do setup: ${context.userData.setupStage}\n`;
    }

    // Identifica se é problema recorrente
    let recurrentIssue = '';
    if (context.issueCount && context.issueCount > 2) {
      recurrentIssue = `\n\n⚠️ ATENÇÃO: Este é o ${context.issueCount}º contato sobre problema similar. Considere escalar para suporte humano.\n`;
    }

    // Monta mensagem completa para a IA
    const fullPrompt = `${systemPrompt}\n\n${ragContext}${userInfo}${conversationHistory}${recurrentIssue}`;

    // Chama IA para gerar resposta
    const response = await groqClient.chat(fullPrompt, message);

    logger.info('✅ Resposta de suporte gerada com sucesso');
    return response;

  } catch (error) {
    logger.error('❌ Erro ao processar mensagem de suporte:', error);
    throw error;
  }
}

/**
 * Identifica tipo de problema/dúvida
 * @param {string} message - Mensagem do lojista
 * @returns {string} Categoria do problema
 */
function identifyIssueCategory(message) {
  const messageLower = message.toLowerCase();

  // Categorias de problemas com palavras-chave
  const categories = {
    whatsapp_connection: ['whatsapp', 'desconect', 'qr code', 'conectar', 'offline', 'reconectar'],
    ai_configuration: ['ia', 'inteligência', 'chave', 'api', 'groq', 'openai', 'gemini', 'responde', 'atende'],
    payment_setup: ['pagamento', 'mercado pago', 'token', 'access token', 'pix', 'receber', 'cobrar'],
    catalog_management: ['produto', 'catálogo', 'estoque', 'preço', 'imagem', 'cadastrar', 'importar'],
    integration: ['integr', 'erp', 'pdv', 'delivery', 'api', 'sincroniz'],
    printing: ['impress', 'pdf', 'térmica', 'cupom', 'pedido'],
    dashboard: ['dashboard', 'painel', 'relatório', 'dados', 'exportar', 'métrica'],
    message_delivery: ['mensagem', 'não chegou', 'não recebe', 'enviar', 'fila'],
    billing: ['cobrança', 'taxa', 'fatura', 'pagou', 'quanto', 'valor', 'custo'],
    account: ['conta', 'senha', 'login', 'acesso', 'cadastro', 'email'],
  };

  // Identifica categoria por palavras-chave
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => messageLower.includes(kw))) {
      return category;
    }
  }

  return 'general';
}

/**
 * Identifica etapa do setup em que o lojista está
 * @param {string} message - Mensagem do lojista
 * @param {Object} context - Contexto
 * @returns {string} Etapa do setup
 */
function identifySetupStage(message, context = {}) {
  const messageLower = message.toLowerCase();

  const stages = {
    account_creation: ['criar conta', 'cadastr', 'registr', 'começar', 'iniciar'],
    whatsapp_connection: ['conectar whatsapp', 'qr code', 'escanear'],
    ai_setup: ['configurar ia', 'chave api', 'groq', 'openai', 'gemini'],
    payment_config: ['mercado pago', 'pagamento', 'access token'],
    catalog_setup: ['produtos', 'catálogo', 'cadastrar produtos'],
    first_sale: ['primeira venda', 'testar', 'funcionando'],
    complete: ['pronto', 'funcionando', 'tudo certo'],
  };

  for (const [stage, keywords] of Object.entries(stages)) {
    if (keywords.some(kw => messageLower.includes(kw))) {
      return stage;
    }
  }

  return context.setupStage || 'unknown';
}

/**
 * Retorna guia passo a passo para tópicos específicos
 * @param {string} topic - Tópico do guia
 * @returns {string|null} Guia formatado ou null
 */
function getStepByStepGuide(topic) {
  const guides = {
    whatsapp_setup: `
📱 *CONECTAR WHATSAPP - PASSO A PASSO*

1️⃣ Acesse: Dashboard → WhatsApp
2️⃣ Clique "Conectar WhatsApp"
3️⃣ QR Code aparecerá na tela
4️⃣ No seu celular:
   • Abra WhatsApp
   • Menu (⋮) → Aparelhos conectados
   • Toque "Conectar aparelho"
   • Escaneie o QR Code

5️⃣ ✅ Pronto! WhatsApp conectado!

⚠️ *IMPORTANTE:*
   • Use WhatsApp Business de preferência
   • Mantenha celular ligado
   • Não use mesmo número em outro lugar
   • Reconexão automática ativada

💡 Não precisa manter app aberto depois!
`,

    ai_setup: `
🤖 *CONFIGURAR IA - PASSO A PASSO*

*OPÇÃO 1: GROQ (RECOMENDADO - GRÁTIS)*

1️⃣ Acesse: console.groq.com
2️⃣ Crie conta gratuita
3️⃣ Vá em "API Keys"
4️⃣ Clique "Create API Key"
5️⃣ Copie a chave gerada
6️⃣ No Dashboard OmniWA:
   • IA → Configurar
   • Cole a chave
   • Escolha modelo: llama-3.1-70b
   • Salve e Teste

*OPÇÃO 2: OPENAI (GPT-4)*

1️⃣ Acesse: platform.openai.com
2️⃣ Crie conta e adicione créditos
3️⃣ API Keys → Create new key
4️⃣ Copie a chave
5️⃣ No Dashboard OmniWA:
   • Cole a chave
   • Escolha: gpt-4 ou gpt-3.5
   • Salve e Teste

*OPÇÃO 3: GOOGLE GEMINI*

1️⃣ Acesse: ai.google.dev
2️⃣ Get API Key
3️⃣ Cole no Dashboard OmniWA
4️⃣ Modelo: gemini-pro
5️⃣ Salve e Teste

💰 *CUSTOS:*
   • Groq: GRATUITO
   • OpenAI: ~$0.002/atendimento
   • Gemini: ~$0.001/atendimento

✅ OmniWA não cobra pela IA!
`,

    payment_setup: `
💳 *MERCADO PAGO - PASSO A PASSO*

1️⃣ Acesse: mercadopago.com.br/developers
2️⃣ Faça login na sua conta
3️⃣ Vá em "Suas integrações"
4️⃣ Crie nova aplicação
5️⃣ Acesse "Credenciais"
6️⃣ Copie "Access Token de PRODUÇÃO"
   ⚠️ NÃO use token de teste!

7️⃣ No Dashboard OmniWA:
   • Pagamentos → Configurar
   • Cole Access Token
   • Split: 3% (automático)
   • Clique "Testar Conexão"
   • Se OK, clique "Salvar"

8️⃣ ✅ Pronto! Pagamentos ativos!

💰 *RECEBIMENTO:*
   • Venda aprovada → Valor vai para sua conta MP
   • 3% retido automaticamente
   • Você recebe 97% em D+7 ou D+14
   • Conforme configuração da sua conta MP

🔒 *SEGURANÇA:*
   • Token criptografado
   • Transações seguras
   • Conforme PCI-DSS
`,

    catalog_setup: `
📦 *CADASTRAR PRODUTOS - PASSO A PASSO*

*MÉTODO 1: CADASTRO MANUAL*

1️⃣ Acesse: Dashboard → Produtos
2️⃣ Clique "Adicionar Produto"
3️⃣ Preencha:
   • Nome do produto
   • Descrição detalhada
   • Preço (em R$)
   • Estoque disponível
   • Categoria
   • Upload de imagem (opcional)
4️⃣ Clique "Salvar"
5️⃣ Produto ativo imediatamente!

*MÉTODO 2: IMPORTAÇÃO EM LOTE*

1️⃣ Prepare planilha CSV com colunas:
   • nome
   • descricao
   • preco
   • estoque
   • categoria
   • url_imagem

2️⃣ No Dashboard: Produtos → Importar
3️⃣ Faça upload do arquivo CSV
4️⃣ Revise e confirme
5️⃣ ✅ Todos importados!

*MÉTODO 3: INTEGRAÇÃO API*

1️⃣ Se você tem ERP/PDV:
   • Dashboard → Integrações
   • Escolha seu sistema
   • Configure API
   • Sincronização automática!

📝 *DICAS:*
   • Descrições claras aumentam vendas
   • Imagens melhoram conversão
   • Mantenha estoque atualizado
   • Organize por categorias
   • Produtos ilimitados sem custo!

✏️ *EDITAR/EXCLUIR:*
   • Dashboard → Produtos
   • Clique no produto
   • Edite ou desative
   • Mudanças imediatas no WhatsApp
`,
  };

  return guides[topic] || null;
}

/**
 * Gera resposta rápida para problemas comuns
 * @param {string} category - Categoria do problema
 * @returns {string|null} Resposta rápida ou null
 */
function getQuickSolution(category) {
  const solutions = {
    whatsapp_connection: `
🔴 *WHATSAPP DESCONECTANDO?*

✅ *SOLUÇÕES RÁPIDAS:*

1. Verificar internet no celular
2. Manter celular ligado
3. Não usar número em outro lugar
4. Reconectar via QR Code

📱 *RECONECTAR AGORA:*
Dashboard → WhatsApp → Escanear novo QR Code

💡 Sistema tenta reconectar automaticamente!
`,

    ai_configuration: `
🤖 *IA NÃO ESTÁ RESPONDENDO?*

✅ *CHECKLIST:*

□ Chave API válida?
□ Provedor tem saldo/créditos?
□ Testou conexão no Dashboard?
□ Verificou logs de erro?

🔧 *TESTAR AGORA:*
Dashboard → IA → Testar Conexão

Se erro persistir, envie print do erro!
`,

    payment_setup: `
💳 *PAGAMENTO NÃO FUNCIONA?*

✅ *VERIFICAR:*

□ Access Token de PRODUÇÃO?
□ Conta Mercado Pago ativa?
□ Testou conexão no Dashboard?
□ Split configurado corretamente?

🔧 *RECONFIGURAR:*
Dashboard → Pagamentos → Testar e Salvar

💡 Se continuar, entre em contato com suporte!
`,
  };

  return solutions[category] || null;
}

/**
 * Detecta se deve escalar para suporte humano
 * @param {string} message - Mensagem do lojista
 * @param {Object} context - Contexto da conversa
 * @returns {Object} Indicação de escalação
 */
function shouldEscalateToHuman(message, context = {}) {
  const messageLower = message.toLowerCase();
  let shouldEscalate = false;
  let reason = '';

  // Palavras indicando frustração
  const frustrationKeywords = ['não funciona', 'não resolve', 'já tentei', 'não aguento', 'péssimo', 'horrível'];
  if (frustrationKeywords.some(kw => messageLower.includes(kw))) {
    shouldEscalate = true;
    reason = 'Cliente demonstrando frustração';
  }

  // Pedido explícito para falar com humano
  if (messageLower.includes('falar com atendente') || 
      messageLower.includes('humano') || 
      messageLower.includes('pessoa real')) {
    shouldEscalate = true;
    reason = 'Solicitação explícita de atendimento humano';
  }

  // Problema recorrente
  if (context.issueCount && context.issueCount >= 3) {
    shouldEscalate = true;
    reason = 'Problema recorrente (3+ tentativas)';
  }

  // Questões financeiras sensíveis
  const financialKeywords = ['cobr indevida', 'estorno', 'reembolso', 'não recebi', 'valor errado'];
  if (financialKeywords.some(kw => messageLower.includes(kw))) {
    shouldEscalate = true;
    reason = 'Questão financeira sensível';
  }

  // Bug crítico do sistema
  const criticalKeywords = ['tudo quebrado', 'não funciona nada', 'erro crítico', 'bug grave'];
  if (criticalKeywords.some(kw => messageLower.includes(kw))) {
    shouldEscalate = true;
    reason = 'Possível bug crítico do sistema';
  }

  return {
    shouldEscalate,
    reason,
    message: shouldEscalate ? getEscalationMessage(reason) : null,
  };
}

/**
 * Gera mensagem de escalação para suporte humano
 * @param {string} reason - Motivo da escalação
 * @returns {string} Mensagem formatada
 */
function getEscalationMessage(reason) {
  return `
🚨 *ENCAMINHANDO PARA SUPORTE ESPECIALIZADO*

Entendo sua situação e vou te conectar com nossa equipe humana para resolver isso rapidamente.

📱 *SUPORTE DIRETO:*
WhatsApp: https://wa.me/5513996069536

📧 *EMAIL:*
suporte@omniwa.com.br

⏰ *HORÁRIO:*
Segunda a Sexta: 9h às 18h
Tempo médio de resposta: 2-4 horas

💬 *O QUE FAZER:*
1. Entre em contato pelos canais acima
2. Explique o problema detalhadamente
3. Envie prints se possível
4. Mencione este atendimento

🙏 Desculpe pelo transtorno. Nossa equipe vai te ajudar!

Motivo: ${reason}
`;
}

/**
 * Avalia satisfação do cliente com a solução
 * @param {string} message - Mensagem do lojista
 * @returns {string} Nível de satisfação
 */
function evaluateSatisfaction(message) {
  const messageLower = message.toLowerCase();

  // Muito satisfeito
  const veryHappyKeywords = ['perfeito', 'excelente', 'ótimo', 'maravilhoso', 'resolveu', 'funcionou', 'obrigado'];
  if (veryHappyKeywords.some(kw => messageLower.includes(kw))) {
    return 'very_satisfied';
  }

  // Satisfeito
  const happyKeywords = ['ok', 'certo', 'entendi', 'vou tentar', 'valeu'];
  if (happyKeywords.some(kw => messageLower.includes(kw))) {
    return 'satisfied';
  }

  // Insatisfeito
  const unhappyKeywords = ['não resolveu', 'continua', 'ainda', 'mas', 'porém', 'não funciona'];
  if (unhappyKeywords.some(kw => messageLower.includes(kw))) {
    return 'unsatisfied';
  }

  // Neutro
  return 'neutral';
}

/**
 * Formata resposta de suporte com próximos passos
 * @param {string} response - Resposta base da IA
 * @param {string} category - Categoria do problema
 * @returns {string} Resposta formatada
 */
function formatSupportResponse(response, category) {
  let formattedResponse = response;

  // Adiciona guia específico se disponível
  const guide = getStepByStepGuide(category);
  if (guide) {
    formattedResponse += `\n\n${guide}`;
  }

  // Adiciona pergunta de follow-up
  formattedResponse += '\n\n❓ Conseguiu resolver? Precisa de mais alguma ajuda?';

  return formattedResponse;
}

export {
  handleSupportMessage,
  identifyIssueCategory,
  identifySetupStage,
  getStepByStepGuide,
  getQuickSolution,
  shouldEscalateToHuman,
  evaluateSatisfaction,
  formatSupportResponse
};