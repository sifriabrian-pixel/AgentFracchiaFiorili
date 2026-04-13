// memory.js
// Gestión de historial de conversación y estado de cada lead

const conversations = new Map() // jid -> [{role, content}]
const leadStates    = new Map() // jid -> { ...estado }

const MAX_HISTORY = 20 // mensajes máximos por conversación

// ─── HISTORIAL ─────────────────────────────────────────────────────────────

export function getHistory(jid) {
  return conversations.get(jid) || []
}

export function addToHistory(jid, role, content) {
  const history = conversations.get(jid) || []
  history.push({ role, content })
  // Mantener solo los últimos N mensajes para no sobrecargar el contexto
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
  conversations.set(jid, history)
}

// ─── ESTADO DEL LEAD ───────────────────────────────────────────────────────

const DEFAULT_STATE = {
  // Timestamps
  firstContactAt:     null,
  lastMessageAt:      null,

  // Tracking de flujo
  fichaEnviada:       false,   // Ya recibió la ficha de la propiedad
  linkEnviado:        false,   // Ya recibió el link de Calendly
  agendoConfirmado:   false,   // Confirmó que agendó

  // Seguimientos
  followupScheduled:  false,
  followup24Sent:     false,
  followup48Sent:     false,

  // Notificación interna
  grupoNotificado:    false,

  // Propiedad de interés (para la notificación al grupo)
  propiedadInteres:   null,
}

export function getLeadState(jid) {
  if (!leadStates.has(jid)) {
    leadStates.set(jid, {
      ...DEFAULT_STATE,
      firstContactAt: Date.now()
    })
  }
  return leadStates.get(jid)
}

export function updateLeadState(jid, updates) {
  const current = getLeadState(jid)
  leadStates.set(jid, { ...current, ...updates })
}

// ─── SEGUIMIENTOS PENDIENTES ───────────────────────────────────────────────

export function getLeadsPendingFollowup() {
  const now = Date.now()
  const pending = []

  for (const [userId, state] of leadStates.entries()) {
    // Solo leads que recibieron ficha o link pero no confirmaron agenda
    if (!state.fichaEnviada && !state.linkEnviado) continue
    if (state.agendoConfirmado) continue
    if (!state.lastMessageAt) continue

    const horasSinRespuesta = (now - state.lastMessageAt) / (1000 * 60 * 60)

    // Seguimiento 24h: para quienes recibieron la ficha y no respondieron
    if (
      state.fichaEnviada &&
      !state.linkEnviado &&
      !state.followup24Sent &&
      horasSinRespuesta >= 24
    ) {
      pending.push({ userId, type: '24h' })
    }

    // Seguimiento 48h: para quienes recibieron el link y no confirmaron
    if (
      state.linkEnviado &&
      !state.agendoConfirmado &&
      !state.followup48Sent &&
      horasSinRespuesta >= 48
    ) {
      pending.push({ userId, type: '48h' })
    }
  }

  return pending
}
