// src/controllers/commandController.js

const logger = require('../utils/logger');
const messageService = require('../services/messageService');

/**
 * 🎯 COMMAND CONTROLLER
 * 
 * Responsável por processar comandos fixos do usuário:
 * - /menu - Menu principal
 * - /ajuda - Ajuda geral
 * - /sobre - Sobre a plataforma
 * - /planos - Informações sobre planos e preços
 * - /contato - Informações de contato
 * - /suporte - Acesso ao suporte técnico
 * 
 * ❌ NÃO contém lógica de bloqueio/desbloqueio de IA
 * ❌ NÃO acessa socket diretamente
 * ✅ Apenas formata e retorna respostas para comandos
 */

/**
 * Lista de comandos disponíveis
 */
const AVAILABLE_COMMANDS = {
  '/menu': 'Menu principal com opções',
  '/ajuda': 'Ajuda geral sobre a plataforma',
  '/sobre': 'Informações sobre a OmniWA',
  '/planos': 'Planos e preços',
  '/contato': 'Formas de contato',
  '/suporte': 'Acesso ao suporte técnico'
};

/**
 * Verifica se a mensagem é um comando válido
 * @param {string} messageText - Texto da mensagem
 * @returns {boolean} - True se for um comando
 */
function isCommand(messageText) {
  if (!messageText || typeof messageText !== 'string') {
    return false;
  }

  const text = messageText.trim().toLowerCase();
  return text.startsWith('/') && Object.keys(AVAILABLE_COMMANDS).includes(text);
}

/**
 * Processa comando e retorna resposta formatada
 * @param {string} command - Comando a processar
 * @param {string} userJid - JID do usuário (para envio de mensagem)
 * @returns {Promise<string>} - Resposta formatada
 */
async function processCommand(command, userJid) {
  try {
    const cmd = command.trim().toLowerCase();
    
    logger.info(`Processando comando: ${cmd} de ${userJid}`);

    switch (cmd) {
      case '/menu':
        return await handleMenuCommand(userJid);
      
      case '/ajuda':
        return await handleHelpCommand(userJid);
      
      case '/sobre':
        return await handleAboutCommand(userJid);
      
      case '/planos':
        return await handlePlansCommand(userJid);
      
      case '/contato':
        return await handleContactCommand(userJid);
      
      case '/suporte':
        return await handleSupportCommand(userJid);
      
      default:
        return handleUnknownCommand(userJid);
    }

  } catch (error) {
    logger.error('Erro ao processar comando:', error);
    return 'Desculpe, ocorreu um erro ao processar seu comando. Tente novamente.';
  }
}

/**
 * 📋 COMANDO: /menu
 * Menu principal com todas as opções
 */
async function handleMenuCommand(userJid) {
  const menuText = `
╔═══════════════════════════════════
║ 📋 MENU PRINCIPAL - OMNIWA
╚═══════════════════════════════════

Escolha uma opção abaixo:

🚀 *Sobre a Plataforma*
   /sobre - Conheça a OmniWA

💰 *Planos e Preços*
   /planos - Veja nossos planos

❓ *Ajuda*
   /ajuda - Central de ajuda

🛠️ *Suporte Técnico*
   /suporte - Fale com suporte

📞 *Contato*
   /contato - Formas de contato

═══════════════════════════════════

💬 Ou simplesmente digite sua dúvida que responderei!
  `.trim();

  logger.info(`Menu enviado para ${userJid}`);
  return menuText;
}

/**
 * ❓ COMANDO: /ajuda
 * Ajuda geral sobre uso da plataforma
 */
async function handleHelpCommand(userJid) {
  const helpText = `
╔═══════════════════════════════════
║ ❓ CENTRAL DE AJUDA
╚═══════════════════════════════════

📱 *Como usar a OmniWA?*

1️⃣ *Para Prospecção*
   • Pergunte sobre preços e planos
   • Conheça as funcionalidades
   • Tire dúvidas sobre o serviço
   • Solicite demonstração

2️⃣ *Para Suporte Técnico*
   • Configure sua conta
   • Conecte WhatsApp via QR Code
   • Adicione chave de IA
   • Cadastre produtos
   • Resolva problemas

═══════════════════════════════════

🤖 *Comandos Disponíveis*

/menu - Menu principal
/sobre - Sobre a OmniWA
/planos - Planos e preços
/suporte - Suporte técnico
/contato - Formas de contato

═══════════════════════════════════

💬 *Dica:* Você pode conversar naturalmente!
Não precisa usar comandos sempre. 😊

🌐 Site: omniwa-saas.web.app
  `.trim();

  logger.info(`Ajuda enviada para ${userJid}`);
  return helpText;
}

