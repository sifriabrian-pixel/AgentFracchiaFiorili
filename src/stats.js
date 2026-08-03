// src/stats.js
// Estadísticas persistentes del agente — se guardan en el volumen de Railway

import fs from 'fs'
import path from 'path'

// Guardado con nombre propio dentro del volumen — separado de los archivos de sesión de WhatsApp
const STATS_PATH = path.join(process.env.SESSION_PATH || './sessions', 'fracchia-stats.json')

const STAT_KEYS = ['leadsAtendidos', 'fichasEnviadas', 'linksAgenda', 'agendasConfirmadas', 'tasacionesSolicitadas', 'consultasAdmin']

const DEFAULT_STATS = {
  leadsAtendidos:        0,
  fichasEnviadas:        0,
  linksAgenda:           0,
  agendasConfirmadas:    0,
  tasacionesSolicitadas: 0,
  consultasAdmin:        0,
  inicioTracking:        new Date().toISOString(),
  ultimaActualizacion:   new Date().toISOString(),
  daily:                 {},  // { "2026-08-03": { leadsAtendidos: 2, ... } }
}

function today() {
  return new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
}

function loadStats() {
  try {
    const raw = fs.readFileSync(STATS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_STATS, ...parsed, daily: parsed.daily || {} }
  } catch {
    return { ...DEFAULT_STATS }
  }
}

function saveStats(stats) {
  try {
    stats.ultimaActualizacion = new Date().toISOString()
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), 'utf8')
  } catch (err) {
    console.warn('⚠️  No se pudieron guardar las estadísticas:', err.message)
  }
}

export function incrementStat(key) {
  const stats = loadStats()
  if (!(key in DEFAULT_STATS)) return

  // Total acumulado
  stats[key] = (stats[key] || 0) + 1

  // Desglose diario
  const d = today()
  if (!stats.daily[d]) stats.daily[d] = {}
  stats.daily[d][key] = (stats.daily[d][key] || 0) + 1

  saveStats(stats)
}

export function getStats() {
  return loadStats()
}

export function formatStatsHtml(stats) {
  const ultima = new Date(stats.ultimaActualizacion).toLocaleString('es-AR')
  const dailyJson = JSON.stringify(stats.daily || {})
  const totalJson = JSON.stringify({
    leadsAtendidos:        stats.leadsAtendidos,
    fichasEnviadas:        stats.fichasEnviadas,
    linksAgenda:           stats.linksAgenda,
    agendasConfirmadas:    stats.agendasConfirmadas,
    tasacionesSolicitadas: stats.tasacionesSolicitadas,
    consultasAdmin:        stats.consultasAdmin,
  })

  // Fechas disponibles para el selector
  const allDates = Object.keys(stats.daily || {}).sort()
  const minDate  = allDates[0] || today()
  const maxDate  = today()

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stats — Fracchia-Fiorioli</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #075E54; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
    h1 { color: #075E54; font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 13px; margin-bottom: 16px; }
    .badge { display: inline-block; background: #25D366; color: white; border-radius: 20px; padding: 4px 12px; font-size: 12px; margin-bottom: 16px; }
    .filters { display: flex; gap: 8px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
    .filters label { font-size: 12px; color: #555; }
    .filters input[type="date"] { border: 1px solid #ddd; border-radius: 8px; padding: 6px 10px; font-size: 13px; color: #333; }
    .btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
    .btn { background: #f0f0f0; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; color: #444; }
    .btn.active { background: #075E54; color: white; }
    .range-label { font-size: 12px; color: #888; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .stat { background: #f5f5f5; border-radius: 10px; padding: 16px; text-align: center; }
    .stat .num { font-size: 32px; font-weight: 700; color: #075E54; transition: all 0.2s; }
    .stat .label { font-size: 12px; color: #666; margin-top: 4px; }
    .footer { font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📊 Fracchia-Fiorioli Propiedades</h1>
    <p class="subtitle">Estadísticas del agente</p>
    <div class="badge">🤖 Agente activo</div>

    <div class="filters">
      <div class="btn-group">
        <button class="btn" onclick="setRange('today')">Hoy</button>
        <button class="btn" onclick="setRange('week')">7 días</button>
        <button class="btn" onclick="setRange('month')">30 días</button>
        <button class="btn active" onclick="setRange('all')">Todo</button>
      </div>
    </div>
    <div class="filters">
      <label>Desde</label>
      <input type="date" id="from" min="${minDate}" max="${maxDate}" onchange="applyFilter()">
      <label>Hasta</label>
      <input type="date" id="to"   min="${minDate}" max="${maxDate}" onchange="applyFilter()">
    </div>
    <div class="range-label" id="rangeLabel">Mostrando: total acumulado</div>

    <div class="grid">
      <div class="stat"><div class="num" id="s0">0</div><div class="label">Leads atendidos</div></div>
      <div class="stat"><div class="num" id="s1">0</div><div class="label">Fichas enviadas</div></div>
      <div class="stat"><div class="num" id="s2">0</div><div class="label">Links de agenda</div></div>
      <div class="stat"><div class="num" id="s3">0</div><div class="label">Agendas confirmadas</div></div>
      <div class="stat"><div class="num" id="s4">0</div><div class="label">Tasaciones</div></div>
      <div class="stat"><div class="num" id="s5">0</div><div class="label">Consultas admin</div></div>
    </div>
    <div class="footer">Actualizado: ${ultima} · <a href="" style="color:#aaa">Refrescar</a></div>
  </div>

  <script>
    const total = ${totalJson}
    const daily = ${dailyJson}
    const keys  = ['leadsAtendidos','fichasEnviadas','linksAgenda','agendasConfirmadas','tasacionesSolicitadas','consultasAdmin']

    function fmt(d) { return d.toISOString().slice(0,10) }

    function setRange(preset) {
      document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'))
      event.target.classList.add('active')
      const now = new Date()
      if (preset === 'all') {
        document.getElementById('from').value = ''
        document.getElementById('to').value   = ''
      } else if (preset === 'today') {
        document.getElementById('from').value = fmt(now)
        document.getElementById('to').value   = fmt(now)
      } else if (preset === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 6)
        document.getElementById('from').value = fmt(d)
        document.getElementById('to').value   = fmt(now)
      } else if (preset === 'month') {
        const d = new Date(now); d.setDate(d.getDate() - 29)
        document.getElementById('from').value = fmt(d)
        document.getElementById('to').value   = fmt(now)
      }
      applyFilter()
    }

    function applyFilter() {
      const from = document.getElementById('from').value
      const to   = document.getElementById('to').value

      let data, label
      if (!from && !to) {
        data  = total
        label = 'Mostrando: total acumulado'
      } else {
        data = {}
        keys.forEach(k => data[k] = 0)
        Object.entries(daily).forEach(([date, d]) => {
          if (from && date < from) return
          if (to   && date > to)   return
          keys.forEach(k => { data[k] = (data[k] || 0) + (d[k] || 0) })
        })
        label = 'Mostrando: ' + (from || '…') + ' → ' + (to || hoy())
      }

      keys.forEach((k, i) => {
        document.getElementById('s' + i).textContent = data[k] || 0
      })
      document.getElementById('rangeLabel').textContent = label
    }

    function hoy() { return new Date().toISOString().slice(0,10) }

    // Mostrar totales al cargar
    applyFilter()

    // Refrescar cada 60s
    setTimeout(() => location.reload(), 60000)
  </script>
</body>
</html>`
}
