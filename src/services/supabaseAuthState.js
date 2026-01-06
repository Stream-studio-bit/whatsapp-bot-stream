import { BufferJSON } from '@whiskeysockets/baileys';

/**
 * Implementa auth state do Baileys usando Supabase Storage
 * Substitui MongoDB/useMultiFileAuthState para deploy gratuito
 * 
 * @param {Object} supabase - Cliente Supabase inicializado
 * @param {string} sessionId - ID único da sessão (ex: 'stream-studio-bot')
 * @returns {Promise<Object>} { state, saveCreds, clearAll }
 */
export async function useSupabaseAuthState(supabase, sessionId) {
  const BUCKET = 'whatsapp-sessions';
  const SESSION_PATH = `${sessionId}/session.json`;
  
  /**
   * Lê dados da sessão do Supabase Storage
   */
  const readData = async () => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(SESSION_PATH);
      
      if (error) {
        console.log('Nenhuma sessão encontrada, iniciando nova');
        return null;
      }
      
      const text = await data.text();
      return JSON.parse(text, BufferJSON.reviver);
    } catch (err) {
      console.error('Erro ao ler sessão:', err.message);
      return null;
    }
  };
  
  /**
   * Salva dados da sessão no Supabase Storage
   */
  const writeData = async (data) => {
    try {
      const serialized = JSON.stringify(data, BufferJSON.replacer);
      
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(SESSION_PATH, new Blob([serialized]), {
          upsert: true,
          contentType: 'application/json'
        });
      
      if (error) throw error;
    } catch (err) {
      console.error('Erro ao salvar sessão:', err.message);
    }
  };
  
  /**
   * Limpa sessão do Supabase Storage
   */
  const clearAll = async () => {
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([SESSION_PATH]);
      
      if (error) throw error;
      console.log('Sessão limpa com sucesso');
    } catch (err) {
      console.error('Erro ao limpar sessão:', err.message);
    }
  };
  
  // Carrega ou inicializa credenciais
  const session = await readData() || { 
    creds: {}, 
    keys: {} 
  };
  
  return {
    state: {
      creds: session.creds,
      keys: {
        /**
         * Obtém chaves de autenticação
         */
        get: async (type, ids) => {
          const data = {};
          ids.forEach(id => {
            const key = `${type}-${id}`;
            if (session.keys[key]) {
              data[id] = session.keys[key];
            }
          });
          return data;
        },
        
        /**
         * Define/atualiza chaves de autenticação
         */
        set: async (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const key = `${category}-${id}`;
              const value = data[category][id];
              
              if (value) {
                session.keys[key] = value;
              } else {
                delete session.keys[key];
              }
            }
          }
          await writeData(session);
        }
      }
    },
    
    /**
     * Salva credenciais atualizadas
     */
    saveCreds: async () => {
      await writeData(session);
    },
    
    /**
     * Limpa todas as credenciais
     */
    clearAll
  };
}