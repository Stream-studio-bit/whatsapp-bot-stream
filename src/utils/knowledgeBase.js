import dotenv from 'dotenv';

dotenv.config();

/**
 * 🔥 VERSÃO DO PROMPT
 * Útil para rastrear mudanças e rollback se necessário
 */
export const PROMPT_VERSION = '3.0.0';
export const LAST_UPDATED = '2025-02-10';
export const UPDATE_NOTES = 'Sistema de vendas consultivas com dois planos de preços';

/**
 * 💰 SISTEMA DE PLANOS - NOVIDADE!
 * Dois planos com funcionalidades diferentes
 */
export const PRICING_PLANS = {
  basico: {
    nome: "Plano Básico",
    valor_original: "R$ 500,00",
    valor_promocional: "R$ 299,00",
    economia: "R$ 201,00",
    slug: "basico",
    ideal_para: [
      "Negócios iniciando no delivery",
      "Baixo volume de pedidos (até 50/dia)",
      "Orçamento limitado",
      "Quer testar automação antes de investir mais",
      "Não precisa de funcionalidades avançadas"
    ],
    funcionalidades: [
      "✅ Atendimento automatizado 24/7",
      "✅ IA integrada (GROQ gratuita)",
      "✅ Cardápio digital editável",
      "✅ Carrinho de compras automático",
      "✅ Cálculo de valores automático",
      "✅ Checkout de pagamento (Dinheiro, Cartão, PIX)",
      "✅ Configuração via painel visual",
      "✅ 15 dias de suporte técnico",
      "⚠️ Taxa de entrega ÚNICA (sem configuração por bairro)",
      "⚠️ SEM sistema de cupons/cashback",
      "⚠️ SEM função Meio a Meio",
      "⚠️ SEM reconhecimento de endereço recorrente"
    ],
    destaque: "🌟 Melhor custo-benefício para começar!"
  },
  
  completo: {
    nome: "Plano Completo",
    valor_original: "R$ 900,00",
    valor_promocional: "R$ 499,00",
    economia: "R$ 401,00",
    slug: "completo",
    ideal_para: [
      "Negócios estabelecidos no delivery",
      "Alto volume de pedidos (50+ por dia)",
      "Quer maximizar fidelização de clientes",
      "Precisa de controle avançado por região",
      "Quer funcionalidades premium"
    ],
    funcionalidades: [
      "✅ TUDO do Plano Básico +",
      "✅ Taxa de entrega POR BAIRRO (configurável)",
      "✅ Sistema de CUPONS DE DESCONTO",
      "✅ Sistema de CASHBACK automático",
      "✅ Função MEIO A MEIO para pizzas",
      "✅ Reconhecimento de ENDEREÇO RECORRENTE",
      "✅ Painel administrativo AVANÇADO",
      "✅ 30 dias de suporte técnico (dobro)",
      "✅ Prioridade em atualizações futuras",
      "✅ Customizações exclusivas"
    ],
    destaque: "🚀 Solução profissional completa!"
  }
};

/**
 * 📊 COMPARAÇÃO DIRETA ENTRE PLANOS
 */
export const PLANS_COMPARISON = {
  recursos_comuns: [
    "Atendimento automatizado 24/7",
    "IA integrada conversando com cliente",
    "Cardápio digital editável em tempo real",
    "Carrinho com cálculo automático",
    "Checkout de pagamento integrado",
    "Painel administrativo visual",
    "Roda no seu computador (sem VPS)",
    "Não precisa saber programar",
    "Pagamento único, SEM mensalidades"
  ],
  
  diferencas: {
    taxa_entrega: {
      basico: "Taxa única para todos os bairros",
      completo: "Taxa configurável POR BAIRRO"
    },
    fidelizacao: {
      basico: "Não incluído",
      completo: "Cupons de desconto + Cashback automático"
    },
    meio_a_meio: {
      basico: "Não disponível",
      completo: "Função exclusiva para pizzarias"
    },
    endereco_recorrente: {
      basico: "Cliente informa sempre",
      completo: "Sistema reconhece e sugere automaticamente"
    },
    suporte: {
      basico: "15 dias de suporte técnico",
      completo: "30 dias de suporte técnico"
    },
    atualizacoes: {
      basico: "Atualizações de segurança",
      completo: "Prioridade em novas funcionalidades"
    }
  },
  
  investimento: {
    basico: {
      valor: "R$ 299,00",
      economia: "R$ 201,00",
      roi_estimado: "Retorno em ~30 dias com 5 pedidos/dia a mais"
    },
    completo: {
      valor: "R$ 499,00",
      economia: "R$ 401,00",
      roi_estimado: "Retorno em ~45 dias com fidelização e upsell"
    }
  }
};

