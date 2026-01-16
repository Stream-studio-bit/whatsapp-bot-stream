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
  // ✅ GARANTE QUE O DIRETÓRIO EXISTE
  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }

  // ✅ LIMPA SESSÃO SOMENTE SE FORÇADO
  if (FORCE_NEW_SESSION && fs.existsSync(SESSION_PATH)) {
    fs.rmSync(SESSION_PATH, { recursive: true, force: true })
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
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
        reconnects < MAX_RECONNECTS
      ) {
        reconnects++
        setTimeout(startBot, 3000)
      }
    }
  })
}

let sock = null
let isStarting = false

async function startBot() {
  if (isStarting || sock) return
  isStarting = true

  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }

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
      return
    }

    if (connection === 'open') {
      status = 'connected'
      qrCode = null
      qrExpiry = null
      reconnects = 0
      isStarting = false
      return
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      sock = null
      isStarting = false

      if (reason !== DisconnectReason.loggedOut && reconnects < MAX_RECONNECTS) {
        reconnects++
        setTimeout(startBot, 5000)
      }
    }
  })
}
