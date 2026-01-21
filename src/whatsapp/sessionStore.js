import { supabaseSession } from '../database/supabaseClient.js';
import logger from '../utils/logger.js';

const SESSION_ID = process.env.SESSION_ID || 'omniwa_bot_session';

export function useSupabaseAuthState() {
  const saveState = async (key, value) => {
    try {
      const { error } = await supabaseSession
        .from('whatsapp-sessions')
        .upsert({
          session_id: SESSION_ID,
          key: key,
          value: value,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id,key'
        });

      if (error) throw error;
    } catch (error) {
      logger.error(`Erro ao salvar ${key}:`, error.message);
    }
  };

  const loadState = async (key) => {
    try {
      const { data, error } = await supabaseSession
        .from('whatsapp-sessions')
        .select('value')
        .eq('session_id', SESSION_ID)
        .eq('key', key)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data?.value || null;
    } catch (error) {
      logger.error(`Erro ao carregar ${key}:`, error.message);
      return null;
    }
  };

  const removeState = async (key) => {
    try {
      const { error } = await supabaseSession
        .from('whatsapp-sessions')
        .delete()
        .eq('session_id', SESSION_ID)
        .eq('key', key);

      if (error) throw error;
    } catch (error) {
      logger.error(`Erro ao remover ${key}:`, error.message);
    }
  };

  return {
    state: {
      creds: null,
      keys: null
    },
    saveCreds: async () => {
      if (useSupabaseAuthState.state?.creds) {
        await saveState('creds', useSupabaseAuthState.state.creds);
      }
    },
    saveKeys: async () => {
      if (useSupabaseAuthState.state?.keys) {
        await saveState('keys', useSupabaseAuthState.state.keys);
      }
    },
    loadCreds: async () => {
      const creds = await loadState('creds');
      if (creds) {
        useSupabaseAuthState.state.creds = creds;
      }
      return creds;
    },
    loadKeys: async () => {
      const keys = await loadState('keys');
      if (keys) {
        useSupabaseAuthState.state.keys = keys;
      }
      return keys;
    },
    removeCreds: async () => {
      await removeState('creds');
      useSupabaseAuthState.state.creds = null;
    },
    removeKeys: async () => {
      await removeState('keys');
      useSupabaseAuthState.state.keys = null;
    },
    clearAll: async () => {
      try {
        const { error } = await supabaseSession
          .from('whatsapp-sessions')
          .delete()
          .eq('session_id', SESSION_ID);

        if (error) throw error;
        
        useSupabaseAuthState.state.creds = null;
        useSupabaseAuthState.state.keys = null;
        
        logger.info('✅ Sessão limpa completamente');
      } catch (error) {
        logger.error('Erro ao limpar sessão:', error.message);
      }
    }
  };
}

export async function hasSession() {
  try {
    const { data, error } = await supabaseSession
      .from('whatsapp-sessions')
      .select('key')
      .eq('session_id', SESSION_ID)
      .eq('key', 'creds')
      .single();

    if (error && error.code === 'PGRST116') {
      return false;
    }

    if (error) throw error;

    return !!data;
  } catch (error) {
    logger.error('Erro ao verificar sessão:', error);
    return false;
  }
}

export async function getSessionInfo() {
  try {
    const { data, error } = await supabaseSession
      .from('whatsapp-sessions')
      .select('updated_at')
      .eq('session_id', SESSION_ID)
      .eq('key', 'creds')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return {
      sessionId: SESSION_ID,
      updatedAt: new Date(data.updated_at),
      age: Date.now() - new Date(data.updated_at).getTime()
    };
  } catch (error) {
    logger.error('Erro ao obter informações da sessão:', error);
    return null;
  }
}

export async function deleteSession() {
  try {
    logger.info('Deletando sessão do Supabase...');

    const { error } = await supabaseSession
      .from('whatsapp-sessions')
      .delete()
      .eq('session_id', SESSION_ID);

    if (error) throw error;

    logger.info('✅ Sessão deletada do Supabase');
    return true;
  } catch (error) {
    logger.error('Erro ao deletar sessão do Supabase:', error);
    return false;
  }
}

export async function cleanupOldSessions(daysOld = 30) {
  try {
    logger.info(`Limpando sessões com mais de ${daysOld} dias...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabaseSession
      .from('whatsapp-sessions')
      .delete()
      .lt('updated_at', cutoffDate.toISOString())
      .select();

    if (error) throw error;

    const deletedCount = data ? data.length : 0;
    logger.info(`✅ ${deletedCount} sessões antigas removidas`);

    return deletedCount;
  } catch (error) {
    logger.error('Erro ao limpar sessões antigas:', error);
    return 0;
  }
}