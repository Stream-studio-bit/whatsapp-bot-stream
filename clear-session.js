import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SESSION_ID = process.env.SESSION_ID || 'stream-studio-bot';

/**
 * 🔥 SCRIPT DE LIMPEZA DE SESSÃO
 * Remove TODAS as credenciais do Supabase Storage para forçar novo QR Code
 */
async function clearSession() {
  console.log('\n🧹 ════════════════════════════════════════════════');
  console.log('🧹 LIMPEZA DE SESSÃO - WHATSAPP BOT');
  console.log('🧹 ════════════════════════════════════════════════\n');
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_ANON_KEY não configurados no .env\n');
    process.exit(1);
  }
  
  try {
    console.log('🔗 Conectando ao Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Conectado com sucesso!\n');
    
    const BUCKET = 'whatsapp-sessions';
    const SESSION_PATH = `${SESSION_ID}/session.json`;
    
    // Verifica se a sessão existe
    console.log('📊 Verificando sessão existente...');
    const { data: file, error: getError } = await supabase.storage
      .from(BUCKET)
      .list(SESSION_ID);
    
    if (getError) {
      console.log(`ℹ️  Bucket não encontrado ou sem permissão: ${getError.message}`);
      console.log('ℹ️  Isso pode significar que não há sessão para limpar.\n');
      return;
    }
    
    if (!file || file.length === 0) {
      console.log('ℹ️  Nenhuma sessão encontrada. Já está limpo!\n');
      return;
    }
    
    console.log(`📄 Sessão encontrada: ${SESSION_PATH}`);
    
    // Pergunta confirmação
    console.log('\n⚠️  ATENÇÃO: Esta ação vai:');
    console.log('   • Remover TODAS as credenciais do WhatsApp');
    console.log('   • Forçar escaneamento de novo QR Code');
    console.log('   • Desconectar qualquer sessão ativa\n');
    
    // Remove a sessão
    console.log('🗑️  Removendo credenciais...');
    const { error: deleteError } = await supabase.storage
      .from(BUCKET)
      .remove([SESSION_PATH]);
    
    if (deleteError) {
      console.error('❌ Erro ao remover sessão:', deleteError.message);
      process.exit(1);
    }
    
    console.log('✅ Sessão removida com sucesso!\n');
    
    console.log('🎉 ════════════════════════════════════════════════');
    console.log('🎉 LIMPEZA CONCLUÍDA!');
    console.log('🎉 ════════════════════════════════════════════════\n');
    console.log('📱 Próximos passos:');
    console.log('   1. Reinicie o bot: npm start');
    console.log('   2. Acesse /qr no navegador');
    console.log('   3. Escaneie o QR Code que aparecer');
    console.log('   4. Aguarde a conexão estabelecer\n');
    
  } catch (error) {
    console.error('\n❌ ERRO durante limpeza:', error.message);
    console.error('💡 Verifique se o Supabase está acessível e as credenciais estão corretas\n');
    process.exit(1);
  }
}

// Executa limpeza
clearSession();