/**
 * userContextService.js
 * Memória de contexto por usuário
 * - Última intenção identificada
 * - Etapa do suporte/onboarding
 * - Progresso no processo
 * - Histórico de conversa (curto prazo)
 * - Dados extraídos do usuário
 */

const supabaseClient = require('../database/supabaseClient');
const logger = require('../utils/logger');

// Nome da tabela de contexto no Supabase
const CONTEXT_TABLE = 'user_contexts';

// Configurações de contexto
const CONTEXT_CONFIG = {
  maxHistoryMessages: 10, // Máximo de mensagens no histórico
  contextTTL: 3600, // TTL em segundos (1 hora)
  autoSaveInterval: 30, // Intervalo de auto-save em segundos
};

/**
 * Estrutura padrão de contexto
 */
const DEFAULT_CONTEXT = {
  userId: null,
  userName: null,
  intent: null, // 'prospeccao', 'suporte', 'geral'
  stage: null, // Estágio específico do funil/onboarding
  messageCount: 0,
  firstInteraction: null,
  lastInteraction: null,
  history: [], // Últimas mensagens
  userData: {}, // Dados extraídos (nome, negócio, segmento, etc)
  issueCount: 0, // Número de vezes que reportou mesmo problema
  issueCategory: null, // Categoria do problema atual
  satisfactionLevel: 'neutral', // 'very_satisfied', 'satisfied', 'neutral', 'unsatisfied'
  needsEscalation: false,
  metadata: {}, // Informações extras
};

/**
 * Busca ou cria contexto de um usuário
 * @param {string} userId - ID do usuário (número WhatsApp)
 * @returns {Promise<Object>} Contexto do usuário
 */
async function getOrCreateContext(userId) {
  try {
    logger.debug(`🔍 Buscando contexto para usuário: ${userId}`);

    // Busca contexto existente
    const { data, error } = await supabaseClient
      .from(CONTEXT_TABLE)
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Se encontrou, retorna contexto existente
    if (data) {
      logger.debug('✅ Contexto encontrado');
      
      // Verifica se contexto expirou (TTL)
      const lastInteraction = new Date(data.last_interaction);
      const now = new Date();
      const diffSeconds = (now - lastInteraction) / 1000;

      if (diffSeconds > CONTEXT_CONFIG.contextTTL) {
        logger.debug('⏰ Contexto expirado, resetando...');
        return await resetContext(userId);
      }

      return {
        ...data,
        history: data.history || [],
        userData: data.user_data || {},
        metadata: data.metadata || {},
      };
    }

    // Não encontrou, cria novo contexto
    logger.debug('📝 Criando novo contexto');
    return await createContext(userId);

  } catch (error) {
    logger.error('❌ Erro ao buscar/criar contexto:', error);
    throw error;
  }
}

/**
 * Cria novo contexto para usuário
 * @param {string} userId - ID do usuário
 * @returns {Promise<Object>} Contexto criado
 */