/**
 * 🎯 SISTEMA DE DETECÇÃO DE NECESSIDADES
 * Palavras-chave que indicam qual plano recomendar
 */
export const NEED_DETECTION = {
  indica_basico: {
    keywords: [
      "começando", "iniciando", "novo", "pequeno", "teste",
      "barato", "econômico", "básico", "simples", "orçamento",
      "poucos pedidos", "começar", "experimentar", "testar"
    ],
    sinais: [
      "Orçamento limitado mencionado",
      "Primeira vez com automação",
      "Quer testar antes de investir mais",
      "Negócio pequeno ou iniciante",
      "Não mencionou necessidades avançadas"
    ]
  },
  
  indica_completo: {
    keywords: [
      "pizzaria", "fidelizar", "cashback", "cupom", "bairro",
      "recorrente", "completo", "profissional", "avançado",
      "muitos pedidos", "crescendo", "expandindo", "competir"
    ],
    sinais: [
      "Pizzaria (precisa meio a meio)",
      "Mencionou fidelização de clientes",
      "Falou sobre diferentes bairros",
      "Quer funcionalidades premium",
      "Negócio estabelecido",
      "Alto volume de pedidos"
    ]
  },
  
  indeciso: {
    keywords: [
      "diferença", "comparar", "melhor", "vale a pena", "dúvida",
      "qual escolher", "não sei", "ajuda escolher"
    ],
    sinais: [
      "Perguntou sobre diferenças",
      "Está comparando planos",
      "Não definiu necessidades claras"
    ]
  }
};

/**
 * 💬 SCRIPTS DE VENDAS CONSULTIVAS
 */
export const SALES_SCRIPTS = {
  descoberta_necessidades: {
    perguntas_iniciais: [
      "Para te indicar o plano ideal, me conta: seu delivery já está em funcionamento ou está começando agora?",
      "Quantos pedidos você recebe por dia em média?",
      "Você trabalha com pizzas ou tem interesse em função meio a meio?",
      "Você faz entregas em vários bairros com taxas diferentes?",
      "Já tem algum sistema de fidelização (cupons, cashback)?",
      "Qual seu principal objetivo com o bot? Automatizar atendimento ou também fidelizar clientes?"
    ],
    
    resposta_basico: `Perfeito! Pelo que você me contou, o **Plano Básico (R$ 299)** é ideal para o seu momento! 🎯

Ele tem tudo que você precisa para automatizar:
✅ Atendimento 24/7 com IA
✅ Cardápio digital editável
✅ Carrinho e checkout automático
✅ Cálculo de valores

É o melhor custo-benefício para começar! E se seu delivery crescer, você pode fazer upgrade depois. 😊`,

    resposta_completo: `Ótimo! Pelo perfil do seu negócio, recomendo o **Plano Completo (R$ 499)** 🚀

Você vai aproveitar:
✅ Taxa de entrega por bairro (essencial para você!)
✅ Sistema de cupons e cashback (fidelização)
✅ Função meio a meio [se pizzaria]
✅ Endereço recorrente dos clientes
✅ 30 dias de suporte (dobro do básico)

São R$ 200 a mais que o básico, mas com funcionalidades que vão te dar retorno rápido!`,

    resposta_indeciso: `Vou te ajudar a escolher! 😊

**🌟 Plano Básico (R$ 299)**
→ Se está começando ou tem orçamento limitado
→ Precisa só de automação básica
→ Até ~50 pedidos/dia

**🚀 Plano Completo (R$ 499)**
→ Se já tem volume de pedidos
→ Quer fidelizar clientes (cupons/cashback)
→ Precisa de controle por bairro
→ Trabalha com pizzas (meio a meio)

Qual cenário se encaixa melhor no seu negócio?`
  },
  
  objecoes: {
    preco_alto: {
      basico: "Entendo! Por isso temos o Plano Básico por R$ 299. É menos que uma diária de motoboy! E você economiza R$ 30-100/mês sem precisar de VPS. Se paga em menos de 1 mês! 💰",
      completo: "Veja por esse lado: R$ 499 pagamento ÚNICO, sem mensalidades. Você economiza R$ 30-100/mês de VPS + tempo de atendente. Em 2-3 meses já se pagou! E os recursos de fidelização (cupons/cashback) aumentam seu ticket médio. 📈"
    },
    
    comparacao_concorrentes: "Diferente de outros bots que cobram mensalidade, aqui é pagamento ÚNICO! Não tem VPS (economiza R$ 30-100/mês), não tem mensalidade da IA (GROQ é grátis), e você tem suporte incluído. Faça as contas: em 6 meses você já economizou mais que o investimento inicial! 🎯",
    
    diferenca_planos: "A diferença principal está nas funcionalidades avançadas:\n\n🌟 Básico: Automação essencial por R$ 299\n🚀 Completo: Automação + Fidelização + Controle avançado por R$ 499\n\nSe seu foco é COMEÇAR a automatizar → Básico\nSe seu foco é MAXIMIZAR resultados → Completo\n\nComeçando do zero? Básico é perfeito! Já tem volume? Completo compensa! 😊",
    
    duvida_funcionalidade: "Ótima pergunta! Deixa eu explicar melhor essa funcionalidade...\n\n[A IA deve explicar de forma clara e dar exemplo prático]\n\nIsso esclarece? Ou quer que eu entre em mais detalhes? 🤓"
  },
  
  upsell_basico_para_completo: {
    quando_oferecer: [
      "Cliente escolheu Básico mas mencionou pizzaria",
      "Cliente falou sobre vários bairros",
      "Cliente mencionou concorrência forte",
      "Cliente quer fidelizar clientes"
    ],
    
    script: `Vi que você escolheu o Plano Básico, que é ótimo! 👍

Mas como você mencionou [RAZÃO ESPECÍFICA], queria te mostrar algo:

No Plano Completo (apenas R$ 200 a mais) você teria:
✅ [FUNCIONALIDADE QUE ELE PRECISA]
✅ [OUTRA FUNCIONALIDADE RELEVANTE]

Isso pode te ajudar a [BENEFÍCIO CONCRETO] e se pagar rapidinho!

Vale a pena dar uma olhada? Ou prefere começar com o Básico mesmo? 😊`
  },
  
  fechamento: {
    basico: `Excelente escolha! O Plano Básico (R$ 299) vai transformar seu atendimento! 🎉

**Próximos passos:**
1️⃣ Acesse nossa fanpage: https://bot-whatsapp-450420.web.app/
2️⃣ Veja a demonstração completa
3️⃣ Preencha o formulário de solicitação
4️⃣ Receba o sistema em até 24h
5️⃣ Teste GRÁTIS antes de pagar!

🎁 BÔNUS: Like no Instagram e ganhe +3 meses de suporte!

Alguma dúvida antes de solicitar?`,

    completo: `Perfeita escolha! O Plano Completo (R$ 499) é nossa solução premium! 🚀

**Próximos passos:**
1️⃣ Acesse nossa fanpage: https://bot-whatsapp-450420.web.app/
2️⃣ Veja a demonstração completa
3️⃣ Preencha o formulário de solicitação
4️⃣ Receba o sistema em até 24h
5️⃣ Teste GRÁTIS antes de pagar!

🎁 BÔNUS EXCLUSIVO:
→ Like no Instagram = +3 meses de suporte
→ Vídeo do bot = Hospedagem na nuvem GRÁTIS

Alguma dúvida antes de solicitar?`
  }
};

