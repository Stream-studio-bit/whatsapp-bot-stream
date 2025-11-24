import { 
  isValidMessage, 
  extractMessageText, 
  cleanMessage, 
  isGreeting, 
  isNewLead,
  simulateTyping,
  log,
  extractPhoneNumber,
  detectOwnerInitiatedConversation,
  calculateResponseTime,
  detectHumanHandoffRequest
} from '../utils/helpers.js';

import {
  saveUser,
  getUser,
  isExistingUser,
  hasOngoingConversation,
  markAsNewLead,
  isLeadUser,
  isBotBlockedForUser,
  blockBotForUser,
  unblockBotForUser,
  saveConversationHistory,
  incrementOwnerMessageCount,
  getOwnerMessageCount,
  recordResponseTime,
  setOwnerProspecting,
  updateUser
} from '../services/database.js';

import {
  processLeadMessage,
  processClientMessage,
  generateWelcomeMessage,
  shouldSendFanpageLink,
  addToHistory,
  getSalesStats,
  analyzeProspectionMessage,
  handleEvaluationRequest
} from '../services/ai.js';

import {
  detectInterlocutorType
} from '../utils/knowledgeBase.js';

const lastMessageTime = new Map();
const DEBOUNCE_DELAY = 500;

// 🔥 Timestamp de inicialização
const BOT_START_TIME = Date.now();

// 🔥 Cache de mensagens processadas
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

// 🔥 Cache de timestamps de última mensagem
const lastUserMessageTimestamp = new Map();

/**
 * Limpa maps antigos
 */
function cleanupDebounceMap() {
  const now = Date.now();
  const MAX_AGE = 60000;
  
  for (const [jid, timestamp] of lastMessageTime.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastMessageTime.delete(jid);
    }
  }
  
  if (processedMessages.size > MAX_PROCESSED_CACHE) {
    processedMessages.clear();
    log('INFO', '🧹 Cache de mensagens processadas limpo');
  }

  for (const [jid, timestamp] of lastUserMessageTimestamp.entries()) {
    if (now - timestamp > MAX_AGE) {
      lastUserMessageTimestamp.delete(jid);
    }
  }
}

setInterval(cleanupDebounceMap, 120000);

/**
 * 🔥 CORREÇÃO 3: Verifica se a mensagem é RECENTE (COM LOGS SEMPRE ATIVOS)
 */
function isRecentMessage(message) {
  try {
    const messageTimestamp = message.messageTimestamp;
    
    if (!messageTimestamp) {
      log('INFO', '⏰ Mensagem sem timestamp - considerando como recente');
      return true;
    }
    
    let messageTime;
    if (typeof messageTimestamp === 'object' && messageTimestamp.low) {
      messageTime = messageTimestamp.low * 1000;
    } else if (typeof messageTimestamp === 'number') {
      messageTime = messageTimestamp < 10000000000 
        ? messageTimestamp * 1000 
        : messageTimestamp;
    } else {
      log('INFO', '⏰ Timestamp em formato desconhecido - considerando como recente');
      return true;
    }
    
    const isRecent = messageTime >= BOT_START_TIME;
    
    // 🔥 SEMPRE LOGA (removido DEBUG_MODE)
    const messageDate = new Date(messageTime).toISOString();
    const botStartDate = new Date(BOT_START_TIME).toISOString();
    const diffSeconds = Math.floor((Date.now() - messageTime) / 1000);
    
    if (isRecent) {
      log('SUCCESS', `✅ Mensagem RECENTE aceita - Enviada: ${messageDate} (${diffSeconds}s atrás)`);
    } else {
      log('WARNING', `❌ Mensagem ANTIGA rejeitada - Enviada: ${messageDate} | Bot iniciou: ${botStartDate} (diferença: ${diffSeconds}s)`);
    }
    
    return isRecent;
    
  } catch (error) {
    log('WARNING', `⚠️ Erro ao verificar idade da mensagem: ${error.message}`);
    return true;
  }
}
/**
 * 🔥 CORREÇÃO 2: Valida se mensagem deve ser processada (COM LOGS SEMPRE ATIVOS)
 */
