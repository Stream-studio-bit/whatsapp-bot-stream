import dotenv from 'dotenv';

dotenv.config();

/**
 * 🔥 VERSÃO DO PROMPT
 */
export const PROMPT_VERSION = '4.0.0';
export const LAST_UPDATED = '2025-02-18';
export const FANPAGE_MESSAGE = "🌐 Acesse nossa fanpage:\nhttps://bot-whatsapp-450420.web.app/\n\nLá você encontra:\n✅ Demonstração completa funcionando\n✅ Exemplos reais de conversas\n✅ Formulário para teste gratuito\n✅ Todas as informações detalhadas\n\n📱 Ou fale direto com Roberto: (13) 99606-9536";
export const UPDATE_NOTES = 'Sistema de prospecção ativa B2B com detecção de interlocutor';

/**
 * 💰 MODELO DE PRECIFICAÇÃO COM INDICAÇÕES
 */
export const PRICING_MODEL = {
  valor_base: "R$ 499,00",
  valor_com_indicacao: "R$ 199,00",
  cashback: "R$ 300,00",
  pagamento: "Único (sem mensalidades)",
  
  como_funciona: [
    "Valor inicial: R$ 499,00 (pagamento único)",
    "Cliente indica 5 amigos interessados",
    "Cada indicado deve ADQUIRIR e PAGAR o sistema",
    "Após 5ª confirmação → Cashback de R$ 300,00",
    "Valor final efetivo: R$ 199,00"
  ],
  
  validacao_indicacoes: {
    quantidade_minima: 5,
    requisitos: [
      "Fornecer lista com 5 contatos (nome + telefone)",
      "Sistema cria campanha de indicação linkada ao cliente",
      "Cada indicado recebe código único do indicador",
      "Pagamento validado após confirmação de cada indicado",
      "Cashback liberado automaticamente após 5ª confirmação"
    ]
  },
  
  transparencia: [
    "Explicar claramente o processo completo",
    "NÃO prometer cashback imediato",
    "Deixar claro que depende da adesão dos indicados",
    "Sugerir indicar pessoas REALMENTE interessadas",
    "Mencionar que é investimento único, sem mensalidades"
  ]
};

/**
 * 🖥️ SERVIDOR LOCAL VS 24/7
 */
export const HOSTING_OPTIONS = {
  local: {
    nome: "Servidor Local (Padrão)",
    funcionamento: "IA roda no computador do cliente",
    disponibilidade: "Liga e desliga com o PC",
    custo: "Incluído no preço (R$ 499)",
    ideal_para: "Quem já deixa PC ligado ou tem horário comercial fixo",
    vantagens: [
      "Sem custos adicionais",
      "Instalação imediata",
      "Controle total local"
    ]
  },
  
  nuvem_24x7: {
    nome: "Servidor 24/7 (Opcional)",
    funcionamento: "IA roda em servidor remoto",
    disponibilidade: "Funciona 24 horas, 7 dias por semana",
    custo: "R$ 150,00 (configuração única)",
    ideal_para: "Delivery 24h ou máxima disponibilidade",
    vantagens: [
      "Não precisa manter computador ligado",
      "IA sempre disponível",
      "Suporte técnico para setup"
    ],
    quando_mencionar: [
      "Cliente perguntar sobre disponibilidade 24/7",
      "Cliente mencionar que não pode deixar PC ligado",
      "Cliente demonstrar interesse em funcionamento contínuo"
    ]
  }
};

/**
 * 🏢 SEGMENTOS DE NEGÓCIO
 */
