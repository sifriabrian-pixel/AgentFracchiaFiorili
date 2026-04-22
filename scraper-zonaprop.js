// scraper-zonaprop.js
// Scrapea el perfil de Fracchia en ZonaProp y mergea los IDs con properties.json

import puppeteer from 'puppeteer'
import fs from 'fs'

const BASE_ZP = 'https://www.zonaprop.com.ar'
const PROFILE = 'https://www.zonaprop.com.ar/inmobiliarias/fracchia-fiorioli-propiedades_30448546-inmuebles.html'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function scrapeZonaprop(page) {
  console.log('📋 Scrapeando perfil de ZonaProp...\n')
  const all = []
  let url = PROFILE
  let pageNum = 1

  while (url) {
    console.log(`  Página ${pageNum}: ${url}`)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await sleep(3000)

    // Scroll para cargar todas las cards
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await sleep(1500)
    }

    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-qa="posting PROPERTY"]')
      return [...cards].map(card => {
        const zpId = card.getAttribute('data-id')
        const toPosting = card.getAttribute('data-to-posting') || ''
        const zpUrl = toPosting ? `https://www.zonaprop.com.ar${toPosting.split('?')[0]}` : null

        const precio = card.querySelector('[data-qa="POSTING_CARD_PRICE"]')?.innerText?.trim()
        const features = card.querySelector('[data-qa="POSTING_CARD_FEATURES"]')?.innerText?.trim()
        const address = card.querySelector('.postingLocations-module__location-address')?.innerText?.trim()
        const location = card.querySelector('[data-qa="POSTING_CARD_LOCATION"]')?.innerText?.trim()
        const desc = card.querySelector('[data-qa="POSTING_CARD_DESCRIPTION"]')?.innerText?.trim()

        return { zpId, zpUrl, precio, features, address, location, desc }
      }).filter(i => i.zpId)
    })

    console.log(`  → ${items.length} propiedades encontradas`)
    all.push(...items)

    // Buscar siguiente página
    const nextUrl = await page.evaluate((base) => {
      const next = document.querySelector('a[data-qa="page-next"], a[aria-label="Siguiente página"], .pagination-module__next a')
      return next ? (next.href.startsWith('http') ? next.href : base + next.getAttribute('href')) : null
    }, BASE_ZP)

    url = nextUrl
    pageNum++
    if (url) await sleep(2000)
  }

  return all
}

function normalize(str) {
  if (!str) return ''
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function extractPrice(str) {
  if (!str) return null
  return str.replace(/[^0-9]/g, '')
}

function mergeWithProperties(zpItems) {
  const data = JSON.parse(fs.readFileSync('./properties.json', 'utf8'))
  const props = data.properties
  let matched = 0, unmatched = 0

  for (const zp of zpItems) {
    if (!zp.zpId) continue

    let bestMatch = null
    let bestScore = 0

    const zpPrecio = extractPrice(zp.precio)
    const zpAddr = normalize(zp.address)
    const zpDesc = normalize(zp.desc)

    for (const prop of props) {
      let score = 0

      // Match por precio (peso alto)
      const propPrecio = extractPrice(prop.precio)
      if (zpPrecio && propPrecio && zpPrecio === propPrecio) score += 0.5

      // Match por dirección
      if (zpAddr && prop.direccion) {
        const propAddr = normalize(prop.direccion)
        // Extraer número de calle
        const zpNum = zpAddr.match(/\d+/)?.[0]
        const propNum = propAddr.match(/\d+/)?.[0]
        if (zpNum && propNum && zpNum === propNum) score += 0.3
        // Match por nombre de calle
        const zpStreet = zpAddr.replace(/\d+/g, '').trim()
        const propStreet = propAddr.replace(/\d+/g, '').trim()
        if (zpStreet && propStreet && zpStreet.length > 3 && propStreet.includes(zpStreet.split(' ')[0])) score += 0.2
      }

      // Match por descripción
      if (zpDesc && prop.titulo) {
        const propTitulo = normalize(prop.titulo)
        const words = zpDesc.split(' ').filter(w => w.length > 5)
        const matches = words.filter(w => propTitulo.includes(w))
        score += (matches.length / Math.max(words.length, 1)) * 0.2
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = prop
      }
    }

    if (bestMatch && bestScore >= 0.3) {
      bestMatch.zonapropId = zp.zpId
      bestMatch.zonapropUrl = zp.zpUrl
      matched++
      console.log(`  ✅ (${Math.round(bestScore * 100)}%) ${bestMatch.titulo?.substring(0, 45)} → ZP:${zp.zpId}`)
    } else {
      unmatched++
      console.log(`  ⚠️  Sin match: ${zp.address} ${zp.precio} (ZP:${zp.zpId})`)
    }
  }

  data.lastUpdated = new Date().toISOString()
  data.zonapropLastSync = new Date().toISOString()
  fs.writeFileSync('./properties.json', JSON.stringify(data, null, 2), 'utf8')

  return { matched, unmatched }
}

async function main() {
  console.log('🚀 Scraper ZonaProp — Fracchia-Fiorioli\n')

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

  const zpItems = await scrapeZonaprop(page)
  await browser.close()

  console.log(`\n✅ Total en ZonaProp: ${zpItems.length}\n`)

  if (!zpItems.length) {
    console.error('❌ No se encontraron propiedades')
    process.exit(1)
  }

  console.log('🔗 Mergeando con properties.json...\n')
  const { matched, unmatched } = mergeWithProperties(zpItems)

  console.log(`\n✅ Merge completo:`)
  console.log(`   Matcheadas: ${matched}`)
  console.log(`   Sin match:  ${unmatched}`)
  console.log(`   properties.json actualizado`)
}

main().catch(console.error)
