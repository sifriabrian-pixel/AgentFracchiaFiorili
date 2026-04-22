// scraper-zonaprop.js
// Scrapea el perfil de Fracchia-Fiorioli en ZonaProp y mergea los IDs con properties.json

import puppeteer from 'puppeteer'
import fs from 'fs'

const ZONAPROP_PROFILE = 'https://www.zonaprop.com.ar/inmobiliarias/fracchia-fiorioli-propiedades_30448546-inmuebles.html'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ─── EXTRAER IDs Y DATOS DE ZONAPROP ──────────────────────────────────────
async function scrapeZonaprop(page) {
  console.log('📋 Cargando perfil de ZonaProp...\n')
  
  await page.goto(ZONAPROP_PROFILE, { waitUntil: 'networkidle2', timeout: 30000 })
  await sleep(3000)

  const zpProperties = []
  let pageNum = 1

  while (true) {
    console.log(`  Página ${pageNum}...`)

    // Scroll para cargar todas las propiedades de la página
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await sleep(2000)
    }

    const items = await page.evaluate(() => {
      const results = []
      
      // ZonaProp usa diferentes selectores según la versión
      const cards = document.querySelectorAll(
        '[data-id], .postingCard, .posting-card, [class*="postingCard"], [class*="posting-card"]'
      )

      cards.forEach(card => {
        // Extraer ID de ZonaProp
        const id = card.getAttribute('data-id') || 
                   card.getAttribute('data-posting-id') ||
                   card.querySelector('[data-id]')?.getAttribute('data-id')

        // Extraer link
        const linkEl = card.querySelector('a[href*="/propiedades/"]')
        const link = linkEl?.href || null

        // Extraer título
        const titulo = card.querySelector('h2, h3, [class*="title"], [class*="titulo"]')?.innerText?.trim()

        // Extraer precio
        const precio = card.querySelector('[class*="price"], [class*="precio"]')?.innerText?.trim()

        // Extraer dirección
        const direccion = card.querySelector('[class*="address"], [class*="direccion"], [class*="location"]')?.innerText?.trim()

        // Extraer características
        const ambientes = card.querySelector('[class*="ambiente"], [class*="room"]')?.innerText?.trim()
        const superficie = card.querySelector('[class*="surface"], [class*="superficie"]')?.innerText?.trim()

        if (id || link) {
          // Extraer ID numérico del link si no hay data-id
          let zpId = id
          if (!zpId && link) {
            const match = link.match(/-(\d+)\.html/)
            if (match) zpId = match[1]
          }

          results.push({ zpId, link, titulo, precio, direccion, ambientes, superficie })
        }
      })

      return results
    })

    if (items.length === 0) {
      console.log('  No se encontraron propiedades en esta página.')
      break
    }

    console.log(`  → ${items.length} propiedades encontradas`)
    zpProperties.push(...items)

    // Buscar botón de siguiente página
    const nextPage = await page.evaluate(() => {
      const next = document.querySelector(
        '[class*="next"], [aria-label="Siguiente"], a[href*="pagina-"]'
      )
      return next ? next.href : null
    })

    if (!nextPage) break

    await page.goto(nextPage, { waitUntil: 'networkidle2', timeout: 30000 })
    await sleep(3000)
    pageNum++
  }

  return zpProperties
}

// ─── NORMALIZAR TEXTO PARA COMPARACIÓN ────────────────────────────────────
function normalize(str) {
  if (!str) return ''
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── CALCULAR SIMILITUD ENTRE DOS STRINGS ─────────────────────────────────
function similarity(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  
  const wordsA = new Set(na.split(' '))
  const wordsB = new Set(nb.split(' '))
  const intersection = [...wordsA].filter(w => wordsB.has(w) && w.length > 3)
  return intersection.length / Math.max(wordsA.size, wordsB.size)
}

// ─── MERGEAR CON properties.json ──────────────────────────────────────────
function mergeWithProperties(zpProperties) {
  if (!fs.existsSync('./properties.json')) {
    console.error('❌ No se encontró properties.json — corré el scraper principal primero')
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync('./properties.json', 'utf8'))
  const properties = data.properties

  let matched = 0
  let unmatched = 0

  for (const zp of zpProperties) {
    if (!zp.zpId) continue

    let bestMatch = null
    let bestScore = 0

    for (const prop of properties) {
      // Match por precio
      const precioScore = zp.precio && prop.precio
        ? (normalize(zp.precio).replace(/\D/g, '') === normalize(prop.precio).replace(/\D/g, '') ? 0.5 : 0)
        : 0

      // Match por título/dirección
      const titleScore = similarity(zp.titulo, prop.titulo) * 0.3
      const dirScore = similarity(zp.direccion, prop.direccion) * 0.4
      const dirTitleScore = similarity(zp.direccion, prop.titulo) * 0.3

      const total = precioScore + titleScore + dirScore + dirTitleScore

      if (total > bestScore) {
        bestScore = total
        bestMatch = prop
      }
    }

    if (bestMatch && bestScore > 0.3) {
      bestMatch.zonapropId = zp.zpId
      bestMatch.zonapropUrl = zp.link
      matched++
      console.log(`  ✅ Match (${Math.round(bestScore * 100)}%): ${bestMatch.titulo?.substring(0, 45)} → ZP:${zp.zpId}`)
    } else {
      unmatched++
      console.log(`  ⚠️  Sin match: ${zp.titulo?.substring(0, 45)} (ZP:${zp.zpId})`)
    }
  }

  // Guardar properties.json actualizado
  data.lastUpdated = new Date().toISOString()
  data.zonapropLastSync = new Date().toISOString()
  fs.writeFileSync('./properties.json', JSON.stringify(data, null, 2), 'utf8')

  return { matched, unmatched }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Scraper ZonaProp — Fracchia-Fiorioli\n')

  const browser = await puppeteer.launch({
    headless: false, // visible para pasar captchas si aparecen
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

  let zpProperties = []
  try {
    zpProperties = await scrapeZonaprop(page)
    console.log(`\n✅ Total propiedades en ZonaProp: ${zpProperties.length}\n`)
  } catch (err) {
    console.error('❌ Error scrapeando ZonaProp:', err.message)
    await browser.close()
    process.exit(1)
  }

  await browser.close()

  if (zpProperties.length === 0) {
    console.error('❌ No se encontraron propiedades en ZonaProp')
    process.exit(1)
  }

  console.log('🔗 Mergeando con properties.json...\n')
  const { matched, unmatched } = mergeWithProperties(zpProperties)

  console.log(`\n✅ Merge completo:`)
  console.log(`   Propiedades matcheadas: ${matched}`)
  console.log(`   Sin match: ${unmatched}`)
  console.log(`   properties.json actualizado con IDs de ZonaProp`)
}

main().catch(console.error)
