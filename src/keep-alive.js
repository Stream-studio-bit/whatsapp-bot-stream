import https from 'https';

// URL do seu app no Render
const RENDER_URL = process.env.RENDER_URL || 'https://whatsapp-bot-stream.onrender.com';

/**
 * Faz ping a cada 10 minutos para manter o bot acordado
 */
function keepAlive() {
  // 🔥 CORREÇÃO: Checagem robusta de ambiente Render
  const isRender = String(process.env.RENDER || '').toLowerCase() === 'true' || process.env.RENDER === '1';
  
  if (!isRender) {
    console.log('ℹ️  Keep-alive desabilitado (ambiente local)');
    return;
  }
  
  if (!process.env.RENDER_URL) {
    console.log('⚠️  RENDER_URL não configurada. Usando URL padrão:', RENDER_URL);
  }
  
  // 🔥 CORREÇÃO: Função de ping reutilizável
  const ping = () => {
    const url = RENDER_URL + '/health';
    
    // 🔥 CORREÇÃO: Adiciona timeout de 5 segundos
    const req = https.get(url, { timeout: 5000 }, (res) => {
      console.log(`✅ Keep-alive ping: ${res.statusCode} - ${new Date().toLocaleTimeString()}`);
    });
    
    req.on('error', (err) => {
      console.log(`❌ Keep-alive erro: ${err.message}`);
    });
    
    // 🔥 CORREÇÃO: Tratamento de timeout
    req.on('timeout', () => {
      req.destroy();
      console.log(`⏱️  Keep-alive timeout (10s excedido)`);
    });
  };
  
  // 🔥 CORREÇÃO: Primeiro ping imediato
  console.log('🔄 Keep-alive ativado! Ping a cada 10 minutos.');
  console.log(`📍 URL monitorada: ${RENDER_URL}/health\n`);
  
  ping(); // Ping imediato
  
  // Pings subsequentes a cada 10 minutos
  setInterval(ping, 10 * 60 * 1000);
}

export default keepAlive;