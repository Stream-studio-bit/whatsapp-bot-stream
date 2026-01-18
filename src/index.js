import express from 'express'
import QRCode from 'qrcode'
import fs from 'fs'
import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'
import pino from 'pino'

const app = express()
const PORT = process.env.PORT || 3000

/* =========================
   CONFIG
========================= */

const SESSION_PATH = './auth'
const FORCE_NEW_SESSION = process.env.FORCE_NEW_SESSION === 'true'
const MAX_RECONNECTS = 10

// Logger silencioso
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

/* =========================
   ROTAS
========================= */

app.get('/', (_, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>WhatsApp Bot Status</title>
      <style>
        body { font-family: Arial; padding: 20px; text-align: center; }
        .status { font-size: 24px; margin: 20px 0; }
        .connected { color: green; }
        .qr { color: orange; }
        .disconnected { color: red; }
      </style>
    </head>
    <body>
      <h1>WhatsApp Bot</h1>
      <div class="status ${status}">${status === 'connected' ? '✅ Conectado' : status === 'qr' ? '⏳ Aguardando QR Code' : '❌ ' + status}</div>
      ${status === 'qr' ? '<a href="/qr">Ver QR Code</a>' : ''}
    </body>
    </html>
  `)
})

app.get('/health', (_, res) => {
  res.status(200).json({ 
    status: status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
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
        <title>QR Code</title>
        <style>
          body { font-family: Arial; padding: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <h2>⏳ QR Code não disponível</h2>
        <p>Status: ${status}</p>
        <p>Aguardando... (atualização automática em 3s)</p>
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
      <title>Escanear QR Code</title>
      <style>
        body { 
          font-family: Arial; 
          padding: 20px; 
          text-align: center;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          max-width: 500px;
          margin: 0 auto;
        }
        img { 
          max-width: 300px; 
          border: 10px solid #25D366;
          border-radius: 10px;
        }
        .timer {
          font-size: 18px;
          color: #666;
          margin: 20px 0;
        }
        .instructions {
          text-align: left;
          margin-top: 20px;
          padding: 15px;
          background: #f9f9f9;
          border-radius: 5px;
        }
      </style>
      <script>
        let seconds = ${expirySeconds};
        setInterval(() => {
          seconds--;
          if (seconds <= 0) {
            location.reload();
          }
          document.getElementById('timer').innerText = seconds;
        }, 1000);
        
        // Recarrega quando o QR expira
        setTimeout(() => location.reload(), ${expirySeconds * 1000});
      </script>
    </head>
    <body>
      <div class="container">
        <h1>📱 Escanear QR Code</h1>
        <img src="${img}" alt="QR Code" />
        <div class="timer">
          ⏱️ Expira em <span id="timer">${expirySeconds}</span>s
        </div>
        <div class="instructions">
          <h3>Como conectar:</h3>
          <ol>
            <li>Abra o WhatsApp no seu celular</li>
            <li>Toque em <strong>Mais opções</strong> (⋮) > <strong>Aparelhos conectados</strong></li>
            <li>Toque em <strong>Conectar um aparelho</strong></li>
            <li>Aponte seu celular para esta tela para escanear o código</li>
          </ol>
        </div>
      </div>
    </body>
    </html>
  `)
})

/* =========================
   WHATSAPP
========================= */

async function startBot() {
  if (isStarting || sock) {
    console.log('⚠️ Bot já está iniciando ou conectado')
    return
  }
  
  isStarting = true
  console.log('🚀 Iniciando bot...')

  try {
    // Garante que o diretório existe
    if (!fs.existsSync(SESSION_PATH)) {
      console.log('📁 Criando diretório de sessão...')
      fs.mkdirSync(SESSION_PATH, { recursive: true })
    }

    // Limpa sessão somente se forçado
    if (FORCE_NEW_SESSION) {
      console.log('🗑️ Limpando sessão anterior...')
      fs.rmSync(SESSION_PATH, { recursive: true, force: true })
      fs.mkdirSync(SESSION_PATH, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)
    const { version } = await fetchLatestBaileysVersion()

    console.log(`📦 Baileys version: ${version.join('.')}`)

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      logger,
      browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
      printQRInTerminal: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000,
      emitOwnEvents: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      markOnlineOnConnect: true
    })

    // Salvar credenciais
    sock.ev.on('creds.update', saveCreds)

    // Eventos de mensagem (para debug)
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0]
      if (!msg.key.fromMe && msg.message) {
        console.log('📩 Nova mensagem recebida:', msg.key.remoteJid)
      }
    })

    // Conexão
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        qrCode = qr
        qrExpiry = Date.now() + 60000
        status = 'qr'
        console.log('📱 QR Code gerado! Acesse /qr para escanear')
        return
      }

      if (connection === 'open') {
        status = 'connected'
        qrCode = null
        qrExpiry = null
        reconnects = 0
        isStarting = false
        console.log('✅ CONECTADO AO WHATSAPP!')
        console.log('📱 Número:', sock.user?.id)
        return
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        const statusCode = lastDisconnect?.error?.output?.statusCode
        
        console.log('❌ Conexão fechada. Código:', statusCode)
        console.log('📊 Motivo:', lastDisconnect?.error?.message || 'Desconhecido')
        
        sock = null
        isStarting = false
        status = 'disconnected'

        if (shouldReconnect && reconnects < MAX_RECONNECTS) {
          reconnects++
          const delay = Math.min(reconnects * 2000, 10000)
          console.log(`🔄 Reconectando em ${delay/1000}s (tentativa ${reconnects}/${MAX_RECONNECTS})...`)
          setTimeout(startBot, delay)
        } else {
          console.log('🛑 Não reconectando:', shouldReconnect ? 'Máximo de tentativas atingido' : 'Logout detectado')
          status = 'stopped'
        }
      }
    })

  } catch (error) {
    console.error('❌ Erro ao iniciar bot:', error)
    isStarting = false
    sock = null
    status = 'error'
    
    if (reconnects < MAX_RECONNECTS) {
      reconnects++
      console.log(`🔄 Tentando novamente em 5s...`)
      setTimeout(startBot, 5000)
    }
  }
}

/* =========================
   SERVIDOR
========================= */

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   🤖 WhatsApp Bot Iniciado        ║
╚════════════════════════════════════╝
  
  🌐 Servidor: http://localhost:${PORT}
  📱 QR Code: http://localhost:${PORT}/qr
  ❤️  Health: http://localhost:${PORT}/health
  
`)
  startBot()
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando bot...')
  if (sock) {
    await sock.logout()
  }
  process.exit(0)
})