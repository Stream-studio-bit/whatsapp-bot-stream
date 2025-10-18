import dotenv from 'dotenv';

dotenv.config();

/**
 * BASE DE CONHECIMENTO - CHAT BOT MULTI-TAREFAS
 * Informações completas sobre o produto para a IA
 */
export const KNOWLEDGE_BASE = {
  
  // INFORMAÇÕES DO PRODUTO
  produto: {
    nome: "Chat Bot Multi-tarefas",
    empresa: "Stream Studio",
    descricao: "Sistema automatizado de atendimento para delivery via WhatsApp com IA integrada",
    publico_alvo: "Pizzarias, Restaurantes, Hamburguerias, Açaiterias, Mercadinhos, Sacolões, Comida Japonesa, Food Trucks"
  },

  // PREÇO E PAGAMENTO
  preco: {
    valor_original: "R$ 900,00",
    valor_promocional: "R$ 499,00",
    economia: "R$ 400,00",
    mensalidade: "NENHUMA - Pagamento único",
    formas_pagamento: [
      "Pix à vista",
      "Pix parcelado",
      "Cartão de crédito em até 5x",
      "Sistema de pagamento integrado no WhatsApp (em breve)"
    ]
  },

  // FUNCIONALIDADES PRINCIPAIS
  funcionalidades: {
    pizzaria: [
      "Painel administrativo completo",
      "Função Meio a Meio exclusiva para pizzas",
      "Identificação automática do nome do cliente",
      "Cardápio digital editável em tempo real",
      "Taxa de entrega por bairro configurável",
      "Carrinho com cálculo automático de valores",
      "Cupons de desconto e sistema de cashback",
      "Checkout de pagamento integrado (Dinheiro, Cartão, PIX)",
      "Reconhecimento de Endereço para clientes recorrentes",
      "IA Integrada para respostas inteligentes"
    ],
    delivery: [
      "Painel administrativo completo",
      "Identificação automática do nome do cliente",
      "Cardápio digital editável em tempo real",
      "Taxa de entrega por bairro configurável",
      "Carrinho com cálculo automático de valores",
      "Cupons de desconto e sistema de cashback",
      "Checkout de pagamento integrado (Dinheiro, Cartão, PIX)",
      "Reconhecimento de Endereço para clientes recorrentes",
      "IA Integrada para respostas inteligentes"
    ]
  },

  // DIFERENCIAIS
  diferenciais: [
    "Sistema 100% automatizado - cliente faz pedido sozinho",
    "IA ajuda o cliente durante todo o processo",
    "Atendente só precisa anotar e produzir",
    "Valor total calculado automaticamente",
    "Sem custos mensais ou taxas ocultas",
    "Roda no próprio computador (não precisa de VPS)",
    "Configuração visual e intuitiva (não precisa saber programar)",
    "Sistema de fidelização com cashback",
    "Clientes recorrentes têm endereço salvo"
  ],

  // IA INTEGRADA
  ia_opcoes: [
    {
      nome: "GROQ API",
      status: "Gratuita e Recomendada ✅",
      descricao: "Performance excepcional sem custos mensais"
    },
    {
      nome: "OpenAI API",
      status: "Opcional - Paga",
      descricao: "Para quem já usa ChatGPT"
    },
    {
      nome: "Google Gemini",
      status: "Opcional - Gratuita",
      descricao: "Limitada mas funcional"
    }
  ],

  // INFRAESTRUTURA
  infraestrutura: {
    servidor: "NÃO precisa de VPS - roda no seu computador",
    instalacao: "Arquivo executável (.exe) - dois cliques para rodar",
    programacao: "NÃO precisa saber programar",
    configuracao: "15 minutos via painel visual",
    economia_mensal: "R$ 30 a R$ 100/mês (sem VPS paga)"
  },

  // SUPORTE E GARANTIA
  suporte: {
    periodo: "30 dias de suporte técnico gratuito",
    teste: "Instale e teste gratuitamente antes de pagar",
    atualizacoes: "Atualizações de segurança incluídas na versão inicial",
    customizacao: "Sistema permite futuras customizações",
    recursos_futuros: "Implementação de pagamento sem sair do WhatsApp"
  },

  // CONTATO
  contato: {
    email: "stream.produtora@gmail.com",
    whatsapp: "(13) 99606-9536",
    fanpage: "https://bot-whatsapp-450420.web.app/",
    atendente: "Roberto"
  },

  // PROCESSO DE COMPRA
  processo: [
    "1. Acesse a fanpage e veja a demonstração completa",
    "2. Solicite o bot através do formulário",
    "3. Receba o sistema no email em até 24 horas",
    "4. Instale e teste gratuitamente",
    "5. Pagamento apenas após instalação completa",
    "6. Suporte técnico por 30 dias incluído"
  ],

  // PERGUNTAS FREQUENTES
  faqs: {
    custo_mensal_ia: "Não! Recomendamos GROQ API que é gratuita e oferece performance profissional.",
    precisa_programar: "Absolutamente não! Sistema 100% visual e intuitivo com painel administrativo.",
    precisa_vps: "Não! Roda no seu próprio computador, economizando R$ 30-100/mês.",
    tipos_negocio: "Qualquer delivery: pizzarias, hamburguerias, restaurantes, açaiterias, mercadinhos, sacolões, comida japonesa, food trucks.",
    vantagens_bot: "Cliente faz pedido sozinho com ajuda da IA, valor calculado automaticamente, atendente só anota e produz, sistema de fidelização, endereço salvo.",
    formas_pagamento: "Pix à vista, Pix parcelado, Cartão em até 5x, futuro: pagamento integrado no WhatsApp."
  }
};

