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

const CONFIG = {
  forceNewSession: process.env.FORCE_NEW_SESSION === 'true',
  sessionPath: './auth',
  maxReconnects: 5
}

/* =========================
   ESTADO
========================= */

let sock
let qrCode = null
let qrExpiry = null
let reconnects = 0
let status = 'init'

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
  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionPath)
  const { version } = await fetchLatestBaileysVersion()

  if (CONFIG.forceNewSession && fs.existsSync(CONFIG.sessionPath)) {
    fs.rmSync(CONFIG.sessionPath, { recursive: true, force: true })
  }

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    browser: ['Bot', 'Chrome', '1.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCode = qr
      qrExpiry = Date.now() + 60000
      status = 'qr'
    }

    if (connection === 'open') {
      status = 'connected'
      reconnects = 0
      qrCode = null
      qrExpiry = null
    }

    if (connection === 'close') {
      status = 'disconnected'

      const reason =
        lastDisconnect?.error?.output?.statusCode

      if (
        reason !== DisconnectReason.loggedOut &&
        reconnects < CONFIG.maxReconnects
      ) {
        reconnects++
        setTimeout(startBot, 3000)
      }
    }
  })
}

/* =========================
   START
========================= */

app.listen(PORT, () => {
  startBot()
})
