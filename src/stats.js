// src/stats.js
// Estadísticas persistentes del agente — se guardan en el volumen de Railway

import fs from 'fs'
import path from 'path'

const STATS_PATH = path.join(process.env.SESSION_PATH || './sessions', 'stats.json')

const DEFAULT_STATS = {
  leadsAtendidos:     0,
  fichasEnviadas:     0,
  linksAgenda:        0,
  agendasConfirmadas: 0,
  tasacionesSolicitadas: 0,
  consultasAdmin:     0,
  inicioTracking:     new Date().toISOString(),
  ultimaActualizacion: new Date().toISOString(),
}

function loadStats() {
  try {
    const raw = fs.readFileSync(STATS_PATH, 'utf8')
    return { ...DEFAULT_STATS, ...JSON.parse(raw) }
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
  if (key in stats) {
    stats[key]++
    saveStats(stats)
  }
}

export function getStats() {
  return loadStats()
}

export function formatStatsHtml(stats) {
  const inicio = new Date(stats.inicioTracking).toLocaleDateString('es-AR')
  const ultima = new Date(stats.ultimaActualizacion).toLocaleString('es-AR')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="60">
  <title>Stats — Fracchia-Fiorioli</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #075E54; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
    h1 { color: #075E54; font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 13px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .stat { background: #f5f5f5; border-radius: 10px; padding: 16px; text-align: center; }
    .stat .num { font-size: 32px; font-weight: 700; color: #075E54; }
    .stat .label { font-size: 12px; color: #666; margin-top: 4px; }
    .footer { font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 16px; }
    .badge { display: inline-block; background: #25D366; color: white; border-radius: 20px; padding: 4px 12px; font-size: 12px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📊 Fracchia-Fiorioli Propiedades</h1>
    <p class="subtitle">Estadísticas del agente desde ${inicio}</p>
    <div class="badge">🤖 Agente activo</div>
    <div class="grid">
      <div class="stat">
        <div class="num">${stats.leadsAtendidos}</div>
        <div class="label">Leads atendidos</div>
      </div>
      <div class="stat">
        <div class="num">${stats.fichasEnviadas}</div>
        <div class="label">Fichas enviadas</div>
      </div>
      <div class="stat">
        <div class="num">${stats.linksAgenda}</div>
        <div class="label">Links de agenda</div>
      </div>
      <div class="stat">
        <div class="num">${stats.agendasConfirmadas}</div>
        <div class="label">Agendas confirmadas</div>
      </div>
      <div class="stat">
        <div class="num">${stats.tasacionesSolicitadas}</div>
        <div class="label">Tasaciones</div>
      </div>
      <div class="stat">
        <div class="num">${stats.consultasAdmin}</div>
        <div class="label">Consultas admin</div>
      </div>
    </div>
    <div class="footer">Actualizado: ${ultima} · Se refresca cada 60s</div>
  </div>
</body>
</html>`
}
