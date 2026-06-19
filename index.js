// index.js
// Agente WhatsApp — Fracchia-Fiorioli Propiedades

import 'dotenv/config'
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'
import cron from 'node-cron'
import http from 'http'
const MAX_FOLLOWUP_ATTEMPTS = 3        // después de 3 fallos, se descarta el lead
const DELAY_BETWEEN_SENDS_MS = 2000    // 2s entre cada mensaje

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

import { askClaude, reloadProperties, FOLLOWUP_MSGS } from './src/claude.js'
import { isExternalPortalLink, extractUrlFromText, scrapePropertyLink } from './src/scrapeLink.js'
import { getHistory, addToHistory, getLeadState, updateLeadState, getLeadsPendingFollowup } from './src/memory.js'
import { incrementStat, getStats, formatStatsHtml } from './src/stats.js'

// ─── CONFIG ────────────────────────────────────────────────────────────────
const GRUPO_JID      = process.env.GRUPO_WHATSAPP_JID   // JID del grupo de asesores
const SESSION_PATH   = process.env.SESSION_PATH || './sessions'
const PORT           = process.env.PORT || 3000
const CLIENTE_NOMBRE = 'Fracchia-Fiorioli Propiedades'

const baileysLogger = pino({ level: 'silent' })
const logger = pino(pino.transport({
  target: 'pino-pretty',
  options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
}))

// ─── ESTADO QR ─────────────────────────────────────────────────────────────
let currentQR   = null
let isConnected = false

// ─── SERVIDOR WEB QR ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
if (req.url === '/stats') {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(formatStatsHtml(getStats()))
  return
}