function shouldProcessMessage(message) {
  // 🔥 Log no início da função
  log('INFO', '🔍 shouldProcessMessage() chamada - iniciando validações...');
  
  try {
    if (!message || !message.key) {
      log('WARNING', '❌ VALIDAÇÃO FALHOU: Mensagem sem estrutura básica (message.key ausente)');
      return false;
    }
    
    const jid = message.key.remoteJid;
    
    // 🔥 Log do JID detectado
    log('INFO', `📱 JID detectado: ${jid}`);
    
    // Ignora broadcast
    if (jid === 'status@broadcast' || jid?.includes('broadcast')) {
      log('INFO', '⭕ VALIDAÇÃO FALHOU: Mensagem é broadcast - ignorando');
      return false;
    }
    
    // Ignora grupos
    if (jid?.endsWith('@g.us')) {
      log('INFO', '⭕ VALIDAÇÃO FALHOU: Mensagem é de grupo - ignorando');
      return false;
    }
    
    // Valida conversa individual
    if (!jid?.endsWith('@s.whatsapp.net')) {
      log('WARNING', `❌ VALIDAÇÃO FALHOU: JID inválido para conversa individual (${jid})`);
      return false;
    }
    
    // Verifica se já foi processada
    const messageId = message.key.id;
    if (messageId && processedMessages.has(messageId)) {
      log('INFO', `⭕ VALIDAÇÃO FALHOU: Mensagem duplicada (ID: ${messageId.substring(0, 20)}...)`);
      return false;
    }
    
    // 🔥 Log antes de verificar se é recente
    log('INFO', '⏰ Verificando se mensagem é recente...');
    
    // Verifica se é recente
    if (!isRecentMessage(message)) {
      log('WARNING', '❌ VALIDAÇÃO FALHOU: Mensagem rejeitada por isRecentMessage() - muito antiga');
      return false;
    }
    
    // 🔥 Se chegou aqui, passou em todas as validações
    log('SUCCESS', `✅ TODAS VALIDAÇÕES PASSARAM - Mensagem será processada (JID: ${jid})`);
    return true;
    
  } catch (error) {
    log('WARNING', `⚠️ Erro ao validar mensagem: ${error.message}`);
    log('WARNING', `❌ VALIDAÇÃO FALHOU: Exceção capturada - ${error.stack}`);
    return false;
  }
}

/**
 * 🔥 Calcula tempo de resposta do lead (para detectar chatbot)
 */
function calculateLeadResponseTime(jid) {
  const now = Date.now();
  const lastTimestamp = lastUserMessageTimestamp.get(jid);
  
  if (!lastTimestamp) {
    return null;
  }
  
  const responseTimeMs = now - lastTimestamp;
  const responseTimeSec = Math.floor(responseTimeMs / 1000);
  
  return responseTimeSec;
}

/**
 * 🔥 HANDLER PRINCIPAL - VERSÃO COM LOGS DE DIAGNÓSTICO COMPLETOS
 */
