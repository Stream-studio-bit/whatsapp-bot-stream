import express from 'express';
import { getStats } from './services/database.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Garante que não há conflito de porta
let server = null;

// Middleware para JSON
app.use(express.json());

/**
 * Rota de Health Check - ESSENCIAL para Render e Keep-Alive
 */
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'online',
    service: 'WhatsApp Bot Stream Studio',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    }
  });
});

/**
 * Rota raiz
 */
app.get('/', (req, res) => {
  const stats = getStats();
  
  res.json({
    service: '🤖 WhatsApp Bot Stream Studio',
    status: '✅ Online',
    version: '1.0.0',
    stats: {
      totalUsers: stats.totalUsers,
      newLeads: stats.newLeads,
      returningClients: stats.returningClients,
      manualAttendance: stats.usersInManualAttendance
    },
    uptime: `${Math.floor(process.uptime() / 60)} minutos`,
    message: 'Bot WhatsApp funcionando normalmente'
  });
});

/**
 * Rota de estatísticas (API)
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Tratamento de rotas não encontradas
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    availableRoutes: [
      'GET /',
      'GET /health',
      'GET /api/stats'
    ]
  });
});

/**
 * Inicia o servidor HTTP
 */
export function startServer() {
  // Previne múltiplas inicializações
  if (server) {
    console.log('⚠️  Servidor HTTP já está rodando');
    return app;
  }

  server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🌐 ════════════════════════════════════════════════');
    console.log(`🌐 Servidor HTTP iniciado na porta ${PORT}`);
    console.log(`🌐 Health Check: http://localhost:${PORT}/health`);
    console.log(`🌐 API Stats: http://localhost:${PORT}/api/stats`);
    console.log('🌐 ════════════════════════════════════════════════\n');
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Porta ${PORT} já está em uso!`);
      console.error('💡 Aguarde alguns segundos e tente novamente...');
      process.exit(1);
    } else {
      console.error('❌ Erro ao iniciar servidor:', err.message);
      throw err;
    }
  });
  
  return app;
}

export default startServer;