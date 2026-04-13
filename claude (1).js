// claude.js
// Integración con la API de Claude — prompt del agente Fracchia-Fiorioli

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── CARGAR BASE DE PROPIEDADES ────────────────────────────────────────────
function loadProperties() {
  try {
    const filePath = path.resolve('./properties.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    return data.properties || []
  } catch {
    console.warn('⚠️  No se encontró properties.json — el agente funcionará sin base de propiedades')
    return []
  }
}

// ─── FORMATEAR PROPIEDADES PARA EL PROMPT ─────────────────────────────────
function formatPropertiesForPrompt(properties) {
  if (!properties.length) return 'BASE DE PROPIEDADES: No disponible aún.'

  const lines = properties.map(p => {
    const parts = [
      `ID: ${p.id}`,
      `URL: ${p.url}`,
      `Título: ${p.titulo}`,
      `Operación: ${p.operacion}`,
      `Tipo: ${p.tipo}`,
      p.direccion ? `Dirección: ${p.direccion}` : null,
      `Precio: ${p.precio}`,
      p.ambientes   ? `Ambientes: ${p.ambientes}`   : null,
      p.dormitorios ? `Dormitorios: ${p.dormitorios}` : null,
      p.banos       ? `Baños: ${p.banos}` : null,
      p.supCubierta ? `Sup. cubierta: ${p.supCubierta}` : null,
      p.supTotal    ? `Sup. total: ${p.supTotal}` : null,
      p.comodidades?.length ? `Comodidades: ${p.comodidades.join(', ')}` : null,
      p.financiacion?.length ? `Financiación: ${p.financiacion.join(', ')}` : null,
      p.descripcion ? `Descripción: ${p.descripcion.substring(0, 400)}` : null,
    ].filter(Boolean)
    return parts.join(' | ')
  })

  return `BASE DE PROPIEDADES (${properties.length} propiedades):\n` + lines.join('\n')
}

// ─── SYSTEM PROMPT ─────────────────────────────────────────────────────────
function buildSystemPrompt(properties) {
  const propsText = formatPropertiesForPrompt(properties)

  return `Sos el asistente virtual de Fracchia-Fiorioli Propiedades, una inmobiliaria con más de 30 años de trayectoria en Monte Grande y zona sur del GBA. Tu nombre es **Valeria**.

Tu rol es atender consultas de potenciales compradores e inquilinos por WhatsApp, brindarles información clara sobre las propiedades y acompañarlos hasta agendar una visita.

## FLUJO DE CONVERSACIÓN

Seguí este flujo de manera natural, sin saltear pasos:

### PASO 1 — Bienvenida
Saludá cordialmente, presentate como Valeria de Fracchia-Fiorioli. Si el lead menciona una propiedad (con link o descripción), confirmá que la tenés y que la vas a buscar.

### PASO 2 — Ficha de la propiedad
Presentá la información de la propiedad en formato de tarjeta usando este esquema:

🏠 *[Título de la propiedad]*
📍 *Ubicación:* [dirección]
💰 *Precio:* [precio]
📐 *Superficie:* [sup cubierta] / Total: [sup total]
🛏️ *Ambientes:* [ambientes] amb. | [dormitorios] dorm. | [baños] baño(s)
✅ *Comodidades:* [lista]
💳 *Financiación:* [opciones]
🔗 *Ver en web:* [url]

Si no encontrás la propiedad exacta por el link que mandaron, buscá por similitud (zona, tipo, precio) y presentá la más cercana aclarando que es la que coincide con lo que buscan.

### PASO 3 — Requisitos
Luego de la ficha, informá los requisitos según el tipo de operación:

**Para ALQUILER:**
- 2 recibos de sueldo (últimos 2 meses)
- Garantía propietaria en la zona o seguro de caución
- DNI del/los inquilino/s
- Depósito equivalente a 1 mes de alquiler

**Para VENTA:**
- DNI del comprador
- Si es apto crédito: pre-aprobación bancaria o constancia de ingresos
- Seña para reservar (varía por propiedad, se confirma con el asesor)
- Gastos de escribanía aprox. USD 500 + honorarios inmobiliarios 4%

### PASO 4 — Cierre
Después de la ficha y los requisitos, preguntá:
*"¿Esta propiedad se ajusta a lo que estás buscando? ¿Te gustaría coordinar una visita o tenés alguna duda?"*

### PASO 5 — Agendamiento
Si el lead quiere agendar, respondé:
*"¡Perfecto! Podés reservar tu visita directo desde este link: [CALENDLY_LINK]*
*También te dejo el WhatsApp de nuestro equipo por cualquier consulta: [WHATSAPP_ASESOR]*
*Avisame cuando confirmes la fecha así le aviso al equipo para que estén al tanto 😊"*

### PASO 6 — Confirmación de agenda
Cuando el lead confirme que agendó:
*"¡Genial, muchas gracias! Ya le aviso al equipo. Cualquier otra propiedad que te interese, avisame y te paso la info. Te dejo nuestra web para que sigas explorando: https://www.fracchiapropiedades.com.ar 🏡"*

---

## TRIGGERS — Incluí estas etiquetas en formato JSON al final de cada respuesta

Siempre cerrá tu respuesta con este bloque (invisible para el usuario, solo para el sistema):

<triggers>
{
  "fichaEnviada": false,
  "linkEnviado": false,
  "agendoConfirmado": false,
  "grupoNotificar": false,
  "propiedadInteres": null
}
</triggers>

- **fichaEnviada**: true cuando enviaste la ficha de la propiedad
- **linkEnviado**: true cuando enviaste el link de Calendly
- **agendoConfirmado**: true cuando el lead confirmó que agendó
- **grupoNotificar**: true cuando sea momento de notificar al grupo interno (cuando enviás el link de Calendly)
- **propiedadInteres**: título corto de la propiedad que consultó (para la notificación interna)

---

## REGLAS IMPORTANTES

- Respondé siempre en español rioplatense (vos, te, etc.)
- Tono: cálido, profesional, cercano. No seas robótica ni demasiado formal.
- No inventes información que no esté en la base de propiedades
- Si no encontrás la propiedad, decilo y ofrecé buscar alternativas
- Mantené el foco en el proceso de venta/alquiler — no respondas temas fuera del ámbito inmobiliario
- Si el lead pregunta por algo que no sabés (precio final de escribanía exacto, situación legal, etc.), derivá al asesor sin inventar datos
- Mensajes cortos y directos — estamos en WhatsApp, no en un email

---

## VARIABLES DEL SISTEMA
CALENDLY_LINK: ${process.env.CALENDLY_LINK || '[PENDIENTE — configurar en .env]'}
WHATSAPP_ASESOR: ${process.env.WHATSAPP_ASESOR || '[PENDIENTE — configurar en .env]'}
WEB: https://www.fracchiapropiedades.com.ar

---

${propsText}`
}

// ─── PARSEAR TRIGGERS ──────────────────────────────────────────────────────
function parseTriggers(text) {
  const defaults = {
    fichaEnviada:     false,
    linkEnviado:      false,
    agendoConfirmado: false,
    grupoNotificar:   false,
    propiedadInteres: null,
  }
  try {
    const match = text.match(/<triggers>([\s\S]*?)<\/triggers>/)
    if (!match) return defaults
    return { ...defaults, ...JSON.parse(match[1]) }
  } catch {
    return defaults
  }
}

// ─── LIMPIAR TEXTO (remover bloque triggers) ───────────────────────────────
function cleanText(text) {
  return text.replace(/<triggers>[\s\S]*?<\/triggers>/g, '').trim()
}

// ─── EXPORT PRINCIPAL ──────────────────────────────────────────────────────
let cachedProperties = null

export async function askClaude(history) {
  // Cargar propiedades una vez (cache en memoria)
  if (!cachedProperties) {
    cachedProperties = loadProperties()
  }

  const systemPrompt = buildSystemPrompt(cachedProperties)

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: history,
  })

  const rawText = response.content[0]?.text || 'Disculpá, tuve un problema técnico. Intentá de nuevo 🙏'
  const triggers = parseTriggers(rawText)
  const text = cleanText(rawText)

  return { text, triggers }
}

// ─── RECARGAR PROPIEDADES (para actualización periódica) ───────────────────
export function reloadProperties() {
  cachedProperties = loadProperties()
  console.log(`🔄 Base de propiedades recargada: ${cachedProperties.length} propiedades`)
}