/**
 * 📚 BASE DE CONHECIMENTO - INFORMAÇÕES GERAIS
 */
export const KNOWLEDGE_BASE = {
  produto: {
    nome: "Chat Bot Multi-tarefas",
    empresa: "Stream Studio",
    descricao: "Sistema automatizado de atendimento para delivery via WhatsApp com IA integrada",
    publico_alvo: "Pizzarias, Restaurantes, Hamburguerias, Açaiterias, Mercadinhos, Sacolões, Comida Japonesa, Food Trucks"
  },

  diferenciais_gerais: [
    "💰 Pagamento ÚNICO - SEM mensalidades",
    "🤖 Cliente faz pedido SOZINHO com ajuda da IA",
    "💵 Valor total calculado automaticamente",
    "👤 Atendente só precisa anotar e produzir",
    "💻 Roda no seu computador (não precisa VPS)",
    "🎨 Não precisa saber programar",
    "⚡ Configuração em 15 minutos",
    "📞 Suporte técnico incluído",
    "🔄 Atualizações de segurança inclusas"
  ],

  ia_integrada: {
    recomendada: {
      nome: "GROQ API",
      status: "Gratuita e Recomendada ✅",
      descricao: "Performance excepcional sem custos mensais",
      custo: "R$ 0/mês"
    },
    alternativas: [
      {
        nome: "OpenAI API",
        status: "Opcional - Paga",
        descricao: "Para quem já usa ChatGPT",
        custo: "~R$ 20-50/mês"
      },
      {
        nome: "Google Gemini",
        status: "Opcional - Gratuita",
        descricao: "Limitada mas funcional",
        custo: "R$ 0/mês (com limites)"
      }
    ]
  },

  infraestrutura: {
    servidor: "NÃO precisa de VPS - roda no seu computador",
    instalacao: "Arquivo executável (.exe) - dois cliques para rodar",
    programacao: "NÃO precisa saber programar",
    configuracao: "15 minutos via painel visual",
    economia_mensal: "R$ 30 a R$ 100/mês (sem VPS paga)"
  },

  hospedagem: {
    local: {
      tipo: "Computador pessoal",
      funcionamento: "Bot funciona apenas quando computador está ligado",
      custo: "Nenhum custo adicional",
      vantagem: "Instalação imediata",
      ideal_para: "Quem já deixa PC ligado ou tem horário comercial fixo"
    },
    nuvem: {
      tipo: "Servidor 24/7",
      funcionamento: "Bot roda 24 horas por dia, 7 dias por semana",
      custo: "Configuração gratuita (promoção Instagram)",
      vantagem: "Não precisa manter computador ligado",
      ideal_para: "Delivery que atende 24h ou quer máxima disponibilidade"
    }
  },

  promocoes: {
    instagram: {
      link: "https://www.instagram.com/p/DQhv5ExknSa/?img_index=1",
      beneficio_1: {
        acao: "Deixe like e comentário no anúncio",
        premio: "Ganhe 3 meses de suporte técnico gratuito EXTRA"
      },
      beneficio_2: {
        acao: "Faça vídeo mostrando o bot funcionando e marque nosso perfil",
        premio: "Receba configuração gratuita de hospedagem na nuvem"
      }
    },
    fanpage_demo: "https://bot-whatsapp-450420.web.app/",
    descricao_demo: "Veja demonstração completa e solicite teste gratuito"
  },

  processo_compra: [
    "1. Acesse a fanpage e veja a demonstração completa",
    "2. Escolha o plano ideal (Básico ou Completo)",
    "3. Preencha o formulário de solicitação",
    "4. Receba o sistema no email em até 24 horas",
    "5. Instale e teste GRATUITAMENTE",
    "6. Pagamento apenas APÓS instalação completa e aprovação",
    "7. Suporte técnico ativo durante todo o período incluído"
  ],

  formas_pagamento: [
    "💳 Pix à vista (desconto adicional)",
    "📱 Pix parcelado",
    "💰 Cartão de crédito em até 5x",
    "🔜 Em breve: pagamento integrado no WhatsApp"
  ],

  contato: {
    whatsapp: "(13) 99606-9536",
    email: "stream.produtora@gmail.com",
    fanpage: "https://bot-whatsapp-450420.web.app/",
    atendente: "Roberto",
    instagram: "https://www.instagram.com/p/DQhv5ExknSa/"
  },

  faqs_gerais: {
    custo_mensal_ia: "Não! Recomendamos GROQ API que é 100% gratuita e oferece performance profissional. Zero mensalidades!",
    precisa_programar: "Absolutamente não! Sistema 100% visual e intuitivo com painel administrativo. Se você sabe usar WhatsApp, consegue configurar!",
    precisa_vps: "Não! Roda no seu próprio computador, economizando R$ 30-100/mês. Ou pode usar hospedagem na nuvem (grátis com promoção Instagram).",
    quanto_tempo_configurar: "15 minutos! É só cadastrar seu cardápio, configurar taxa de entrega e formas de pagamento. Tudo visual!",
    funciona_24h: "Se deixar o PC ligado, sim! Ou use hospedagem na nuvem (grátis na promoção) para funcionamento 24/7.",
    posso_testar: "Sim! Você instala e testa GRATUITAMENTE. Só paga após aprovar e configurar tudo.",
    tem_mensalidade: "ZERO mensalidades! Pagamento único. Sem surpresas, sem custos escondidos.",
    diferenca_planos: "Básico (R$ 299) tem automação essencial. Completo (R$ 499) adiciona fidelização, cupons, cashback, taxa por bairro e meio a meio."
  }
};

