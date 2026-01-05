import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// CONFIGURAÇÃO SUPABASE
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

/**
 * Valida configurações do Supabase
 * @returns {boolean}
 */
export function validateSupabaseConfig() {
  if (!SUPABASE_URL) {
    console.error('❌ SUPABASE_URL não configurado no .env');
    return false;
  }

  if (!SUPABASE_ANON_KEY) {
    console.error('❌ SUPABASE_ANON_KEY não configurado no .env');
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
 * Cria cliente Supabase
 * @returns {SupabaseClient}
 */
export function createSupabaseClient() {
  if (!validateSupabaseConfig()) {
    throw new Error('Configuração Supabase inválida');
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Testa conexão com Supabase
 * @param {SupabaseClient} supabase 
 * @returns {Promise<boolean>}
 */
export async function testSupabaseConnection(supabase) {
  try {
    // Tenta listar buckets para testar conexão
    const { data, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('❌ Erro ao conectar Supabase:', error.message);
      return false;
    }

    console.log('✅ Supabase conectado com sucesso');
    console.log(`📦 Buckets disponíveis: ${data.length}`);
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
export async function ensureBucketExists(supabase, bucketName = 'whatsapp-sessions') {
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