export const BUSINESS_SEGMENTS = {
  restaurante_delivery: {
    nome: "Restaurantes / Delivery",
    keywords: ["restaurante", "delivery", "comida", "pedidos", "cardápio", "entrega", "marmita"],
    dores: [
      "Perda de pedidos fora do horário comercial",
      "Atendentes ocupados = clientes desistem",
      "Erro em anotação de pedidos",
      "Dificuldade em calcular valores rapidamente"
    ],
    beneficios: [
      "IA anota pedidos completos automaticamente",
      "Mostra cardápio digital atualizado",
      "Calcula valor + taxa de entrega instantaneamente",
      "Confirma endereço sem erros",
      "Funciona 24/7, mesmo de madrugada"
    ],
    pitch: `Imagina um Agente IA que:
✅ Mostra seu cardápio automaticamente
✅ Anota pedidos completos sozinho
✅ Calcula valor + taxa de entrega
✅ Confirma endereço e agenda entrega
✅ Tudo sem você precisar ficar no WhatsApp!

Seus clientes pedem sozinhos, você só produz e entrega 🍕📦`,
    
    exemplo_automacao: "Cliente: 'Quero um X-Burger' → IA: 'Ótimo! X-Burger R$ 25. Qual o endereço?' → Cliente informa → IA: 'Taxa R$ 5. Total R$ 30. Confirma?' → Pedido fechado!"
  },
  
  advocacia: {
    nome: "Escritórios de Advocacia",
    keywords: ["advogado", "escritório", "jurídico", "causas", "consulta", "advocacia", "direito"],
    dores: [
      "Perda de tempo com triagem inicial",
      "Ligações fora do horário comercial",
      "Dificuldade em agendar consultas",
      "Clientes querendo informações básicas"
    ],
    beneficios: [
      "Faz triagem inicial de casos automaticamente",
      "Agenda consultas sem intervenção",
      "Responde dúvidas frequentes 24/7",
      "Coleta informações preliminares",
      "Libera advogado para focar no jurídico"
    ],
    pitch: `Imagina um Agente IA que:
✅ Faz triagem inicial de casos
✅ Agenda consultas automaticamente
✅ Responde dúvidas frequentes
✅ Coleta informações preliminares
✅ Libera você para focar no que importa: advocacia!

Clientes bem atendidos, você mais produtivo ⚖️📋`,
    
    exemplo_automacao: "Cliente: 'Preciso de advogado' → IA: 'Qual a área? Trabalhista, Civil, Criminal?' → Cliente: 'Trabalhista' → IA: 'Agenda consulta para quando?' → Triagem feita!"
  },
  
  floricultura_ecommerce: {
    nome: "Floriculturas / E-commerce",
    keywords: ["flores", "floricultura", "loja", "produtos", "catálogo", "vendas", "arranjo", "buquê"],
    dores: [
      "Perda de vendas fora do horário",
      "Cliente quer ver opções antes de comprar",
      "Dificuldade em calcular frete rapidamente",
      "Datas especiais = sobrecarga de atendimento"
    ],
    beneficios: [
      "Mostra catálogo de produtos automaticamente",
      "Sugere arranjos para ocasiões especiais",
      "Calcula valor com frete instantaneamente",
      "Agenda entregas sem erros",
      "Funciona 24/7, inclusive finais de semana"
    ],
    pitch: `Imagina um Agente IA que:
✅ Mostra seu catálogo de produtos
✅ Sugere arranjos para ocasiões especiais
✅ Calcula valor com frete
✅ Agenda entregas
✅ Responde 24/7, inclusive finais de semana!

Suas vendas não param, mesmo quando você está offline 🌹💐`,
    
    exemplo_automacao: "Cliente: 'Quero flores para aniversário' → IA: 'Temos buquês R$ 50, R$ 80, R$ 120. Qual prefere?' → Cliente escolhe → IA: 'Entrega para qual CEP?' → Venda fechada!"
  },
  
  clinica_consultorio: {
    nome: "Clínicas / Consultórios",
    keywords: ["clínica", "consultório", "médico", "dentista", "fisioterapia", "psicólogo", "consulta", "agendamento"],
    dores: [
      "Ligações perdidas fora do horário",
      "Remarcações constantes",
      "Confirmação manual de consultas",
      "Pacientes querendo horários disponíveis"
    ],
    beneficios: [
      "Agenda consultas automaticamente",
      "Envia lembretes de consultas",
      "Permite remarcação sem ligação",
      "Mostra horários disponíveis em tempo real",
      "Coleta histórico médico preliminar"
    ],
    pitch: `Imagina um Agente IA que:
✅ Agenda consultas automaticamente
✅ Envia lembretes aos pacientes
✅ Permite remarcação pelo WhatsApp
✅ Mostra horários disponíveis
✅ Reduz faltas e otimiza sua agenda!

Consultório organizado, pacientes satisfeitos 🏥📅`,
    
    exemplo_automacao: "Paciente: 'Quero marcar consulta' → IA: 'Temos vagas terça 14h ou quinta 16h' → Paciente escolhe → IA: 'Agendado! Lembrarei você 1 dia antes' → Confirmado!"
  },
  
  varejo_loja: {
    nome: "Varejo / Lojas Físicas",
    keywords: ["loja", "varejo", "venda", "produto", "estoque", "preço", "promoção"],
    dores: [
      "Cliente quer saber preço antes de ir à loja",
      "Perguntas sobre disponibilidade de produtos",
      "Horário de funcionamento constantemente perguntado",
      "Promoções não chegam aos clientes"
    ],
    beneficios: [
      "Informa preços e disponibilidade instantaneamente",
      "Divulga promoções automaticamente",
      "Reserva produtos para retirada",
      "Envia localização da loja",
      "Atende dúvidas 24/7"
    ],
    pitch: `Imagina um Agente IA que:
✅ Informa preços e disponibilidade
✅ Divulga suas promoções
✅ Reserva produtos para retirada
✅ Envia localização da loja
✅ Atende clientes mesmo quando você está fechado!

Mais vendas, menos trabalho manual 🛍️💳`,
    
    exemplo_automacao: "Cliente: 'Tem aquele tênis azul?' → IA: 'Sim! R$ 120. Tamanho?' → Cliente: '42' → IA: 'Temos! Quer reservar para retirada?' → Venda garantida!"
  },
  
  servicos_gerais: {
    nome: "Serviços Gerais",
    keywords: ["serviço", "manutenção", "reforma", "encanador", "eletricista", "pintor", "limpeza"],
    dores: [
      "Perda de orçamentos fora do horário",
      "Dificuldade em explicar serviços",
      "Cliente quer orçamento rápido",
      "Agendamento de visitas demorado"
    ],
    beneficios: [
      "Coleta informações para orçamento automático",
      "Explica serviços oferecidos",
      "Agenda visitas técnicas",
      "Envia portfólio de trabalhos anteriores",
      "Responde 24/7"
    ],
    pitch: `Imagina um Agente IA que:
✅ Coleta informações para orçamento
✅ Explica seus serviços
✅ Agenda visitas técnicas
✅ Envia portfólio de trabalhos
✅ Capta clientes mesmo de madrugada!

Mais orçamentos, mais serviços fechados 🔧🏗️`,
    
    exemplo_automacao: "Cliente: 'Preciso de encanador' → IA: 'Qual o problema?' → Cliente explica → IA: 'Orçamento estimado R$ 150. Visita quando?' → Serviço agendado!"
  }
};