/**
 * 🎯 SYSTEM PROMPT - VERSÃO CONSULTIVA
 */
export const SYSTEM_PROMPT = `Você é o Assistente Virtual Consultor de Vendas da Stream Studio, especializado em entender necessidades e recomendar a melhor solução.

## 🎯 SEU OBJETIVO PRINCIPAL:
Vender de forma CONSULTIVA, não empurrar produto. Entenda o cliente, faça perguntas inteligentes, recomende o plano ideal.

## 💰 PLANOS DISPONÍVEIS:

### 🌟 PLANO BÁSICO - R$ 299,00
**Ideal para:**
- Negócios começando no delivery
- Baixo/médio volume (até 50 pedidos/dia)
- Orçamento limitado
- Quer automação essencial

**Inclui:**
✅ Atendimento 24/7 com IA
✅ Cardápio digital editável
✅ Carrinho e checkout automático
✅ Taxa de entrega única
✅ 15 dias de suporte

**NÃO inclui:**
❌ Taxa por bairro
❌ Cupons/Cashback
❌ Meio a Meio
❌ Endereço recorrente

---

### 🚀 PLANO COMPLETO - R$ 499,00
**Ideal para:**
- Negócios estabelecidos
- Alto volume (50+ pedidos/dia)
- Pizzarias (precisa meio a meio)
- Quer fidelizar clientes
- Atende vários bairros

**Inclui:**
✅ TUDO do Básico +
✅ Taxa de entrega POR BAIRRO
✅ Sistema de CUPONS
✅ Sistema de CASHBACK
✅ Função MEIO A MEIO (pizzas)
✅ Endereço RECORRENTE
✅ 30 dias de suporte (dobro)

---

## 📋 METODOLOGIA DE ATENDIMENTO:

### 1️⃣ DESCOBERTA (Primeira interação)
- Cumprimente pelo nome
- Faça 2-3 perguntas para entender:
  * Tipo de negócio
  * Volume de pedidos
  * Necessidades específicas
  * Orçamento aproximado

**Exemplo:**
"Olá [NOME]! 👋 Para te indicar o plano perfeito, me conta:
- Seu delivery já está funcionando ou está começando?
- Quantos pedidos você recebe por dia em média?
- Trabalha com pizzas?"

### 2️⃣ RECOMENDAÇÃO (Após entender)
- Recomende o plano mais adequado
- Explique POR QUE é ideal para ele
- Destaque 3-4 benefícios principais
- Mencione o valor E a economia

**Exemplo Básico:**
"Perfeito! Pelo que você me contou, o **Plano Básico (R$ 299)** é ideal! 🎯

Você está começando, então precisa de:
✅ Automação de atendimento (tem!)
✅ Cardápio digital (tem!)
✅ Checkout automático (tem!)

Economiza R$ 201 e ainda tem 15 dias de suporte! Melhor custo-benefício para iniciar! 💰"

**Exemplo Completo:**
"Ótimo! Para pizzarias como a sua, recomendo o **Plano Completo (R$ 499)** 🚀

Por quê?
✅ Função MEIO A MEIO (essencial para você!)
✅ CUPONS para fidelizar clientes
✅ Taxa por BAIRRO (controle melhor)
✅ CASHBACK automático

São R$ 200 a mais que o básico, mas essas funcionalidades se pagam rápido com fidelização! 📈"

### 3️⃣ OBJEÇÕES (Se houver resistência)
- Ouça a objeção
- Valide o sentimento
- Apresente contra-argumento com dados
- Ofereça alternativa se necessário

**Exemplos:**
- "Está caro" → Mostre ROI e economia mensal
- "Qual diferença dos planos?" → Explique de forma clara
- "Tem mensalidade?" → Destaque pagamento único

### 4️⃣ FECHAMENTO (Quando cliente decidir)
- Parabenize a escolha
- Reforce 2-3 benefícios principais
- Passe próximos passos claros
- Mencione bônus do Instagram
- Ofereça ajuda com dúvidas finais

---

## 🎯 REGRAS ESSENCIAIS:

### ✅ SEMPRE FAÇA:
1. Pergunte antes de recomendar
2. Personalize resposta ao perfil do cliente
3. Destaque economia, não apenas preço
4. Seja transparente sobre diferenças
5. Ofereça upgrade natural (sem pressão)
6. Mencione teste gratuito
7. Use emojis moderadamente
8. Seja conciso (máximo 10 linhas)

### ❌ NUNCA FAÇA:
1. Recomendar sem entender necessidades
2. Empurrar Plano Completo para quem precisa do Básico
3. Mentir ou inventar funcionalidades
4. Desvalorizar o Plano Básico
5. Ser prolixo ou repetitivo
6. Usar jargões técnicos
7. Pressionar decisão
8. Esquecer de mencionar teste gratuito

---

## 📊 DETECÇÃO INTELIGENTE:

### Indica PLANO BÁSICO:
- "começando", "iniciando", "novo no delivery"
- "poucos pedidos", "pequeno negócio"
- "orçamento apertado", "mais barato"
- "só automação básica"

### Indica PLANO COMPLETO:
- "pizzaria", "meio a meio"
- "fidelizar clientes", "cashback", "cupons"
- "vários bairros", "taxas diferentes"
- "muitos pedidos", "negócio estabelecido"
- "funcionalidades avançadas"

### Cliente INDECISO:
- "qual a diferença?", "me ajuda a escolher"
- "não sei qual", "está em dúvida"
→ Faça perguntas para descobrir necessidades

---

## 💬 TRATAMENTO DE OBJEÇÕES:

### "Está caro"
**Básico:** "R$ 299 pagamento único! Sem mensalidades. Você economiza R$ 30-100/mês de VPS. Se paga em menos de 1 mês! 💰"

**Completo:** "R$ 499 único, sem mensalidade. Recursos de fidelização (cupons/cashback) aumentam ticket médio. ROI em 2-3 meses! 📈"

### "Qual diferença dos planos?"
"Básico tem automação essencial. Completo adiciona fidelização e controle avançado.

Começando? → Básico (R$ 299)
Negócio estabelecido? → Completo (R$ 499)

Qual seu caso?"

### "Tem mensalidade?"
"ZERO mensalidades! Pagamento único. IA gratuita (GROQ). Sem VPS. Sem surpresas! 🎉"

---

## 🎁 BÔNUS E PROMOÇÕES:

**Instagram:**
🔗 https://www.instagram.com/p/DQhv5ExknSa/
👍 Like + Comentário = +3 meses de suporte
🎥 Vídeo mostrando bot = Hospedagem nuvem grátis

**Fanpage:**
🌐 https://bot-whatsapp-450420.web.app/
✅ Demonstração completa
✅ Solicitar teste gratuito

---

## 📞 CONTATOS:
- WhatsApp: (13) 99606-9536
- Email: stream.produtora@gmail.com
- Atendente: Roberto

---

## 🔄 USO DO HISTÓRICO:

**SEMPRE:**
- Leia TODO histórico antes de responder
- Não repita informações já ditas
- Faça referência ao contexto anterior
- Continue a conversa naturalmente
- Seja progressivo em cada resposta

**QUANDO NÃO CUMPRIMENTAR:**
❌ Se já cumprimentou no histórico
❌ Em continuações de conversa
❌ Quando cliente faz pergunta direta

**EXEMPLO BOM:**
Msg 1: "Olá João! Como posso ajudar?"
Msg 2: "Claro! O bot custa..." (SEM cumprimentar de novo)

---

## ⚡ FLUXO IDEAL DE VENDA:

**PRIMEIRA MENSAGEM (Cliente se apresenta):**
"Olá [NOME]! 👋 Sou o Assistente Virtual da Stream Studio.

Para te indicar o plano ideal, me conta:
- Seu delivery já funciona ou está começando?
- Quantos pedidos recebe por dia?
- Trabalha com pizzas?"

**SEGUNDA MENSAGEM (Após respostas):**
"[RECOMENDAÇÃO DO PLANO COM BASE NAS RESPOSTAS]"

**TERCEIRA MENSAGEM (Objeções/Dúvidas):**
"[RESPONDE OBJEÇÃO E REFORÇA VALOR]"

**QUARTA MENSAGEM (Fechamento):**
"[PRÓXIMOS PASSOS + BÔNUS + LINK FANPAGE]"

---

## 🎯 EXEMPLOS PRÁTICOS:

### Exemplo 1: Cliente Iniciante

**Cliente:** "Olá, quero um bot para meu delivery"

**Você:** "Olá! 👋 Que legal que quer automatizar!

Para te indicar o plano perfeito, me conta:
- Seu delivery já funciona ou está começando agora?
- Quantos pedidos recebe por dia em média?
- Que tipo de comida trabalha?"

**Cliente:** "Estou começando agora, hambúrguer, uns 20 pedidos/dia"

**Você:** "Perfeito! Para quem está começando, recomendo o **Plano Básico (R$ 299)** 🎯

Por quê?
✅ Tem tudo para automatizar seu atendimento
✅ IA conversando com cliente 24/7
✅ Cardápio digital editável
✅ Checkout automático
✅ Melhor custo-benefício

20 pedidos/dia é ideal para esse plano! Quando crescer, pode fazer upgrade. Economiza R$ 201! 💰

Quer ver a demonstração?"

---

### Exemplo 2: Pizzaria Estabelecida

**Cliente:** "Preciso de bot para minha pizzaria"

**Você:** "Olá! 👋 Pizzaria é nosso forte!

Me conta mais:
- Quantos pedidos faz por dia?
- Entrega em vários bairros?
- Já usa cupons ou cashback para fidelizar?"

**Cliente:** "Uns 80 pedidos/dia, 5 bairros diferentes, não tenho cupom ainda"

**Você:** "Para pizzarias com esse volume, o **Plano Completo (R$ 499)** é perfeito! 🚀

Você vai usar:
✅ Função MEIO A MEIO (exclusiva!)
✅ Taxa de entrega POR BAIRRO (seus 5 bairros!)
✅ Sistema de CUPONS para fidelizar
✅ CASHBACK automático
✅ 30 dias de suporte

Com 80 pedidos/dia, os recursos de fidelização se pagam rápido! Vale os R$ 200 a mais que o básico! 📈

Quer ver funcionando?"

---

### Exemplo 3: Cliente Indeciso

**Cliente:** "Qual a diferença entre os planos?"

**Você:** "Ótima pergunta! Deixa eu explicar de forma simples:

🌟 **PLANO BÁSICO - R$ 299**
→ Automação completa de atendimento
→ Taxa de entrega única
→ 15 dias de suporte
→ **Ideal se:** está começando ou quer só automação

🚀 **PLANO COMPLETO - R$ 499**
→ Tudo do Básico +
→ Taxa POR BAIRRO
→ Cupons e Cashback
→ Meio a Meio (pizzas)
→ 30 dias de suporte
→ **Ideal se:** negócio estabelecido, pizzaria, quer fidelizar

Para te indicar melhor: seu delivery já funciona? Quantos pedidos/dia?"

---

## 📝 FORMATO DAS RESPOSTAS:

**Máximo 10 linhas por resposta**
**Use emojis moderadamente (2-4 por resposta)**
**Seja direto e objetivo**
**Sempre termine com próximo passo ou pergunta**

---

## 🚀 CALL TO ACTION FINAIS:

Quando cliente decidir o plano, SEMPRE envie:

"Excelente escolha! [PLANO] vai transformar seu delivery! 🎉

**Próximos passos:**
1️⃣ Acesse: https://bot-whatsapp-450420.web.app/
2️⃣ Veja demonstração completa
3️⃣ Preencha formulário
4️⃣ Teste GRÁTIS antes de pagar

🎁 BÔNUS: Like no Instagram = +3 meses suporte!

Alguma dúvida?"

---

**Lembre-se:** Você é um CONSULTOR, não um vendedor. Entenda necessidades, recomende com base nelas, seja transparente. O cliente certo no plano certo = cliente satisfeito! 🎯`;

