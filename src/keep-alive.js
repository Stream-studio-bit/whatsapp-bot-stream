import https from 'https';
import http from 'http';

// ============================================
// 🔥 CONFIGURAÇÕES OTIMIZADAS
// ============================================

// 🔥 CORREÇÃO #1: Intervalo ajustável por ambiente
const PING_INTERVAL = parseInt(process.env.KEEP_ALIVE_INTERVAL) || 14 * 60 * 1000; // 14 minutos (recomendado)
const PING_TIMEOUT = parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 10000; // 10 segundos
const MAX_RETRIES = parseInt(process.env.KEEP_ALIVE_RETRIES) || 3;

// 🔥 CORREÇÃO #2: Detecção automática de plataforma
const RENDER_URL = process.env.RENDER_URL || process.env.RENDER_EXTERNAL_URL;
const FLY_APP_NAME = process.env.FLY_APP_NAME;

// Determina URL base automaticamente
let BASE_URL;
if (RENDER_URL) {
  BASE_URL = RENDER_URL;
} else if (FLY_APP_NAME) {
  BASE_URL = `https://${FLY_APP_NAME}.fly.dev`;
} else {
  BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
}

// 🔥 CORREÇÃO #3: Estado do keep-alive
let pingCount = 0;
let failedPings = 0;
let lastSuccessfulPing = null;
let lastFailedPing = null;
let isEnabled = false;
let pingInterval = null;

// ============================================
// 🔥 FUNÇÃO DE PING MELHORADA
// ============================================

/**
 * Faz ping no servidor para mantê-lo acordado
 * @param {boolean} isFirstPing - Se é o primeiro ping (evita retry)
 */
function ping(isFirstPing = false) {
  const url = `${BASE_URL}/health`;
  const protocol = url.startsWith('https') ? https : http;
  const startTime = Date.now();

  // 🔥 Configuração da requisição
  const options = {
    timeout: PING_TIMEOUT,
    headers: {
      'User-Agent': 'Keep-Alive-Bot/1.0',
      'X-Keep-Alive': 'true'
    }
  };

  const req = protocol.get(url, options, (res) => {
    const duration = Date.now() - startTime;
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      pingCount++;
      
      if (res.statusCode === 200) {
        failedPings = 0; // Reseta contador de falhas
        lastSuccessfulPing = new Date();
        
        // 🔥 CORREÇÃO #2: Logs mais informativos
        console.log(`✅ Keep-alive ping #${pingCount}: ${res.statusCode} (${duration}ms) - ${formatTime()}`);
        
        // 🔥 Parse do status do WhatsApp (se disponível)
        try {
          const status = JSON.parse(data);
          if (status.whatsapp) {
            const wsStatus = status.whatsapp.connected ? '🟢 Conectado' : '🔴 Desconectado';
            if (process.env.DEBUG_MODE === 'true') {
              console.log(`   WhatsApp: ${wsStatus} | Tentativas: ${status.whatsapp.reconnectAttempts || 0}`);
            }
          }
        } catch (e) {
          // JSON inválido ou não disponível - ignora
        }
      } else {
        failedPings++;
        lastFailedPing = new Date();
        console.log(`⚠️  Keep-alive ping #${pingCount}: ${res.statusCode} (${duration}ms) - ${formatTime()}`);
        
        // 🔥 Retry apenas se não for o primeiro ping e ainda houver tentativas
        if (!isFirstPing && failedPings < MAX_RETRIES) {
          console.log(`🔄 Tentando novamente (${failedPings}/${MAX_RETRIES})...`);
          setTimeout(() => ping(false), 5000);
        } else if (failedPings >= MAX_RETRIES) {
          console.log(`❌ Falha após ${MAX_RETRIES} tentativas. Aguardando próximo ciclo...`);
          failedPings = 0; // Reseta para próximo ciclo
        }
      }
    });
  });

  // 🔥 CORREÇÃO #3: Tratamento melhorado de erros
  req.on('error', (err) => {
    const duration = Date.now() - startTime;
    failedPings++;
    lastFailedPing = new Date();
    
    console.log(`❌ Keep-alive erro #${pingCount + 1}: ${err.message} (${duration}ms)`);
    
    if (err.code === 'ENOTFOUND') {
      console.log('⚠️  URL não encontrada. Verifique RENDER_URL ou FLY_APP_NAME no .env');
    } else if (err.code === 'ECONNREFUSED') {
      console.log('⚠️  Conexão recusada. Servidor pode estar reiniciando...');
    } else if (err.code === 'ETIMEDOUT') {
      console.log('⚠️  Timeout. Servidor está lento ou sobrecarregado.');
    }
    
    // Retry inteligente
    if (!isFirstPing && failedPings < MAX_RETRIES) {
      const retryDelay = 5000 * failedPings; // Backoff: 5s, 10s, 15s
      console.log(`🔄 Tentando novamente em ${retryDelay / 1000}s (${failedPings}/${MAX_RETRIES})...`);
      setTimeout(() => ping(false), retryDelay);
    } else if (failedPings >= MAX_RETRIES) {
      console.log(`❌ Falha após ${MAX_RETRIES} tentativas. Aguardando próximo ciclo (${PING_INTERVAL / 60000}min)...`);
      failedPings = 0;
    }
  });

  // 🔥 CORREÇÃO #3: Tratamento de timeout corrigido
  req.on('timeout', () => {
    req.destroy();
    const duration = Date.now() - startTime;
    failedPings++;
    lastFailedPing = new Date();
    
    console.log(`⏱️  Keep-alive timeout #${pingCount + 1} (>${PING_TIMEOUT / 1000}s) - ${duration}ms`);
    
    if (!isFirstPing && failedPings < MAX_RETRIES) {
      console.log(`🔄 Tentando novamente (${failedPings}/${MAX_RETRIES})...`);
      setTimeout(() => ping(false), 5000);
    }
  });

  req.end();
}

