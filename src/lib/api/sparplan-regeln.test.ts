import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_KURSALTER_STUNDEN, kursAlterStunden, kursIstFrisch, monatsGrenzen } from '../../../supabase/functions/execute-savings-plans/regeln.ts'

const JETZT = new Date('2026-11-14T09:00:00Z')
const vor = (stunden: number) => new Date(JETZT.getTime() - stunden * 3_600_000).toISOString()

// ── Monatsgrenzen ────────────────────────────────────────────────────────────

test('monatsGrenzen: erster Tag des Monats und des Folgemonats', () => {
  assert.deepEqual(monatsGrenzen('2026-11-13'), { von: '2026-11-01', bis: '2026-12-01' })
  assert.deepEqual(monatsGrenzen('2026-11-01'), { von: '2026-11-01', bis: '2026-12-01' })
  assert.deepEqual(monatsGrenzen('2026-11-30'), { von: '2026-11-01', bis: '2026-12-01' })
})

test('monatsGrenzen: Dezember läuft ins nächste Jahr, Januar nicht ins vorige', () => {
  assert.deepEqual(monatsGrenzen('2026-12-31'), { von: '2026-12-01', bis: '2027-01-01' })
  assert.deepEqual(monatsGrenzen('2026-01-15'), { von: '2026-01-01', bis: '2026-02-01' })
})

test('monatsGrenzen: Februar im Schaltjahr', () => {
  assert.deepEqual(monatsGrenzen('2028-02-29'), { von: '2028-02-01', bis: '2028-03-01' })
  assert.deepEqual(monatsGrenzen('2027-02-28'), { von: '2027-02-01', bis: '2027-03-01' })
})

test('monatsGrenzen: ein Buchungstag liegt genau dann im Monat, wenn von <= tag < bis (Stringvergleich wie in der Abfrage)', () => {
  const { von, bis } = monatsGrenzen('2026-11-13')
  const imMonat = (tag: string) => tag >= von && tag < bis
  assert.equal(imMonat('2026-11-01'), true)
  assert.equal(imMonat('2026-11-30'), true)
  assert.equal(imMonat('2026-10-31'), false)
  assert.equal(imMonat('2026-12-01'), false)
})

// ── Kursalter ────────────────────────────────────────────────────────────────

test('Schwelle: 72 Stunden', () => {
  assert.equal(MAX_KURSALTER_STUNDEN, 72)
})

test('kursIstFrisch: frische und noch tragbare Kurse', () => {
  for (const h of [0, 1, 12, 36, 60, 71.9, 72]) {
    assert.equal(kursIstFrisch(vor(h), JETZT), true, `${h} h`)
  }
})

test('kursIstFrisch: zu alte Kurse werden abgelehnt', () => {
  for (const h of [72.02, 73, 96, 24 * 7, 24 * 30]) {
    assert.equal(kursIstFrisch(vor(h), JETZT), false, `${h} h`)
  }
})

test('kursIstFrisch: das normale Wochenende fällt nicht aus (letzter Abruf Fr 20:45 UTC, Job Sa/So 09:00 UTC)', () => {
  const freitagAbruf = '2026-11-13T20:45:02.978+00:00'
  assert.equal(kursIstFrisch(freitagAbruf, new Date('2026-11-14T09:00:00Z')), true) // Samstag, ~12 h
  assert.equal(kursIstFrisch(freitagAbruf, new Date('2026-11-15T09:00:00Z')), true) // Sonntag, ~36 h
  // Montag früh, falls der Montagsabruf ausfällt: ~60 h, der Freitagsschlusskurs ist dann der richtige
  assert.equal(kursIstFrisch(freitagAbruf, new Date('2026-11-16T09:00:00Z')), true)
  // Dienstag ohne einen einzigen Abruf seit Freitag: ~84 h
  assert.equal(kursIstFrisch(freitagAbruf, new Date('2026-11-17T09:00:00Z')), false)
})

test('kursIstFrisch: fehlender oder unlesbarer Zeitstempel -> nicht frisch (nie raten)', () => {
  for (const v of [null, undefined, '', 'gestern', '2026-13-45T99:00:00Z']) {
    assert.equal(kursIstFrisch(v as string | null | undefined, JETZT), false, JSON.stringify(v))
  }
})

test('kursIstFrisch: Zeitstempel leicht in der Zukunft (Uhrenabweichung) gilt als frisch', () => {
  assert.equal(kursIstFrisch(vor(-0.1), JETZT), true)
})

test('kursIstFrisch: eigene Schwelle wird beachtet', () => {
  assert.equal(kursIstFrisch(vor(30), JETZT, 24), false)
  assert.equal(kursIstFrisch(vor(20), JETZT, 24), true)
})

test('kursAlterStunden: Stunden, null bei fehlendem Zeitstempel', () => {
  assert.equal(kursAlterStunden(vor(5), JETZT), 5)
  assert.equal(kursAlterStunden(null, JETZT), null)
  assert.equal(kursAlterStunden('kaputt', JETZT), null)
})

// ── Struktur: die Abfrage in index.ts ───────────────────────────────────────

test('index.ts: Bereichsabfrage statt .like() auf die DATE-Spalte, Fehler der Prüfung wird gelesen', () => {
  const code = readFileSync(new URL('../../../supabase/functions/execute-savings-plans/index.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(zeile => !zeile.trim().startsWith('//'))
    .join('\n')
  assert.equal(code.includes('.like('), false, '.like() auf transaction_date darf nicht zurückkehren (date ~~ text gibt es nicht)')
  assert.match(code, /\.gte\('transaction_date', monatVon\)/)
  assert.match(code, /\.lt\('transaction_date', monatBis\)/)
  assert.match(code, /\.limit\(1\)/)
  assert.match(code, /error: existingErr/, 'der Fehler der Prüfung muss gelesen werden')
  assert.match(code, /if \(existingErr\)/)
  assert.match(code, /kursIstFrisch\(cache\.fetched_at, jetzt\)/)
})