/**
 * 🔥 Gera system prompt personalizado com nome do cliente
 */
export function getSystemPromptForCustomer(customerName = '') {
  let prompt = SYSTEM_PROMPT;
  
  if (customerName) {
    prompt += `\n\n**IMPORTANTE:** O nome do cliente é ${customerName}. Use o nome dele naturalmente para criar rapport e personalizar recomendações.`;
  }
  
  prompt += `\n\n---\n_Prompt Version: ${PROMPT_VERSION} | Last Updated: ${LAST_UPDATED} | ${UPDATE_NOTES}_`;
  
  return prompt;
}

/**
 * 🔥 Detecta qual plano recomendar baseado na mensagem
 */
export function detectRecommendedPlan(message) {
  if (!message) return null;
  
  const msg = message.toLowerCase();
  
  // Contadores de sinais
  let basicoScore = 0;
  let completoScore = 0;
  
  // Verifica keywords do Básico
  NEED_DETECTION.indica_basico.keywords.forEach(keyword => {
    if (msg.includes(keyword)) basicoScore++;
  });
  
  // Verifica keywords do Completo
  NEED_DETECTION.indica_completo.keywords.forEach(keyword => {
    if (msg.includes(keyword)) completoScore++;
  });
  
  // Verifica keywords de indecisão
  const isIndeciso = NEED_DETECTION.indeciso.keywords.some(keyword => 
    msg.includes(keyword)
  );
  
  if (isIndeciso) return 'indeciso';
  if (completoScore > basicoScore) return 'completo';
  if (basicoScore > completoScore) return 'basico';
  
  return null; // Precisa de mais informações
}

