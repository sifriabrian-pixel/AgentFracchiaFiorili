// scraper.js — usa Puppeteer para renderizar JS y obtener todas las propiedades

import puppeteer from 'puppeteer'
import fs from 'fs'

const BASE_URL = 'https://www.fracchiapropiedades.com.ar'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchAllPropertyIds(page) {
  const ids = new Set()
  console.log('📋 Cargando listado de propiedades...\n')

  await page.goto(`${BASE_URL}/propiedades`, { waitUntil: 'networkidle2', timeout: 30000 })

  // Hacer scroll hasta el fondo para disparar el lazy loading
  let previousHeight = 0
  let attempts = 0

  while (attempts < 20) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(2000)

    const currentHeight = await page.evaluate(() => document.body.scrollHeight)
    const links = await page.$$eval('a[href*="/propiedad/"]', els =>
      els.map(el => el.getAttribute('href'))
    )

    links.forEach(href => {
      const match = href?.match(/\/propiedad\/(\d+)/)
      if (match) ids.add(match[1])
    })

    console.log(`  Scroll ${attempts + 1}: ${ids.size} propiedades encontradas`)

    if (currentHeight === previousHeight) break
    previousHeight = currentHeight
    attempts++
  }

  return [...ids]
}

async function fetchProperty(page, id) {
  try {
    const url = `${BASE_URL}/propiedad/${id}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await sleep(800)

    const data = await page.evaluate(() => {
      const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || null
      const getAll  = (selector) => [...document.querySelectorAll(selector)].map(el => el.innerText.trim())

      // Título
      const titulo = document.title.replace(' - Fracchia - Fiorioli Propiedades', '').trim()

      // Precio
      let precio = null
      document.querySelectorAll('*').forEach(el => {
        if (precio) return
        const t = el.childNodes.length === 1 ? el.innerText?.trim() : null
        if (t && (t.includes('USD') || t.match(/^\$\s*[\d.]+/)) && t.length < 25) precio = t
      })

      // Operación
      let operacion = null
      document.querySelectorAll('*').forEach(el => {
        if (operacion) return
        const t = el.innerText?.trim()
        if (t === 'Venta' || t === 'Alquiler') operacion = t
      })

      // Tipo
      const tipos = ['Departamentos','Casas','Lotes / Terrenos','Dúplex/Tríplex','PH','Locales','Cocheras','Campos']
      let tipo = null
      document.querySelectorAll('*').forEach(el => {
        if (tipo) return
        const t = el.innerText?.trim()
        if (tipos.includes(t)) tipo = t
      })

      // Dirección
      let direccion = null
      document.querySelectorAll('*').forEach(el => {
        if (direccion) return
        const t = el.innerText?.trim()
        if (t?.match(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]+\s+\d+/) && t.length < 60) direccion = t
      })

      // Números
      const getNum = (kw) => {
        let val = null
        document.querySelectorAll('*').forEach(el => {
          if (val) return
          const t = el.innerText?.trim()?.toLowerCase()
          if (t?.includes(kw) && t.length < 50) {
            const m = t.match(/(\d+)/)
            if (m) val = m[1]
          }
        })
        return val
      }

      const bodyText = document.body.innerText.toLowerCase()

      // Comodidades
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

      // Descripción
      let descripcion = ''
      document.querySelectorAll('p').forEach(el => {
        const t = el.innerText?.trim().replace(/\s+/g, ' ')
        if (t?.length > descripcion.length && t.length > 80) descripcion = t
      })

      return {
        titulo,
        precio,
        operacion,
        tipo,
        direccion,
        ambientes:   getNum('ambiente'),
        dormitorios: getNum('dormitorio'),
        banos:       getNum('baño'),
        supCubierta: getNum('cubierta'),
        supTotal:    getNum('total'),
        comodidades,
        financiacion,
        descripcion: descripcion.substring(0, 1000)
      }
    })

    return { id, url, ...data,
      supCubierta: data.supCubierta ? `${data.supCubierta}m²` : null,
      supTotal:    data.supTotal    ? `${data.supTotal}m²`    : null,
      scrapedAt: new Date().toISOString()
    }

  } catch (err) {
    return null
  }
}

async function main() {
  console.log('🚀 Scraper Puppeteer — Fracchia-Fiorioli Propiedades\n')

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  let ids = []
  try {
    ids = await fetchAllPropertyIds(page)
    console.log(`\n✅ Total IDs: ${ids.length}\n`)
  } catch (err) {
    console.error('Error recolectando IDs:', err.message)
    await browser.close()
    process.exit(1)
  }

  console.log('🔍 Scrapeando fichas individuales...\n')
  const properties = []
  let ok = 0, errors = 0

  for (let i = 0; i < ids.length; i++) {
    process.stdout.write(`  [${i+1}/${ids.length}] ${ids[i]}... `)
    const prop = await fetchProperty(page, ids[i])
    if (prop?.titulo) {
      properties.push(prop)
      ok++
      console.log(`✅ ${prop.titulo.substring(0, 55)}`)
    } else {
      errors++
      console.log('⚠️  sin datos')
    }
    await sleep(500)
  }

  await browser.close()

  fs.writeFileSync('./properties.json', JSON.stringify({
    lastUpdated: new Date().toISOString(),
    total: properties.length,
    properties
  }, null, 2), 'utf8')

  console.log(`\n✅ Listo: ${ok} propiedades guardadas, ${errors} errores`)
  console.log('📄 Archivo: properties.json')
}

main().catch(console.error)
