// scraper.js
// Extrae todas las propiedades de fracchiapropiedades.com.ar y genera properties.json

import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'fs'

const BASE_URL = 'https://www.fracchiapropiedades.com.ar'
const DELAY_MS = 800 // respetuoso con el servidor

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ─── PASO 1: Recolectar todos los IDs de propiedades del listado ────────────
async function fetchPropertyIds() {
  const ids = new Set()
  let page = 1
  let hasMore = true

  console.log('📋 Recolectando IDs de propiedades...')

  while (hasMore) {
    try {
      const url = page === 1
        ? `${BASE_URL}/propiedades`
        : `${BASE_URL}/propiedades/pagina/${page}`

      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)' },
        timeout: 10000
      })

      const $ = cheerio.load(data)
      const links = $('a[href*="/propiedad/"]')
      
      if (links.length === 0) {
        hasMore = false
        break
      }

      let newFound = 0
      links.each((_, el) => {
        const href = $(el).attr('href') || ''
        const match = href.match(/\/propiedad\/(\d+)/)
        if (match && !ids.has(match[1])) {
          ids.add(match[1])
          newFound++
        }
      })

      console.log(`  Página ${page}: ${newFound} nuevos IDs (total: ${ids.size})`)

      if (newFound === 0) hasMore = false
      page++
      await sleep(DELAY_MS)

    } catch (err) {
      console.error(`  Error en página ${page}:`, err.message)
      hasMore = false
    }
  }

  return [...ids]
}

// ─── PASO 2: Scrapear ficha individual ─────────────────────────────────────
async function fetchProperty(id) {
  try {
    const url = `${BASE_URL}/propiedad/${id}`
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)' },
      timeout: 10000
    })

    const $ = cheerio.load(data)

    // Título
    const titulo = $('h1, .propiedad-titulo, .titulo').first().text().trim() ||
      $('title').text().replace(' - Fracchia - Fiorioli Propiedades', '').trim()

    // Precio
    const precioText = $('*').filter((_, el) => {
      const t = $(el).text()
      return (t.includes('USD') || t.includes('$')) && t.length < 30
    }).first().text().trim()

    // Operación (Venta / Alquiler)
    const operacion = $('*').filter((_, el) => {
      const t = $(el).text().trim()
      return t === 'Venta' || t === 'Alquiler'
    }).first().text().trim()

    // Tipo de propiedad
    const tipo = $('*').filter((_, el) => {
      const t = $(el).text().trim()
      return ['Departamentos','Casas','Lotes / Terrenos','Dúplex/Tríplex','PH','Locales','Cocheras','Campos'].includes(t)
    }).first().text().trim()

    // Dirección
    const direccion = $('[class*="location"], [class*="ubicacion"], [class*="direccion"]')
      .first().text().trim().replace(/\s+/g, ' ')

    // Características numéricas
    const getNum = (label) => {
      let val = null
      $('*').each((_, el) => {
        const t = $(el).text().trim()
        if (t.toLowerCase().includes(label.toLowerCase()) && t.length < 40) {
          const match = t.match(/\d+/)
          if (match) { val = match[0]; return false }
        }
      })
      return val
    }

    const ambientes   = getNum('ambiente')
    const dormitorios = getNum('dormitorio')
    const banos       = getNum('baño')
    const supCubierta = getNum('cubierta')
    const supTotal    = getNum('total')

    // Comodidades (buscar texto de la sección)
    const comodidades = []
    const comodKeywords = ['cochera','pileta','parrilla','jardín','patio','balcon','calefacción','solarium','mascotas','apto crédito','permuta','anticipo']
    $('*').each((_, el) => {
      const t = $(el).text().trim().toLowerCase()
      comodKeywords.forEach(k => {
        if (t === k || t === `con ${k}` || t === `acepta ${k}`) {
          if (!comodidades.includes(k)) comodidades.push(k)
        }
      })
    })

    // Descripción principal
    const descripcion = $('[class*="descripcion"], [class*="datos-propiedad"], .datos-acerca')
      .first().text().trim().replace(/\s+/g, ' ').substring(0, 1500)

    // Financiación
    const financiacion = []
    if ($('*').filter((_, el) => $(el).text().trim() === 'Apto Crédito').length) financiacion.push('Apto Crédito')
    if ($('*').filter((_, el) => $(el).text().trim() === 'Anticipo y cuotas').length) financiacion.push('Anticipo y cuotas')
    if ($('*').filter((_, el) => $(el).text().trim() === 'Acepta permuta').length) financiacion.push('Acepta permuta')

    return {
      id,
      url,
      titulo,
      operacion,
      tipo,
      direccion,
      precio: precioText,
      ambientes,
      dormitorios,
      banos,
      supCubierta: supCubierta ? `${supCubierta}m²` : null,
      supTotal: supTotal ? `${supTotal}m²` : null,
      comodidades,
      financiacion,
      descripcion,
      scrapedAt: new Date().toISOString()
    }

  } catch (err) {
    console.error(`  ❌ Error en propiedad ${id}:`, err.message)
    return null
  }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Iniciando scraper de Fracchia-Fiorioli Propiedades\n')

  const ids = await fetchPropertyIds()
  console.log(`\n✅ Total de IDs encontrados: ${ids.length}\n`)
  console.log('🔍 Scrapeando fichas individuales...\n')

  const properties = []
  let ok = 0
  let errors = 0

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    process.stdout.write(`  [${i + 1}/${ids.length}] Propiedad ${id}... `)
    
    const prop = await fetchProperty(id)
    if (prop && prop.titulo) {
      properties.push(prop)
      ok++
      console.log(`✅ ${prop.titulo.substring(0, 50)}`)
    } else {
      errors++
      console.log('⚠️  sin datos')
    }

    await sleep(DELAY_MS)
  }

  // Guardar JSON
  const output = {
    lastUpdated: new Date().toISOString(),
    total: properties.length,
    properties
  }

  fs.writeFileSync('./properties.json', JSON.stringify(output, null, 2), 'utf8')

  console.log(`\n✅ Scraping completo: ${ok} propiedades guardadas, ${errors} errores`)
  console.log('📄 Archivo generado: properties.json')
}

main().catch(console.error)