/**
 * ℹ️ COMANDO: /sobre
 * Informações sobre a plataforma OmniWA
 */
async function handleAboutCommand(userJid) {
  const aboutText = `
╔═══════════════════════════════════
║ 📱 SOBRE A OMNIWA
╚═══════════════════════════════════

🎯 *O que é?*
OmniWA = Operação Omnichannel no WhatsApp

Plataforma SaaS que automatiza vendas pelo WhatsApp usando Inteligência Artificial.

✨ *Diferenciais*

🤖 IA 24/7
   Atendimento automatizado sempre ativo

📱 Seu Número
   Usa seu próprio WhatsApp

💳 Pagamento Integrado
   Checkout via Mercado Pago

🔗 Integrações
   ERP, PDV, Delivery

📊 Dashboard Completo
   Gestão total de vendas e pedidos

═══════════════════════════════════

💰 *Modelo de Negócio*

✅ SEM mensalidade fixa
✅ SEM taxa de adesão
✅ Produtos ILIMITADOS
✅ Conversas ILIMITADAS

💳 Taxa: 3% só quando vender

Exemplo: Vendeu R$ 100 = Você recebe R$ 97

═══════════════════════════════════

🎯 *Ideal para:*
• Restaurantes e delivery
• Lojas de varejo
• Farmácias
• Pet shops
• Mercados
• Serviços em geral

═══════════════════════════════════

🚀 Quer conhecer mais?
Digite: "Quero saber mais" ou use /planos
  `.trim();

  logger.info(`Sobre enviado para ${userJid}`);
  return aboutText;
}

/**
 * 💰 COMANDO: /planos
 * Informações sobre planos e preços
 */
async function handlePlansCommand(userJid) {
  const plansText = `
╔═══════════════════════════════════
║ 💰 PLANOS E PREÇOS - OMNIWA
╚═══════════════════════════════════

🎉 *PLANO ÚNICO - A MENOR TAXA DO MERCADO*

═══════════════════════════════════

✅ *O QUE ESTÁ INCLUSO:*

🤖 Agente de IA dedicado 24/7
📱 WhatsApp Business integrado
💳 Pagamento via Mercado Pago
🔗 Integrações ilimitadas (ERP/PDV/Delivery)
📦 Produtos ILIMITADOS
💬 Conversas ILIMITADAS
🖨️ Impressão automática de pedidos
📊 Dashboard completo
🛠️ Suporte técnico

═══════════════════════════════════

💵 *INVESTIMENTO:*

❌ SEM mensalidade fixa
❌ SEM taxa de adesão
❌ SEM custo de setup
❌ SEM limite de produtos
❌ SEM limite de conversas

✅ Taxa: *3% por venda concluída*

═══════════════════════════════════

📊 *EXEMPLOS PRÁTICOS:*

• Vendeu R$ 50 → Você recebe R$ 48,50
• Vendeu R$ 100 → Você recebe R$ 97,00
• Vendeu R$ 500 → Você recebe R$ 485,00
• Vendeu R$ 1.000 → Você recebe R$ 970,00

*Não vendeu nada no mês? = R$ 0 de custo*

═══════════════════════════════════

💡 *COMPARAÇÃO COM O MERCADO:*

Outras plataformas:
❌ R$ 200-500/mês + 5-7% de taxa
❌ Limites de produtos/conversas
❌ Custos fixos mesmo sem vender

OmniWA:
✅ 3% APENAS quando vender
✅ ZERO custos fixos
✅ Tudo ILIMITADO

═══════════════════════════════════

⚡ *ONBOARDING RÁPIDO:*

5-10 minutos para começar:
1️⃣ Criar conta (1 min)
2️⃣ Configurar IA (3 min)
3️⃣ Conectar pagamento (1 min)
4️⃣ Conectar WhatsApp (30s)
5️⃣ Cadastrar produtos (variável)
6️⃣ COMEÇAR A VENDER! 🎉

═══════════════════════════════════

🚀 *PRONTO PARA COMEÇAR?*

Acesse: omniwa-saas.web.app
Ou digite: "Quero criar minha conta"
  `.trim();

  logger.info(`Planos enviados para ${userJid}`);
  return plansText;
}

