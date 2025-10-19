import https from 'https';

// URL do seu app no Render
const RENDER_URL = process.env.RENDER_URL || 'https://whatsapp-bot-stream.onrender.com';

/**
 * Faz ping a cada 10 minutos para manter o bot acordado
 */
function keepAlive() {
  // Verifica se está no ambiente Render
  if (!process.env.RENDER) {
    console.log('ℹ️  Keep-alive desabilitado (ambiente local)');
    return;
  }
  
  if (!process.env.RENDER_URL) {
    console.log('⚠️  RENDER_URL não configurada. Usando URL padrão:', RENDER_URL);
  }
  
  setInterval(() => {
    const url = RENDER_URL + '/health';
    
    https.get(url, (res) => {
      console.log(`✅ Keep-alive ping: ${res.statusCode} - ${new Date().toLocaleTimeString()}`);
    }).on('error', (err) => {
      console.log(`❌ Keep-alive erro: ${err.message}`);
    });
  }, 10 * 60 * 1000); // 10 minutos
  
  console.log('🔄 Keep-alive ativado! Ping a cada 10 minutos.');
  console.log(`📍 URL monitorada: ${RENDER_URL}/health\n`);
}

export default keepAlive;