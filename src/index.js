import express from 'express'
import QRCode from 'qrcode'
import fs from 'fs'
import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'

const app = express()
const PORT = process.env.PORT || 3000

/* =========================
   CONFIG
========================= */

const SESSION_PATH = './auth'
const FORCE_NEW_SESSION = process.env.FORCE_NEW_SESSION === 'true'
const MAX_RECONNECTS = 5

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
  res.send(`Status: ${status}`)
})

app.get('/health', (_, res) => {
  res.status(200).send('OK')
})

app.get('/qr', async (_, res) => {
  if (!qrCode) {
    return res.send(`
      QR não disponível<br>
      Status: ${status}
      <script>setTimeout(()=>location.reload(),5000)</script>
    `)
  }

  const img = await QRCode.toDataURL(qrCode)

  res.send(`
    <img src="${img}" />
    <p>Expira em ${Math.max(0, Math.floor((qrExpiry - Date.now()) / 1000))}s</p>
  `)
})

/* =========================
   WHATSAPP
========================= */

async function startBot() {
  if (isStarting || sock) return
  isStarting = true

  try {
    // Garante que o diretório existe
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true })
    }

    // Limpa sessão somente se forçado
    if (FORCE_NEW_SESSION) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true })
      fs.mkdirSync(SESSION_PATH, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: state,
      browser: ['Bot', 'Chrome', '1.0'],
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrCode = qr
        qrExpiry = Date.now() + 60000
        status = 'qr'
        console.log('QR Code gerado')
        return
      }

      if (connection === 'open') {
        status = 'connected'
        qrCode = null
        qrExpiry = null
        reconnects = 0
        isStarting = false
        console.log('✅ Conectado ao WhatsApp')
        return
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode
        sock = null
        isStarting = false

        console.log('Desconectado. Razão:', reason)

        if (reason !== DisconnectReason.loggedOut && reconnects < MAX_RECONNECTS) {
          reconnects++
          console.log(`Tentando reconectar (${reconnects}/${MAX_RECONNECTS})...`)
          setTimeout(startBot, 5000)
        } else {
          status = 'disconnected'
        }
      }
    })
  } catch (error) {
    console.error('Erro ao iniciar bot:', error)
    isStarting = false
    sock = null
    
    if (reconnects < MAX_RECONNECTS) {
      reconnects++
      setTimeout(startBot, 5000)
    }
  }
}

/* =========================
   SERVIDOR
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  startBot()
})