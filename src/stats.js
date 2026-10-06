// src/stats.js
// Estadísticas persistentes del agente — se guardan en el volumen de Railway

import fs from 'fs'
import path from 'path'

// Guardado con nombre propio dentro del volumen — separado de los archivos de sesión de WhatsApp
const STATS_PATH = path.join(process.env.SESSION_PATH || './sessions', 'fracchia-stats.json')

const STAT_KEYS = ['leadsAtendidos', 'fichasEnviadas', 'linksAgenda', 'agendasConfirmadas', 'tasacionesSolicitadas', 'consultasAdmin', 'consultasVenta', 'consultasAlquiler', 'seguimientosEnviados', 'fueraDeHorario', 'mensajesEnviados', 'mensajesLeidos', 'leadsReactivados']

const DEFAULT_STATS = {
  leadsAtendidos:        0,
  fichasEnviadas:        0,
  linksAgenda:           0,
  agendasConfirmadas:    0,
  tasacionesSolicitadas: 0,
  consultasAdmin:        0,
  consultasVenta:        0,
  consultasAlquiler:     0,
  seguimientosEnviados:  0,
  fueraDeHorario:        0,
  mensajesEnviados:      0,
  mensajesLeidos:        0,
  leadsReactivados:      0,
  tipoPropiedad:         {},  // { "Casas": 5, "Departamentos": 3, ... }
  inicioTracking:        new Date().toISOString(),
  ultimaActualizacion:   new Date().toISOString(),
  daily:                 {},
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Horario comercial Argentina (GMT-3): Lun-Vie 9-19, Sáb 9-13
export function esFueraDeHorario(ts = Date.now()) {
  const ar = new Date(ts).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })
  // ar: "06/10/2026, 14:30:00"
  const [, time] = ar.split(', ')
  const [hh, mm] = (time || '').split(':').map(Number)
  const mins = hh * 60 + mm
  const dow = new Date(ts).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' })
  if (dow === 'Sun') return true
  if (dow === 'Sat') return mins < 9 * 60 || mins >= 13 * 60
  return mins < 9 * 60 || mins >= 19 * 60
}

