/**
 * knowledgeService.js
 * CRUD da base de conhecimento (FAQ, artigos, tutoriais)
 * Usado pelo RAG para fornecer contexto específico à IA
 */

const supabaseClient = require('../database/supabaseClient');
const logger = require('../utils/logger');

// Nome da tabela de conhecimento no Supabase
const KNOWLEDGE_TABLE = 'knowledge_base';

/**
 * Cria um novo documento na base de conhecimento
 * @param {Object} data - Dados do documento
 * @param {string} data.title - Título do documento
 * @param {string} data.content - Conteúdo completo
 * @param {string} data.category - Categoria ('prospeccao', 'suporte', 'geral')
 * @param {string} data.keywords - Palavras-chave separadas por vírgula
 * @returns {Promise<Object>} Documento criado
 */
async function createKnowledge(data) {
  try {
    logger.info(`📝 Criando novo documento: "${data.title}"`);

    // Valida dados obrigatórios
    if (!data.title || !data.content || !data.category) {
      throw new Error('Título, conteúdo e categoria são obrigatórios');
    }

    // Valida categoria
    const validCategories = ['prospeccao', 'suporte', 'geral'];
    if (!validCategories.includes(data.category)) {
      throw new Error(`Categoria inválida. Use: ${validCategories.join(', ')}`);
    }

    // Prepara dados para inserção
    const knowledgeData = {
      title: data.title.trim(),
      content: data.content.trim(),
      category: data.category,
      keywords: data.keywords ? data.keywords.toLowerCase().trim() : '',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Insere no banco
    const { data: created, error } = await supabaseClient
      .from(KNOWLEDGE_TABLE)
      .insert([knowledgeData])
      .select()
      .single();

    if (error) throw error;

    logger.info(`✅ Documento criado com sucesso: ID ${created.id}`);
    return created;

  } catch (error) {
    logger.error('❌ Erro ao criar documento:', error);
    throw error;
  }
}

/**
 * Lista todos os documentos da base de conhecimento
 * @param {Object} filters - Filtros opcionais
 * @param {string} filters.category - Filtrar por categoria
 * @param {boolean} filters.active - Filtrar por status (padrão: true)
 * @param {number} filters.limit - Limite de resultados
 * @returns {Promise<Array>} Lista de documentos
 */
async function listKnowledge(filters = {}) {
  try {
    logger.debug('📚 Listando documentos da base de conhecimento');

    let query = supabaseClient
      .from(KNOWLEDGE_TABLE)
      .select('*');

    // Aplica filtros
    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    if (filters.active !== undefined) {
      query = query.eq('active', filters.active);
    } else {
      // Por padrão, retorna apenas ativos
      query = query.eq('active', true);
    }

    // Ordena por data de criação (mais recentes primeiro)
    query = query.order('created_at', { ascending: false });

    // Limita resultados se especificado
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    logger.debug(`✅ ${data.length} documento(s) encontrado(s)`);
    return data || [];

  } catch (error) {
    logger.error('❌ Erro ao listar documentos:', error);
    throw error;
  }
}

/**
 * Busca um documento específico por ID
 * @param {string} id - ID do documento
 * @returns {Promise<Object|null>} Documento encontrado ou null
 */
async function getKnowledgeById(id) {
  try {
    logger.debug(`🔍 Buscando documento com ID: ${id}`);

    const { data, error } = await supabaseClient
      .from(KNOWLEDGE_TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn(`⚠️ Documento não encontrado: ${id}`);
        return null;
      }
      throw error;
    }

    logger.debug('✅ Documento encontrado');
    return data;

  } catch (error) {
    logger.error('❌ Erro ao buscar documento:', error);
    throw error;
  }
}

/**
 * Atualiza um documento existente
 * @param {string} id - ID do documento
 * @param {Object} updates - Campos a atualizar
 * @returns {Promise<Object>} Documento atualizado
 */
async function updateKnowledge(id, updates) {
  try {
    logger.info(`📝 Atualizando documento ID: ${id}`);

    // Valida se o documento existe
    const existing = await getKnowledgeById(id);
    if (!existing) {
      throw new Error('Documento não encontrado');
    }

    // Valida categoria se fornecida
    if (updates.category) {
      const validCategories = ['prospeccao', 'suporte', 'geral'];
      if (!validCategories.includes(updates.category)) {
        throw new Error(`Categoria inválida. Use: ${validCategories.join(', ')}`);
      }
    }

    // Prepara dados para atualização
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Remove campos que não devem ser atualizados
    delete updateData.id;
    delete updateData.created_at;

    // Normaliza keywords se fornecidas
    if (updateData.keywords) {
      updateData.keywords = updateData.keywords.toLowerCase().trim();
    }

    // Atualiza no banco
    const { data, error } = await supabaseClient
      .from(KNOWLEDGE_TABLE)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info('✅ Documento atualizado com sucesso');
    return data;

  } catch (error) {
    logger.error('❌ Erro ao atualizar documento:', error);
    throw error;
  }
}

/**
 * Desativa um documento (soft delete)
 * @param {string} id - ID do documento
 * @returns {Promise<Object>} Documento desativado
 */
async function deactivateKnowledge(id) {
  try {
    logger.info(`🗑️ Desativando documento ID: ${id}`);

    const updated = await updateKnowledge(id, { active: false });
    logger.info('✅ Documento desativado com sucesso');
    
    return updated;

  } catch (error) {
    logger.error('❌ Erro ao desativar documento:', error);
    throw error;
  }
}

/**
 * Reativa um documento desativado
 * @param {string} id - ID do documento
 * @returns {Promise<Object>} Documento reativado
 */
