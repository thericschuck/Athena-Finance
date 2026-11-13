// Strukturtest (SECURITY-AUDIT.md S4/E1): Nach der Migration 20261113130000 duerfen `authenticated` weder `fund_prices` schreiben
// noch die Chiffrate in `exchange_keys` lesen oder schreiben. Dieser Test haelt fest, dass im Code nur die vorgesehenen Dateien
// (Service-Role-Helfer) solche Zugriffe enthalten; ein neuer Zugriff mit dem Nutzer-Client faellt hier auf, nicht erst in Produktion.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const src = new URL('../../', import.meta.url)
const dateien = (readdirSync(src, { recursive: true }) as string[])
  .map(p => p.replace(/\\/g, '/'))
  .filter(p => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) && !p.startsWith('types/'))

function treffer(tabelle: string, kritisch: RegExp): string[] {
  const aus: string[] = []
  for (const d of dateien) {
    const z = readFileSync(new URL(d, src), 'utf8').replace(/\r\n/g, '\n').split('\n')
    z.forEach((zeile, i) => {
      if (zeile.includes(`from('${tabelle}')`)) {
        const kontext = z.slice(i, i + 8).join('\n')
        if (kritisch.test(kontext)) aus.push(`${d}:${i + 1}`)
      }
    })
  }
  return aus
}

test('exchange_keys: Chiffrate lesen/schreiben nur in kraken/schluessel-core.ts', () => {
  const t = treffer('exchange_keys', /api_key|api_secret|\.upsert\(|\.insert\(|\.update\(|\.delete\(/)
  assert.ok(dateien.length > 100, 'Testaufbau: Quelldateien gefunden')
  assert.deepEqual([...new Set(t.map(x => x.split(':')[0]))], ['lib/kraken/schluessel-core.ts'], t.join(', '))
})

test('fund_prices: Schreiben nur in data/fund-prices.ts', () => {
  const t = treffer('fund_prices', /\.upsert\(|\.insert\(|\.update\(|\.delete\(/)
  assert.deepEqual([...new Set(t.map(x => x.split(':')[0]))], ['lib/data/fund-prices.ts'], t.join(', '))
})

test('depot.ts schreibt fund_prices nur ueber den Helfer mit Admin-Client', () => {
  const q = readFileSync(new URL('app/actions/depot.ts', src), 'utf8')
  assert.ok(q.includes('speichereKursFallsNeu(createAdminClient()'))
  assert.ok(!q.includes("from('fund_prices')"))
})
