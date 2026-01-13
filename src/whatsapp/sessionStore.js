// Convertido para ES Modules

/**
 * sessionStore.js
 * Salva e recupera a sessão do WhatsApp no Supabase
 * Evita desconexão quando o servidor reiniciar
 * Armazena credenciais de autenticação do Baileys
 */

import supabaseClient from '../database/supabaseClient.js';
import logger from '../utils/logger.js';

// Nome da tabela no Supabase
const SESSION_TABLE = 'whatsapp_sessions';

// ID único da sessão (pode ser alterado se houver múltiplos bots)
const SESSION_ID = process.env.SESSION_ID || 'omniwa_bot_session';

/**
 * Salva a sessão do WhatsApp no Supabase
 * @param {Object} authState - Estado de autenticação do Baileys
 * @returns {Promise<boolean>} True se salvou com sucesso
 */
export async function saveSession(authState) {
  try {
    logger.debug('Salvando sessão no Supabase...');

    // Serializa o estado de autenticação
    const sessionData = JSON.stringify(authState);

    // Verifica se já existe uma sessão salva
    const { data: existingSession, error: fetchError } = await supabaseClient
      .from(SESSION_TABLE)
      .select('id')
      .eq('session_id', SESSION_ID)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = nenhum registro encontrado (é esperado na primeira vez)
      throw fetchError;
    }

    // Atualiza ou insere a sessão
    if (existingSession) {
      // Atualiza sessão existente
      const { error: updateError } = await supabaseClient
        .from(SESSION_TABLE)
        .update({
          session_data: sessionData,
          updated_at: new Date().toISOString(),
        })
        .eq('session_id', SESSION_ID);

      if (updateError) throw updateError;
      logger.debug('✅ Sessão atualizada no Supabase');
    } else {
      // Insere nova sessão
      const { error: insertError } = await supabaseClient
        .from(SESSION_TABLE)
        .insert({
          session_id: SESSION_ID,
          session_data: sessionData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
      logger.debug('✅ Sessão criada no Supabase');
    }

    return true;
  } catch (error) {
    logger.error('Erro ao salvar sessão no Supabase:', error);
    return false;
  }
}

/**
 * Carrega a sessão do WhatsApp do Supabase
 * @returns {Promise<Object|null>} Estado de autenticação ou null se não existir
 */
export async function loadSession() {
  try {
    logger.debug('Carregando sessão do Supabase...');

    const { data, error } = await supabaseClient
      .from(SESSION_TABLE)
      .select('session_data, updated_at')
      .eq('session_id', SESSION_ID)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.info('Nenhuma sessão encontrada no Supabase (primeira conexão)');
        return null;
      }
      throw error;
    }

    if (!data || !data.session_data) {
      logger.warn('Sessão encontrada mas sem dados válidos');
      return null;
    }

    // Deserializa os dados da sessão
    const authState = JSON.parse(data.session_data);
    
    const lastUpdate = new Date(data.updated_at);
    logger.info(`✅ Sessão carregada do Supabase (última atualização: ${lastUpdate.toLocaleString()})`);

    return authState;
  } catch (error) {
    logger.error('Erro ao carregar sessão do Supabase:', error);
    return null;
  }
}

/**
 * Deleta a sessão do WhatsApp do Supabase
 * @returns {Promise<boolean>} True se deletou com sucesso
 */
export async function deleteSession() {
  try {
    logger.info('Deletando sessão do Supabase...');

    const { error } = await supabaseClient
      .from(SESSION_TABLE)
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

/**
 * Verifica se existe uma sessão salva
 * @returns {Promise<boolean>} True se existe sessão
 */
export async function hasSession() {
  try {
    const { data, error } = await supabaseClient
      .from(SESSION_TABLE)
      .select('id')
      .eq('session_id', SESSION_ID)
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

/**
 * Retorna informações sobre a sessão salva
 * @returns {Promise<Object|null>} Informações da sessão
 */
export async function getSessionInfo() {
  try {
    const { data, error } = await supabaseClient
      .from(SESSION_TABLE)
      .select('session_id, created_at, updated_at')
      .eq('session_id', SESSION_ID)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return {
      sessionId: data.session_id,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      age: Date.now() - new Date(data.updated_at).getTime(),
    };
  } catch (error) {
    logger.error('Erro ao obter informações da sessão:', error);
    return null;
  }
}

/**
 * Limpa sessões antigas/expiradas do Supabase
 * @param {number} daysOld - Dias para considerar sessão antiga (padrão: 30)
 * @returns {Promise<number>} Quantidade de sessões deletadas
 */
export async function cleanupOldSessions(daysOld = 30) {
  try {
    logger.info(`Limpando sessões com mais de ${daysOld} dias...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabaseClient
      .from(SESSION_TABLE)
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