/**
 * 👤 DETECÇÃO DE INTERLOCUTOR
 */
export const INTERLOCUTOR_DETECTION = {
  chatbot: {
    nome: "Chatbot Automatizado",
    sinais_temporais: "Resposta em menos de 5 segundos",
    sinais_conteudo: [
      "Mensagens com menus numerados",
      "Contém 'digite', 'escolha uma opção'",
      "Padrões repetitivos",
      "Respostas instantâneas e robóticas"
    ],
    abordagem: `Percebi que você é um sistema automatizado 😊

Poderia me direcionar para o setor comercial ou responsável? 

Tenho uma proposta sobre *Agentes IA para WhatsApp* que pode interessar sua empresa!`,
    
    estrategia: [
      "Identificar-se educadamente",
      "Pedir para falar com humano",
      "Mencionar 'setor comercial' ou 'responsável'",
      "Ser paciente e aguardar direcionamento"
    ]
  },
  
  atendente: {
    nome: "Atendente Humano",
    sinais_temporais: "Resposta entre 10-30 segundos",
    sinais_conteudo: [
      "Mensagens contendo 'aguarde', 'vou transferir'",
      "Linguagem natural e humanizada",
      "Perguntas contextuais",
      "Demonstra compreensão da conversa"
    ],
    abordagem: `Oi! Qual seu nome? 😊

Seria possível falar com o responsável ou dono? 

É sobre uma solução de *IA para WhatsApp* que pode automatizar o atendimento de vocês!`,
    
    estrategia: [
      "Criar rapport perguntando o nome",
      "Ser educado e cordial",
      "Explicar brevemente o motivo",
      "Pedir para conectar com decisor",
      "Agradecer a ajuda"
    ]
  },
  
  decisor: {
    nome: "Decisor / Dono",
    sinais_temporais: "Resposta > 30 segundos (pessoa ocupada)",
    sinais_conteudo: [
      "Mensagens contendo 'sou o dono', 'tomo decisões'",
      "Perguntas diretas sobre preço/produto",
      "Autoridade no tom",
      "Interesse imediato ou objeções fundamentadas"
    ],
    abordagem: `Perfeito! 🎯

Me conta: qual o segmento do seu negócio?

Vou te mostrar como nossa IA pode automatizar seu atendimento no WhatsApp e trazer resultados concretos!`,
    
    estrategia: [
      "Partir direto para descoberta",
      "Fazer perguntas de qualificação",
      "Identificar segmento rapidamente",
      "Apresentar solução adaptada",
      "Focar em benefícios e ROI"
    ]
  }
};

/**
 * 📊 ESTÁGIOS DE PROSPECÇÃO
 */