/**
 * 🔥 Retorna script de vendas apropriado
 */
export function getSalesScript(type, subtype = null) {
  if (!SALES_SCRIPTS[type]) return null;
  
  if (subtype && SALES_SCRIPTS[type][subtype]) {
    return SALES_SCRIPTS[type][subtype];
  }
  
  return SALES_SCRIPTS[type];
}

/**
 * 🔥 Retorna comparação entre planos formatada
 */
export function getPlansComparison() {
  return `🌟 **PLANO BÁSICO - R$ 299**
${PRICING_PLANS.basico.ideal_para.map(item => `→ ${item}`).join('\n')}

🚀 **PLANO COMPLETO - R$ 499**
${PRICING_PLANS.completo.ideal_para.map(item => `→ ${item}`).join('\n')}

**Recursos Comuns:**
${PLANS_COMPARISON.recursos_comuns.slice(0, 5).map(item => `✅ ${item}`).join('\n')}

**Diferenças Principais:**
📍 Taxa entrega: ${PLANS_COMPARISON.diferencas.taxa_entrega.basico} vs ${PLANS_COMPARISON.diferencas.taxa_entrega.completo}
🎁 Fidelização: ${PLANS_COMPARISON.diferencas.fidelizacao.basico} vs ${PLANS_COMPARISON.diferencas.fidelizacao.completo}
📞 Suporte: ${PLANS_COMPARISON.diferencas.suporte.basico} vs ${PLANS_COMPARISON.diferencas.suporte.completo}`;
}

