// src/claude.js
// Integración con la API de Claude

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { buildSystemPrompt, FOLLOWUP_MSGS } from '../prompts/fracchia.js'

export { FOLLOWUP_MSGS }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
    CALENDLY_LINK:   process.env.CALENDLY_LINK   || '[PENDIENTE — configurar CALENDLY_LINK en Railway]',
    WHATSAPP_ASESOR: process.env.WHATSAPP_ASESOR || '[PENDIENTE — configurar WHATSAPP_ASESOR en Railway]',
  }
}

let cachedProperties = null

export async function askClaude(history) {
  if (!cachedProperties) cachedProperties = loadProperties()

  const systemPrompt = buildSystemPrompt(cachedProperties, getEnvVars())

  const response = await client.messages.create({
    model:      'claude-opus-4-5',
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
