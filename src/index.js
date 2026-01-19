import express from 'express'
import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import {
  default as makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { useSupabaseAuthState } from './supabaseAuthState.js'

const app = express()
const PORT = process.env.PORT || 3000

/* =========================
   CONFIG
========================= */

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SESSION_ID = process.env.SESSION_ID || 'stream-studio-bot'
const MAX_RECONNECTS = 20
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const logger = pino({ level: 'silent' })

/* =========================
   ESTADO
========================= */

let qrCode = null
let qrExpiry = null
let status = 'init'
let reconnects = 0
let sock = null
let isStarting = false
let connectionAttempts = 0
let lastDisconnectTime = null
let lastError = null

/* =========================
   UTILITÁRIOS
========================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getStatusEmoji(currentStatus) {
  const emojis = {
    'init': '🔄',
    'connecting': '⚡',
    'qr': '📱',
    'connected': '✅',
    'disconnected': '❌',
    'reconnecting': '🔄',
    'error': '⚠️',
    'logged_out': '🚪',
    'stopped': '🛑',
    'conflict': '⚠️'
  }
  return emojis[currentStatus] || '❓'
}

/* =========================
   ROTAS
========================= */

app.get('/', (_, res) => {
  const uptime = Math.floor(process.uptime())
  const hours = Math.floor(uptime / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)
  const seconds = uptime % 60
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="5">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp Bot - Stream Studio</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          max-width: 600px;
          width: 100%;
          animation: fadeIn 0.5s;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        h1 { 
          color: #333; 
          margin-bottom: 10px;
          font-size: 28px;
        }
        .subtitle {
          color: #666;
          font-size: 14px;
          margin-bottom: 30px;
        }
        .status { 
          font-size: 28px; 
          margin: 30px 0;
          font-weight: bold;
          padding: 20px;
          border-radius: 10px;
          background: #f8f9fa;
        }
        .connected { color: #25D366; background: #d4edda; }
        .qr { color: #FFA500; background: #fff3cd; }
        .disconnected, .error, .conflict { color: #dc3545; background: #f8d7da; }
        .init, .connecting, .reconnecting { color: #17a2b8; background: #d1ecf1; }
        .btn {
          display: inline-block;
          padding: 15px 30px;
          margin: 10px 5px;
          background: #25D366;
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-weight: bold;
          transition: all 0.3s;
          border: none;
          cursor: pointer;
          font-size: 16px;
        }
        .btn:hover {
          background: #128C7E;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(37,211,102,0.3);
        }
        .btn.secondary {
          background: #6c757d;
        }
        .btn.secondary:hover {
          background: #5a6268;
        }
        .btn.danger {
          background: #dc3545;
        }
        .btn.danger:hover {
          background: #c82333;
        }
        .info {
          margin-top: 30px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 10px;
          font-size: 14px;
          text-align: left;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #dee2e6;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-label {
          font-weight: bold;
          color: #495057;
        }
        .info-value {
          color: #6c757d;
        }
        .pulse {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .alert {
          background: #fff3cd;
          border-left: 5px solid #ffc107;
          padding: 15px;
          border-radius: 5px;
          margin-top: 20px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 WhatsApp Bot</h1>
        <div class="subtitle">Stream Studio v2.0 + Supabase</div>
        
        <div class="status ${status} ${['connecting', 'reconnecting', 'init'].includes(status) ? 'pulse' : ''}">
          ${getStatusEmoji(status)} ${
            status === 'connected' ? 'Conectado' : 
            status === 'qr' ? 'Aguardando QR Code' : 
            status === 'connecting' ? 'Conectando...' :
            status === 'reconnecting' ? 'Reconectando...' :
            status === 'init' ? 'Inicializando...' :
            status === 'logged_out' ? 'Desconectado (Logout)' :
            status === 'conflict' ? 'Conflito - Reconectando...' :
            status.toUpperCase()
          }
        </div>
        
        <div style="text-align: center;">
          ${status === 'qr' ? '<a href="/qr" class="btn">📱 Ver QR Code</a>' : ''}
          <a href="/health" class="btn secondary">📊 Health Check</a>
          ${status !== 'connected' && status !== 'connecting' ? '<a href="/restart" class="btn secondary">🔄 Restart</a>' : ''}
          ${status === 'connected' ? '<a href="/logout" class="btn danger">🚪 Logout</a>' : ''}
        </div>
        
        ${lastError ? `<div class="alert"><strong>⚠️ Último erro:</strong> ${lastError}</div>` : ''}
        
        <div class="info">
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="info-value">${status}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Tentativas:</span>
            <span class="info-value">${connectionAttempts}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Reconexões:</span>
            <span class="info-value">${reconnects}/${MAX_RECONNECTS}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Uptime:</span>
            <span class="info-value">${hours}h ${minutes}m ${seconds}s</span>
          </div>
          <div class="info-row">
            <span class="info-label">Ambiente:</span>
            <span class="info-value">${IS_PRODUCTION ? 'Produção' : 'Desenvolvimento'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Storage:</span>
            <span class="info-value">Supabase (${SESSION_ID})</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `)
})

app.get('/health', (_, res) => {
  res.status(200).json({ 
    status: status,
    uptime: process.uptime(),
    reconnects: reconnects,
    connectionAttempts: connectionAttempts,
    timestamp: new Date().toISOString(),
    connected: status === 'connected',
    node: process.version,
    memory: process.memoryUsage(),
    lastDisconnect: lastDisconnectTime,
    lastError: lastError,
    environment: IS_PRODUCTION ? 'production' : 'development',
    storage: 'supabase',
    sessionId: SESSION_ID
  })
})

app.get('/qr', async (_, res) => {
  if (!qrCode) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="3">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Code</title>
        <style>
          body { 
            font-family: Arial; 
            padding: 20px; 
            text-align: center;
            background: #f5f5f5;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 500px;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #25D366;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h2>⏳ Gerando QR Code...</h2>
          <p>Status: ${status}</p>
          <p>Tentativa: ${connectionAttempts}</p>
          <p><small>Atualização automática em 3s</small></p>
        </div>
      </body>
      </html>
    `)
  }

  const img = await QRCode.toDataURL(qrCode)
  const expirySeconds = Math.max(0, Math.floor((qrExpiry - Date.now()) / 1000))

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Escanear QR Code - WhatsApp Bot</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          max-width: 600px;
          width: 100%;
        }
        h1 { color: #333; margin-bottom: 20px; }
        img { 
          max-width: 100%;
          height: auto;
          padding: 20px;
          background: white;
          border: 5px solid #25D366;
          border-radius: 15px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .timer {
          font-size: 24px;
          color: #666;
          margin: 25px 0;
          font-weight: bold;
        }
        .timer span {
          color: #25D366;
          font-size: 32px;
        }
        .instructions {
          text-align: left;
          margin-top: 30px;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 10px;
          border-left: 5px solid #25D366;
        }
        .instructions h3 {
          margin-top: 0;
          color: #25D366;
        }
        .instructions ol {
          line-height: 1.8;
          padding-left: 20px;
        }
        .warning {
          background: #fff3cd;
          padding: 15px;
          border-radius: 10px;
          margin-top: 20px;
          border-left: 5px solid #ffc107;
          font-size: 14px;
        }
      </style>
      <script>
        let seconds = ${expirySeconds};
        const timerElement = document.getElementById('timer');
        
        const countdown = setInterval(() => {
          seconds--;
          if (timerElement) {
            timerElement.innerText = seconds;
          }
          if (seconds <= 0) {
            clearInterval(countdown);
            location.reload();
          }
        }, 1000);
        
        setTimeout(() => location.reload(), ${expirySeconds * 1000 + 1000});
      </script>
    </head>
    <body>
      <div class="container">
        <h1>📱 Conectar WhatsApp Bot</h1>
        <div style="text-align: center;">
          <img src="${img}" alt="QR Code WhatsApp" />
        </div>
        <div class="timer">
          ⏱️ Expira em <span id="timer">${expirySeconds}</span>s
        </div>
        <div class="instructions">
          <h3>📋 Como conectar:</h3>
          <ol>
            <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
            <li>Toque em <strong>Mais opções</strong> (⋮) ou <strong>Configurações</strong></li>
            <li>Selecione <strong>Aparelhos conectados</strong></li>
            <li>Toque em <strong>Conectar um aparelho</strong></li>
            <li><strong>Aponte sua câmera</strong> para este QR Code</li>
            <li>Aguarde a confirmação da conexão</li>
          </ol>
        </div>
        <div class="warning">
          <strong>⚠️ IMPORTANTE:</strong> Escaneie apenas uma vez. As credenciais serão salvas no Supabase automaticamente.
        </div>
      </div>
    </body>
    </html>
  `)
})

app.get('/restart', async (_, res) => {
  console.log('🔄 Restart solicitado via /restart')
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="3;url=/">
      <title>Reiniciando...</title>
      <style>
        body { 
          font-family: Arial; 
          text-align: center; 
          padding: 50px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          background: white;
          color: #333;
          padding: 40px;
          border-radius: 20px;
          max-width: 500px;
          margin: 0 auto;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔄 Reiniciando Bot...</h1>
        <p>Você será redirecionado em 3 segundos...</p>
      </div>
    </body>
    </html>
  `)
  
  if (sock) {
    sock.end()
    sock = null
  }
  reconnects = 0
  isStarting = false
  connectionAttempts = 0
  lastError = null
  setTimeout(startBot, 2000)
})

app.get('/logout', async (_, res) => {
  console.log('🚪 Logout solicitado via /logout')
  
  if (!sock) {
    return res.send('❌ Não conectado')
  }
  
  try {
    await sock.logout()
    status = 'logged_out'
    sock = null
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="3;url=/">
        <title>Logout</title>
        <style>
          body { 
            font-family: Arial; 
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            background: white;
            color: #333;
            padding: 40px;
            border-radius: 20px;
            max-width: 500px;
            margin: 0 auto;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Logout realizado com sucesso</h1>
          <p>Você será redirecionado em 3 segundos...</p>
        </div>
      </body>
      </html>
    `)
  } catch (err) {
    console.error('❌ Erro no logout:', err.message)
    res.send('❌ Erro ao fazer logout: ' + err.message)
  }
})

/* =========================
   WHATSAPP
========================= */

async function startBot() {
  if (isStarting) {
    console.log('⚠️ Bot já está iniciando, aguarde...')
    return
  }
  
  if (sock) {
    console.log('⚠️ Encerrando conexão anterior...')
    try {
      sock.end()
    } catch (err) {
      console.log('Erro ao encerrar conexão:', err.message)
    }
    sock = null
    await sleep(2000)
  }
  
  isStarting = true
  connectionAttempts++
  console.log(`\n${'='.repeat(50)}`)
  console.log(`🚀 Tentativa de conexão #${connectionAttempts}`)
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`)
  console.log(`🌐 Ambiente: ${IS_PRODUCTION ? 'Produção' : 'Desenvolvimento'}`)
  console.log(`💾 Storage: Supabase (${SESSION_ID})`)
  console.log('='.repeat(50))

  try {
    const { state, saveCreds } = await useSupabaseAuthState(supabase, SESSION_ID)
    const { version } = await fetchLatestBaileysVersion()

    console.log(`📦 Baileys version: ${version.join('.')}`)
    console.log(`🔐 Credenciais carregadas do Supabase`)

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 10_000,
      
      emitOwnEvents: false,
      fireInitQueries: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      
      getMessage: async () => undefined
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.key.fromMe && msg.message) {
            const from = msg.key.remoteJid
            console.log(`📩 Nova mensagem de: ${from}`)
          }
        }
      }
    })

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update

      if (qr) {
        qrCode = qr
        qrExpiry = Date.now() + 60000
        status = 'qr'
        console.log('📱 ✅ QR Code gerado!')
        console.log(`🔗 Acesse: ${IS_PRODUCTION ? 'https://seu-app.onrender.com' : 'http://localhost:' + PORT}/qr`)
        return
      }

      if (connection === 'connecting') {
        console.log('🔄 Conectando ao WhatsApp...')
        status = 'connecting'
        return
      }

      if (connection === 'open') {
        status = 'connected'
        qrCode = null
        qrExpiry = null
        reconnects = 0
        lastError = null
        isStarting = false
        
        console.log('\n' + '='.repeat(50))
        console.log('✅✅✅ CONECTADO AO WHATSAPP! ✅✅✅')
        console.log('='.repeat(50))
        console.log(`📱 ID: ${sock.user?.id}`)
        console.log(`👤 Nome: ${sock.user?.name || 'N/A'}`)
        console.log(`🆕 Nova sessão: ${isNewLogin ? 'Sim' : 'Não'}`)
        console.log(`💾 Sessão persistida no Supabase`)
        console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`)
        console.log('='.repeat(50) + '\n')
        return
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const reason = lastDisconnect?.error?.output?.payload?.error
        const errorMsg = lastDisconnect?.error?.message
        lastDisconnectTime = new Date().toISOString()
        
        console.log('\n' + '='.repeat(50))
        console.log('❌ CONEXÃO FECHADA')
        console.log('='.repeat(50))
        console.log(`📊 Status Code: ${statusCode}`)
        console.log(`📊 Motivo: ${reason || errorMsg || 'Desconhecido'}`)
        console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`)
        console.log('='.repeat(50))
        
        sock = null
        isStarting = false
        
        const isLoggedOut = statusCode === DisconnectReason.loggedOut
        const shouldReconnect = !isLoggedOut && reconnects < MAX_RECONNECTS
        
        if (isLoggedOut) {
          status = 'logged_out'
          lastError = 'Logout realizado'
          console.log('🚪 Logout detectado - não reconectando\n')
          return
        }

        if (shouldReconnect) {
          reconnects++
          const delay = Math.min(reconnects * 3000, 30000)
          status = 'reconnecting'
          lastError = errorMsg || `Erro ${statusCode}`
          console.log(`🔄 Reconectando em ${delay/1000}s (tentativa ${reconnects}/${MAX_RECONNECTS})...\n`)
          setTimeout(startBot, delay)
        } else {
          status = 'stopped'
          lastError = 'Máximo de tentativas atingido'
          console.log(`🛑 Máximo de tentativas atingido (${MAX_RECONNECTS})\n`)
        }
      }
    })

  } catch (error) {
    console.error('\n' + '='.repeat(50))
    console.error('❌ ERRO AO INICIAR BOT')
    console.error('='.repeat(50))
    console.error('Mensagem:', error.message)
    console.error('Stack:', error.stack)
    console.error('='.repeat(50) + '\n')
    
    lastError = error.message
    isStarting = false
    sock = null
    status = 'error'
    
    if (reconnects < MAX_RECONNECTS) {
      reconnects++
      const delay = 5000
      console.log(`🔄 Tentando novamente em ${delay/1000}s...\n`)
      setTimeout(startBot, delay)
    }
  }
}

/* =========================
   SERVIDOR
========================= */

app.listen(PORT, () => {
  console.log('\n' + '╔' + '═'.repeat(48) + '╗')
  console.log('║' + ' '.repeat(10) + '🤖 WhatsApp Bot - Stream Studio' + ' '.repeat(7) + '║')
  console.log('║' + ' '.repeat(18) + 'v2.0.0' + ' '.repeat(24) + '║')
  console.log('╚' + '═'.repeat(48) + '╝')
  console.log('')
  console.log(`  🌐 Servidor:  http://localhost:${PORT}`)
  console.log(`  📱 QR Code:   http://localhost:${PORT}/qr`)
  console.log(`  ❤️  Health:    http://localhost:${PORT}/health`)
  console.log(`  🔄 Restart:   http://localhost:${PORT}/restart`)
  console.log(`  🚪 Logout:    http://localhost:${PORT}/logout`)
  console.log('')
  console.log('  📦 Node:      ' + process.version)
  console.log('  🔧 Ambiente:  ' + (IS_PRODUCTION ? 'Produção' : 'Desenvolvimento'))
  console.log('  💾 Storage:   Supabase (' + SESSION_ID + ')')
  console.log('')
  console.log('═'.repeat(50))
  console.log('')
  
  setTimeout(startBot, 2000)
})

const shutdown = async (signal) => {
  console.log(`\n🛑 ${signal} recebido, desligando gracefully...`)
  if (sock) {
    try {
      await sock.logout()
      console.log('✅ Logout realizado')
    } catch (err) {
      console.log('⚠️ Erro no logout:', err.message)
    }
  }
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))