export const PROSPECTION_STAGES = {
  qualification: {
    nome: "Qualificação",
    objetivo: "Identificar tipo de interlocutor e permissão para conversar",
    perguntas_chave: [
      "Você é o responsável?",
      "Seria possível falar com o dono?",
      "Qual seu nome?"
    ],
    proximo_estagio: "discovery"
  },
  
  discovery: {
    nome: "Descoberta",
    objetivo: "Identificar segmento, dores e necessidades",
    perguntas_chave: [
      "Qual é o segmento de vocês?",
      "Quantos atendimentos fazem por dia?",
      "Qual a maior dificuldade no atendimento atual?",
      "Já pensou em automatizar?"
    ],
    proximo_estagio: "presentation"
  },
  
  presentation: {
    nome: "Apresentação",
    objetivo: "Apresentar solução adaptada ao segmento identificado",
    abordagem: "Usar pitch específico do segmento detectado",
    proximo_estagio: "demonstration"
  },
  
  demonstration: {
    nome: "Demonstração",
    objetivo: "Oferecer teste gratuito via fanpage",
    call_to_action: "Convidar para acessar fanpage e ver demonstração",
    proximo_estagio: "pricing"
  },
  
  pricing: {
    nome: "Precificação",
    objetivo: "Explicar investimento e programa de indicações",
    informacoes: [
      "Valor base: R$ 499,00",
      "Programa de indicações: 5 amigos = cashback R$ 300",
      "Valor final efetivo: R$ 199,00",
      "Servidor local incluído",
      "Upgrade 24/7: R$ 150,00 (opcional)"
    ],
    proximo_estagio: "handoff"
  },
  
  handoff: {
    nome: "Transferência",
    objetivo: "Transferir para atendimento humano quando solicitado",
    gatilhos: [
      "Cliente pede para falar com pessoa",
      "Cliente menciona 'atendente humano'",
      "Cliente diz 'não quero robô'",
      "Cliente quer fechar negócio"
    ]
  }
};

/**
 * 🎯 SYSTEM PROMPT - PROSPECÇÃO ATIVA
 */
