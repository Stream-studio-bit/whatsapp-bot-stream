import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

/**
 * Auth state para Baileys usando Supabase Storage
 * Substitui useMultiFileAuthState para ambientes efêmeros
 */
export async function useSupabaseAuthState(supabase, sessionId) {
  const BUCKET = 'whatsapp-sessions';
  const FILE_PATH = `${sessionId}/creds.json`;
  
  // Lê credenciais do Supabase Storage
  const readCreds = async () => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(FILE_PATH);
      
      if (error) {
        console.log('📝 Nenhuma sessão encontrada, criando nova');
        return null;
      }
      
      const text = await data.text();
      return JSON.parse(text, BufferJSON.reviver);
    } catch (err) {
      console.error('❌ Erro ao ler credenciais:', err.message);
      return null;
    }
  };
  
  // Salva credenciais no Supabase Storage
  const writeCreds = async (creds) => {
    try {
      const json = JSON.stringify(creds, BufferJSON.replacer, 2);
      const buffer = Buffer.from(json, 'utf-8');
      
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, buffer, {
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
  
  // Carrega ou inicializa credenciais
  let creds = await readCreds();
  if (!creds) {
    creds = initAuthCreds();
    await writeCreds(creds);
  }
  
  return {
    state: { creds },
    saveCreds: async () => {
      await writeCreds(creds);
    }
  };
}