/**
 * 📞 COMANDO: /contato
 * Formas de contato com a equipe
 */
async function handleContactCommand(userJid) {
  const contactText = `
╔═══════════════════════════════════
║ 📞 FORMAS DE CONTATO
╚═══════════════════════════════════

Entre em contato conosco:

📱 *WhatsApp Suporte*
   wa.me/5513996069536
   Atendimento: Seg-Sex, 9h-18h

📧 *Email*
   suporte@omniwa.com.br
   Resposta em até 4 horas úteis

💬 *Chat no Dashboard*
   Disponível após login
   (somente para clientes)

🌐 *Site Oficial*
   omniwa-saas.web.app

═══════════════════════════════════

⏱️ *Tempo Médio de Resposta:*
• WhatsApp: 2-4 horas (horário comercial)
• Email: 4-8 horas (horário comercial)
• Chat: Imediato (se online)

═══════════════════════════════════

💡 *Dica:* Para suporte técnico rápido,
use o comando /suporte
  `.trim();

  logger.info(`Contato enviado para ${userJid}`);
  return contactText;
}

/**
 * 🛠️ COMANDO: /suporte
 * Acesso ao suporte técnico
 */
async function handleSupportCommand(userJid) {
  const supportText = `
╔═══════════════════════════════════
║ 🛠️ SUPORTE TÉCNICO
╚═══════════════════════════════════

Precisa de ajuda técnica? Estamos aqui!

═══════════════════════════════════

🔧 *PROBLEMAS COMUNS:*

1️⃣ WhatsApp desconecta
2️⃣ IA não responde
3️⃣ Link de pagamento não funciona
4️⃣ Produtos não aparecem
5️⃣ Erro ao conectar IA
6️⃣ Integração com ERP

═══════════════════════════════════

💬 *COMO OBTER AJUDA:*

*Opção 1: Converse comigo*
Descreva seu problema que tentarei ajudar!

*Opção 2: Suporte Direto*
📱 WhatsApp: wa.me/5513996069536
📧 Email: suporte@omniwa.com.br

*Opção 3: Dashboard*
💬 Chat ao vivo (se estiver logado)

═══════════════════════════════════

📚 *CENTRAL DE AJUDA:*

🌐 omniwa-saas.web.app/ajuda

Tutoriais em vídeo:
✅ Como conectar WhatsApp
✅ Como configurar IA
✅ Como cadastrar produtos
✅ Como conectar pagamento
✅ Como integrar ERP

═══════════════════════════════════

⏱️ *Tempo de Resposta:*
2-4 horas no horário comercial
(Seg-Sex, 9h-18h)

═══════════════════════════════════

💡 Me conte seu problema que vou ajudar! 😊
  `.trim();

  logger.info(`Suporte enviado para ${userJid}`);
  return supportText;
}

/**
 * ❌ Comando desconhecido
 */
function handleUnknownCommand(userJid) {
  const unknownText = `
❌ Comando não reconhecido.

📋 *Comandos disponíveis:*

/menu - Menu principal
/ajuda - Central de ajuda
/sobre - Sobre a OmniWA
/planos - Planos e preços
/contato - Formas de contato
/suporte - Suporte técnico

💬 Ou digite sua dúvida diretamente!
  `.trim();

  logger.warn(`Comando desconhecido enviado por ${userJid}`);
  return unknownText;
}

/**
 * Retorna lista de comandos disponíveis
 * @returns {Object} - Objeto com comandos e descrições
 */
function getAvailableCommands() {
  return AVAILABLE_COMMANDS;
}

/**
 * Formata mensagem de boas-vindas com menu
 * @returns {string} - Mensagem de boas-vindas
 */
function getWelcomeMessage() {
  return `
Olá! 👋 Seja bem-vindo(a) à *OmniWA*!

Eu sou seu assistente virtual. Como posso ajudar?

🚀 Digite /menu para ver todas as opções
💬 Ou converse naturalmente comigo!

Estou aqui para:
✅ Apresentar a plataforma
✅ Explicar preços e planos
✅ Ajudar com suporte técnico
✅ Tirar suas dúvidas

Pode começar! 😊
  `.trim();
}

module.exports = {
  isCommand,
  processCommand,
  getAvailableCommands,
  getWelcomeMessage,
  
  // Exporta handlers individuais (caso necessário)
  handleMenuCommand,
  handleHelpCommand,
  handleAboutCommand,
  handlePlansCommand,
  handleContactCommand,
  handleSupportCommand
};