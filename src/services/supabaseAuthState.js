import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

/**
 * Auth state para Baileys usando Supabase Storage
 * BUCKET: whatsapp-sessions (minúsculo conforme Supabase)
 */
export async function useSupabaseAuthState(supabase, sessionId) {
  const BUCKET = 'whatsapp-sessions'; 
  const CREDS_FILE = `${sessionId}/creds.json`;
  const KEYS_PREFIX = `${sessionId}/keys/`;
  
  // Lê credenciais
  const readCreds = async () => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(CREDS_FILE);
      
      if (error) {
        console.log('🔍 Nenhuma credencial encontrada - primeira execução');
        return null;
      }
      
      const text = await data.text();
      console.log('✅ Credenciais carregadas do Supabase');
      return JSON.parse(text, BufferJSON.reviver);
    } catch (err) {
      console.error('❌ Erro ao ler credenciais:', err.message);
      return null;
    }
  };
  
  // Salva credenciais
  const writeCreds = async (creds) => {
    try {
      const json = JSON.stringify(creds, BufferJSON.replacer, 2);
      const buffer = Buffer.from(json, 'utf-8');
      
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(CREDS_FILE, buffer, {
          upsert: true,
          contentType: 'application/json'
        });
      
      if (error) throw error;
      console.log('💾 Credenciais salvas no Supabase');
    } catch (err) {
      console.error('❌ Erro ao salvar credenciais:', err.message);
      throw err;
    }
  };
  
  // Lê uma key específica
  const readKey = async (keyPath) => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(`${KEYS_PREFIX}${keyPath}.json`);
      
      if (error) return null;
      
      const text = await data.text();
      return JSON.parse(text, BufferJSON.reviver);
    } catch {
      return null;
    }
  };
  
  // Salva uma key
  const writeKey = async (keyPath, value) => {
    try {
      const json = JSON.stringify(value, BufferJSON.replacer);
      const buffer = Buffer.from(json, 'utf-8');
      
      await supabase.storage
        .from(BUCKET)
        .upload(`${KEYS_PREFIX}${keyPath}.json`, buffer, {
          upsert: true,
          contentType: 'application/json'
        });
    } catch (err) {
      console.error(`❌ Erro ao salvar key ${keyPath}:`, err.message);
    }
  };
  
  // Deleta uma key
  const deleteKey = async (keyPath) => {
    try {
      await supabase.storage
        .from(BUCKET)
        .remove([`${KEYS_PREFIX}${keyPath}.json`]);
    } catch (err) {
      console.error(`❌ Erro ao deletar key ${keyPath}:`, err.message);
    }
  };
  
  // Inicializa credenciais
  let creds = await readCreds();
  if (!creds) {
    console.log('🆕 Criando novas credenciais...');
    creds = initAuthCreds();
    await writeCreds(creds);
  }
  
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readKey(`${type}-${id}`);
              if (value) {
                data[id] = value;
              }
            })
          );
          return data;
        },
        
        set: async (data) => {
          const tasks = [];
          
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const keyPath = `${category}-${id}`;
              
              if (value) {
                tasks.push(writeKey(keyPath, value));
              } else {
                tasks.push(deleteKey(keyPath));
              }
            }
          }
          
          await Promise.all(tasks);
        }
      }
    },
    
    saveCreds: async () => {
      await writeCreds(creds);
    }
  };
}