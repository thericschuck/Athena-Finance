// Strukturtest (AUDIT.md B5): Die Server Actions sind nicht ohne Next-Laufzeit und Datenbank aufrufbar, daher prueft
// dieser Test den Quelltext. Er sichert zwei Regeln ab, die beim Ergaenzen einer elften Mutation leicht verloren gehen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const quelle = readFileSync(new URL('./depot.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const zeilen = quelle.split('\n')

test('depot actions: jede erfolgreiche Mutation revalidiert vor dem Erfolgs-Return', () => {
  const erfolg = zeilen.flatMap((z, i) => (/^\s*return \{ success: true(, id: data\.id)? \}$/.test(z) ? [i] : []))
  assert.equal(erfolg.length, 10, 'zehn Mutationen mit Erfolgs-Return erwartet')
  for (const i of erfolg) {
    assert.match(zeilen[i - 1], /^\s*revalidiereDepotAnsichten\(\)$/, `Zeile ${i + 1}: revalidiereDepotAnsichten() fehlt davor`)
  }
})

test('depot actions: revalidiert /depot, /finance/accounts und /dashboard', () => {
  for (const pfad of ['/depot', '/finance/accounts', '/dashboard']) {
    assert.ok(quelle.includes(`revalidatePath('${pfad}')`), `${pfad} wird nicht revalidiert`)
  }
})

test('depot actions: kein UTC-Datum per toISOString', () => {
  const code = zeilen.filter(z => !/^\s*(\/\/|\/?\*)/.test(z)).join('\n') // Kommentare duerfen toISOString() erklaeren
  assert.ok(!/toISOString\(\)/.test(code), 'toISOString() in depot.ts: Berliner Datum (heuteBerlin) verwenden')
  assert.ok(quelle.includes('heuteBerlin()'))
})