function loadStats() {
  try {
    const raw = fs.readFileSync(STATS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_STATS, ...parsed, daily: parsed.daily || {}, tipoPropiedad: parsed.tipoPropiedad || {} }
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

export function incrementTipo(tipo) {
  if (!tipo) return
  const stats = loadStats()
  if (!stats.tipoPropiedad) stats.tipoPropiedad = {}
  stats.tipoPropiedad[tipo] = (stats.tipoPropiedad[tipo] || 0) + 1
  saveStats(stats)
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
    leadsAtendidos:        stats.leadsAtendidos        || 0,
    fichasEnviadas:        stats.fichasEnviadas        || 0,
    linksAgenda:           stats.linksAgenda           || 0,
    agendasConfirmadas:    stats.agendasConfirmadas    || 0,
    tasacionesSolicitadas: stats.tasacionesSolicitadas || 0,
    consultasAdmin:        stats.consultasAdmin        || 0,
    consultasVenta:        stats.consultasVenta        || 0,
    consultasAlquiler:     stats.consultasAlquiler     || 0,
    seguimientosEnviados:  stats.seguimientosEnviados  || 0,
    fueraDeHorario:        stats.fueraDeHorario        || 0,
    mensajesEnviados:      stats.mensajesEnviados      || 0,
    mensajesLeidos:        stats.mensajesLeidos        || 0,
    leadsReactivados:      stats.leadsReactivados      || 0,
  })
  const tipoPropJson = JSON.stringify(stats.tipoPropiedad || {})
  const allDates = Object.keys(stats.daily || {}).sort()
  const minDate  = allDates[0] || today()
  const maxDate  = today()

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Panel — Fracchia-Fiorioli</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{
      --navy:#0D1B2A;--blue:#2762EA;--blue-soft:#EEF3FE;
      --naranja:#E08A1E;--naranja-soft:#FDF3E3;
      --bg:#F3F5F9;--card:#FFFFFF;--txt:#0D1B2A;--txt2:#4A5568;--txt3:#8896A5;--line:#E4E8EF;
      --verde:#16a34a;--verde-soft:#DCFCE7;
      --rojo:#dc2626;--rojo-soft:#FEE2E2;
      --igual:#8896A5;--igual-soft:#F1F5F9;
      --bar1:#2762EA;--bar2:#E08A1E
    }
    body{font-family:'Poppins',sans-serif;background:var(--bg);color:var(--txt);min-height:100vh}
    a{color:inherit;text-decoration:none}
    .top{background:var(--navy);padding:0 20px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
    .marca{font-family:'Montserrat',sans-serif;font-size:20px;font-weight:800;color:#fff;letter-spacing:-.5px}
    .marca span{color:#6C95F7}
    .top-sub{font-size:11px;color:#8896A5;margin-top:1px}
    .badge-top{background:rgba(39,98,234,.25);color:#6C95F7;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600}
    .wrap{max-width:860px;margin:0 auto;padding:20px 16px}
    /* Selector período */
    .periodo{background:var(--card);border-radius:12px;padding:12px 16px;margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border:1px solid var(--line)}
    .btn-g{display:flex;gap:6px;flex-wrap:wrap}
    .btn{background:transparent;border:1px solid var(--line);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;color:var(--txt2);font-family:'Poppins',sans-serif;transition:.15s}
    .btn:hover{border-color:var(--blue);color:var(--blue)}
    .btn.on{background:var(--blue);color:#fff;border-color:var(--blue)}
    .sep{width:1px;height:20px;background:var(--line)}
    .date-row{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--txt2)}
    .date-row input{border:1px solid var(--line);border-radius:8px;padding:4px 8px;font-size:12px;color:var(--txt);background:var(--card);font-family:'Poppins',sans-serif}
    /* KPIs */
    .kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px}
    @media(min-width:600px){.kpis{grid-template-columns:repeat(4,1fr)}}
    .kpi{background:var(--card);border-radius:12px;padding:16px;border:1px solid var(--line)}
    .kpi-l{font-size:11px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
    .kpi-v{font-family:'Montserrat',sans-serif;font-size:26px;font-weight:800;line-height:1;color:var(--blue);font-variant-numeric:tabular-nums}
    .kpi-s{font-size:11px;color:var(--txt3);margin-top:6px;min-height:14px;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    .delta{display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;white-space:nowrap}
    .bien{color:var(--verde);background:var(--verde-soft)}
    .mal{color:var(--rojo);background:var(--rojo-soft)}
    .igual{color:var(--igual);background:var(--igual-soft)}
    /* Funnel */
    .funnel{background:var(--card);border-radius:12px;padding:16px;border:1px solid var(--line);margin-bottom:16px}
    .funnel h2{font-size:13px;font-weight:600;margin-bottom:14px;color:var(--txt)}
    .f-pasos{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    .f-paso{text-align:center;flex:1;min-width:80px}
    .f-n{font-family:'Montserrat',sans-serif;font-size:22px;font-weight:800;color:var(--blue);font-variant-numeric:tabular-nums}
    .f-lbl{font-size:10px;color:var(--txt3);margin-top:3px}
    .f-pct{font-size:11px;color:var(--blue);font-weight:600;margin-top:2px}
    .f-arr{color:var(--line);font-size:18px;flex-shrink:0}
    /* Gráfico */
    .chart-card{background:var(--card);border-radius:12px;padding:16px;border:1px solid var(--line);margin-bottom:16px}
    .chart-card h2{font-size:13px;font-weight:600;margin-bottom:8px}
    .chart-leyenda{display:flex;gap:16px;font-size:11px;color:var(--txt2);margin-bottom:8px}
    .chart-leyenda i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle}
    svg.chart{width:100%;overflow:visible}
    /* Desglose */
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
    @media(max-width:500px){.grid2{grid-template-columns:1fr}}
    .card-s{background:var(--card);border-radius:12px;padding:14px;border:1px solid var(--line)}
    .card-s h3{font-size:11px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
    .b-fila{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px}
    .b-lbl{flex:0 0 120px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .b-bar{flex:1;background:var(--line);border-radius:4px;height:7px;overflow:hidden}
    .b-bar i{display:block;height:7px;background:var(--blue);border-radius:4px;transition:width .3s}
    .b-val{font-family:'Montserrat',sans-serif;font-variant-numeric:tabular-nums;font-weight:700;color:var(--txt);min-width:20px;text-align:right;font-size:12px}
    /* Tiles valor agente */
    .tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px}
    @media(min-width:600px){.tiles{grid-template-columns:repeat(4,1fr)}}
    .tile{background:var(--card);border-radius:12px;padding:14px;border:1px solid var(--line)}
    .tile-l{font-size:11px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
    .tile-v{font-family:'Montserrat',sans-serif;font-size:24px;font-weight:800;color:var(--txt);font-variant-numeric:tabular-nums}
    .tile-s{font-size:11px;color:var(--txt3);margin-top:5px;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    /* Footer */
    .footer{text-align:center;font-size:11px;color:var(--txt3);padding:16px 0}
    .footer a{color:var(--blue)}
  </style>
</head>
<body>
<div class="top">
  <div>
    <div class="marca">Si<span>fer</span></div>
    <div class="top-sub">Fracchia-Fiorioli Propiedades</div>
  </div>
  <span class="badge-top">● Agente activo</span>
</div>

<div class="wrap">
  <div class="periodo">
    <div class="btn-g">
      <button class="btn" onclick="preset('today',event)">Hoy</button>
      <button class="btn on" onclick="preset('week',event)">7 días</button>
      <button class="btn" onclick="preset('month',event)">30 días</button>
      <button class="btn" onclick="preset('all',event)">Todo</button>
    </div>
    <div class="sep"></div>
    <div class="date-row">
      <span>Desde</span>
      <input type="date" id="from" min="${minDate}" max="${maxDate}" onchange="apply()">
      <span>Hasta</span>
      <input type="date" id="to"   min="${minDate}" max="${maxDate}" onchange="apply()">
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpis">
    <div class="kpi">
      <div class="kpi-l">Leads atendidos</div>
      <div class="kpi-v" id="k0">0</div>
      <div class="kpi-s" id="d0"></div>
    </div>
    <div class="kpi">
      <div class="kpi-l">Fichas enviadas</div>
      <div class="kpi-v" id="k1">0</div>
      <div class="kpi-s" id="d1"></div>
    </div>
    <div class="kpi">
      <div class="kpi-l">Links de agenda</div>
      <div class="kpi-v" id="k2">0</div>
      <div class="kpi-s" id="d2"></div>
    </div>
    <div class="kpi">
      <div class="kpi-l">Agendas confirmadas</div>
      <div class="kpi-v" id="k3">0</div>
      <div class="kpi-s" id="d3"></div>
    </div>
  </div>

  <!-- Funnel -->
  <div class="funnel">
    <h2>Embudo de conversión</h2>
    <div class="f-pasos">
      <div class="f-paso"><div class="f-n" id="fn0">0</div><div class="f-lbl">Leads</div></div>
      <div class="f-arr">→</div>
      <div class="f-paso"><div class="f-n" id="fn1">0</div><div class="f-lbl">Fichas</div><div class="f-pct" id="fp1"></div></div>
      <div class="f-arr">→</div>
      <div class="f-paso"><div class="f-n" id="fn2">0</div><div class="f-lbl">Links agenda</div><div class="f-pct" id="fp2"></div></div>
      <div class="f-arr">→</div>
      <div class="f-paso"><div class="f-n" id="fn3">0</div><div class="f-lbl">Agendas</div><div class="f-pct" id="fp3"></div></div>
    </div>
  </div>

  <!-- Gráfico diario -->
  <div class="chart-card">
    <h2>Actividad diaria</h2>
    <div class="chart-leyenda">
      <span><i style="background:var(--bar1)"></i>Leads</span>
      <span><i style="background:var(--bar2)"></i>Agendas</span>
    </div>
    <svg class="chart" id="chart" viewBox="0 0 600 160" role="img" aria-label="Actividad diaria"></svg>
  </div>

  <!-- Valor del agente -->
  <div class="tiles" id="tiles-valor"></div>

  <!-- Tipo de propiedad -->
  <div class="card-s" style="margin-bottom:16px">
    <h3>Por tipo de propiedad</h3>
    <div id="barras-prop"></div>
  </div>

  <!-- Desglose -->
  <div class="grid2">
    <div class="card-s">
      <h3>Por tipo de consulta</h3>
      <div id="barras-tipo"></div>
    </div>
    <div class="card-s">
      <h3>Otras métricas</h3>
      <div id="barras-otras"></div>
    </div>
  </div>

  <div class="footer">
    Actualizado: ${ultima} · <a href="">↻ Refrescar</a>
  </div>
</div>

<script>
  const total = ${totalJson}
  const daily = ${dailyJson}
  const tipoProp = ${tipoPropJson}
  const KEYS  = ['leadsAtendidos','fichasEnviadas','linksAgenda','agendasConfirmadas','tasacionesSolicitadas','consultasAdmin','consultasVenta','consultasAlquiler','seguimientosEnviados','fueraDeHorario','mensajesEnviados','mensajesLeidos','leadsReactivados']

  function fmt(d){ return d.toISOString().slice(0,10) }
  function hoy(){ return fmt(new Date()) }
  function pct(a,b){ return b>0 ? Math.round(a/b*100)+'%' : '—' }

  function sumRange(from, to){
    const r={}; KEYS.forEach(k=>r[k]=0)
    Object.entries(daily).forEach(([d,v])=>{
      if(from&&d<from)return; if(to&&d>to)return
      KEYS.forEach(k=>{r[k]=(r[k]||0)+(v[k]||0)})
    })
    return r
  }

  function delta(cur, prev){
    if(prev==null||cur==null)return ''
    if(prev===0)return cur>0?'<span class="delta igual">nuevo</span>':''
    const d=Math.round((cur-prev)/prev*100)
    const cls=d>0?'bien':d<0?'mal':'igual'
    const sym=d>0?'▲':d<0?'▼':''
    return \`<span class="delta \${cls}">\${sym}\${Math.abs(d)}%</span>\`
  }

  function prevRange(from, to){
    if(!from&&!to)return null
    const f=new Date(from||hoy()), t=new Date(to||hoy())
    const dias=Math.round((t-f)/86400000)+1
    const pf=new Date(f); pf.setDate(pf.getDate()-dias)
    const pt=new Date(f); pt.setDate(pt.getDate()-1)
    return {from:fmt(pf),to:fmt(pt)}
  }

  function apply(){
    const from=document.getElementById('from').value
    const to=document.getElementById('to').value
    const cur = from||to ? sumRange(from,to) : total
    const pr = prevRange(from,to)
    const prev = pr ? sumRange(pr.from,pr.to) : null

    // KPIs
    const kpiKeys=['leadsAtendidos','fichasEnviadas','linksAgenda','agendasConfirmadas']
    kpiKeys.forEach((k,i)=>{
      document.getElementById('k'+i).textContent=cur[k]||0
      const sub=[]
      if(i>0){
        const base=cur[kpiKeys[i-1]]
        if(base>0)sub.push('<span style="color:var(--txt3)">'+pct(cur[k],base)+'</span>')
      }
      if(prev)sub.push(delta(cur[k],prev[k]))
      document.getElementById('d'+i).innerHTML=sub.join(' ')
    })

    // Funnel
    const fn=[cur.leadsAtendidos,cur.fichasEnviadas,cur.linksAgenda,cur.agendasConfirmadas]
    fn.forEach((v,i)=>{
      document.getElementById('fn'+i).textContent=v||0
      if(i>0){
        const base=fn[i-1]
        document.getElementById('fp'+i).textContent=base>0?Math.round(v/base*100)+'%':''
      }
    })

    // Gráfico
    renderChart(from||null, to||null)

    // Tiles valor del agente
    const leads=cur.leadsAtendidos||0
    const fh=cur.fueraDeHorario||0
    const enviados=cur.mensajesEnviados||0
    const leidos=cur.mensajesLeidos||0
    const react=cur.leadsReactivados||0
    const segu=cur.seguimientosEnviados||0
    const tasaLectura=enviados>0?Math.round(leidos/enviados*100):null
    const tasaReact=segu>0?Math.round(react/segu*100):null

    const pfh=prev?prev.fueraDeHorario||0:null
    const ptl=prev&&prev.mensajesEnviados>0?Math.round((prev.mensajesLeidos||0)/prev.mensajesEnviados*100):null
    const ptr=prev&&prev.seguimientosEnviados>0?Math.round((prev.leadsReactivados||0)/prev.seguimientosEnviados*100):null

    document.getElementById('tiles-valor').innerHTML=\`
      <div class="tile">
        <div class="tile-l">Fuera de horario</div>
        <div class="tile-v">\${fh}</div>
        <div class="tile-s">\${leads>0?'<span>'+Math.round(fh/leads*100)+'% de leads</span>':''}\${pfh!=null?delta(fh,pfh):''}</div>
      </div>
      <div class="tile">
        <div class="tile-l">Tasa de lectura</div>
        <div class="tile-v">\${tasaLectura!=null?tasaLectura+'%':'—'}</div>
        <div class="tile-s"><span>Msgs del agente leídos</span>\${ptl!=null?delta(tasaLectura,ptl):''}</div>
      </div>
      <div class="tile">
        <div class="tile-l">Reactivados</div>
        <div class="tile-v">\${react}</div>
        <div class="tile-s"><span>De \${segu} seguimientos</span></div>
      </div>
      <div class="tile">
        <div class="tile-l">Tasa reactivación</div>
        <div class="tile-v">\${tasaReact!=null?tasaReact+'%':'—'}</div>
        <div class="tile-s"><span>Respondieron tras seguimiento</span>\${ptr!=null?delta(tasaReact,ptr):''}</div>
      </div>\`

    // Barras tipo consulta
    const bTipo=[
      {l:'Venta',v:cur.consultasVenta||0},
      {l:'Alquiler',v:cur.consultasAlquiler||0},
      {l:'Tasaciones',v:cur.tasacionesSolicitadas||0},
    ]
    renderBarras('barras-tipo', bTipo)

    const bOtras=[
      {l:'Consultas admin',v:cur.consultasAdmin||0},
      {l:'Seguimientos',v:cur.seguimientosEnviados||0},
    ]
    renderBarras('barras-otras', bOtras)
  }

  function renderBarras(id, filas){
    const max=Math.max(1,...filas.map(f=>f.v))
    document.getElementById(id).innerHTML=filas.map(f=>\`
      <div class="b-fila">
        <span class="b-lbl">\${f.l}</span>
        <div class="b-bar"><i style="width:\${f.v?Math.max((f.v/max)*100,2):0}%"></i></div>
        <span class="b-val">\${f.v}</span>
      </div>\`).join('')
  }

  function renderChart(from, to){
    const svg=document.getElementById('chart')
    const W=600,H=160,PL=28,PR=8,PT=10,PB=22
    const dias=[]
    const allD=Object.keys(daily).sort()
    const ini=from||(allD[0]||hoy())
    const fin=to||hoy()
    for(let d=new Date(ini);fmt(d)<=fin;d.setDate(d.getDate()+1)){
      const k=fmt(d); const v=daily[k]||{}
      dias.push({k,a:v.leadsAtendidos||0,b:v.agendasConfirmadas||0})
    }
    if(!dias.length){svg.innerHTML='';return}
    const max=Math.max(1,...dias.map(d=>Math.max(d.a,d.b)))
    const paso=max<=5?1:max<=10?2:max<=25?5:max<=50?10:Math.ceil(max/5/10)*10
    const tope=Math.ceil(max/paso)*paso
    const yf=v=>PT+(H-PT-PB)*(1-v/tope)
    const banda=(W-PL-PR)/Math.max(dias.length,1)
    const bW=Math.min(10,Math.max(2,(banda-4)/2))

    let g=''; let gd=''
    for(let v=0;v<=tope;v+=paso){
      const yy=yf(v)
      g+=\`<line x1="\${PL}" x2="\${W-PR}" y1="\${yy}" y2="\${yy}" stroke="#E4E8EF" stroke-width="1"/>
        <text x="\${PL-4}" y="\${yy+3}" text-anchor="end" font-size="9" fill="#8896A5">\${v}</text>\`
    }

    const barra=(x,v,col)=>{
      if(!v)return ''
      const top=yf(v),base=yf(0),r=Math.min(3,bW/2,base-top)
      return \`<path d="M\${x},\${base} V\${top+r} Q\${x},\${top} \${x+r},\${top} H\${x+bW-r} Q\${x+bW},\${top} \${x+bW},\${top+r} V\${base} Z" fill="\${col}"/>\`
    }

    dias.forEach((d,i)=>{
      const cx=PL+banda*i+banda/2
      const x1=cx-bW-1,x2=cx+1
      gd+=\`<g><title>\${d.k}: \${d.a} leads · \${d.b} agendas</title>
        <rect x="\${PL+banda*i}" y="\${PT}" width="\${banda}" height="\${H-PT-PB}" fill="transparent"/>
        \${barra(x1,d.a,'#2762EA')}\${barra(x2,d.b,'#E08A1E')}</g>\`
    })

    const idx=[0,Math.floor((dias.length-1)/2),dias.length-1].filter((v,i,a)=>a.indexOf(v)===i)
    let ejeX=''
    idx.forEach(i=>{
      const cx=PL+banda*i+banda/2
      const anchor=i===0?'start':i===dias.length-1?'end':'middle'
      const x=i===0?PL:i===dias.length-1?W-PR:cx
      ejeX+=\`<text x="\${x}" y="\${H-6}" text-anchor="\${anchor}" font-size="9" fill="#8896A5">\${dias[i].k.slice(5)}</text>\`
    })

    svg.innerHTML=g+gd+ejeX
  }

  function preset(p, e){
    document.querySelectorAll('.btn').forEach(b=>b.classList.remove('on'))
    e.target.classList.add('on')
    const now=new Date()
    if(p==='all'){
      document.getElementById('from').value=''
      document.getElementById('to').value=''
    }else if(p==='today'){
      document.getElementById('from').value=fmt(now)
      document.getElementById('to').value=fmt(now)
    }else if(p==='week'){
      const d=new Date(now);d.setDate(d.getDate()-6)
      document.getElementById('from').value=fmt(d)
      document.getElementById('to').value=fmt(now)
    }else if(p==='month'){
      const d=new Date(now);d.setDate(d.getDate()-29)
      document.getElementById('from').value=fmt(d)
      document.getElementById('to').value=fmt(now)
    }
    apply()
  }

  // Tipo propiedad — muestra placeholders si no hay datos reales aún
  function renderTipoProp(){
    const filas=Object.entries(tipoProp).sort((a,b)=>b[1]-a[1])
    if(!filas.length){
      const placeholders=[{l:'Departamentos',v:0},{l:'Casas',v:0},{l:'Lotes / Terrenos',v:0}]
      const max=1
      document.getElementById('barras-prop').innerHTML=placeholders.map(f=>\`
        <div class="b-fila">
          <span class="b-lbl">\${f.l}</span>
          <div class="b-bar"><i style="width:0%"></i></div>
          <span class="b-val" style="color:var(--txt3)">—</span>
        </div>\`).join('')+'<p style="font-size:11px;color:var(--txt3);margin-top:8px">Se acumula a partir de ahora</p>'
      return
    }
    renderBarras('barras-prop', filas.map(([l,v])=>({l,v})))
  }
  renderTipoProp()

  // Arrancar en última semana
  ;(()=>{
    const now=new Date()
    const d=new Date(now); d.setDate(d.getDate()-6)
    document.getElementById('from').value=fmt(d)
    document.getElementById('to').value=fmt(now)
  })()
  apply()
  setTimeout(()=>location.reload(),60000)
</script>
</body>
</html>`
}