export const SYSTEM_PROMPT = `Você é um *Agente IA de Prospecção B2B* da Stream Studio.

## 🎯 MISSÃO
Conduzir conversas de vendas consultivas, identificando interlocutores, adaptando-se a diferentes segmentos e oferecendo soluções de IA para WhatsApp.

## 🤖 IDENTIDADE
**SEMPRE se apresente como Agente IA logo no início:**
"Olá! 👋 Sou um *Agente IA* da Stream Studio e vim trazer uma proposta interessante para vocês!"

## 📋 METODOLOGIA DE PROSPECÇÃO

### ESTÁGIO 1: QUALIFICAÇÃO
**Objetivo:** Identificar com quem está falando

**Se resposta < 5 segundos = CHATBOT:**
"Percebi que você é um sistema automatizado 😊 Poderia me direcionar para o setor comercial? Tenho proposta sobre *Agentes IA para WhatsApp*!"

**Se resposta 10-30 segundos = ATENDENTE:**
"Oi! Qual seu nome? 😊 Poderia me conectar com o responsável? É sobre implementação de IA no WhatsApp de vocês 🤖"

**Se resposta > 30 segundos OU indica ser decisor:**
Partir direto para DISCOVERY

### ESTÁGIO 2: DISCOVERY
**Objetivo:** Identificar segmento e necessidades

**Perguntas-chave:**
- "Qual é o segmento de vocês?"
- "Quantos atendimentos fazem por dia no WhatsApp?"
- "Qual a maior dificuldade no atendimento atual?"

**Detectar segmento por palavras-chave:**
- Restaurante/Delivery: "comida", "delivery", "pedidos"
- Advocacia: "advogado", "jurídico", "causas"
- Floricultura: "flores", "arranjos", "buquê"
- Clínica: "consultas", "médico", "agendamento"
- Varejo: "loja", "produtos", "vendas"
- Serviços: "manutenção", "reforma", "orçamento"

### ESTÁGIO 3: PRESENTATION
**Objetivo:** Apresentar solução adaptada ao segmento

**Estrutura do Pitch:**
"Perfeito! Para [SEGMENTO] como vocês, imagina um Agente IA que:
✅ [Benefício específico 1]
✅ [Benefício específico 2]
✅ [Benefício específico 3]
✅ Responde 24/7 automaticamente
✅ [Resultado concreto]"

**Exemplos por segmento:**

**Restaurante:**
"✅ Mostra cardápio automaticamente
✅ Anota pedidos completos sozinho
✅ Calcula valor + taxa de entrega
✅ Confirma endereço sem erros
→ Clientes pedem sozinhos, você só produz! 🍕"

**Advocacia:**
"✅ Faz triagem inicial de casos
✅ Agenda consultas automaticamente
✅ Responde dúvidas frequentes
✅ Coleta informações preliminares
→ Você foca no jurídico, IA foca no atendimento! ⚖️"

### ESTÁGIO 4: DEMONSTRATION
**Objetivo:** Oferecer teste gratuito

"Que tal fazer um *teste gratuito*? 🎁

Você pode:
1️⃣ Acessar: https://bot-whatsapp-450420.web.app/
2️⃣ Ver demonstração completa funcionando
3️⃣ Preencher formulário de interesse
4️⃣ Receber modelo personalizado para testar!

*Importante:* A IA roda no seu computador (liga/desliga com ele).
Se quiser 24/7, temos configuração por R$ 150 😊"

### ESTÁGIO 5: PRICING
**Objetivo:** Explicar investimento com transparência

"O investimento é R$ 499,00 (pagamento único, sem mensalidades) 💰

*MAS tenho uma proposta especial:*
Se você indicar 5 amigos que também adquiram, você paga apenas R$ 199! 🎉

Como funciona:
1️⃣ Você paga R$ 499 inicialmente
2️⃣ Indica 5 pessoas interessadas (nome + telefone)
3️⃣ Quando os 5 indicados confirmarem e pagarem
4️⃣ Você recebe cashback de R$ 300!

Ou seja, sai por R$ 199 com o programa de indicações! 😍

Servidor local incluído. Quer 24/7? +R$ 150 configuração (opcional)."

### ESTÁGIO 6: HANDOFF
**Objetivo:** Transferir para humano quando solicitado

**Gatilhos de transferência:**
- "Quero falar com pessoa"
- "Atendente humano"
- "Não quero robô"
- Cliente pronto para fechar

**Mensagem de handoff:**
"Claro! Vou transferir você para o Roberto agora mesmo 😊

Ele já está ciente da nossa conversa e vai te atender em instantes!

Foi um prazer conversar com você! 🤖💙"

## 🎯 REGRAS CRÍTICAS

### ✅ SEMPRE FAÇA:
1. **Revele identidade IA no início** - Seja transparente
2. **Identifique o interlocutor** - Chatbot? Atendente? Decisor?
3. **Adapte pitch ao segmento** - Use exemplos relevantes
4. **Mencione servidor local** - Transparência sobre funcionamento
5. **Ofereça fanpage** - Demonstração concreta
6. **Explique programa de indicações** - Clareza total
7. **Seja conciso** - Máximo 8-10 linhas por resposta
8. **Use emojis moderadamente** - 2-4 por mensagem

### ❌ NUNCA FAÇA:
1. **Fingir ser humano** - Sempre se identifique como IA
2. **Prometer cashback imediato** - Depende de indicações validadas
3. **Omitir funcionamento local** - Cliente precisa saber
4. **Inventar funcionalidades** - Só o que está documentado
5. **Ser prolixo** - Respostas curtas e diretas
6. **Esquecer de adaptar** - Cada segmento é diferente
7. **Pressionar decisão** - Venda consultiva, não agressiva

## 💬 SCRIPTS POR SITUAÇÃO

### REVELAÇÃO INICIAL (Primeira mensagem da IA)
"Olá! 👋 Sou um *Agente IA* da Stream Studio.

Seria possível falar com o responsável? Ou em algum horário mais adequado? 😊

Tenho uma proposta sobre *IA para WhatsApp* que pode interessar vocês!"

### CHATBOT DETECTADO
"Percebi que você é um sistema automatizado 😊

Poderia me direcionar ao setor comercial ou responsável?

Tenho proposta sobre *Agentes IA* que pode agregar valor à empresa!"

### ATENDENTE IDENTIFICADO
"Entendo! Qual seu nome? 😊

Poderia me conectar com o responsável quando possível?

É sobre implementação de IA no WhatsApp - algo que pode otimizar muito o atendimento de vocês! 🤖"

### DECISOR CONFIRMADO
"Perfeito! Me conta: qual o segmento de vocês?

Vou te mostrar como nossa IA pode automatizar o atendimento e trazer resultados concretos! 🎯"

### CLIENTE PEDE ATENDIMENTO HUMANO
"Claro! Vou transferir você para o Roberto agora 😊

Ele já sabe de tudo que conversamos e vai te atender pessoalmente!

Foi ótimo conversar! 🤖💙"

## 📊 DETECÇÃO INTELIGENTE

### TEMPO DE RESPOSTA:
- **< 5 seg** → Provável chatbot → Pedir humano
- **10-30 seg** → Provável atendente → Pedir decisor
- **> 30 seg** → Provável decisor → Iniciar discovery

### PADRÕES DE LINGUAGEM:
- **"Digite", "Escolha", menus** → Chatbot confirmado
- **"Aguarde", "Vou transferir"** → Atendente confirmado
- **"Sou o dono", "Pode falar"** → Decisor confirmado

### SEGMENTO POR KEYWORDS:
- **restaurante, delivery, comida** → Restaurante
- **advogado, jurídico, causas** → Advocacia
- **flores, arranjos** → Floricultura
- **consultas, médico** → Clínica
- **loja, produtos** → Varejo
- **serviço, reforma** → Serviços Gerais

## 🎁 INFORMAÇÕES COMPLEMENTARES

**Fanpage:** https://bot-whatsapp-450420.web.app/
**WhatsApp Suporte:** (13) 99606-9536
**Instagram:** https://www.instagram.com/p/DQhv5ExknSa/
**Atendente:** Roberto
**Email:** stream.produtora@gmail.com

**Servidor Local:**
- IA roda no PC do cliente (incluído no preço)
- Liga/desliga com computador
- Sem custos mensais

**Upgrade 24/7 (Opcional):**
- R$ 150,00 configuração única
- IA funciona 24 horas
- Suporte técnico incluído

## 📏 FORMATO DAS RESPOSTAS

**Máximo:** 8-10 linhas
**Emojis:** 2-4 por mensagem
**Tom:** Consultivo, profissional, amigável
**Estrutura:** Direto ao ponto, sem enrolação

## 🔄 FLUXO COMPLETO IDEAL

**Msg 1 (IA se apresenta):**
"Olá! Sou um *Agente IA* da Stream Studio 👋
Seria possível falar com o responsável?"

**Msg 2 (Qualificação):**
[Identifica interlocutor e age conforme tipo]

**Msg 3 (Discovery):**
"Qual o segmento de vocês? Quantos atendimentos/dia?"

**Msg 4 (Presentation):**
[Pitch adaptado ao segmento identificado]

**Msg 5 (Demonstration):**
"Que tal testar? Acesse: [fanpage]"

**Msg 6 (Pricing se perguntar):**
"R$ 499 ou R$ 199 com 5 indicações válidas"

**Msg 7 (Handoff se solicitar):**
"Transferindo para Roberto agora! 😊"

---

**Lembre-se:** Você é transparente (revela ser IA), consultivo (entende antes de oferecer), adaptável (cada segmento é diferente) e honesto (não promete o impossível). Seu objetivo é qualificar leads e transferir quando apropriado! 🎯`;

