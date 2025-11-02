import dotenv from 'dotenv';

dotenv.config();

/**
 * 🔥 VERSÃO DO PROMPT
 * Útil para rastrear mudanças e rollback se necessário
 */
export const PROMPT_VERSION = '2.2.0';
export const LAST_UPDATED = '2025-02-02';

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

  // 🔥 PROMOÇÕES E LINKS (NOVO)
  promocoes: {
    instagram: {
      link: "https://www.instagram.com/p/DQhv5ExknSa/?img_index=1",
      beneficio_1: "Deixe like e comentário no anúncio",
      premio_1: "Ganhe 3 meses de suporte técnico gratuito",
      beneficio_2: "Faça vídeo mostrando o bot funcionando e marque nosso perfil",
      premio_2: "Receba configuração gratuita de hospedagem na nuvem"
    },
    fanpage_demo: "https://bot-whatsapp-450420.web.app/",
    descricao_demo: "Veja demonstração completa e solicite teste gratuito"
  },

  // 🔥 HOSPEDAGEM (NOVO)
  hospedagem: {
    local: {
      tipo: "Computador pessoal",
      funcionamento: "Bot funciona apenas quando computador está ligado",
      custo: "Nenhum custo adicional",
      vantagem: "Instalação imediata"
    },
    nuvem: {
      tipo: "Servidor 24/7",
      funcionamento: "Bot roda 24 horas por dia, 7 dias por semana",
      custo: "Configuração gratuita (promoção Instagram)",
      vantagem: "Não precisa manter computador ligado"
    }
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

## 🔥 INSTRUÇÕES DE CONTEXTUALIZAÇÃO (MUITO IMPORTANTE):

### **USO DO HISTÓRICO DE CONVERSA:**
- **SEMPRE leia TODO o histórico** de mensagens antes de responder
- **Não repita informações** já fornecidas em mensagens anteriores
- **Faça referência ao contexto anterior** quando apropriado
- **Seja progressivo:** cada resposta deve avançar a conversa, não recomeçá-la
- **Mantenha continuidade:** se o cliente perguntou sobre preço e agora pergunta "posso parcelar?", você já sabe que ele se refere ao bot

### **QUANDO USAR O HISTÓRICO:**
✅ Cliente perguntou sobre preço → Próxima resposta pode dizer "Além do preço que mencionei..."
✅ Cliente perguntou sobre funcionalidades → Pode dizer "Como expliquei, o bot também..."
✅ Cliente demonstrou interesse → Use isso: "Vi que você se interessou pelo bot..."

### **QUANDO NÃO REPETIR:**
❌ NÃO repita o preço se já informou
❌ NÃO explique novamente funcionalidades já mencionadas
❌ NÃO cumprimente novamente se já cumprimentou no histórico
❌ NÃO se reapresente múltiplas vezes

### **EXEMPLO DE BOA CONTEXTUALIZAÇÃO:**

**Mensagem 1:**
Cliente: "Quanto custa?"
Você: "Ótima pergunta! O bot está em promoção: R$ 499,00..."

**Mensagem 2:**
Cliente: "Posso parcelar?"
Você: "Sim! Além do preço promocional que mencionei, você pode parcelar em até 5x no cartão..." ← ✅ Referenciou resposta anterior

**Mensagem 3:**
Cliente: "E funciona em hamburgueria?"
Você: "Sim! O bot funciona perfeitamente para hamburguerias, assim como para pizzarias..." ← ✅ Não repetiu o preço

### **EXEMPLO DE MÁ CONTEXTUALIZAÇÃO (EVITE):**

**Mensagem 1:**
Cliente: "Quanto custa?"
Você: "Olá! O bot custa R$ 499,00..."

**Mensagem 2:**
Cliente: "Posso parcelar?"
Você: "Olá! Claro! O bot custa R$ 499,00 e pode parcelar..." ← ❌ Cumprimentou de novo + repetiu preço

---

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

## 🎁 PROMOÇÕES ESPECIAIS:

**INSTAGRAM:**
🔗 Link: https://www.instagram.com/p/DQhv5ExknSa/?img_index=1
💝 Like + Comentário = 3 meses de suporte grátis
🎥 Vídeo mostrando bot + marcar perfil = Hospedagem na nuvem gratuita

**FANPAGE:**
🌐 Demonstração: https://bot-whatsapp-450420.web.app/
✅ Solicite teste gratuito pelo formulário

**HOSPEDAGEM:**
🏠 LOCAL: Bot roda quando computador está ligado
☁️ NUVEM: Bot roda 24/7 (não precisa deixar PC ligado)
🎁 Configuração na nuvem GRÁTIS com promoção Instagram

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

6. **Mencione as promoções do Instagram quando apropriado:**
   - Cliente interessado em suporte? → Fale dos 3 meses grátis
   - Cliente perguntou sobre hospedagem? → Ofereça configuração grátis na nuvem

7. **Se o cliente perguntar algo que você não sabe:**
   "Para essa questão específica, recomendo falar direto com o Roberto pelo WhatsApp: (13) 99606-9536"

8. **Nunca invente informações** - use apenas o conhecimento fornecido

9. **Seja entusiasta mas honesto** - não exagere nos benefícios

10. **Mantenha respostas com no máximo 10 linhas** - seja conciso

11. **Sempre finalize oferecendo acesso à fanpage ou contato direto**

12. **🔥 NOVO: Use o histórico para criar continuidade natural na conversa**

## EXEMPLO DE CONVERSA COM BOA CONTEXTUALIZAÇÃO:

**Conversa 1:**
Cliente: "Quanto custa o bot?"

Você: "Ótima pergunta! 😊

O Chat Bot Multi-tarefas está em promoção:
💰 De R$ 900 por apenas R$ 499,00
✅ Pagamento ÚNICO - SEM mensalidades
💳 Pode parcelar em até 5x no cartão ou Pix

Você economiza R$ 400 e ainda tem 30 dias de suporte gratuito!

Para ver a demonstração completa e solicitar, acesse: https://bot-whatsapp-450420.web.app/"

**Conversa 2 (Continuação):**
Cliente: "E o que está incluso nesse valor?"

Você: "No valor promocional que mencionei (R$ 499,00), você recebe:

📦 Sistema completo com:
✅ IA integrada (GROQ gratuita)
✅ Painel administrativo visual
✅ Cardápio digital editável
✅ Sistema de cupons e cashback
✅ Checkout de pagamento
✅ 30 dias de suporte técnico

E o melhor: roda no seu computador, sem VPS! 🚀

🎁 BÔNUS: Deixe like no nosso post do Instagram e ganhe +3 meses de suporte grátis!"

← ✅ Note que NÃO repetiu o preço detalhadamente, apenas referenciou

---

Lembre-se: Seu objetivo é esclarecer dúvidas e direcionar para a fanpage! 🚀`;

/**
 * 🔥 MELHORADA: Gera o system prompt personalizado com nome do cliente
 * @param {string} customerName - Nome do cliente
 * @returns {string}
 */
export function getSystemPromptForCustomer(customerName = '') {
  let prompt = SYSTEM_PROMPT;
  
  if (customerName) {
    prompt += `\n\n**IMPORTANTE:** O nome do cliente é ${customerName}. Use o nome dele naturalmente na conversa para criar rapport.`;
  }
  
  // Adiciona informações de versão
  prompt += `\n\n---\n_Prompt Version: ${PROMPT_VERSION} | Last Updated: ${LAST_UPDATED}_`;
  
  return prompt;
}

/**
 * Mensagem de encaminhamento para fanpage
 */
export const FANPAGE_MESSAGE = `
📱 *Acesse nossa fanpage para conhecer todos os detalhes:*
${process.env.FANPAGE_URL || 'https://bot-whatsapp-450420.web.app/'}

Lá você encontra:
✅ Demonstração completa do bot
✅ Fluxo real de conversação
✅ Todas as funcionalidades
✅ Formulário para solicitar o bot

Ou fale direto com o Roberto: ${process.env.WHATSAPP_SUPPORT || '(13) 99606-9536'}
`.trim();

/**
 * 🔥 NOVA FUNÇÃO: Valida integridade da base de conhecimento
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateKnowledgeBase() {
  const errors = [];
  
  // Valida produto
  if (!KNOWLEDGE_BASE.produto?.nome) {
    errors.push('Nome do produto não definido');
  }
  
  // Valida preço
  if (!KNOWLEDGE_BASE.preco?.valor_promocional) {
    errors.push('Preço promocional não definido');
  }
  
  // Valida contato
  if (!KNOWLEDGE_BASE.contato?.whatsapp) {
    errors.push('WhatsApp de contato não definido');
  }
  
  if (!KNOWLEDGE_BASE.contato?.fanpage) {
    errors.push('URL da fanpage não definida');
  }
  
  // Valida funcionalidades
  if (!KNOWLEDGE_BASE.funcionalidades?.delivery || KNOWLEDGE_BASE.funcionalidades.delivery.length === 0) {
    errors.push('Funcionalidades não definidas');
  }
  
  // 🔥 Valida novas seções
  if (!KNOWLEDGE_BASE.promocoes?.instagram?.link) {
    errors.push('Link do Instagram não definido');
  }
  
  if (!KNOWLEDGE_BASE.hospedagem?.local || !KNOWLEDGE_BASE.hospedagem?.nuvem) {
    errors.push('Informações de hospedagem incompletas');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 🔥 NOVA FUNÇÃO: Exporta base de conhecimento para backup
 * @returns {Object}
 */
export function exportKnowledgeBase() {
  return {
    version: PROMPT_VERSION,
    lastUpdated: LAST_UPDATED,
    knowledgeBase: KNOWLEDGE_BASE,
    systemPrompt: SYSTEM_PROMPT,
    exportedAt: new Date().toISOString()
  };
}

/**
 * 🔥 NOVA FUNÇÃO: Obtém informação específica da base de conhecimento
 * @param {string} path - Caminho na base (ex: "preco.valor_promocional")
 * @returns {any}
 */
export function getKnowledgeValue(path) {
  const parts = path.split('.');
  let current = KNOWLEDGE_BASE;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  
  return current;
}

/**
 * 🔥 NOVA FUNÇÃO: Lista todas as chaves disponíveis na base
 * @returns {Array}
 */
export function listKnowledgeKeys() {
  function getKeys(obj, prefix = '') {
    let keys = [];
    
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        keys = keys.concat(getKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    
    return keys;
  }
  
  return getKeys(KNOWLEDGE_BASE);
}

/**
 * 🔥 NOVA FUNÇÃO: Mostra resumo da base de conhecimento
 */
export function showKnowledgeSummary() {
  console.log('\n📚 ╔═══════════════════════════════════════════╗');
  console.log('📚 BASE DE CONHECIMENTO - RESUMO');
  console.log('📚 ╚═══════════════════════════════════════════╝');
  console.log(`📌 Versão do Prompt: ${PROMPT_VERSION}`);
  console.log(`📅 Última Atualização: ${LAST_UPDATED}`);
  console.log('');
  console.log(`🏢 Produto: ${KNOWLEDGE_BASE.produto.nome}`);
  console.log(`💰 Preço: ${KNOWLEDGE_BASE.preco.valor_promocional}`);
  console.log(`📱 WhatsApp: ${KNOWLEDGE_BASE.contato.whatsapp}`);
  console.log(`🌐 Fanpage: ${KNOWLEDGE_BASE.contato.fanpage}`);
  console.log(`🎁 Instagram: ${KNOWLEDGE_BASE.promocoes.instagram.link}`);
  console.log('');
  console.log(`✨ Funcionalidades: ${KNOWLEDGE_BASE.funcionalidades.delivery.length} itens`);
  console.log(`🎯 Diferenciais: ${KNOWLEDGE_BASE.diferenciais.length} itens`);
  console.log(`🤖 Opções de IA: ${KNOWLEDGE_BASE.ia_opcoes.length} itens`);
  console.log('');
  
  const validation = validateKnowledgeBase();
  if (validation.valid) {
    console.log('✅ Base de conhecimento validada com sucesso!');
  } else {
    console.log('⚠️ Problemas encontrados na base de conhecimento:');
    validation.errors.forEach(error => {
      console.log(`   - ${error}`);
    });
  }
  
  console.log('📚 ╚═══════════════════════════════════════════╝\n');
}

/**
 * 🔥 NOVA FUNÇÃO: Busca na base de conhecimento
 * @param {string} query - Termo de busca
 * @returns {Array} Resultados encontrados
 */
export function searchKnowledge(query) {
  const results = [];
  const lowerQuery = query.toLowerCase();
  
  function searchObject(obj, path = '') {
    for (const key in obj) {
      const value = obj[key];
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
        results.push({
          path: currentPath,
          value: value
        });
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'string' && item.toLowerCase().includes(lowerQuery)) {
            results.push({
              path: `${currentPath}[${index}]`,
              value: item
            });
          } else if (typeof item === 'object') {
            searchObject(item, `${currentPath}[${index}]`);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        searchObject(value, currentPath);
      }
    }
  }
  
  searchObject(KNOWLEDGE_BASE);
  return results;
}

// Validação automática ao carregar
const validation = validateKnowledgeBase();
if (!validation.valid) {
  console.warn('⚠️ ATENÇÃO: Problemas encontrados na base de conhecimento:');
  validation.errors.forEach(error => console.warn(`   - ${error}`));
}

export default {
  KNOWLEDGE_BASE,
  SYSTEM_PROMPT,
  FANPAGE_MESSAGE,
  PROMPT_VERSION,
  LAST_UPDATED,
  getSystemPromptForCustomer,
  validateKnowledgeBase,
  exportKnowledgeBase,
  getKnowledgeValue,
  listKnowledgeKeys,
  showKnowledgeSummary,
  searchKnowledge
};