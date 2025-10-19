import https from 'https';

// URL do seu app no Render (você vai obter após deploy)
const RENDER_URL = process.env.RENDER_URL || 'https://whatsapp-bot-stream.onrender.com';

/**
 * Faz ping a cada 10 minutos para manter o bot acordado
 */
function keepAlive() {
  if (!process.env.RENDER_URL) {
    console.log('⚠️  RENDER_URL não configurada. Keep-alive desabilitado.');
    return;
  }
  
  setInterval(() => {
    https.get(RENDER_URL + '/health', (res) => {
      console.log(`✅ Keep-alive ping: ${res.statusCode}`);
    }).on('error', (err) => {
      console.log(`❌ Keep-alive erro: ${err.message}`);
    });
  }, 10 * 60 * 1000); // 10 minutos
  
  console.log('🔄 Keep-alive ativado!');
}

export default keepAlive;