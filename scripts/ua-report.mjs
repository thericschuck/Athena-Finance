#!/usr/bin/env node
// Erzeugt aus .ua/knowledge-graph.json einen kompakten Orientierungs-Report (.ua/ARCHITECTURE_REPORT.md).
// Ersatz für den früheren graphify-out/GRAPH_REPORT.md: zuerst lesen, dann gezielt Dateien öffnen.
// Aufruf: node scripts/ua-report.mjs   (nach jedem /understand-Lauf erneut ausführen)
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const graphPath = path.join(root, '.ua', 'knowledge-graph.json')
const outPath = path.join(root, '.ua', 'ARCHITECTURE_REPORT.md')
const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'))

const byId = new Map(g.nodes.map((n) => [n.id, n]))
const FILE_TYPES = new Set(['file', 'config', 'document', 'service', 'pipeline', 'table', 'schema', 'resource', 'endpoint'])
const fileNodes = g.nodes.filter((n) => FILE_TYPES.has(n.type))
const layerOf = new Map()
for (const l of g.layers) for (const id of l.nodeIds) layerOf.set(id, l)

const fanIn = new Map()
const fanOut = new Map()
for (const e of g.edges) {
  if (e.type !== 'imports') continue
  fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1)
  fanOut.set(e.source, (fanOut.get(e.source) || 0) + 1)
}
const fnCount = new Map()
for (const n of g.nodes) if (n.type === 'function') fnCount.set(n.filePath, (fnCount.get(n.filePath) || 0) + 1)
const testedBy = g.edges.filter((e) => e.type === 'tested_by').length

const short = (s, n = 140) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const rel = (id) => (byId.get(id)?.filePath || id)
const top = (map, k) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)

const lines = []
const L = (s = '') => lines.push(s)

L('# Architektur-Report (aus dem Understand-Anything-Graph)')
L()
L(`> Automatisch erzeugt mit \`node scripts/ua-report.mjs\` aus \`.ua/knowledge-graph.json\`. Nicht von Hand bearbeiten.`)
L(`> Stand: Graph vom ${String(g.project.analyzedAt).slice(0, 10)}, Commit \`${String(g.project.gitCommitHash).slice(0, 7)}\`.`)
L()
L('## Überblick')
L(`- ${g.project.description}`)
L(`- ${fileNodes.length} Dateien, ${g.nodes.filter((n) => n.type === 'function').length} Funktionen, ${g.nodes.filter((n) => n.type === 'class').length} Klassen, ${g.edges.length} Kanten (${g.edges.filter((e) => e.type === 'imports').length} imports, ${g.edges.filter((e) => e.type === 'calls').length} calls, ${testedBy} tested_by)`)
L(`- Frameworks: ${(g.project.frameworks || []).join(', ')}`)
L()

L('## Schichten')
L()
L('| Schicht | Dateien | Zweck |')
L('|---|---:|---|')
for (const l of g.layers) L(`| ${l.name} | ${l.nodeIds.length} | ${short(l.description, 150)} |`)
L()

L('## God Nodes (meistimportierte Dateien)')
L('Änderungen hier haben den größten Wirkungsradius.')
L()
for (const [id, c] of top(fanIn, 15)) {
  const n = byId.get(id)
  L(`- \`${rel(id)}\` — ${c} Importe — ${short(n?.summary, 110)}`)
}
L()

L('## Dateien mit den meisten Abhängigkeiten (fan-out)')
L()
for (const [id, c] of top(fanOut, 10)) L(`- \`${rel(id)}\` — importiert ${c} Dateien`)
L()

L('## Größte Dateien nach Funktionsanzahl')
L()
for (const [p, c] of top(fnCount, 10)) L(`- \`${p}\` — ${c} Funktionen`)
L()

L('## Abhängigkeiten zwischen Schichten (imports, Quelle → Ziel)')
L()
const cross = new Map()
for (const e of g.edges) {
  if (e.type !== 'imports') continue
  const a = layerOf.get(e.source)
  const b = layerOf.get(e.target)
  if (!a || !b || a.id === b.id) continue
  const k = `${a.name} → ${b.name}`
  cross.set(k, (cross.get(k) || 0) + 1)
}
for (const [k, c] of top(cross, 20)) L(`- ${k}: ${c}`)
L()

L('## Wichtigste Dateien je Schicht')
for (const l of g.layers) {
  L()
  L(`### ${l.name}`)
  const ranked = l.nodeIds
    .map((id) => [id, (fanIn.get(id) || 0) * 2 + (fanOut.get(id) || 0) * 0.5 + (fnCount.get(rel(id)) || 0) * 0.2])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  for (const [id] of ranked) L(`- \`${rel(id)}\` — ${short(byId.get(id)?.summary, 120)}`)
}
L()

L('## Geführte Tour')
L()
for (const s of g.tour || []) L(`${s.order}. **${s.title}** — ${short(s.description, 160)}`)
L()

L('## Nutzung')
L('- Orientierung: diesen Report lesen, danach gezielt Dateien öffnen.')
L('- Fragen an den Graph: `/understand-chat`, Datei erklären: `/understand-explain`, Diff-Auswirkungen: `/understand-diff`.')
L('- Visuell: `/understand-dashboard` (interaktives Dashboard).')
L('- Nach Code-Änderungen: `/understand --update`, danach `node scripts/ua-report.mjs`.')

fs.writeFileSync(outPath, lines.join('\n') + '\n')
console.log(`Report geschrieben: ${path.relative(root, outPath)} (${lines.length} Zeilen)`)