async function createContext(userId) {
  try {
    const now = new Date().toISOString();
    
    const newContext = {
      user_id: userId,
      user_name: null,
      intent: null,
      stage: null,
      message_count: 0,
      first_interaction: now,
      last_interaction: now,
      history: [],
      user_data: {},
      issue_count: 0,
      issue_category: null,
      satisfaction_level: 'neutral',
      needs_escalation: false,
      metadata: {},
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabaseClient
      .from(CONTEXT_TABLE)
      .insert([newContext])
      .select()
      .single();

    if (error) throw error;

    logger.info(`✅ Contexto criado para usuário: ${userId}`);
    return {
      ...data,
      history: data.history || [],
      userData: data.user_data || {},
      metadata: data.metadata || {},
    };

  } catch (error) {
    logger.error('❌ Erro ao criar contexto:', error);
    throw error;
  }
}

/**
 * Atualiza contexto do usuário
 * @param {string} userId - ID do usuário
 * @param {Object} updates - Campos a atualizar
 * @returns {Promise<Object>} Contexto atualizado
 */
async function updateContext(userId, updates) {
  try {
    logger.debug(`📝 Atualizando contexto: ${userId}`);

    const updateData = {
      ...updates,
      last_interaction: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Converte nomes de campos para snake_case do banco
    const dbUpdateData = {};
    if (updateData.userName) dbUpdateData.user_name = updateData.userName;
    if (updateData.intent) dbUpdateData.intent = updateData.intent;
    if (updateData.stage) dbUpdateData.stage = updateData.stage;
    if (updateData.messageCount !== undefined) dbUpdateData.message_count = updateData.messageCount;
    if (updateData.history) dbUpdateData.history = updateData.history;
    if (updateData.userData) dbUpdateData.user_data = updateData.userData;
    if (updateData.issueCount !== undefined) dbUpdateData.issue_count = updateData.issueCount;
    if (updateData.issueCategory) dbUpdateData.issue_category = updateData.issueCategory;
    if (updateData.satisfactionLevel) dbUpdateData.satisfaction_level = updateData.satisfactionLevel;
    if (updateData.needsEscalation !== undefined) dbUpdateData.needs_escalation = updateData.needsEscalation;
    if (updateData.metadata) dbUpdateData.metadata = updateData.metadata;
    dbUpdateData.last_interaction = updateData.last_interaction;
    dbUpdateData.updated_at = updateData.updated_at;

    const { data, error } = await supabaseClient
      .from(CONTEXT_TABLE)
      .update(dbUpdateData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.debug('✅ Contexto atualizado');
    return {
      ...data,
      history: data.history || [],
      userData: data.user_data || {},
      metadata: data.metadata || {},
    };

  } catch (error) {
    logger.error('❌ Erro ao atualizar contexto:', error);
    throw error;
  }
}

/**
 * Adiciona mensagem ao histórico do contexto
 * @param {string} userId - ID do usuário
 * @param {string} role - 'user' ou 'assistant'
 * @param {string} content - Conteúdo da mensagem
 * @returns {Promise<Object>} Contexto atualizado
 */
async function addMessageToHistory(userId, role, content) {
  try {
    logger.debug(`💬 Adicionando mensagem ao histórico: ${userId}`);

    const context = await getOrCreateContext(userId);
    const history = context.history || [];

    // Adiciona nova mensagem
    history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // Limita tamanho do histórico (mantém apenas as últimas N mensagens)
    const trimmedHistory = history.slice(-CONTEXT_CONFIG.maxHistoryMessages);

    // Incrementa contador de mensagens
    const messageCount = (context.message_count || 0) + 1;

    // Atualiza contexto
    return await updateContext(userId, {
      history: trimmedHistory,
      messageCount,
    });

  } catch (error) {
    logger.error('❌ Erro ao adicionar mensagem ao histórico:', error);
    throw error;
  }
}

/**
 * Atualiza intenção do usuário
 * @param {string} userId - ID do usuário
 * @param {string} intent - Nova intenção ('prospeccao', 'suporte', 'geral')
 * @returns {Promise<Object>} Contexto atualizado
 */
async function updateIntent(userId, intent) {
  try {
    logger.debug(`🎯 Atualizando intenção para: ${intent}`);

    const validIntents = ['prospeccao', 'suporte', 'geral'];
    if (!validIntents.includes(intent)) {
      throw new Error(`Intenção inválida: ${intent}`);
    }

    return await updateContext(userId, { intent });

  } catch (error) {
    logger.error('❌ Erro ao atualizar intenção:', error);
    throw error;
  }
}

/**
 * Atualiza estágio do usuário
 * @param {string} userId - ID do usuário
 * @param {string} stage - Novo estágio
 * @returns {Promise<Object>} Contexto atualizado
 */
async function updateStage(userId, stage) {
  try {
    logger.debug(`📊 Atualizando estágio para: ${stage}`);

    return await updateContext(userId, { stage });

  } catch (error) {
    logger.error('❌ Erro ao atualizar estágio:', error);
    throw error;
  }
}

/**
 * Atualiza dados do usuário extraídos da conversa
 * @param {string} userId - ID do usuário
 * @param {Object} userData - Novos dados
 * @returns {Promise<Object>} Contexto atualizado
 */
async function updateUserData(userId, userData) {
  try {
    logger.debug(`👤 Atualizando dados do usuário: ${userId}`);

    const context = await getOrCreateContext(userId);
    const currentData = context.user_data || {};

    // Merge dos dados novos com os existentes
    const mergedData = {
      ...currentData,
      ...userData,
    };

    return await updateContext(userId, { userData: mergedData });

  } catch (error) {
    logger.error('❌ Erro ao atualizar dados do usuário:', error);
    throw error;
  }
}

/**
 * Incrementa contador de problemas similares
 * @param {string} userId - ID do usuário
 * @param {string} issueCategory - Categoria do problema
 * @returns {Promise<Object>} Contexto atualizado
 */
async function incrementIssueCount(userId, issueCategory) {
  try {
    logger.debug(`⚠️ Incrementando contador de problemas: ${issueCategory}`);

    const context = await getOrCreateContext(userId);
    
    // Se é a mesma categoria, incrementa
    let issueCount = context.issue_count || 0;
    if (context.issue_category === issueCategory) {
      issueCount++;
    } else {
      // Nova categoria, reseta contador
      issueCount = 1;
    }

    // Se atingiu 3 problemas, marca para escalação
    const needsEscalation = issueCount >= 3;

    if (needsEscalation) {
      logger.warn(`🚨 Usuário ${userId} precisa de escalação (${issueCount} problemas)`);
    }

    return await updateContext(userId, {
      issueCount,
      issueCategory,
      needsEscalation,
    });

  } catch (error) {
    logger.error('❌ Erro ao incrementar contador de problemas:', error);
    throw error;
  }
}

/**
 * Atualiza nível de satisfação
 * @param {string} userId - ID do usuário
 * @param {string} level - Nível de satisfação
 * @returns {Promise<Object>} Contexto atualizado
 */
async function updateSatisfaction(userId, level) {
  try {
    logger.debug(`😊 Atualizando satisfação para: ${level}`);

    const validLevels = ['very_satisfied', 'satisfied', 'neutral', 'unsatisfied'];
    if (!validLevels.includes(level)) {
      throw new Error(`Nível de satisfação inválido: ${level}`);
    }

    // Se muito insatisfeito, marca para escalação
    const needsEscalation = level === 'unsatisfied';

    return await updateContext(userId, {
      satisfactionLevel: level,
      needsEscalation,
    });

  } catch (error) {
    logger.error('❌ Erro ao atualizar satisfação:', error);
    throw error;
  }
}

/**
 * Reseta contexto do usuário (mantém ID)
 * @param {string} userId - ID do usuário
 * @returns {Promise<Object>} Contexto resetado
 */
async function resetContext(userId) {
  try {
    logger.info(`🔄 Resetando contexto: ${userId}`);

    const now = new Date().toISOString();

    const resetData = {
      user_name: null,
      intent: null,
      stage: null,
      message_count: 0,
      history: [],
      user_data: {},
      issue_count: 0,
      issue_category: null,
      satisfaction_level: 'neutral',
      needs_escalation: false,
      metadata: {},
      last_interaction: now,
      updated_at: now,
    };

    return await updateContext(userId, resetData);

  } catch (error) {
    logger.error('❌ Erro ao resetar contexto:', error);
    throw error;
  }
}

/**
 * Deleta contexto do usuário permanentemente
 * @param {string} userId - ID do usuário
 * @returns {Promise<boolean>} True se deletado
 */
async function deleteContext(userId) {
  try {
    logger.warn(`🗑️ Deletando contexto: ${userId}`);

    const { error } = await supabaseClient
      .from(CONTEXT_TABLE)
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    logger.info('✅ Contexto deletado');
    return true;

  } catch (error) {
    logger.error('❌ Erro ao deletar contexto:', error);
    throw error;
  }
}

/**
 * Lista todos os contextos ativos (última interação < TTL)
 * @param {Object} filters - Filtros opcionais
 * @returns {Promise<Array>} Lista de contextos ativos
 */
async function listActiveContexts(filters = {}) {
  try {
    logger.debug('📋 Listando contextos ativos');

    const ttlDate = new Date(Date.now() - CONTEXT_CONFIG.contextTTL * 1000).toISOString();

    let query = supabaseClient
      .from(CONTEXT_TABLE)
      .select('*')
      .gte('last_interaction', ttlDate);

    // Aplica filtros
    if (filters.intent) {
      query = query.eq('intent', filters.intent);
    }

    if (filters.needsEscalation) {
      query = query.eq('needs_escalation', true);
    }

    // Ordena por última interação (mais recentes primeiro)
    query = query.order('last_interaction', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    logger.debug(`✅ ${data.length} contexto(s) ativo(s)`);
    return data || [];

  } catch (error) {
    logger.error('❌ Erro ao listar contextos:', error);
    throw error;
  }
}

/**
 * Limpa contextos expirados (limpeza automática)
 * @returns {Promise<number>} Número de contextos deletados
 */
async function cleanExpiredContexts() {
  try {
    logger.info('🧹 Limpando contextos expirados...');

    const ttlDate = new Date(Date.now() - CONTEXT_CONFIG.contextTTL * 1000).toISOString();

    const { data, error } = await supabaseClient
      .from(CONTEXT_TABLE)
      .delete()
      .lt('last_interaction', ttlDate)
      .select();

    if (error) throw error;

    const deletedCount = data ? data.length : 0;
    logger.info(`✅ ${deletedCount} contexto(s) expirado(s) removido(s)`);
    
    return deletedCount;

  } catch (error) {
    logger.error('❌ Erro ao limpar contextos expirados:', error);
    throw error;
  }
}

/**
 * Obtém estatísticas dos contextos
 * @returns {Promise<Object>} Estatísticas
 */
async function getContextStats() {
  try {
    logger.debug('📊 Obtendo estatísticas de contextos');

    const { data, error } = await supabaseClient
      .from(CONTEXT_TABLE)
      .select('intent, needs_escalation, satisfaction_level, message_count');

    if (error) throw error;

    const ttlDate = new Date(Date.now() - CONTEXT_CONFIG.contextTTL * 1000);

    const stats = {
      total: data.length,
      active: data.filter(c => new Date(c.last_interaction) > ttlDate).length,
      byIntent: {
        prospeccao: data.filter(c => c.intent === 'prospeccao').length,
        suporte: data.filter(c => c.intent === 'suporte').length,
        geral: data.filter(c => c.intent === 'geral').length,
        unknown: data.filter(c => !c.intent).length,
      },
      needsEscalation: data.filter(c => c.needs_escalation).length,
      bySatisfaction: {
        very_satisfied: data.filter(c => c.satisfaction_level === 'very_satisfied').length,
        satisfied: data.filter(c => c.satisfaction_level === 'satisfied').length,
        neutral: data.filter(c => c.satisfaction_level === 'neutral').length,
        unsatisfied: data.filter(c => c.satisfaction_level === 'unsatisfied').length,
      },
      avgMessageCount: data.length > 0 
        ? (data.reduce((sum, c) => sum + (c.message_count || 0), 0) / data.length).toFixed(2)
        : 0,
    };

    logger.debug('✅ Estatísticas obtidas:', stats);
    return stats;

  } catch (error) {
    logger.error('❌ Erro ao obter estatísticas:', error);
    throw error;
  }
}

/**
 * Exporta contexto de um usuário (para análise ou backup)
 * @param {string} userId - ID do usuário
 * @returns {Promise<Object>} Contexto completo
 */
async function exportContext(userId) {
  try {
    logger.debug(`📤 Exportando contexto: ${userId}`);

    const context = await getOrCreateContext(userId);
    
    return {
      userId: context.user_id,
      userName: context.user_name,
      intent: context.intent,
      stage: context.stage,
      messageCount: context.message_count,
      firstInteraction: context.first_interaction,
      lastInteraction: context.last_interaction,
      history: context.history,
      userData: context.user_data,
      issueCount: context.issue_count,
      issueCategory: context.issue_category,
      satisfactionLevel: context.satisfaction_level,
      needsEscalation: context.needs_escalation,
      metadata: context.metadata,
      exportedAt: new Date().toISOString(),
    };

  } catch (error) {
    logger.error('❌ Erro ao exportar contexto:', error);
    throw error;
  }
}

module.exports = {
  getOrCreateContext,
  createContext,
  updateContext,
  addMessageToHistory,
  updateIntent,
  updateStage,
  updateUserData,
  incrementIssueCount,
  updateSatisfaction,
  resetContext,
  deleteContext,
  listActiveContexts,
  cleanExpiredContexts,
  getContextStats,
  exportContext,
  CONTEXT_CONFIG,
};