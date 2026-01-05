/**
 * 🗄️ SUPABASE CLIENT
 * Cliente direto para banco de dados Supabase
 * Usado pelos services e pelo ragEngine
 * 
 * Responsabilidades:
 * - Conectar com Supabase
 * - Fornecer interface para operações CRUD
 * - Gerenciar tabelas: conversations, blocked_users, whatsapp_sessions, knowledge_base
 */

const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseKey } = require('../config/supabase');
const logger = require('../utils/logger');

// Inicializa o cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

/**
 * 💬 CONVERSATIONS - Gerenciamento de conversas
 */
const conversations = {
  /**
   * Cria nova conversa ou atualiza existente
   */
  async create(data) {
    try {
      const { error } = await supabase
        .from('conversations')
        .insert({
          user_jid: data.userJid,
          user_name: data.userName || null,
          user_message: data.userMessage,
          bot_response: data.botResponse || null,
          intent: data.intent || null,
          owner_initiated: data.ownerInitiated || false,
          ai_activated: data.aiActivated || false,
          ai_activated_at: data.aiActivatedAt || null,
          first_owner_message: data.firstOwnerMessage || null,
          first_client_message: data.firstClientMessage || null
        });

      if (error) throw error;
      logger.info(`✅ Conversa registrada: ${data.userJid}`);
      return { success: true };
    } catch (error) {
      logger.error('❌ Erro ao criar conversa:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Busca histórico de conversas de um usuário
   */
  async getByUser(userJid, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_jid', userJid)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      logger.error('❌ Erro ao buscar conversas:', error.message);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Busca conversas iniciadas pelo dono (owner_initiated = true)
   */
  async getOwnerInitiated(aiActivated = null) {
    try {
      let query = supabase
        .from('conversations')
        .select('*')
        .eq('owner_initiated', true)
        .order('created_at', { ascending: false });

      if (aiActivated !== null) {
        query = query.eq('ai_activated', aiActivated);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      logger.error('❌ Erro ao buscar conversas owner_initiated:', error.message);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Ativa IA em conversa iniciada pelo dono
   */
  async activateAI(userJid) {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          ai_activated: true,
          ai_activated_at: new Date().toISOString()
        })
        .eq('user_jid', userJid)
        .eq('owner_initiated', true);

      if (error) throw error;
      logger.info(`🤖 IA ativada para: ${userJid}`);
      return { success: true };
    } catch (error) {
      logger.error('❌ Erro ao ativar IA:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * 🚫 BLOCKED USERS - Gerenciamento de usuários bloqueados
 */
const blockedUsers = {
  /**
   * Verifica se usuário está bloqueado
   */
  async isBlocked(userJid) {
    try {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('is_blocked')
        .eq('user_jid', userJid)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = não encontrado
      return data ? data.is_blocked : false;
    } catch (error) {
      logger.error('❌ Erro ao verificar bloqueio:', error.message);
      return false;
    }
  },

  /**
   * Bloqueia um usuário
   */
  async block(userJid, blockedBy = 'System') {
    try {
      const { error } = await supabase
        .from('blocked_users')
        .upsert({
          user_jid: userJid,
          is_blocked: true,
          blocked_by: blockedBy,
          blocked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      logger.info(`🚫 Usuário bloqueado: ${userJid}`);
      return { success: true };
    } catch (error) {
      logger.error('❌ Erro ao bloquear usuário:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Desbloqueia um usuário
   */
  async unblock(userJid) {
    try {
      const { error } = await supabase
        .from('blocked_users')
        .update({
          is_blocked: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_jid', userJid);

      if (error) throw error;
      logger.info(`✅ Usuário desbloqueado: ${userJid}`);
      return { success: true };
    } catch (error) {
      logger.error('❌ Erro ao desbloquear usuário:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Lista todos os usuários bloqueados
   */
  async list() {
    try {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('*')
        .eq('is_blocked', true)
        .order('blocked_at', { ascending: false });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      logger.error('❌ Erro ao listar bloqueados:', error.message);
      return { success: false, error: error.message, data: [] };
    }
  }
};

/**
 * 📱 WHATSAPP SESSIONS - Gerenciamento de sessões do WhatsApp
 */
const sessions = {
  /**
   * Salva sessão do WhatsApp
   */
  async save(sessionId, sessionData) {
    try {
      const { error } = await supabase
        .from('whatsapp_sessions')
        .upsert({
          session_id: sessionId,
          session_data: sessionData,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      logger.info(`💾 Sessão salva: ${sessionId}`);
      return { success: true };
    } catch (error) {
      logger.error('❌ Erro ao salvar sessão:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Recupera sessão do WhatsApp
   */
  async load(sessionId) {
    try {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('session_data')
        .eq('session_id', sessionId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data ? { success: true, data: data.session_data } : { success: false, data: null };
    } catch (error) {
      logger.error('❌ Erro ao carregar sessão:', error.message);
      return { success: false, error: error.message, data: null };
    }
  },

  /**
   * Remove sessão do WhatsApp
   */
  async delete(sessionId) {
    try {
      const { error } = await supabase
        .from('whatsapp_sessions')
        .delete()
        .eq('session_id', sessionId);

      if (error) throw error;
      logger.info(`🗑️ Sessão removida: ${sessionId}`);
      return { success: true };
    } catch (error) {
      logger.error('❌ Erro ao remover sessão:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * 📚 KNOWLEDGE BASE - Base de conhecimento para RAG
 */
const knowledge = {
  /**
   * Busca documentos relevantes (usado pelo RAG)
   */
  async search(query, limit = 5) {
    try {
      // Busca simples por palavras-chave no título e conteúdo
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(limit);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      logger.error('❌ Erro ao buscar conhecimento:', error.message);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Lista toda a base de conhecimento
   */
  async listAll() {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      logger.error('❌ Erro ao listar conhecimento:', error.message);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Adiciona novo documento à base
   */
  async add(title, content, category = 'geral') {
    try {
      const { error } = await supabase
        .from('knowledge_base')
        .insert({
          title,
          content,
          category
        });

      if (error) throw error;
      logger.info(`📚 Conhecimento adicionado: ${title}`);
      return { success: true };
    } catch (error) {
      logger.error('❌ Erro ao adicionar conhecimento:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * 🧪 Testa conexão com Supabase
 */
async function testConnection() {
  try {
    const { error } = await supabase.from('conversations').select('count').limit(1);
    if (error) throw error;
    logger.info('✅ Conexão com Supabase estabelecida');
    return true;
  } catch (error) {
    logger.error('❌ Falha na conexão com Supabase:', error.message);
    return false;
  }
}

module.exports = {
  supabase,
  conversations,
  blockedUsers,
  sessions,
  knowledge,
  testConnection
};