export async function handleIncomingMessage(sock, message) {
  // 🔥 CORREÇÃO 4: Log no início
  log('INFO', '🔍 ============================================');
  log('INFO', '🔍 handleIncomingMessage() CHAMADA');
  log('INFO', '🔍 ============================================');
  
  try {
    // 🔥 Validação inicial com logs específicos
    log('INFO', '📋 Etapa 1/7: Validando estrutura da mensagem...');
    
    if (!shouldProcessMessage(message)) {
      log('WARNING', '❌ Mensagem rejeitada por shouldProcessMessage() - encerrando processamento');
      return;
    }
    log('SUCCESS', '✅ Etapa 1/7: shouldProcessMessage() passou');
    
    log('INFO', '📋 Etapa 2/7: Validando conteúdo da mensagem...');
    if (!isValidMessage(message)) {
      log('WARNING', '❌ Mensagem rejeitada por isValidMessage() - conteúdo inválido');
      return;
    }
    log('SUCCESS', '✅ Etapa 2/7: isValidMessage() passou');
    
    const jid = message.key.remoteJid;
    
    log('INFO', '📋 Etapa 3/7: Extraindo texto da mensagem...');
    const messageText = extractMessageText(message);
    
    if (!messageText) {
      log('WARNING', '❌ Mensagem rejeitada - sem texto extraível (provavelmente mídia sem caption)');
      log('INFO', `🔍 Estrutura da mensagem: ${JSON.stringify(message.message, null, 2).substring(0, 500)}...`);
      return;
    }
    log('SUCCESS', `✅ Etapa 3/7: Texto extraído com sucesso (${messageText.length} caracteres)`);
    
    // Marca como processada
    const messageId = message.key.id;
    if (messageId) {
      processedMessages.add(messageId);
      log('INFO', `📝 Mensagem marcada como processada (ID: ${messageId.substring(0, 20)}...)`);
    }
    // ==========================================
    // 🔥 SISTEMA DE BLOQUEIO INTELIGENTE
    // ==========================================
    
    log('INFO', '📋 Etapa 4/7: Verificando se mensagem é do owner...');
    
    if (message?.key?.fromMe) {
      log('INFO', '👤 Mensagem enviada pelo OWNER detectada');
      
      const targetJid = message.key.remoteJid;
      const clientPhone = extractPhoneNumber(targetJid);
      
      if (isRecentMessage(message)) {
        try {
          const ownerMsgCount = await incrementOwnerMessageCount(targetJid);
          
          log('INFO', `👤 Owner enviou mensagem para ${clientPhone} (contador: ${ownerMsgCount})`);
          
          if (ownerMsgCount === 1) {
            await setOwnerProspecting(targetJid, true);
            log('SUCCESS', `🎯 Prospecção ativa iniciada para ${clientPhone} - IA PERMANECE ATIVA`);
          }
          else if (ownerMsgCount === 2) {
            await blockBotForUser(targetJid);
            log('SUCCESS', `🔒 IA BLOQUEADA para ${clientPhone} - Owner assumiu (2ª mensagem)`);
          }
          else {
            const isAlreadyBlocked = await isBotBlockedForUser(targetJid);
            if (!isAlreadyBlocked) {
              await blockBotForUser(targetJid);
              log('SUCCESS', `🔒 IA BLOQUEADA para ${clientPhone} - Owner assumiu`);
            }
          }
          
        } catch (err) {
          log('WARNING', `⚠️ Erro ao processar mensagem do owner: ${err.message}`);
        }
      } else {
        log('INFO', `⭕ Ignorando mensagem ANTIGA do owner para ${clientPhone}`);
      }
      
      log('INFO', '✅ Processamento de mensagem do owner concluído - encerrando (owner não gera resposta IA)');
      return;
    }
    
    log('SUCCESS', '✅ Etapa 4/7: Mensagem NÃO é do owner - prosseguindo');

    // ==========================================
    // 🔥 VERIFICAÇÃO DE BLOQUEIO
    // ==========================================
    
    log('INFO', '📋 Etapa 5/7: Verificando se IA está bloqueada para este contato...');
    
    let isBlocked = false;
    try {
      isBlocked = await isBotBlockedForUser(jid);
      
      if (isBlocked) {
        log('WARNING', `🚫 IA BLOQUEADA para este contato - encerrando processamento`);
      } else {
        log('SUCCESS', '✅ IA NÃO está bloqueada - prosseguindo');
      }
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar bloqueio: ${err.message}`);
      isBlocked = false;
    }

    if (isBlocked) {
      const clientPhone = extractPhoneNumber(jid);
      log('WARNING', `🚫 MENSAGEM IGNORADA - Bot bloqueado para ${clientPhone} (Owner em atendimento)`);
      return;
    }
    
    log('SUCCESS', '✅ Etapa 5/7: Verificação de bloqueio passou');

    // ==========================================
    // 🔥 DETECÇÃO DE SOLICITAÇÃO DE ATENDIMENTO HUMANO
    // ==========================================
    
    log('INFO', '📋 Etapa 6/7: Verificando solicitação de handoff...');
    
    const wantsHumanHandoff = detectHumanHandoffRequest(messageText);
    
    if (wantsHumanHandoff) {
      const clientPhone = extractPhoneNumber(jid);
      const pushName = message.pushName || 'Cliente';
      
      log('INFO', `🤝 ${pushName} solicitou atendimento humano - Transferindo...`);
      
      await blockBotForUser(jid);
      
      const handoffMessage = `Claro, ${pushName}! Vou transferir você para o Roberto agora mesmo 😊\n\nEle já está ciente da nossa conversa e vai te atender em instantes!\n\nFoi um prazer conversar com você! 🤖💙`;
      
      await sock.sendMessage(jid, { text: handoffMessage }).catch((err) => {
        log('WARNING', `⚠️ Erro ao enviar mensagem de handoff: ${err.message}`);
      });
      
      log('SUCCESS', `✅ Handoff realizado para ${clientPhone}`);
      return;
    }
    
    log('SUCCESS', '✅ Etapa 6/7: Nenhum handoff solicitado - prosseguindo para processamento IA');

    // Debounce
    const now = Date.now();
    const lastTime = lastMessageTime.get(jid) || 0;
    if (now - lastTime < DEBOUNCE_DELAY) {
      log('INFO', '⏱️ Debounce ativo - ignorando mensagem duplicada rápida');
      return;
    }
    lastMessageTime.set(jid, now);

    const cleanedMessage = cleanMessage(messageText);
    const pushName = message.pushName || 'Cliente';
    const phone = extractPhoneNumber(jid);
    
    // 🔥 LOG PRINCIPAL - Se chegou aqui, mensagem passou por TODAS as validações
    log('SUCCESS', '✅ ============================================');
    log('SUCCESS', '✅ MENSAGEM PASSOU POR TODAS AS VALIDAÇÕES!');
    log('SUCCESS', '✅ ============================================');
    log('INFO', `📩 ${pushName} (${phone}): "${cleanedMessage.substring(0, 50)}${cleanedMessage.length > 50 ? '...' : ''}"`);

    // ==========================================
    // 🔥 CÁLCULO DE TEMPO DE RESPOSTA
    // ==========================================
    
    const responseTime = calculateLeadResponseTime(jid);
    
    if (responseTime !== null) {
      try {
        await recordResponseTime(jid, responseTime);
        log('INFO', `⏱️ Tempo de resposta: ${responseTime}s`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao registrar tempo de resposta: ${err.message}`);
      }
    }
    
    lastUserMessageTimestamp.set(jid, now);

    // ==========================================
    // 🔥 VERIFICAÇÃO: Primeira interação
    // ==========================================
    
    log('INFO', '📋 Etapa 7/7: Processando mensagem com IA...');
    
    let userExists = false;
    try {
      userExists = await isExistingUser(jid);
      log('INFO', `🔍 Usuário existe no banco: ${userExists ? 'SIM' : 'NÃO (primeira vez)'}`);
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar usuário: ${err.message}`);
      userExists = false;
    }
    
    const isFirstContact = !userExists;
    // ==========================================
    // 🔥 DETECÇÃO DE PROSPECÇÃO ATIVA
    // ==========================================
    
    let isOwnerProspecting = false;
    try {
      const user = await getUser(jid);
      isOwnerProspecting = user?.isOwnerProspecting || false;
      
      if (isOwnerProspecting) {
        log('INFO', `🎯 MODO PROSPECÇÃO ATIVA detectado para ${phone}`);
      }
    } catch (err) {
      log('WARNING', `⚠️ Erro ao verificar prospecção: ${err.message}`);
    }

    // ==========================================
    // 🔥 PRIMEIRA MENSAGEM - COM DETECÇÃO DE EMAIL
    // ==========================================
    
    if (isFirstContact) {
      log('INFO', '🆕 PROCESSANDO PRIMEIRA MENSAGEM (novo contato)');
      
      const hasLeadKeywords = isNewLead(cleanedMessage);
      
      await saveUser(jid, { 
        name: pushName,
        isNewLead: true
      });
      
      // 🔥 DETECÇÃO DE EMAIL NA PRIMEIRA MENSAGEM
      const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
      const emailMatch = cleanedMessage.match(emailRegex);
      
      if (emailMatch) {
        const email = emailMatch[0];
        log('SUCCESS', `🎯 EMAIL CAPTURADO na primeira mensagem: ${email}`);
        
        await updateUser(jid, { 
          email: email,
          emailCapturedAt: new Date()
        });
        
        await simulateTyping(sock, jid, 1500);
        
        const emailResponse = `Perfeito, ${pushName}! 🎉

Email anotado: ${email}

Vou encaminhar pra equipe da Stream Studio preparar uma avaliação GRATUITA personalizada!

Enquanto aguarda, quer ver uma demonstração funcionando?
🌐 https://bot-whatsapp-450420.web.app/

Tem mais alguma dúvida? 😊`;
        
        await sock.sendMessage(jid, { text: emailResponse }).catch((err) => {
          log('WARNING', `⚠️ Erro ao enviar resposta: ${err.message}`);
        });
        
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', emailResponse);
        
        log('SUCCESS', `🔔 CONVERSÃO! ${pushName} (${phone}) → ${email}`);
        
        return;
      }
      
      // Sem email - continua com boas-vindas normais
      if (hasLeadKeywords) {
        await markAsNewLead(jid, pushName);
        log('SUCCESS', `🎯 NOVO LEAD (com keywords): ${pushName}`);
      } else {
        log('SUCCESS', `👤 NOVO CONTATO: ${pushName}`);
      }
      
      await simulateTyping(sock, jid, 1500);
      
      const isProspectionMode = isOwnerProspecting;
      
      log('INFO', '🤖 Gerando mensagem de boas-vindas com IA...');
      
      const welcomeMsg = await generateWelcomeMessage(
        pushName, 
        true,
        isProspectionMode,
        responseTime
      );
      
      log('SUCCESS', `✅ Mensagem de boas-vindas gerada (${welcomeMsg.length} caracteres)`);
      
      await sock.sendMessage(jid, { text: welcomeMsg }).catch((err) => {
        log('WARNING', `⚠️ Erro ao enviar mensagem: ${err.message}`);
      });
      
      try {
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', welcomeMsg);
        log('SUCCESS', `📝 Histórico registrado na IA`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico da IA: ${err.message}`);
      }
      
      try {
        await saveConversationHistory(jid, [
          { role: 'user', content: cleanedMessage },
          { role: 'assistant', content: welcomeMsg }
        ]);
        log('SUCCESS', `💾 Histórico salvo no banco de dados`);
      } catch (err) {
        log('WARNING', `⚠️ Erro ao salvar histórico no DB: ${err.message}`);
      }
      
      if (isProspectionMode) {
        log('SUCCESS', `✅ Boas-vindas enviadas (PROSPECÇÃO ATIVA - Revelação IA)`);
      } else {
        log('SUCCESS', `✅ Boas-vindas enviadas (LEAD - Vendas Consultivas Ativas)`);
      }
      
      // 🔥 Log de estatísticas
      try {
        const salesStats = getSalesStats();
        log('INFO', `📊 Leads Ativos: ${salesStats.totalLeads} | Em Descoberta: ${salesStats.byStage.discovery}`);
      } catch (err) {
        // Ignora erro de stats
      }
      
      return;
    }

    // ==========================================
    // 🔥 MENSAGENS SEGUINTES - COM PRIORIZAÇÃO DE EMAIL
    // ==========================================
    
    log('INFO', `📨 PROCESSANDO MENSAGEM SUBSEQUENTE de ${pushName}`);
    
    await saveUser(jid, { name: pushName });
    
    const isLead = await isLeadUser(jid);
    log('INFO', `🔍 Usuário é lead: ${isLead ? 'SIM' : 'NÃO (cliente existente)'}`);
    
    // 🔥 DETECÇÃO DE EMAIL EM QUALQUER MENSAGEM
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
    const emailMatch = cleanedMessage.match(emailRegex);

    if (emailMatch && isLead) {
      const email = emailMatch[0];
      const user = await getUser(jid);
      
      if (!user?.email || user.email !== email) {
        log('SUCCESS', `🎯 NOVO EMAIL CAPTURADO: ${email} - ${pushName}`);
        
        await updateUser(jid, {
          email: email,
          emailCapturedAt: new Date()
        });
        
        await simulateTyping(sock, jid, 1500);
        
        const emailResponse = handleEvaluationRequest(pushName, email);
        
        await sock.sendMessage(jid, { text: emailResponse }).catch((err) => {
          log('WARNING', `⚠️ Erro ao enviar resposta: ${err.message}`);
        });
        
        addToHistory(phone, 'user', cleanedMessage);
        addToHistory(phone, 'assistant', emailResponse);
        
        log('SUCCESS', `🔔 CONVERSÃO! ${pushName} (${phone}) → ${email}`);
        
        return;
      } else {
        log('INFO', `ℹ️ Email já capturado anteriormente: ${email}`);
      }
    }
    
    // Continua com processamento normal
    await simulateTyping(sock, jid, 1500);
    
    let aiResponse;
    
    try {
      if (isLead) {
        log('INFO', '🤖 Processando como LEAD (vendas consultivas)...');
        
        let interlocutorType = null;
        
        if (isOwnerProspecting && responseTime !== null) {
          try {
            interlocutorType = detectInterlocutorType(
              responseTime,
              cleanedMessage
            );
            
            log('INFO', `🕵️ Interlocutor detectado: ${interlocutorType}`);
          } catch (err) {
            log('WARNING', `⚠️ Erro ao detectar interlocutor: ${err.message}`);
          }
        }
        
        log('INFO', '🧠 Chamando IA para gerar resposta de lead...');
        
        aiResponse = await processLeadMessage(
          phone, 
          pushName, 
          cleanedMessage,
          {
            isProspecting: isOwnerProspecting,
            interlocutorType: interlocutorType,
            responseTime: responseTime
          }
        );
        
        log('SUCCESS', `✅ Resposta IA gerada para LEAD (${aiResponse?.length || 0} caracteres)`);
        // Verifica se deve enviar fanpage
        if (shouldSendFanpageLink(cleanedMessage) || 
            cleanedMessage.toLowerCase().includes('quero') ||
            cleanedMessage.toLowerCase().includes('interesse') ||
            cleanedMessage.toLowerCase().includes('teste') ||
            cleanedMessage.toLowerCase().includes('demonstra')) {
          
          log('INFO', '🌐 Enviando link da fanpage (interesse detectado)...');
          
          await simulateTyping(sock, jid, 1000);
          
          const FANPAGE_MESSAGE = `🌐 Acesse nossa fanpage e veja demonstrações:\nhttps://bot-whatsapp-450420.web.app/`;
          
          await sock.sendMessage(jid, { text: FANPAGE_MESSAGE }).catch((err) => {
            log('WARNING', `⚠️ Erro ao enviar fanpage: ${err.message}`);
          });
          
          log('SUCCESS', `📱 Link da fanpage enviado`);
        }
        
        if (isOwnerProspecting) {
          log('SUCCESS', `✅ Resposta IA gerada (PROSPECÇÃO ATIVA)`);
        } else {
          log('SUCCESS', `✅ Resposta IA gerada (LEAD - Vendas Consultivas)`);
        }
        
      } else {
        log('INFO', '🤖 Processando como CLIENTE EXISTENTE...');
        log('INFO', '🧠 Chamando IA para gerar resposta de cliente...');
        
        aiResponse = await processClientMessage(phone, pushName, cleanedMessage);
        
        log('SUCCESS', `✅ Resposta IA gerada (CLIENTE) - ${aiResponse?.length || 0} caracteres`);
      }
      
      if (aiResponse) {
        log('INFO', '📤 Enviando resposta ao usuário...');
        
        await sock.sendMessage(jid, { text: aiResponse }).catch((err) => {
          log('WARNING', `⚠️ Erro ao enviar resposta: ${err.message}`);
        });
        
        log('SUCCESS', `✅ Resposta enviada com sucesso para ${pushName}`);
      } else {
        log('WARNING', '⚠️ IA não gerou resposta (aiResponse vazio)');
      }
      
      // Log de estatísticas após interação
      if (isLead) {
        try {
          const salesStats = getSalesStats();
          log('INFO', `📊 Vendas | Descoberta: ${salesStats.byStage.discovery} | Recomendação: ${salesStats.byStage.recommendation} | Fechamento: ${salesStats.byStage.closing}`);
        } catch (err) {
          // Ignora erro de stats
        }
      }
      
    } catch (error) {
      log('WARNING', `⚠️ Erro ao gerar resposta da IA: ${error.message}`);
      log('WARNING', `🔍 Stack trace: ${error.stack}`);
      
      const errorMsg = `Desculpe ${pushName}, estou com dificuldades técnicas no momento. 😅\n\nPor favor, aguarde que logo você será atendido!`;
      await sock.sendMessage(jid, { text: errorMsg }).catch(() => {});
    }

  } catch (error) {
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ ERRO CRÍTICO ao processar mensagem: ${error.message}`);
      log('WARNING', `🔍 Stack trace completo: ${error.stack}`);
    }
  }
  
  log('INFO', '🔍 ============================================');
  log('INFO', '🔍 handleIncomingMessage() FINALIZADA');
  log('INFO', '🔍 ============================================\n');
}

/**
 * Processa mensagem (wrapper)
 */
export async function processMessage(sock, message) {
  try {
    await handleIncomingMessage(sock, message);
  } catch (error) {
    if (!error.message?.includes('Connection') && !error.message?.includes('Stream')) {
      log('WARNING', `⚠️ Erro crítico no processMessage: ${error.message}`);
    }
  }
}

/**
 * Reseta cache de mensagens processadas
 */
export function resetProcessedMessages() {
  processedMessages.clear();
  lastUserMessageTimestamp.clear();
  log('SUCCESS', '✅ Cache de mensagens processadas resetado');
}

/**
 * Obtém estatísticas do handler
 */
export function getHandlerStats() {
  return {
    botStartTime: new Date(BOT_START_TIME).toISOString(),
    processedMessagesCount: processedMessages.size,
    debounceCacheSize: lastMessageTime.size,
    responseTimeCacheSize: lastUserMessageTimestamp.size
  };
}

/**
 * 🔥 Mostra estatísticas completas (handler + vendas)
 */
export function showCompleteStats() {
  const handlerStats = getHandlerStats();
  
  console.log('\n📊 ╔═══════════════════════════════════════╗');
  console.log('📊 ESTATÍSTICAS COMPLETAS DO SISTEMA');
  console.log('📊 ╚═══════════════════════════════════════╝');
  console.log('');
  console.log('🤖 HANDLER:');
  console.log(`   Início do Bot: ${handlerStats.botStartTime}`);
  console.log(`   Mensagens processadas: ${handlerStats.processedMessagesCount}`);
  console.log(`   Cache de debounce: ${handlerStats.debounceCacheSize}`);
  console.log(`   Cache de tempo de resposta: ${handlerStats.responseTimeCacheSize}`);
  console.log('');
  
  try {
    const salesStats = getSalesStats();
    console.log('💰 VENDAS:');
    console.log(`   Total de Leads: ${salesStats.totalLeads}`);
    console.log(`   Em Descoberta: ${salesStats.byStage.discovery}`);
    console.log(`   Em Recomendação: ${salesStats.byStage.recommendation}`);
    console.log(`   Com Objeção: ${salesStats.byStage.objection}`);
    console.log(`   Em Fechamento: ${salesStats.byStage.closing}`);
    console.log('');
    console.log('📋 PLANOS:');
    console.log(`   🌟 Básico: ${salesStats.byPlan.basico}`);
    console.log(`   🚀 Completo: ${salesStats.byPlan.completo}`);
    console.log(`   ❓ Indeciso: ${salesStats.byPlan.indeciso}`);
    console.log(`   ➖ Nenhum: ${salesStats.byPlan.none}`);
  } catch (err) {
    console.log('⚠️ Não foi possível obter estatísticas de vendas');
  }
  
  console.log('📊 ╚═══════════════════════════════════════╝\n');
}

/**
 * 🔥 Comando para visualizar estado atual de um cliente
 */
export async function showClientStatus(phone) {
  if (!phone) {
    console.log('❌ Telefone não informado');
    return;
  }
  
  console.log(`\n👤 STATUS DO CLIENTE: ${phone}`);
  console.log('═'.repeat(50));
  
  try {
    const { getSalesContextDetails } = await import('../services/ai.js');
    const details = getSalesContextDetails(phone);
    
    if (!details) {
      console.log('❌ Cliente não encontrado no sistema');
      return;
    }
    
    console.log('📊 CONTEXTO DE VENDAS:');
    console.log(`   Estágio: ${details.salesContext.stage}`);
    console.log(`   Plano Recomendado: ${details.salesContext.recommendedPlan || 'Nenhum'}`);
    console.log(`   Perguntas Feitas: ${details.salesContext.questionsAsked}`);
    console.log(`   Plano Mencionado: ${details.salesContext.planMentioned ? 'Sim' : 'Não'}`);
    console.log(`   Necessidades Detectadas: ${details.salesContext.detectedNeeds.length}`);
    console.log(`   Objeções: ${details.salesContext.objections.length}`);
    
    if (details.salesContext.isProspecting) {
      console.log('');
      console.log('🎯 PROSPECÇÃO ATIVA:');
      console.log(`   Interlocutor: ${details.salesContext.interlocutorType || 'Desconhecido'}`);
      console.log(`   Segmento: ${details.salesContext.businessSegment || 'Não identificado'}`);
    }
    
    console.log('');
    console.log('💬 HISTÓRICO:');
    console.log(`   Total de mensagens: ${details.historySize}`);
    console.log('   Últimas 3 mensagens:');
    details.lastMessages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. [${msg.role}]: ${msg.preview}`);
    });
    
  } catch (err) {
    console.log(`❌ Erro ao obter status: ${err.message}`);
  }
  
  console.log('═'.repeat(50) + '\n');
}

