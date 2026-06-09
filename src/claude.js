// src/claude.js
// Integración con la API de Claude — con prompt caching

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

function extractPropertyId(text) {
  const match = text.match(/fracchiapropiedades\.com\.ar\/propiedad\/(\d+)/)
  return match ? match[1] : null
}

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
    CALENDLY_LINK:           process.env.CALENDLY_LINK           || '[PENDIENTE]',
    WHATSAPP_ASESOR_VENTA:   process.env.WHATSAPP_ASESOR_VENTA   || '5491156396534',
    WHATSAPP_ASESOR_ALQUILER: process.env.WHATSAPP_ASESOR_ALQUILER || '5491167012528',
    WHATSAPP_CONSULTAS:      process.env.WHATSAPP_CONSULTAS      || '[PENDIENTE]',
  }
}

let cachedProperties = null

export async function askClaude(history) {
  if (!cachedProperties) cachedProperties = loadProperties()

  const lastUserMsg = [...history].reverse().find(m => m.role === 'user')
  const propId = lastUserMsg ? extractPropertyId(lastUserMsg.content) : null
  const matchedProperty = propId ? findPropertyById(propId, cachedProperties) : null

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
    // Prompt caching — el system prompt se cachea y se cobra 90% menos en llamadas repetidas
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: history,
  })

  const rawText = response.content[0]?.text || 'Disculpá, tuve un problema técnico. Intentá de nuevo 🙏'
  const triggers = parseTriggers(rawText)
  const text     = cleanText(rawText)

  // Log de uso de cache
  const usage = response.usage
  if (usage?.cache_read_input_tokens > 0) {
    console.log(`💾 Cache hit: ${usage.cache_read_input_tokens} tokens desde cache`)
  }

  return { text, triggers }
}

export function reloadProperties() {
  cachedProperties = loadProperties()
  console.log(`🔄 Propiedades recargadas: ${cachedProperties.length}`)
}
