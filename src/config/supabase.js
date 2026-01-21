import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// CONFIGURAÇÃO SUPABASE - SERVICE ROLE ONLY
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Valida configurações do Supabase
 * CRÍTICO: Apenas Service Role Key é aceita
 * @returns {boolean}
 */
export function validateSupabaseConfig() {
  if (!SUPABASE_URL) {
    console.error('❌ SUPABASE_URL não configurado no .env');
    return false;
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurado no .env');
    console.error('⚠️  ANON_KEY NÃO é suportada para sessões WhatsApp');
    return false;
  }

  // Valida formato da URL
  try {
    new URL(SUPABASE_URL);
  } catch {
    console.error('❌ SUPABASE_URL inválido');
    return false;
  }

  return true;
}

/**
 * Cria cliente Supabase com Service Role Key
 * CRÍTICO: Bypass de RLS necessário para Storage de sessão
 * @returns {SupabaseClient}
 */
export function createSupabaseClient() {
  if (!validateSupabaseConfig()) {
    throw new Error('Configuração Supabase inválida');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    db: {
      schema: 'public'
    }
  });
}

/**
 * Testa conexão com Supabase e operações de Storage
 * @param {SupabaseClient} supabase 
 * @returns {Promise<boolean>}
 */
export async function testSupabaseConnection(supabase) {
  try {
    // Teste 1: Listar buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Erro ao conectar Supabase:', listError.message);
      return false;
    }

    // Teste 2: Operação real de Storage (upload + delete teste)
    const testFile = Buffer.from('test');
    const testPath = 'test-connection.txt';
    
    const { error: uploadError } = await supabase.storage
      .from('WHATSAPP-SESSIONS') // ✅ MAIÚSCULO
      .upload(testPath, testFile, { upsert: true });
    
    if (uploadError && uploadError.message !== 'The resource already exists') {
      console.error('❌ Erro ao testar upload:', uploadError.message);
      return false;
    }

    // Limpa arquivo de teste
    await supabase.storage
      .from('WHATSAPP-SESSIONS') // ✅ MAIÚSCULO
      .remove([testPath]);

    console.log('✅ Supabase conectado com sucesso');
    console.log(`📦 Buckets disponíveis: ${buckets.length}`);
    return true;
  } catch (err) {
    console.error('❌ Erro ao testar Supabase:', err.message);
    return false;
  }
}

/**
 * Verifica se o bucket existe e cria se necessário
 * @param {SupabaseClient} supabase 
 * @param {string} bucketName 
 * @returns {Promise<boolean>}
 */
export async function ensureBucketExists(supabase, bucketName = 'WHATSAPP-SESSIONS') {
  try {
    // Lista buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Erro ao listar buckets:', listError.message);
      return false;
    }

    // Verifica se bucket existe
    const bucketExists = buckets.some(b => b.name === bucketName);

    if (bucketExists) {
      console.log(`✅ Bucket "${bucketName}" já existe`);
      return true;
    }

    // Cria bucket se não existir
    console.log(`📦 Criando bucket "${bucketName}"...`);
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: 5242880 // 5MB
    });

    if (createError) {
      console.error('❌ Erro ao criar bucket:', createError.message);
      return false;
    }

    console.log(`✅ Bucket "${bucketName}" criado com sucesso`);
    return true;

  } catch (err) {
    console.error('❌ Erro em ensureBucketExists:', err.message);
    return false;
  }
}

export default {
  validateSupabaseConfig,
  createSupabaseClient,
  testSupabaseConnection,
  ensureBucketExists
};