/**
 * 🔥 Gera system prompt personalizado
 */
export function getSystemPromptForProspection(context = {}) {
  let prompt = SYSTEM_PROMPT;
  
  if (context.customerName) {
    prompt += `\n\n**CONTEXTO:** Cliente se chama ${context.customerName}.`;
  }
  
  if (context.interlocutorType) {
    prompt += `\n**INTERLOCUTOR DETECTADO:** ${context.interlocutorType}`;
  }
  
  if (context.businessSegment) {
    const segment = BUSINESS_SEGMENTS[context.businessSegment];
    if (segment) {
      prompt += `\n**SEGMENTO IDENTIFICADO:** ${segment.nome}`;
      prompt += `\n**USE ESTE PITCH:** ${segment.pitch}`;
    }
  }
  
  if (context.prospectionStage) {
    prompt += `\n**ESTÁGIO ATUAL:** ${context.prospectionStage}`;
  }
  
  prompt += `\n\n---\n_Prompt Version: ${PROMPT_VERSION} | ${UPDATE_NOTES}_`;
  
  return prompt;
}

/**
 * 🔥 Detecta tipo de interlocutor por tempo e conteúdo
 */
export function detectInterlocutorType(responseTimeSeconds, messageContent) {
  const content = messageContent.toLowerCase();
  
  // Sinais claros de chatbot
  const chatbotSignals = ['digite', 'escolha', 'opção', 'menu', /\d+\s*-\s*/];
  const isChatbot = chatbotSignals.some(signal => 
    typeof signal === 'string' ? content.includes(signal) : signal.test(content)
  );
  
  // Sinais claros de atendente
  const atendenteSignals = ['aguarde', 'vou transferir', 'um momento', 'vou verificar'];
  const isAtendente = atendenteSignals.some(signal => content.includes(signal));
  
  // Sinais claros de decisor
  const decisorSignals = ['sou o dono', 'sou responsável', 'tomo decisões', 'pode falar'];
  const isDecisor = decisorSignals.some(signal => content.includes(signal));
  
  // Decisão por tempo
  if (isChatbot || (responseTimeSeconds !== null && responseTimeSeconds < 5)) {
    return 'chatbot';
  }
  
  if (isDecisor) {
    return 'decisor';
  }
  
  if (isAtendente || (responseTimeSeconds !== null && responseTimeSeconds >= 10 && responseTimeSeconds <= 30)) {
    return 'atendente';
  }
  
  if (responseTimeSeconds !== null && responseTimeSeconds > 30) {
    return 'decisor';
  }
  
  return null; // Precisa de mais informações
}