async function activateKnowledge(id) {
  try {
    logger.info(`♻️ Reativando documento ID: ${id}`);

    const updated = await updateKnowledge(id, { active: true });
    logger.info('✅ Documento reativado com sucesso');
    
    return updated;

  } catch (error) {
    logger.error('❌ Erro ao reativar documento:', error);
    throw error;
  }
}

/**
 * Deleta permanentemente um documento (hard delete)
 * @param {string} id - ID do documento
 * @returns {Promise<boolean>} True se deletado com sucesso
 */
async function deleteKnowledge(id) {
  try {
    logger.warn(`🗑️ DELETANDO PERMANENTEMENTE documento ID: ${id}`);

    // Verifica se existe antes de deletar
    const existing = await getKnowledgeById(id);
    if (!existing) {
      throw new Error('Documento não encontrado');
    }

    const { error } = await supabaseClient
      .from(KNOWLEDGE_TABLE)
      .delete()
      .eq('id', id);

    if (error) throw error;

    logger.info('✅ Documento deletado permanentemente');
    return true;

  } catch (error) {
    logger.error('❌ Erro ao deletar documento:', error);
    throw error;
  }
}

/**
 * Busca documentos por palavra-chave ou termo
 * @param {string} searchTerm - Termo de busca
 * @param {Object} options - Opções adicionais
 * @returns {Promise<Array>} Documentos encontrados
 */
async function searchKnowledgeByTerm(searchTerm, options = {}) {
  try {
    logger.debug(`🔍 Buscando documentos com termo: "${searchTerm}"`);

    if (!searchTerm || searchTerm.trim().length < 2) {
      logger.warn('⚠️ Termo de busca muito curto');
      return [];
    }

    const term = `%${searchTerm.toLowerCase()}%`;

    let query = supabaseClient
      .from(KNOWLEDGE_TABLE)
      .select('*')
      .eq('active', true)
      .or(`title.ilike.${term},content.ilike.${term},keywords.ilike.${term}`);

    // Aplica filtro de categoria se fornecido
    if (options.category) {
      query = query.eq('category', options.category);
    }

    // Ordena e limita
    query = query.order('created_at', { ascending: false });
    
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    logger.debug(`✅ ${data.length} documento(s) encontrado(s)`);
    return data || [];

  } catch (error) {
    logger.error('❌ Erro ao buscar documentos:', error);
    throw error;
  }
}

/**
 * Conta total de documentos por categoria
 * @returns {Promise<Object>} Contagem por categoria
 */
async function getKnowledgeStats() {
  try {
    logger.debug('📊 Obtendo estatísticas da base de conhecimento');

    const { data, error } = await supabaseClient
      .from(KNOWLEDGE_TABLE)
      .select('category, active');

    if (error) throw error;

    const stats = {
      total: data.length,
      active: data.filter(d => d.active).length,
      inactive: data.filter(d => !d.active).length,
      byCategory: {
        prospeccao: data.filter(d => d.category === 'prospeccao' && d.active).length,
        suporte: data.filter(d => d.category === 'suporte' && d.active).length,
        geral: data.filter(d => d.category === 'geral' && d.active).length,
      },
    };

    logger.debug('✅ Estatísticas obtidas:', stats);
    return stats;

  } catch (error) {
    logger.error('❌ Erro ao obter estatísticas:', error);
    throw error;
  }
}

/**
 * Importa múltiplos documentos em lote
 * @param {Array<Object>} documents - Array de documentos
 * @returns {Promise<Object>} Resultado da importação
 */
async function bulkImportKnowledge(documents) {
  try {
    logger.info(`📦 Importando ${documents.length} documentos em lote`);

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error('Array de documentos inválido ou vazio');
    }

    // Valida e prepara todos os documentos
    const validCategories = ['prospeccao', 'suporte', 'geral'];
    const preparedDocs = documents.map((doc, index) => {
      if (!doc.title || !doc.content || !doc.category) {
        throw new Error(`Documento ${index + 1}: título, conteúdo e categoria são obrigatórios`);
      }

      if (!validCategories.includes(doc.category)) {
        throw new Error(`Documento ${index + 1}: categoria inválida`);
      }

      return {
        title: doc.title.trim(),
        content: doc.content.trim(),
        category: doc.category,
        keywords: doc.keywords ? doc.keywords.toLowerCase().trim() : '',
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    // Insere em lote
    const { data, error } = await supabaseClient
      .from(KNOWLEDGE_TABLE)
      .insert(preparedDocs)
      .select();

    if (error) throw error;

    const result = {
      success: true,
      imported: data.length,
      documents: data,
    };

    logger.info(`✅ ${result.imported} documentos importados com sucesso`);
    return result;

  } catch (error) {
    logger.error('❌ Erro na importação em lote:', error);
    throw error;
  }
}

/**
 * Exporta toda a base de conhecimento
 * @param {Object} filters - Filtros opcionais
 * @returns {Promise<Array>} Documentos exportados
 */
async function exportKnowledge(filters = {}) {
  try {
    logger.info('📤 Exportando base de conhecimento');

    const documents = await listKnowledge(filters);

    logger.info(`✅ ${documents.length} documentos exportados`);
    return documents;

  } catch (error) {
    logger.error('❌ Erro ao exportar conhecimento:', error);
    throw error;
  }
}

module.exports = {
  createKnowledge,
  listKnowledge,
  getKnowledgeById,
  updateKnowledge,
  deactivateKnowledge,
  activateKnowledge,
  deleteKnowledge,
  searchKnowledgeByTerm,
  getKnowledgeStats,
  bulkImportKnowledge,
  exportKnowledge,
};