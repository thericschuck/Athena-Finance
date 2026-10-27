// Auswertung der Messung (PERF_LOG=1): node scripts/perf-report.mjs [pfad/zur/perf.log] [--top=5] [--clear]
// Fasst perf-log/perf.log pro Route zusammen: Aufrufe, Summe der Aufrufdauer, Wall-Clock, Anteil sequenziell, Wasserfall-Tiefe,
// langsamste Aufrufe, Duplikate (gleiche Tabelle + gleiche Filterspalten mehrfach je Request).
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--')) ?? join(process.cwd(), 'perf-log', 'perf.log')
const top = Number((args.find(a => a.startsWith('--top=')) ?? '--top=5').split('=')[1]) || 5
if (args.includes('--clear')) { if (existsSync(file)) rmSync(file); console.log('Log geleert.'); process.exit(0) }
if (!existsSync(file)) { console.error(`Keine Logdatei: ${file}\nApp mit PERF_LOG=1 starten (npm run build && PERF_LOG=1 npm start) und Seiten aufrufen.`); process.exit(1) }

const entries = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } })
const requests = new Map()
for (const e of entries) {
  if (e.rid === 'no-request' || e.rid === 'admin') continue
  let r = requests.get(e.rid)
  if (!r) requests.set(e.rid, (r = { rid: e.rid, route: e.route, calls: [], render: null }))
  if (e.kind === 'sb') r.calls.push(e)
  else if (e.kind === 'render') r.render = e.dur
}

/** Kennzahlen eines Requests: Summe, Wall-Clock, Zeit mit genau einem Aufruf in Flight, Wasserfall-Tiefe. */
function analyse(calls) {
  const iv = calls.map(c => ({ s: c.start, e: c.start + c.dur, key: c.key, dur: c.dur, target: c.target })).sort((a, b) => a.s - b.s)
  const sum = iv.reduce((a, c) => a + c.dur, 0)
  const wall = iv.length ? Math.max(...iv.map(c => c.e)) - iv[0].s : 0
  const points = iv.flatMap(c => [[c.s, 1], [c.e, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let active = 0, last = 0, busy = 0, single = 0
  for (const [t, d] of points) {
    if (active > 0) { busy += t - last; if (active === 1) single += t - last }
    active += d; last = t
  }
  const levels = []
  for (const c of iv) {
    const prev = iv.filter(o => o !== c && o.e <= c.s)
    levels.push(prev.length ? 1 + Math.max(...prev.map((_, i) => levels[iv.indexOf(prev[i])] ?? 0)) : 1)
  }
  return { sum, wall, busy, single, depth: levels.length ? Math.max(...levels) : 0 }
}

const byRoute = new Map()
for (const r of requests.values()) {
  if (!r.calls.length) continue
  const a = analyse(r.calls)
  const dup = new Map()
  for (const c of r.calls) dup.set(c.key, (dup.get(c.key) ?? 0) + 1)
  const list = byRoute.get(r.route) ?? []
  list.push({ ...r, a, dup })
  byRoute.set(r.route, list)
}

const f = n => n.toFixed(0).padStart(6)
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
console.log(`\n${requests.size} Requests, ${entries.filter(e => e.kind === 'sb').length} Supabase-Aufrufe in ${file}\n`)
console.log('Route'.padEnd(38) + 'Req  Aufr  Summe ms  Wall ms  Render  seq%  Tiefe  Dupl')
const rows = [...byRoute.entries()].sort((a, b) => avg(b[1].map(r => r.a.wall)) - avg(a[1].map(r => r.a.wall)))
for (const [route, list] of rows) {
  const n = list.length
  const calls = avg(list.map(r => r.calls.length))
  const sum = avg(list.map(r => r.a.sum)), wall = avg(list.map(r => r.a.wall))
  const busy = avg(list.map(r => r.a.busy)), single = avg(list.map(r => r.a.single))
  const renders = list.map(r => r.render).filter(x => x != null)
  const dups = avg(list.map(r => [...r.dup.values()].reduce((a, c) => a + (c > 1 ? c - 1 : 0), 0)))
  console.log(route.slice(0, 37).padEnd(38) + String(n).padStart(3) + ' ' + calls.toFixed(1).padStart(5) + ' ' + f(sum) + '  ' + f(wall) + '  ' + (renders.length ? f(avg(renders)) : '     -') + '  ' + ((busy ? single / busy : 0) * 100).toFixed(0).padStart(3) + '%  ' + avg(list.map(r => r.a.depth)).toFixed(1).padStart(5) + '  ' + dups.toFixed(1).padStart(4))
}
console.log('\nseq% = Anteil der Zeit, in der genau ein Aufruf lief (hoch = Waterfall). Tiefe = Kette hintereinander laufender Aufrufe.')
for (const [route, list] of rows) {
  console.log(`\n== ${route}`)
  const all = list.flatMap(r => r.calls)
  const slow = [...all].sort((a, b) => b.dur - a.dur).slice(0, top)
  console.log('  langsamste Aufrufe:')
  for (const c of slow) console.log(`    ${c.dur.toFixed(0).padStart(5)} ms  ${c.method} ${c.target}${c.select ? ' select=' + c.select.slice(0, 60) : ''}`)
  const dupAgg = new Map()
  for (const r of list) for (const [k, c] of r.dup) if (c > 1) dupAgg.set(k, Math.max(dupAgg.get(k) ?? 0, c))
  if (dupAgg.size) {
    console.log('  Duplikate (max. Anzahl je Request):')
    for (const [k, c] of [...dupAgg].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`    ${c}x  ${k.slice(0, 110)}`)
  }
}
