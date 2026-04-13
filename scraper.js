// scraper.js — Puppeteer con scroll optimizado para fracchiapropiedades.com.ar

import puppeteer from 'puppeteer'
import fs from 'fs'

const BASE_URL = 'https://www.fracchiapropiedades.com.ar'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchIdsFromSection(page, url) {
  console.log(`\n📋 Cargando: ${url}`)
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
  await sleep(2000)

  const ids = new Set()
  let stable = 0

  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(3500)

    const currentIds = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="/propiedad/"]')].map(e => {
        const m = e.href.match(/\/propiedad\/(\d+)/)
        return m ? m[1] : null
      }).filter(Boolean))]
    )

    const prevSize = ids.size
    currentIds.forEach(id => ids.add(id))
    console.log(`  Scroll ${i + 1}: ${ids.size} propiedades`)

    if (ids.size === prevSize) {
      stable++
      if (stable >= 3) {
        console.log(`  ✅ Estabilizado en ${ids.size} propiedades`)
        break
      }
    } else {
      stable = 0
    }
  }

  return [...ids]
}

async function fetchProperty(page, id) {
  try {
    const url = `${BASE_URL}/propiedad/${id}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await sleep(800)

    const data = await page.evaluate(() => {
      const titulo = document.title.replace(' - Fracchia - Fiorioli Propiedades', '').trim()

      let precio = null
      document.querySelectorAll('*').forEach(el => {
        if (precio) return
        const t = el.childNodes.length === 1 ? el.innerText?.trim() : null
        if (t && (t.includes('USD') || t.match(/^\$\s*[\d.]+/)) && t.length < 25) precio = t
      })

      let operacion = null
      document.querySelectorAll('*').forEach(el => {
        if (operacion) return
        const t = el.innerText?.trim()
        if (t === 'Venta' || t === 'Alquiler') operacion = t
      })

      const tipos = ['Departamentos','Casas','Lotes / Terrenos','Dúplex/Tríplex','PH','Locales','Cocheras','Campos']
      let tipo = null
      document.querySelectorAll('*').forEach(el => {
        if (tipo) return
        const t = el.innerText?.trim()
        if (tipos.includes(t)) tipo = t
      })

      let direccion = null
      document.querySelectorAll('*').forEach(el => {
        if (direccion) return
        const t = el.innerText?.trim()
        if (t?.match(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]+\s+\d+/) && t.length < 60) direccion = t
      })

      const getNum = (kw) => {
        let val = null
        document.querySelectorAll('*').forEach(el => {
          if (val) return
          const t = el.innerText?.trim()?.toLowerCase()
          if (t?.includes(kw) && t.length < 50) {
            const m = t.match(/(\d+)/); if (m) val = m[1]
          }
        })
        return val
      }

      const bodyText = document.body.innerText.toLowerCase()
      const comodidades = []
      const checks = { 'cochera':'cochera','pileta':'pileta','parrilla':'parrilla','jardín':'jardín','patio':'patio','balcon':'balcón','calefacción':'calefacción','solarium':'solarium','acepta mascota':'acepta mascotas' }
      for (const [k,v] of Object.entries(checks)) { if (bodyText.includes(k)) comodidades.push(v) }

      const financiacion = []
      if (bodyText.includes('apto crédito')) financiacion.push('Apto Crédito')
      if (bodyText.includes('anticipo y cuotas')) financiacion.push('Anticipo y cuotas')
      if (bodyText.includes('acepta permuta')) financiacion.push('Acepta permuta')

      let descripcion = ''
      document.querySelectorAll('p').forEach(el => {
        const t = el.innerText?.trim().replace(/\s+/g, ' ')
        if (t?.length > descripcion.length && t.length > 80) descripcion = t
      })

      return { titulo, precio, operacion, tipo, direccion,
        ambientes: getNum('ambiente'), dormitorios: getNum('dormitorio'),
        banos: getNum('baño'), supCubierta: getNum('cubierta'), supTotal: getNum('total'),
        comodidades, financiacion, descripcion: descripcion.substring(0, 1000) }
    })

    return { id, url, ...data,
      supCubierta: data.supCubierta ? `${data.supCubierta}m²` : null,
      supTotal:    data.supTotal    ? `${data.supTotal}m²`    : null,
      scrapedAt: new Date().toISOString() }
  } catch { return null }
}

async function main() {
  console.log('🚀 Scraper — Fracchia-Fiorioli Propiedades\n')

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  // Recolectar IDs de venta y alquiler
  const ventaIds  = await fetchIdsFromSection(page, `${BASE_URL}/propiedades/venta`)
  const alqIds    = await fetchIdsFromSection(page, `${BASE_URL}/propiedades/alquiler`)

  const allIds = [...new Set([...ventaIds, ...alqIds])]
  console.log(`\n✅ Total IDs únicos: ${allIds.length}\n`)

  console.log('🔍 Scrapeando fichas...\n')
  const properties = []
  let ok = 0, errors = 0

  for (let i = 0; i < allIds.length; i++) {
    process.stdout.write(`  [${i+1}/${allIds.length}] ${allIds[i]}... `)
    const prop = await fetchProperty(page, allIds[i])
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
