// src/scrapeLink.js
// Intenta leer links de portales externos con axios (liviano, sin browser)
// Si el portal bloquea, retorna null y el agente pregunta manualmente

import axios from 'axios'
import * as cheerio from 'cheerio'

const PORTALES = ['zonaprop.com.ar', 'mercadolibre.com.ar', 'buscaprop.com.ar', 'argenprop.com']

export function isExternalPortalLink(text) {
  return PORTALES.some(portal => text.includes(portal))
}

export function extractUrlFromText(text) {
  const match = text.match(/https?:\/\/[^\s]+/)
  return match ? match[0] : null
}

export async function scrapePropertyLink(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9',
      }
    })

    const $ = cheerio.load(data)

    // Extraer título
    const titulo = $('h1').first().text().trim() || $('title').text().trim()

    // Extraer precio
    let precio = null
    $('*').each((_, el) => {
      if (precio) return false
      const t = $(el).clone().children().remove().end().text().trim()
      if (t && (t.includes('USD') || t.match(/^\$\s*[\d.]+/)) && t.length < 25) precio = t
    })

    // Extraer dirección
    const direccion = $('[class*="address"], [class*="location"], [class*="ubicacion"], [class*="direccion"]')
      .first().text().trim().replace(/\s+/g, ' ')

    // Extraer características
    const features = $('[class*="features"], [class*="caracteristicas"], [data-qa="POSTING_CARD_FEATURES"]')
      .first().text().trim().replace(/\s+/g, ' ')

    // Extraer descripción
    let descripcion = ''
    $('p').each((_, el) => {
      const t = $(el).text().trim().replace(/\s+/g, ' ')
      if (t.length > descripcion.length && t.length > 80) descripcion = t
    })

    if (!titulo && !precio) return null

    const parts = [
      titulo     ? `Título: ${titulo}` : null,
      precio     ? `Precio: ${precio}` : null,
      direccion  ? `Dirección: ${direccion.substring(0, 100)}` : null,
      features   ? `Características: ${features.substring(0, 200)}` : null,
      descripcion ? `Descripción: ${descripcion.substring(0, 400)}` : null,
    ].filter(Boolean)

    return parts.length >= 2 ? parts.join('\n') : null

  } catch {
    return null
  }
}