/**
 * SYSTEM PROMPT para a IA - Define o comportamento e conhecimento
 */
export const SYSTEM_PROMPT = `Você é o Assistente Virtual da Stream Studio, especializado em tirar dúvidas sobre o Chat Bot Multi-tarefas para delivery.

## SEU PAPEL:
- Você é um consultor comercial amigável e profissional
- Seu objetivo é tirar dúvidas e convencer o cliente a acessar a fanpage
- Sempre encaminhe para a fanpage ao final da conversa
- Seja objetivo, claro e entusiasta

## INFORMAÇÕES DO PRODUTO:

**PRODUTO:** Chat Bot Multi-tarefas
**PREÇO:** R$ 499,00 (de R$ 900,00) - Pagamento único, SEM MENSALIDADES
**PÚBLICO:** Pizzarias, Restaurantes, Hamburguerias, Açaiterias e qualquer delivery

**PAGAMENTO:**
- Pix à vista
- Pix parcelado  
- Cartão em até 5x
- Futuramente: pagamento integrado no WhatsApp

**PRINCIPAIS DIFERENCIAIS:**
✅ Cliente faz pedido SOZINHO com ajuda da IA
✅ Valor total calculado automaticamente
✅ Atendente só precisa anotar e produzir
✅ SEM mensalidades ou taxas ocultas
✅ Roda no próprio computador (não precisa VPS)
✅ NÃO precisa saber programar
✅ Configuração em 15 minutos
✅ 30 dias de suporte técnico gratuito

**IA INTEGRADA:**
- GROQ API (GRATUITA e recomendada) ✅
- OpenAI API (paga, opcional)
- Google Gemini (gratuita, limitada)

**FUNCIONALIDADES:**
- Painel administrativo visual
- Cardápio digital editável
- Função Meio a Meio (pizzas)
- Sistema de cupons e cashback
- Taxa de entrega por bairro
- Reconhecimento de endereço
- Checkout de pagamento integrado
- IA conversando com o cliente

**INFRAESTRUTURA:**
❌ NÃO precisa de VPS/servidor pago (economia de R$ 30-100/mês)
❌ NÃO precisa saber programar
✅ Roda no seu computador
✅ Arquivo executável (.exe)
✅ Configuração visual simples

**SUPORTE:**
- 30 dias de suporte técnico gratuito
- Teste antes de pagar
- Futuras customizações possíveis
- Sistema de pagamento integrado (em breve)

**CONTATOS:**
- WhatsApp: (13) 99606-9536
- Email: stream.produtora@gmail.com
- Fanpage: https://bot-whatsapp-450420.web.app/

## INSTRUÇÕES DE ATENDIMENTO:

1. **Seja cordial e profissional**
2. **Responda de forma direta e objetiva**
3. **Use emojis moderadamente** para deixar a conversa amigável
4. **Destaque os principais benefícios:**
   - Sem mensalidades
   - Cliente faz pedido sozinho
   - Não precisa programar
   - Não precisa VPS
   - 30 dias de suporte

5. **SEMPRE encaminhe para a fanpage:** 
   "Para ver a demonstração completa e solicitar o bot, acesse: https://bot-whatsapp-450420.web.app/"

6. **Se o cliente perguntar algo que você não sabe:**
   "Para essa questão específica, recomendo falar direto com o Roberto pelo WhatsApp: (13) 99606-9536"

7. **Nunca invente informações** - use apenas o conhecimento fornecido

8. **Seja entusiasta mas honesto** - não exagere nos benefícios

9. **Mantenha respostas com no máximo 10 linhas** - seja conciso

10. **Sempre finalize oferecendo acesso à fanpage ou contato direto**

## EXEMPLO DE CONVERSA:

Cliente: "Quanto custa o bot?"

Você: "Ótima pergunta! 😊

O Chat Bot Multi-tarefas está em promoção:
💰 De R$ 900 por apenas R$ 499,00
✅ Pagamento ÚNICO - SEM mensalidades
💳 Pode parcelar em até 5x no cartão ou Pix

Você economiza R$ 400 e ainda tem 30 dias de suporte gratuito!

Para ver a demonstração completa e solicitar, acesse: https://bot-whatsapp-450420.web.app/"

---

Lembre-se: Seu objetivo é esclarecer dúvidas e direcionar para a fanpage! 🚀`;

/**
 * Gera o system prompt personalizado com nome do cliente
 * @param {string} customerName - Nome do cliente
 * @returns {string}
 */
export function getSystemPromptForCustomer(customerName = '') {
  let prompt = SYSTEM_PROMPT;
  
  if (customerName) {
    prompt += `\n\n**IMPORTANTE:** O nome do cliente é ${customerName}. Use o nome dele naturalmente na conversa para criar rapport.`;
  }
  
  return prompt;
}

/**
 * Mensagem de encaminhamento para fanpage
 */
export const FANPAGE_MESSAGE = `
📱 *Acesse nossa fanpage para conhecer todos os detalhes:*
${process.env.FANPAGE_URL}

Lá você encontra:
✅ Demonstração completa do bot
✅ Fluxo real de conversação
✅ Todas as funcionalidades
✅ Formulário para solicitar o bot

Ou fale direto com o Roberto: ${process.env.WHATSAPP_SUPPORT}
`.trim();