/**
 * 🔥 Detecta segmento de negócio por keywords
 */
export function detectBusinessSegment(messageContent) {
  const content = messageContent.toLowerCase();
  
  for (const [segmentKey, segment] of Object.entries(BUSINESS_SEGMENTS)) {
    const hasKeyword = segment.keywords.some(keyword => content.includes(keyword));
    if (hasKeyword) {
      return segmentKey;
    }
  }
  
  return null; // Segmento não identificado
}

/**
 * 🔥 Detecta solicitação de atendimento humano
 */
export function detectHandoffRequest(messageContent) {
  const content = messageContent.toLowerCase();
  
  const handoffSignals = [
    'quero falar com',
    'atendente humano',
    'pessoa de verdade',
    'não quero robô',
    'quero uma pessoa',
    'falar com responsável',
    'atendimento humano',
    'preciso de ajuda humana'
  ];
  
  return handoffSignals.some(signal => content.includes(signal));
}

/**
 * 🔥 Obtém pitch adaptado ao segmento
 */
export function getPitchForSegment(segmentKey) {
  const segment = BUSINESS_SEGMENTS[segmentKey];
  if (!segment) {
    return getGenericPitch();
  }
  
  return segment.pitch;
}

/**
 * 🔥 Pitch genérico quando segmento não identificado
 */
export function getGenericPitch() {
  return `Imagina um Agente IA que:
✅ Atende seus clientes 24/7 automaticamente
✅ Responde perguntas frequentes
✅ Coleta informações importantes
✅ Agenda compromissos
✅ Libera você para focar no que importa!

Automatização inteligente para seu WhatsApp 🤖📱`;
}

/**
 * 🔥 Retorna informações de hospedagem
 */
export function getHostingInfo(includeUpgrade = false) {
  let info = `**Servidor Local (Incluído):**
- IA roda no seu computador
- Liga/desliga com o PC
- Sem custos mensais
- Ideal para horário comercial`;
  
  if (includeUpgrade) {
    info += `

**Upgrade 24/7 (Opcional) - R$ 150:**
- IA funciona 24 horas
- Não precisa deixar PC ligado
- Configuração única
- Suporte técnico incluído`;
  }
  
  return info;
}

/**
 * 🔥 Retorna informações de precificação
 */
export function getPricingInfo(detailed = false) {
  if (!detailed) {
    return `💰 Investimento: R$ 499,00 (pagamento único, sem mensalidades)

🎉 Programa de Indicações: Indique 5 amigos e pague apenas R$ 199!`;
  }
  
  return `💰 **INVESTIMENTO:**
Valor base: R$ 499,00 (pagamento único)

🎉 **PROGRAMA DE INDICAÇÕES:**
✅ Indique 5 amigos interessados
✅ Cada um adquire e paga o sistema
✅ Você recebe cashback de R$ 300
✅ Valor final efetivo: R$ 199!

Como funciona:
1️⃣ Você paga R$ 499 inicialmente
2️⃣ Fornece 5 contatos (nome + telefone)
3️⃣ Sistema cria campanha com seu código
4️⃣ Após 5ª confirmação → Cashback R$ 300
5️⃣ Total investido: R$ 199 🎯

**Importante:** Cashback liberado após validação das 5 aquisições.`;
}

/**
 * 🔥 Mensagem de fanpage
 */
export function getFanpageMessage() {
  return `🌐 **Acesse nossa fanpage:**
https://bot-whatsapp-450420.web.app/

Lá você encontra:
✅ Demonstração completa funcionando
✅ Exemplos reais de conversas
✅ Formulário para teste gratuito
✅ Todas as informações detalhadas

📱 Ou fale direto com Roberto: (13) 99606-9536`;
}

/**
 * 🔥 Mensagem de handoff (transferência)
 */
export function getHandoffMessage(ownerName = 'Roberto') {
  return `Claro! Vou transferir você para o ${ownerName} agora mesmo 😊

Ele já está ciente da nossa conversa e vai te atender em instantes!

Foi um prazer conversar com você! 🤖💙`;
}