/**
 * 🔥 Retorna informações detalhadas de um plano
 */
export function getPlanDetails(planSlug) {
  const plan = PRICING_PLANS[planSlug];
  if (!plan) return null;
  
  return {
    nome: plan.nome,
    valor: plan.valor_promocional,
    economia: plan.economia,
    ideal_para: plan.ideal_para,
    funcionalidades: plan.funcionalidades,
    destaque: plan.destaque
  };
}

/**
 * 🔥 Mensagem de encaminhamento para fanpage
 * @returns {string}
 */
export function getFanpageMessage() {
  return `
🔗 *Acesse nossa fanpage para conhecer todos os detalhes:*
${process.env.FANPAGE_URL || 'https://bot-whatsapp-450420.web.app/'}

Lá você encontra:
✅ Demonstração completa do bot
✅ Fluxo real de conversação
✅ Comparação detalhada dos planos
✅ Formulário para solicitar teste gratuito

Ou fale direto com o Roberto: ${process.env.WHATSAPP_SUPPORT || '(13) 99606-9536'}
`.trim();
}

// 🔥 Export para compatibilidade
export const FANPAGE_MESSAGE = getFanpageMessage();

/**
 * 🔥 Validação da base de conhecimento
 */
export function validateKnowledgeBase() {
  const errors = [];
  
  // Valida planos
  if (!PRICING_PLANS.basico?.valor_promocional) {
    errors.push('Preço do Plano Básico não definido');
  }
  if (!PRICING_PLANS.completo?.valor_promocional) {
    errors.push('Preço do Plano Completo não definido');
  }
  
  // Valida scripts
  if (!SALES_SCRIPTS.descoberta_necessidades) {
    errors.push('Scripts de vendas não definidos');
  }
  
  // Valida contatos
  if (!KNOWLEDGE_BASE.contato?.whatsapp) {
    errors.push('WhatsApp não definido');
  }
  if (!KNOWLEDGE_BASE.contato?.fanpage) {
    errors.push('Fanpage não definida');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 🔥 Mostra resumo da base
 */
export function showKnowledgeSummary() {
  console.log('\n📚 ╔═══════════════════════════════════════════╗');
  console.log('📚 BASE DE CONHECIMENTO - RESUMO');
  console.log('📚 ╚═══════════════════════════════════════════╝');
  console.log(`📌 Versão: ${PROMPT_VERSION} (${UPDATE_NOTES})`);
  console.log(`📅 Última Atualização: ${LAST_UPDATED}`);
  console.log('');
  console.log('💰 PLANOS DISPONÍVEIS:');
  console.log(`   🌟 Básico: ${PRICING_PLANS.basico.valor_promocional}`);
  console.log(`   🚀 Completo: ${PRICING_PLANS.completo.valor_promocional}`);
  console.log('');
  console.log(`🏢 Produto: ${KNOWLEDGE_BASE.produto.nome}`);
  console.log(`📱 WhatsApp: ${KNOWLEDGE_BASE.contato.whatsapp}`);
  console.log(`🌐 Fanpage: ${KNOWLEDGE_BASE.contato.fanpage}`);
  console.log(`🎁 Instagram: ${KNOWLEDGE_BASE.promocoes.instagram.link}`);
  console.log('');
  
  const validation = validateKnowledgeBase();
  if (validation.valid) {
    console.log('✅ Base de conhecimento validada com sucesso!');
  } else {
    console.log('⚠️ Problemas encontrados:');
    validation.errors.forEach(error => {
      console.log(`   - ${error}`);
    });
  }
  
  console.log('📚 ╚═══════════════════════════════════════════╝\n');
}

// Validação automática ao carregar
const validation = validateKnowledgeBase();
if (!validation.valid) {
  console.warn('⚠️ ATENÇÃO: Problemas na base de conhecimento:');
  validation.errors.forEach(error => console.warn(`   - ${error}`));
}

export default {
  PRICING_PLANS,
  PLANS_COMPARISON,
  NEED_DETECTION,
  SALES_SCRIPTS,
  KNOWLEDGE_BASE,
  SYSTEM_PROMPT,
  FANPAGE_MESSAGE,
  PROMPT_VERSION,
  LAST_UPDATED,
  UPDATE_NOTES,
  getSystemPromptForCustomer,
  detectRecommendedPlan,
  getSalesScript,
  getPlansComparison,
  getPlanDetails,
  validateKnowledgeBase,
  showKnowledgeSummary
};