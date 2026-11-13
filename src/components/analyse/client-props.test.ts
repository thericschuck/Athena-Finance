// Strukturtest (AUDIT.md C3): Alles, was an eine Client-Komponente geht, landet serialisiert im Browser. `AnalyseDaten` enthaelt
// `scopeCtx` (Mitglieder-IDs, IBANs auch des Partners), alle Buchungen und alle Monatssummen. Deshalb darf keine
// 'use client'-Komponente der Analyse dieses Objekt als Prop annehmen, und die Seite darf es nicht an die beiden Client-Abschnitte
// durchreichen. Server-Abschnitte (AnalyseBudget, AnalyseKalender, ...) duerfen es: sie laufen nur auf dem Server.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const lies = (url: URL) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n')
const ordner = new URL('./', import.meta.url)

test('Client-Komponenten der Analyse nehmen weder AnalyseDaten noch scopeCtx an', () => {
  const clients = readdirSync(ordner).filter(f => f.endsWith('.tsx') && /^\s*['"]use client['"]/.test(lies(new URL(f, ordner))))
  assert.ok(clients.length >= 8, `Testaufbau: erwartet mehrere Client-Komponenten, gefunden ${clients.length}`)
  assert.ok(clients.includes('AnalyseInsights.tsx') && clients.includes('AnalyseVergleichWahl.tsx'))
  for (const f of clients) {
    const q = lies(new URL(f, ordner))
    assert.ok(!/AnalyseDaten|AnalyseAbschnittProps|scopeCtx|ScopeContext/.test(q), `${f}: darf AnalyseDaten/scopeCtx nicht kennen (landet im Browser)`)
  }
})

test('analyse/page.tsx: AnalyseInsights und AnalyseVergleichWahl bekommen gezielte Props, nie {...props} oder daten', () => {
  const seite = lies(new URL('../../app/(dashboard)/analyse/page.tsx', import.meta.url))
  for (const name of ['AnalyseInsights', 'AnalyseVergleichWahl']) {
    const treffer = [...seite.matchAll(new RegExp(`<${name}\\b([^>]*)/?>`, 'gs'))]
    assert.equal(treffer.length, 1, `${name}: genau eine Verwendung erwartet`)
    assert.ok(!/\{\.\.\.|daten=|scopeCtx/.test(treffer[0][1]), `${name}: bekommt das daten-Objekt oder scopeCtx`)
  }
  assert.match(seite, /<AnalyseInsights hinweise=\{hinweise\} \/>/)
})