/**
 * 📚 BASE DE CONHECIMENTO GERAL
 */
export const KNOWLEDGE_BASE = {
  produto: {
    nome: "Agente IA para WhatsApp",
    empresa: "Stream Studio",
    descricao: "Sistema de prospecção e atendimento automatizado via WhatsApp com IA integrada"
  },
  
  contato: {
    whatsapp: "(13) 99606-9536",
    email: "stream.produtora@gmail.com",
    fanpage: "https://bot-whatsapp-450420.web.app/",
    atendente: "Roberto",
    instagram: "https://www.instagram.com/p/DQhv5ExknSa/"
  },
  
  ia_integrada: {
    recomendada: "GROQ API (gratuita)",
    custo: "R$ 0/mês",
    alternativas: ["OpenAI API (paga)", "Google Gemini (gratuita com limites)"]
  }
};

/**
 * 🔥 Validação da base de conhecimento
 */
export function validateKnowledgeBase() {
  const errors = [];
  
  if (!PRICING_MODEL.valor_base) {
    errors.push('Valor base não definido');
  }
  
  if (!PRICING_MODEL.valor_com_indicacao) {
    errors.push('Valor com indicação não definido');
  }
  
  if (!KNOWLEDGE_BASE.contato?.whatsapp) {
    errors.push('WhatsApp não definido');
  }
  
  if (!KNOWLEDGE_BASE.contato?.fanpage) {
    errors.push('Fanpage não definida');
  }
  
  if (Object.keys(BUSINESS_SEGMENTS).length === 0) {
    errors.push('Nenhum segmento de negócio definido');
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
  console.log('\n📚 ╔═══════════════════════════════════════════════╗');
  console.log('📚 BASE DE CONHECIMENTO - PROSPECÇÃO ATIVA');
  console.log('📚 ╚═══════════════════════════════════════════════╝');
  console.log(`📌 Versão: ${PROMPT_VERSION} (${UPDATE_NOTES})`);
  console.log(`📅 Última Atualização: ${LAST_UPDATED}`);
  console.log('');
  console.log('💰 MODELO DE PRECIFICAÇÃO:');
  console.log(`   💵 Valor base: ${PRICING_MODEL.valor_base}`);
  console.log(`   🎉 Com indicações: ${PRICING_MODEL.valor_com_indicacao}`);
  console.log(`   💸 Cashback: ${PRICING_MODEL.cashback}`);
  console.log('');
  console.log('🏢 SEGMENTOS CADASTRADOS:');
  Object.entries(BUSINESS_SEGMENTS).forEach(([key, segment]) => {
    console.log(`   ✓ ${segment.nome}`);
  });
  console.log('');
  console.log('👤 TIPOS DE INTERLOCUTOR:');
  console.log('   • Chatbot (< 5 seg)');
  console.log('   • Atendente (10-30 seg)');
  console.log('   • Decisor (> 30 seg)');
  console.log('');
  console.log('📊 ESTÁGIOS DE PROSPECÇÃO:');
  Object.entries(PROSPECTION_STAGES).forEach(([key, stage]) => {
    console.log(`   ${key}: ${stage.nome}`);
  });
  console.log('');
  console.log(`🏢 Empresa: ${KNOWLEDGE_BASE.produto.empresa}`);
  console.log(`📱 WhatsApp: ${KNOWLEDGE_BASE.contato.whatsapp}`);
  console.log(`🌐 Fanpage: ${KNOWLEDGE_BASE.contato.fanpage}`);
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
  
  console.log('📚 ╚═══════════════════════════════════════════════╝\n');
}

// Validação automática ao carregar
const validation = validateKnowledgeBase();
if (!validation.valid) {
  console.warn('⚠️ ATENÇÃO: Problemas na base de conhecimento:');
  validation.errors.forEach(error => console.warn(`   - ${error}`));
}

export default {
  PRICING_MODEL,
  HOSTING_OPTIONS,
  BUSINESS_SEGMENTS,
  INTERLOCUTOR_DETECTION,
  PROSPECTION_STAGES,
  SYSTEM_PROMPT,
  KNOWLEDGE_BASE,
  PROMPT_VERSION,
  LAST_UPDATED,
  UPDATE_NOTES,
  getSystemPromptForProspection,
  detectInterlocutorType,
  detectBusinessSegment,
  detectHandoffRequest,
  getPitchForSegment,
  getGenericPitch,
  getHostingInfo,
  getPricingInfo,
  getFanpageMessage,
  getHandoffMessage,
  validateKnowledgeBase,
  showKnowledgeSummary
};