if (req.url === '/qr') {
    if (isConnected) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Agente Activo</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#128C7E;}
        .box{background:white;padding:40px;border-radius:16px;text-align:center;}h2{color:#075E54;}</style></head>
        <body><div class="box"><h2>✅ WhatsApp Conectado</h2>
        <p>El agente de <strong>${CLIENTE_NOMBRE}</strong> está activo.</p>
        <p style="color:#25D366;font-size:22px;">🤖 En línea 24/7</p></div></body></html>`)
      return
    }

    if (!currentQR) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3">
        <title>Generando QR...</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#128C7E;}
        .box{background:white;padding:40px;border-radius:16px;text-align:center;}h2{color:#075E54;}</style></head>
        <body><div class="box"><h2>⏳ Generando QR...</h2><p>Se actualizará en 3 segundos.</p></div></body></html>`)
      return
    }

    try {
      const qrImage = await QRCode.toDataURL(currentQR, { width: 300, margin: 2 })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="30">
        <title>Escanear QR — ${CLIENTE_NOMBRE}</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#128C7E;}
        .box{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.2);}
        h2{color:#075E54;}img{border:4px solid #075E54;border-radius:8px;margin:16px 0;}
        .steps{text-align:left;background:#f5f5f5;padding:16px;border-radius:8px;margin-top:12px;font-size:13px;line-height:1.8;}
        </style></head>
        <body><div class="box">
        <h2>📱 Vincular WhatsApp</h2>
        <p><strong>${CLIENTE_NOMBRE}</strong> — QR expira en 60s</p>
        <img src="${qrImage}" width="280"/>
        <div class="steps"><strong>Pasos:</strong><br>
        1. Abrí WhatsApp → ⋮ → Dispositivos vinculados<br>
        2. Tocá "Vincular dispositivo"<br>
        3. Escaneá este QR</div>
        </div></body></html>`)
    } catch (e) {
      res.writeHead(500); res.end('Error generando QR')
    }
    return
  }
  res.writeHead(302, { Location: '/qr' }); res.end()
})

server.listen(PORT, () => logger.info(`🌐 Servidor QR en puerto ${PORT} → /qr`))


// ─── NOTIFICACIÓN AL GRUPO Y ASESOR ───────────────────────────────────────
async function notifyGrupo(sock, userId, propiedadInteres, replyText, pushName) {
  const rawNumero = userId.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '')
  // Formatear número argentino con +54 9
  let numero = rawNumero
  if (rawNumero && rawNumero.length <= 10 && !rawNumero.startsWith('54')) {
    numero = '+54 9 ' + rawNumero
  } else if (rawNumero && rawNumero.startsWith('54') && rawNumero.length > 10) {
    numero = '+' + rawNumero.slice(0,2) + ' 9 ' + rawNumero.slice(2)
  } else if (rawNumero && !rawNumero.startsWith('+')) {
    numero = '+54 9 ' + rawNumero
  }
  // Detectar tipo de notificación según propiedadInteres
  const esInquilino = propiedadInteres?.toLowerCase().includes('consulta de inquilino')
  const esTasacion = propiedadInteres?.toLowerCase().includes('tasación')

  let titulo, detalle
  if (esInquilino) {
    titulo = '🔔 *Nueva Consulta de Inquilino Activo*'
    detalle = `✅ Revisar y contactar al inquilino a la brevedad.`
  } else if (esTasacion) {
    titulo = '🔔 *Nueva Solicitud de Tasación*'
    detalle = `✅ Coordinar visita de tasación con el propietario.`
  } else {
    titulo = '🔔 *Nuevo lead interesado en agendar visita*'
    detalle = `✅ Se le pasó el link de Calendly. Estén atentos por si confirma visita.`
  }

  const msg =
    `${titulo}\n\n` +
    `👤 *Contacto:* ${pushName || 'Desconocido'}\n` +
    `📱 *Número:* ${numero}\n` +
    `🏠 *Propiedad/Consulta:* ${propiedadInteres || 'No especificada'}\n\n` +
    `💬 *Último mensaje del cliente:*\n${replyText}\n\n` +
    detalle

  // Notificar al asesor individual
  const ASESOR_NOTIF = process.env.WHATSAPP_ASESOR
  if (ASESOR_NOTIF) {
    try {
      const asesorJid = `${ASESOR_NOTIF}@s.whatsapp.net`
      await sock.sendMessage(asesorJid, { text: msg })
      logger.info(`✅ Asesor notificado — lead: ${numero}`)
    } catch (err) {
      logger.error({ err }, '❌ Error notificando al asesor')
    }
  }

  // Notificar al grupo si está configurado
  if (GRUPO_JID) {
    try {
      await sock.sendMessage(GRUPO_JID, { text: msg })
      logger.info(`✅ Grupo notificado — lead: ${numero}`)
    } catch (err) {
      logger.error({ err }, '❌ Error notificando al grupo')
    }
  }

  if (!ASESOR_NOTIF && !GRUPO_JID) {
    logger.warn('⚠️  WHATSAPP_ASESOR y GRUPO_WHATSAPP_JID no configurados — saltando notificación')
  }
}

// ─── HANDLER PRINCIPAL ─────────────────────────────────────────────────────
async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid
  // Obtener número real — intentar resolver LID a número real
  let phoneNumber = jid.replace('@s.whatsapp.net', '').replace('@lid', '')
  try {
    if (jid.endsWith('@lid')) {
      const contact = await sock.onWhatsApp(jid.replace('@lid', '') + '@s.whatsapp.net')
      if (contact?.[0]?.jid) phoneNumber = contact[0].jid.replace('@s.whatsapp.net', '')
    }
  } catch { /* usar el número tal cual */ }
  if (msg.key.fromMe) return
  if (jid.endsWith('@g.us')) return
  if (jid === 'status@broadcast') return

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    null

  if (!text) return

  logger.info(`📩 [${jid}] "${text}"`)
  if (!getLeadState(jid).firstContactAt) incrementStat('leadsAtendidos')
  await sock.readMessages([msg.key])
  await sock.sendPresenceUpdate('composing', jid)

  try {
    // Detectar y scrapear links de portales externos
    let enrichedText = text
    if (isExternalPortalLink(text)) {
      const url = extractUrlFromText(text)
      if (url) {
        logger.info(`🔍 Link externo detectado, scrapeando: ${url}`)
        const propData = await scrapePropertyLink(url)
        if (propData) {
          enrichedText = `${text}\n\n[DATOS EXTRAÍDOS DEL PORTAL]:\n${propData}`
          logger.info('✅ Datos del portal extraídos correctamente')
        } else {
          logger.warn('⚠️  No se pudieron extraer datos del portal')
        }
      }
    }

    addToHistory(jid, 'user', enrichedText)
    const { text: reply, triggers } = await askClaude(getHistory(jid))
    addToHistory(jid, 'assistant', reply)

    const state = getLeadState(jid)
    updateLeadState(jid, { lastMessageAt: Date.now() })

    // Capturar número de teléfono si el lead lo escribió
    const phoneMatch = text.match(/(?:54|0)?9?\s*(?:11|[2-9]\d{2,3})\s*[\d\s-]{6,10}/)
    if (phoneMatch && !state.phoneNumber) {
      const cleanPhone = phoneMatch[0].replace(/[\s-]/g, '')
      updateLeadState(jid, { phoneNumber: cleanPhone })
      logger.info(`📱 Número capturado del lead: ${cleanPhone}`)
    }

    // Actualizar estado según triggers
    if (triggers.fichaEnviada && !state.fichaEnviada) {
      updateLeadState(jid, { fichaEnviada: true, followupScheduled: true })
      incrementStat('fichasEnviadas')
      logger.info(`📋 Ficha enviada a: ${jid}`)
    }

    if (triggers.linkEnviado && !state.linkEnviado) {
      updateLeadState(jid, { linkEnviado: true })
      incrementStat('linksAgenda')
      if (triggers.propiedadInteres) {
        updateLeadState(jid, { propiedadInteres: triggers.propiedadInteres })
      }
      logger.info(`📅 Link Calendly enviado a: ${jid}`)
    }

    if (triggers.agendoConfirmado && !state.agendoConfirmado) {
      updateLeadState(jid, { agendoConfirmado: true })
      incrementStat('agendasConfirmadas')
      logger.info(`🎯 Lead confirmó agenda: ${jid}`)
    }

    // Enviar respuesta
    await sock.sendPresenceUpdate('paused', jid)
    await sock.sendMessage(jid, { text: reply })

    // Notificar grupo si corresponde
    if (triggers.grupoNotificar && !state.grupoNotificado) {
      updateLeadState(jid, { grupoNotificado: true })
      const updatedState = getLeadState(jid)
      const realPhone = updatedState.phoneNumber || phoneNumber
      if (updatedState.propiedadInteres?.toLowerCase().includes('tasación')) incrementStat('tasacionesSolicitadas')
      if (updatedState.propiedadInteres?.toLowerCase().includes('consulta de inquilino')) incrementStat('consultasAdmin')
      await notifyGrupo(sock, realPhone, updatedState.propiedadInteres, text, msg.pushName)
    }

  } catch (err) {
    logger.error({ err }, '❌ Error procesando mensaje')
    await sock.sendPresenceUpdate('paused', jid)
    await sock.sendMessage(jid, { text: '¡Disculpá! Tuve un problema técnico. Intentá de nuevo en un momento 🙏' })
  }
}

// ─── SCHEDULER DE SEGUIMIENTOS ─────────────────────────────────────────────
// Fix: throttling entre envíos + manejo de fallos para no reintentar infinito
//
// Cambios respecto al original:
// 1. sleep() entre cada sendMessage (evita bombardear el socket → "Connection Closed")
// 2. Contador de intentos fallidos por lead (después de N fallos, se marca como
//    "no enviable" y se deja de reintentar — para no generar el mismo error cada
//    corrida de cron por días)
// 3. Logging agregado: cuántos enviados / cuántos fallidos por corrida

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const MAX_FOLLOWUP_ATTEMPTS = 3        // después de 3 fallos, se descarta el lead
const DELAY_BETWEEN_SENDS_MS = 2000    // 2s entre cada mensaje — ajustable

function startFollowupScheduler(sock) {
  cron.schedule('0 10,18 * * *', async () => {  // Corre a las 10am y 6pm
    const pending = getLeadsPendingFollowup()
    if (!pending.length) return

    logger.info(`⏰ Procesando ${pending.length} seguimiento(s)`)

    let enviados = 0
    let fallidos = 0
    let descartados = 0

    for (const { userId, type } of pending) {
      try {
        const msg = FOLLOWUP_MSGS[type]
        await sock.sendMessage(userId, { text: msg })
        addToHistory(userId, 'assistant', msg)
        if (type === '24h') updateLeadState(userId, { followup24Sent: true, followupAttempts: 0 })
        if (type === '48h') updateLeadState(userId, { followup48Sent: true, followupAttempts: 0 })
        logger.info(`📤 Seguimiento ${type} enviado a ${userId}`)
        enviados++
      } catch (err) {
        fallidos++
        const attempts = (getLeadState(userId)?.followupAttempts || 0) + 1

        if (attempts >= MAX_FOLLOWUP_ATTEMPTS) {
          // Dejar de reintentar este lead — se marca como enviado igual para
          // que no vuelva a aparecer en getLeadsPendingFollowup()
          if (type === '24h') updateLeadState(userId, { followup24Sent: true, followupFailed: true, followupAttempts: attempts })
          if (type === '48h') updateLeadState(userId, { followup48Sent: true, followupFailed: true, followupAttempts: attempts })
          logger.error({ err }, `🛑 Seguimiento ${type} a ${userId} descartado tras ${attempts} intentos fallidos`)
          descartados++
        } else {
          updateLeadState(userId, { followupAttempts: attempts })
          logger.error({ err }, `❌ Error enviando seguimiento a ${userId} (intento ${attempts}/${MAX_FOLLOWUP_ATTEMPTS})`)
        }
      }

      // Throttle: esperar entre cada envío para no saturar el socket de Baileys
      await sleep(DELAY_BETWEEN_SENDS_MS)
    }

    logger.info(`⏰ Corrida finalizada — enviados: ${enviados}, fallidos: ${fallidos}, descartados: ${descartados}`)
  })
  logger.info('⏰ Scheduler de seguimientos activo (10am y 6pm)')
}
  })
  logger.info('⏰ Scheduler de seguimientos activo (10am y 6pm)')
}

// ─── RECARGA DIARIA DE PROPIEDADES ─────────────────────────────────────────
function startPropertyReloader() {
  cron.schedule('0 6 * * *', () => {  // Todos los días a las 6am
    reloadProperties()
  })
  logger.info('🔄 Recarga de propiedades programada (6am diaria)')
}

// ─── CONEXIÓN WHATSAPP ─────────────────────────────────────────────────────
async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)
  const { version } = await fetchLatestBaileysVersion()

  logger.info(`🚀 Iniciando agente: ${CLIENTE_NOMBRE}`)

  const sock = makeWASocket({
    version,
    logger: baileysLogger,
    auth: state,
    printQRInTerminal: true,
    browser: ['Agente IA', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      currentQR = qr
      isConnected = false
      qrcode.generate(qr, { small: true })
      logger.info('📱 QR listo — abrí /qr para escanear')
    }

    if (connection === 'open') {
      currentQR = null
      isConnected = true
      logger.info('✅ WhatsApp conectado')
      logger.info(`🤖 Agente activo — ${CLIENTE_NOMBRE}`)
      startFollowupScheduler(sock)
      startPropertyReloader()
    }

    if (connection === 'close') {
      isConnected = false
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode : 0
      if (statusCode !== DisconnectReason.loggedOut) {
        logger.warn(`⚠️  Reconectando en 5s... (código ${statusCode})`)
        setTimeout(connectWhatsApp, 5000)
      } else {
        logger.error('🚫 Sesión cerrada. Eliminá sessions/ y volvé a escanear el QR.')
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) await handleMessage(sock, msg)
  })

  return sock
}

// ─── ARRANQUE ──────────────────────────────────────────────────────────────
connectWhatsApp().catch(err => {
  logger.fatal({ err }, '💥 Error fatal al iniciar')
  process.exit(1)
})