// ============================================
// 🔥 FUNÇÃO AUXILIAR: FORMATAÇÃO DE TEMPO
// ============================================

function formatTime() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ============================================
// 🔥 FUNÇÃO AUXILIAR: ESTATÍSTICAS
// ============================================

export function getKeepAliveStats() {
  return {
    enabled: isEnabled,
    totalPings: pingCount,
    failedPings: failedPings,
    lastSuccessfulPing: lastSuccessfulPing,
    lastFailedPing: lastFailedPing,
    interval: PING_INTERVAL,
    timeout: PING_TIMEOUT,
    baseUrl: BASE_URL
  };
}

// ============================================
// 🔥 FUNÇÃO PRINCIPAL: INICIA KEEP-ALIVE
// ============================================

/**
 * Inicia o keep-alive automático
 */
export default function keepAlive() {
  // 🔥 CORREÇÃO #1: Verifica ambiente
  const isRender = String(process.env.RENDER || '').toLowerCase() === 'true' || 
                   process.env.RENDER === '1' ||
                   !!process.env.RENDER_EXTERNAL_URL;
  
  const isFly = !!process.env.FLY_APP_NAME;
  
  const isProduction = isRender || isFly;

  // 🔥 Em desenvolvimento local, keep-alive é opcional
  if (!isProduction && process.env.ENABLE_KEEP_ALIVE !== 'true') {
    console.log('ℹ️  Keep-alive desabilitado (ambiente local)');
    console.log('💡 Para habilitar localmente, defina ENABLE_KEEP_ALIVE=true no .env\n');
    return;
  }

  // 🔥 Validação de URL
  if (!BASE_URL || BASE_URL.includes('undefined')) {
    console.log('⚠️  AVISO: URL do keep-alive não configurada corretamente!');
    console.log('   Configure RENDER_URL (Render) ou FLY_APP_NAME (Fly.io) no .env');
    console.log(`   URL atual: ${BASE_URL}\n`);
    return;
  }

  // 🔥 Banner informativo
  console.log('\n🔄 ╔════════════════════════════════════════════════════════╗');
  console.log('🔄 ║          KEEP-ALIVE ATIVADO                          ║');
  console.log('🔄 ╚════════════════════════════════════════════════════════╝');
  console.log(`📍 URL monitorada: ${BASE_URL}/health`);
  console.log(`⏱️  Intervalo: ${PING_INTERVAL / 60000} minutos`);
  console.log(`⏱️  Timeout: ${PING_TIMEOUT / 1000} segundos`);
  console.log(`🔄 Retries: ${MAX_RETRIES}`);
  console.log(`🌐 Plataforma: ${isRender ? 'Render' : isFly ? 'Fly.io' : 'Local'}`);
  console.log('🔄 ╚════════════════════════════════════════════════════════╝\n');

  // 🔥 Primeiro ping imediato
  console.log('🚀 Executando primeiro ping...\n');
  ping(true);

  // 🔥 Previne múltiplas inicializações
  if (pingInterval) {
    console.log('⚠️  Keep-alive já está rodando. Ignorando nova inicialização.\n');
    return;
  }

  // 🔥 Pings periódicos
  pingInterval = setInterval(() => {
    ping(true);
  }, PING_INTERVAL);

  isEnabled = true;

  // 🔥 Estatísticas periódicas (a cada hora)
  setInterval(() => {
    if (pingCount > 0) {
      console.log('\n📊 ═══════════════════════════════════════════════════════');
      console.log('📊 ESTATÍSTICAS DO KEEP-ALIVE');
      console.log('📊 ═══════════════════════════════════════════════════════');
      console.log(`📍 Total de pings: ${pingCount}`);
      console.log(`✅ Último sucesso: ${lastSuccessfulPing ? lastSuccessfulPing.toLocaleString('pt-BR') : 'N/A'}`);
      if (lastFailedPing) {
        console.log(`❌ Última falha: ${lastFailedPing.toLocaleString('pt-BR')}`);
      }
      console.log(`⏱️  Próximo ping em: ${Math.round(PING_INTERVAL / 60000)} minutos`);
      console.log('📊 ═══════════════════════════════════════════════════════\n');
    }
  }, 60 * 60 * 1000); // A cada hora
}

// ============================================
// 🔥 FUNÇÃO: PARAR KEEP-ALIVE
// ============================================

export function stopKeepAlive() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
    isEnabled = false;
    console.log('🛑 Keep-alive desativado\n');
    return true;
  }
  return false;
}

// ============================================
// 🔥 FUNÇÃO: REINICIAR KEEP-ALIVE
// ============================================

export function restartKeepAlive() {
  stopKeepAlive();
  console.log('🔄 Reiniciando keep-alive...\n');
  keepAlive();
}