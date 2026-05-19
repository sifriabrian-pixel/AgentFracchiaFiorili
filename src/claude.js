// src/claude.js
// Integración con la API de Claude

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { buildSystemPrompt, FOLLOWUP_MSGS } from '../prompts/fracchia.js'
import { buildSinglePropertyPrompt } from '../prompts/single.js'

export { FOLLOWUP_MSGS }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function loadProperties() {
  try {
    const filePath = path.resolve('./properties.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    return data.properties || []
  } catch {
    console.warn('⚠️  No se encontró properties.json')
    return []
  }
}

// Extraer ID de propiedad de un link de la web propia
function extractPropertyId(text) {
  const match = text.match(/fracchiapropiedades\.com\.ar\/propiedad\/(\d+)/)
  return match ? match[1] : null
}

// Buscar propiedad por ID exacto
function findPropertyById(id, properties) {
  return properties.find(p => p.id === id) || null
}

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

function cleanText(text) {
  return text.replace(/<triggers>[\s\S]*?<\/triggers>/g, '').trim()
}

function getEnvVars() {
  return {
    CALENDLY_LINK:      process.env.CALENDLY_LINK      || '[PENDIENTE — configurar CALENDLY_LINK en Railway]',
    WHATSAPP_ASESOR:    process.env.WHATSAPP_ASESOR    || '[PENDIENTE — configurar WHATSAPP_ASESOR en Railway]',
    WHATSAPP_CONSULTAS: process.env.WHATSAPP_CONSULTAS || '[PENDIENTE — configurar WHATSAPP_CONSULTAS en Railway]',
  }
}

let cachedProperties = null

export async function askClaude(history) {
  if (!cachedProperties) cachedProperties = loadProperties()

  // Detectar si el último mensaje del usuario tiene un link de la web propia
  const lastUserMsg = [...history].reverse().find(m => m.role === 'user')
  const propId = lastUserMsg ? extractPropertyId(lastUserMsg.content) : null
  const matchedProperty = propId ? findPropertyById(propId, cachedProperties) : null

  // Si encontramos la propiedad por ID, pasamos solo esa al prompt
  // Si no, pasamos toda la base (para búsquedas generales)
  let systemPrompt
  if (matchedProperty) {
    console.log(`🎯 Propiedad encontrada por ID ${propId}: ${matchedProperty.titulo}`)
    systemPrompt = buildSinglePropertyPrompt(matchedProperty, getEnvVars())
  } else {
    systemPrompt = buildSystemPrompt(cachedProperties, getEnvVars())
  }

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     systemPrompt,
    messages:   history,
  })

  const rawText = response.content[0]?.text || 'Disculpá, tuve un problema técnico. Intentá de nuevo 🙏'
  const triggers = parseTriggers(rawText)
  const text     = cleanText(rawText)

  return { text, triggers }
}

export function reloadProperties() {
  cachedProperties = loadProperties()
  console.log(`🔄 Propiedades recargadas: ${cachedProperties.length}`)
}
