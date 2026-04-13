// scraper.js
// Extrae todas las propiedades de fracchiapropiedades.com.ar y genera properties.json

import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'fs'

const BASE_URL = 'https://www.fracchiapropiedades.com.ar'
const DELAY_MS = 600
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
  'Referer': 'https://www.fracchiapropiedades.com.ar/'
}

async function fetchAllPropertyIds() {
  const ids = new Set()
  console.log('📋 Recolectando IDs por secciones...\n')

  // Secciones por localidad + operación
  const sections = [
    `${BASE_URL}/propiedades`,
    `${BASE_URL}/propiedades/venta`,
    `${BASE_URL}/propiedades/alquiler`,
    `${BASE_URL}/propiedades/monte-grande`,
    `${BASE_URL}/propiedades/luis-guillon`,
    `${BASE_URL}/propiedades/canning`,
    `${BASE_URL}/propiedades/canninge`,
    `${BASE_URL}/propiedades/ezeiza`,
    `${BASE_URL}/propiedades/tristan-suarez`,
    `${BASE_URL}/propiedades/la-union`,
    `${BASE_URL}/propiedades/lomas-de-zamora`,
    `${BASE_URL}/propiedades/mar-del-tuyu`,
    `${BASE_URL}/propiedades/ramos-mejia`,
    `${BASE_URL}/propiedades/ranchos`,
    `${BASE_URL}/propiedades/san-bernardo`,
    `${BASE_URL}/propiedades/alejandro-petion`,
    `${BASE_URL}/propiedades/el-jaguel`,
    `${BASE_URL}/propiedades/general-las-heras`,
  ]

  // Para cada sección intentar hasta 10 páginas
  for (const section of sections) {
    for (let page = 1; page <= 10; page++) {
      try {
        const url = page === 1 ? section : `${section}/${page}`
        const { data } = await axios.get(url, { headers, timeout: 15000 })
        const $ = cheerio.load(data)

        let newFound = 0
        $('a[href*="/propiedad/"]').each((_, el) => {
          const match = ($(el).attr('href') || '').match(/\/propiedad\/(\d+)/)
          if (match && !ids.has(match[1])) {
            ids.add(match[1])
            newFound++
          }
        })

        if (newFound === 0) break // no hay más páginas en esta sección
        console.log(`  ${section.split('/').pop()} p${page}: +${newFound} (total: ${ids.size})`)
        await sleep(DELAY_MS)

      } catch { break }
    }
  }

  return [...ids]
}

async function fetchProperty(id) {
  try {
    const url = `${BASE_URL}/propiedad/${id}`
    const { data } = await axios.get(url, { headers, timeout: 15000 })
    const $ = cheerio.load(data)

    const titulo = $('title').text().replace(' - Fracchia - Fiorioli Propiedades', '').trim()

    let precio = null
    $('*').each((_, el) => {
      const t = $(el).clone().children().remove().end().text().trim()
      if (!precio && (t.includes('USD') || t.match(/^\$\s*[\d.]+/)) && t.length < 25) precio = t
    })

    let operacion = null
    $('*').each((_, el) => {
      const t = $(el).clone().children().remove().end().text().trim()
      if (!operacion && (t === 'Venta' || t === 'Alquiler')) operacion = t
    })

    const tipos = ['Departamentos','Casas','Lotes / Terrenos','Dúplex/Tríplex','PH','Locales','Cocheras','Campos','Depósitos / Galpones','Inmuebles Comerciales']
    let tipo = null
    $('*').each((_, el) => {
      const t = $(el).clone().children().remove().end().text().trim()
      if (!tipo && tipos.includes(t)) tipo = t
    })

    const getNum = (keywords) => {
      let val = null
      $('*').each((_, el) => {
        if (val) return false
        const t = $(el).text().trim()
        for (const kw of keywords) {
          if (t.toLowerCase().includes(kw) && t.length < 50) {
            const match = t.match(/(\d+)/)
            if (match) { val = match[1]; return false }
          }
        }
      })
      return val
    }

    const ambientes   = getNum(['ambiente'])
    const dormitorios = getNum(['dormitorio'])
    const banos       = getNum(['baño'])
    const supCubierta = getNum(['cubierta'])
    const supTotal    = getNum(['total'])

    const bodyText = $('body').text().toLowerCase()
    const comodidades = []
    const checks = {
      'cochera': 'cochera', 'pileta': 'pileta', 'parrilla': 'parrilla',
      'jardín': 'jardín', 'patio': 'patio', 'balcon': 'balcón',
      'calefacción': 'calefacción', 'solarium': 'solarium',
      'acepta mascota': 'acepta mascotas'
    }
    for (const [k, v] of Object.entries(checks)) {
      if (bodyText.includes(k)) comodidades.push(v)
    }

    const financiacion = []
    if (bodyText.includes('apto crédito')) financiacion.push('Apto Crédito')
    if (bodyText.includes('anticipo y cuotas')) financiacion.push('Anticipo y cuotas')
    if (bodyText.includes('acepta permuta')) financiacion.push('Acepta permuta')

    let descripcion = ''
    $('p').each((_, el) => {
      const t = $(el).text().trim().replace(/\s+/g, ' ')
      if (t.length > descripcion.length && t.length > 80) descripcion = t
    })

    return {
      id, url, titulo, operacion, tipo,
      precio, ambientes, dormitorios, banos,
      supCubierta: supCubierta ? `${supCubierta}m²` : null,
      supTotal:    supTotal    ? `${supTotal}m²`    : null,
      comodidades, financiacion,
      descripcion: descripcion.substring(0, 1000),
      scrapedAt: new Date().toISOString()
    }

  } catch (err) {
    return null
  }
}

async function main() {
  console.log('🚀 Scraper — Fracchia-Fiorioli Propiedades\n')

  const ids = await fetchAllPropertyIds()
  console.log(`\n✅ Total IDs encontrados: ${ids.length}\n`)

  if (!ids.length) {
    console.error('❌ No se encontraron propiedades.')
    process.exit(1)
  }

  console.log('🔍 Scrapeando fichas...\n')
  const properties = []
  let ok = 0, errors = 0

  for (let i = 0; i < ids.length; i++) {
    process.stdout.write(`  [${i+1}/${ids.length}] ${ids[i]}... `)
    const prop = await fetchProperty(ids[i])
    if (prop?.titulo) {
      properties.push(prop)
      ok++
      console.log(`✅ ${prop.titulo.substring(0, 55)}`)
    } else {
      errors++
      console.log('⚠️  sin datos')
    }
    await sleep(DELAY_MS)
  }

  fs.writeFileSync('./properties.json', JSON.stringify({
    lastUpdated: new Date().toISOString(),
    total: properties.length,
    properties
  }, null, 2), 'utf8')

  console.log(`\n✅ Listo: ${ok} propiedades guardadas, ${errors} errores`)
  console.log('📄 Archivo: properties.json')
}

main().catch(console.error)
