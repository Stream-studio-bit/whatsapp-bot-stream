import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_ID = process.env.SESSION_ID || 'stream-studio-bot';

/**
 * 🔥 SCRIPT DE LIMPEZA DE SESSÃO
 * Remove TODAS as credenciais do MongoDB para forçar novo QR Code
 */
async function clearSession() {
  console.log('\n🧹 ════════════════════════════════════════════════');
  console.log('🧹 LIMPEZA DE SESSÃO - WHATSAPP BOT');
  console.log('🧹 ════════════════════════════════════════════════\n');
  
  if (!MONGODB_URI) {
    console.error('❌ ERRO: MONGODB_URI não configurado no .env\n');
    process.exit(1);
  }
  
  let client;
  
  try {
    console.log('🔗 Conectando ao MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Conectado com sucesso!\n');
    
    const db = client.db('baileys_auth');
    const collection = db.collection(SESSION_ID);
    
    // Conta documentos antes da limpeza
    const countBefore = await collection.countDocuments();
    console.log(`📊 Documentos encontrados: ${countBefore}`);
    
    if (countBefore === 0) {
      console.log('ℹ️  Nenhuma sessão encontrada. Já está limpo!\n');
      return;
    }
    
    // Pergunta confirmação
    console.log('\n⚠️  ATENÇÃO: Esta ação vai:');
    console.log('   • Remover TODAS as credenciais do WhatsApp');
    console.log('   • Forçar escaneamento de novo QR Code');
    console.log('   • Desconectar qualquer sessão ativa\n');
    
    // Remove todos os documentos
    console.log('🗑️  Removendo credenciais...');
    const result = await collection.deleteMany({});
    console.log(`✅ ${result.deletedCount} documentos removidos com sucesso!\n`);
    
    console.log('🎉 ════════════════════════════════════════════════');
    console.log('🎉 LIMPEZA CONCLUÍDA!');
    console.log('🎉 ════════════════════════════════════════════════\n');
    console.log('📱 Próximos passos:');
    console.log('   1. Reinicie o bot: npm start');
    console.log('   2. Escaneie o QR Code que aparecer');
    console.log('   3. Aguarde a conexão estabelecer\n');
    
  } catch (error) {
    console.error('\n❌ ERRO durante limpeza:', error.message);
    console.error('💡 Verifique se o MongoDB está acessível\n');
    process.exit(1);
    
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Conexão MongoDB fechada\n');
    }
  }
}

// Executa limpeza
clearSession();