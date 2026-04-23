// src/scrapeLink.js
// Scrapea links externos de portales (ZonaProp, MercadoLibre, BuscaProp)
// y extrae los datos de la propiedad para pasárselos a Claude

import puppeteer from 'puppeteer'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Portales soportados
const PORTALES = ['zonaprop.com.ar', 'inmuebles.mercadolibre.com.ar', 'buscaprop.com.ar', 'argenprop.com']

export function isExternalPortalLink(text) {
  return PORTALES.some(portal => text.includes(portal))
}

export function extractUrlFromText(text) {
  const match = text.match(/https?:\/\/[^\s]+/)
  return match ? match[0] : null
}

async function scrapeZonaprop(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
  await sleep(2000)

  return await page.evaluate(() => {
    const titulo = document.querySelector('h1')?.innerText?.trim()
    const precio = document.querySelector('[class*="price"]')?.innerText?.trim()
    const direccion = document.querySelector('[class*="address"]')?.innerText?.trim()
    const features = document.querySelector('[data-qa="POSTING_CARD_FEATURES"], [class*="main-features"]')?.innerText?.trim()
    const desc = document.querySelector('[data-qa="POSTING_DESCRIPTION"], [class*="description"]')?.innerText?.trim()
    const ubicacion = document.querySelector('[class*="location"]')?.innerText?.trim()

    return { titulo, precio, direccion: direccion || ubicacion, features, descripcion: desc?.substring(0, 500) }
  })
}

async function scrapeMercadoLibre(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
  await sleep(2000)

  return await page.evaluate(() => {
    const titulo = document.querySelector('h1')?.innerText?.trim()
    const precio = document.querySelector('.andes-money-amount__fraction, [class*="price"]')?.innerText?.trim()
    const direccion = document.querySelector('[class*="location"], [class*="address"]')?.innerText?.trim()
    const features = [...document.querySelectorAll('.ui-pdp-features li, [class*="attribute"]')]
      .map(el => el.innerText?.trim()).filter(Boolean).join(' | ')
    const desc = document.querySelector('.ui-pdp-description__content, [class*="description"]')?.innerText?.trim()

    return { titulo, precio, direccion, features, descripcion: desc?.substring(0, 500) }
  })
}

async function scrapeGeneric(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
  await sleep(2000)

  return await page.evaluate(() => {
    const titulo = document.querySelector('h1')?.innerText?.trim()
    // Buscar precio en el body
    let precio = null
    document.querySelectorAll('*').forEach(el => {
      if (precio) return
      const t = el.childNodes.length === 1 ? el.innerText?.trim() : null
      if (t && (t.includes('USD') || t.includes('$ ')) && t.length < 25) precio = t
    })
    const direccion = document.querySelector('[class*="address"], [class*="location"], [class*="ubicacion"]')?.innerText?.trim()
    const desc = document.querySelector('[class*="description"], [class*="descripcion"]')?.innerText?.trim()

    return { titulo, precio, direccion, features: null, descripcion: desc?.substring(0, 500) }
  })
}

export async function scrapePropertyLink(url) {
  let browser = null
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' })

    let data = null

    if (url.includes('zonaprop.com.ar')) {
      data = await scrapeZonaprop(page, url)
    } else if (url.includes('mercadolibre.com.ar')) {
      data = await scrapeMercadoLibre(page, url)
    } else {
      data = await scrapeGeneric(page, url)
    }

    await browser.close()

    // Formatear resultado
    if (!data?.titulo && !data?.precio) return null

    const parts = [
      data.titulo    ? `Título: ${data.titulo}` : null,
      data.precio    ? `Precio: ${data.precio}` : null,
      data.direccion ? `Dirección: ${data.direccion}` : null,
      data.features  ? `Características: ${data.features}` : null,
      data.descripcion ? `Descripción: ${data.descripcion}` : null,
    ].filter(Boolean)

    return parts.join('\n')

  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    return null
  }
}