/**
 * 🔥 Lista conversas onde owner está prospectando
 */
export async function listOwnerConversations() {
  console.log('\n🎯 CONVERSAS DE PROSPECÇÃO ATIVA');
  console.log('═'.repeat(60));
  
  try {
    const { getAllProspectingConversations } = await import('../services/database.js');
    const conversations = await getAllProspectingConversations();
    
    if (!conversations || conversations.length === 0) {
      console.log('   Nenhuma prospecção ativa no momento');
      console.log('═'.repeat(60) + '\n');
      return;
    }
    
    conversations.forEach((conv, idx) => {
      console.log(`\n${idx + 1}. ${conv.phone} (${conv.name || 'Nome não disponível'})`);
      console.log(`   Mensagens do owner: ${conv.ownerMessageCount}`);
      console.log(`   IA bloqueada: ${conv.isBotBlocked ? 'Sim' : 'Não'}`);
      console.log(`   Último contato: ${conv.lastContact ? new Date(conv.lastContact).toLocaleString() : 'N/A'}`);
    });
    
    console.log('\n═'.repeat(60));
    console.log(`Total: ${conversations.length} prospecção(ões) ativa(s)\n`);
    
  } catch (err) {
    console.log(`❌ Erro ao listar conversas: ${err.message}`);
    console.log('═'.repeat(60) + '\n');
  }
}

export default {
  handleIncomingMessage,
  processMessage,
  resetProcessedMessages,
  getHandlerStats,
  showCompleteStats,
  showClientStatus,
  listOwnerConversations
};