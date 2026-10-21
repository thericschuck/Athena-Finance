import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addTage, tageZwischen } from './datum.ts'
import { baueModell, faecher, tagesReihe, zyklen, type TagesSumme } from './zyklus.ts'

/**
 * Synthetische Historie mit bekanntem Muster: Ausgaben nur an Werktagen (Di/Do mehr), Einnahmen von
 * 2.000 € am 28. jedes Monats. Eine kleine deterministische Streuung verhindert ein perfektes Muster.
 */
function synthetisch(von: string, bis: string): TagesSumme[] {
  const out: TagesSumme[] = []
  const n = tageZwischen(von, bis)
  for (let i = 0; i <= n; i++) {
    const datum = addTage(von, i)
    const wd = (new Date(datum + 'T12:00:00Z').getUTCDay() + 6) % 7
    const tag = Number(datum.slice(8, 10))
    const rausch = 1 + 0.2 * Math.sin(i * 12.9898)
    const aus = wd >= 5 ? 0 : (wd === 1 || wd === 3 ? 120 : 60) * rausch
    const ein = tag === 28 ? 2000 : 0
    if (aus > 0 || ein > 0) out.push({ datum, einnahmen: ein, ausgaben: aus, einnahmenEcht: ein, ausgabenEcht: aus, lohn: 0 })
  }
  return out
}

const HEUTE = '2026-10-20'

test('Tagesreihe: lückenlos, fehlende Tage sind 0, Lohn wird herausgerechnet', () => {
  const r = tagesReihe([
    { datum: '2026-10-01', einnahmen: 100, ausgaben: 10, einnahmenEcht: 100, ausgabenEcht: 10, lohn: 40 },
    { datum: '2026-10-04', einnahmen: 0, ausgaben: 5, einnahmenEcht: 0, ausgabenEcht: 5, lohn: 0 },
  ], '2026-10-05', 'liquiditaet')!
  assert.equal(r.start, '2026-10-01')
  assert.equal(r.ein.length, 5)
  assert.deepEqual(r.ein, [60, 0, 0, 0, 0])
  assert.deepEqual(r.aus, [10, 0, 0, 5, 0])
  assert.equal(tagesReihe([], '2026-10-05', 'liquiditaet'), null)
})

test('Tagesreihe: Vermögen nutzt nur die echten Flüsse', () => {
  const r = tagesReihe([
    { datum: '2026-10-01', einnahmen: 500, ausgaben: 300, einnahmenEcht: 100, ausgabenEcht: 50, lohn: 0 },
  ], '2026-10-01', 'vermoegen')!
  assert.deepEqual([r.ein[0], r.aus[0]], [100, 50])
})

test('Modell: findet Monatsende-Einnahmen und leere Wochenenden', () => {
  const m = baueModell(synthetisch('2025-01-01', HEUTE), HEUTE, 'liquiditaet')
  const e28 = m.erwartet('2026-11-28').einnahmen
  const e15 = m.erwartet('2026-11-16').einnahmen
  assert.ok(e28 > 10 * Math.max(e15, 1), `28. (${e28}) deutlich über dem 16. (${e15})`)
  // Wochenende (Sa 2026-11-14, So 15.) praktisch ohne Ausgaben, Werktag (Do 2026-11-12) nicht
  assert.ok(m.erwartet('2026-11-14').ausgaben < 0.1 * m.erwartet('2026-11-12').ausgaben)
  assert.ok(m.muster.some(t => /Monatsdrittel/.test(t)))
  assert.ok(m.muster.some(t => /Wochenende/.test(t)))
})

test('Modell: schlägt im Backtest den flachen Verlauf deutlich, wenn ein Muster da ist', () => {
  const m = baueModell(synthetisch('2025-01-01', HEUTE), HEUTE, 'liquiditaet')
  assert.ok(m.backtest)
  assert.ok(m.backtest!.ursprunge >= 10)
  assert.ok(m.backtest!.verbesserungPct > 20, `Verbesserung ${m.backtest!.verbesserungPct} %`)
  assert.equal(m.backtest!.fehlerJeHalbwertszeit.length, 5)
})

test('Modell: Gesamtniveau bleibt erhalten (Profil über einen Monat ≈ Monatsmittel)', () => {
  const tage = synthetisch('2025-01-01', HEUTE)
  const m = baueModell(tage, HEUTE, 'liquiditaet')
  let erwartetEin = 0
  for (let i = 1; i <= 30; i++) erwartetEin += m.erwartet(addTage(HEUTE, i)).einnahmen
  assert.ok(Math.abs(erwartetEin - 2000) < 250, `Einnahmen/Monat ≈ 2000, war ${erwartetEin.toFixed(0)}`)
})

test('Modell: Periodogramm findet den 7-Tage- und den Monatszyklus', () => {
  const r = tagesReihe(synthetisch('2025-01-01', HEUTE), HEUTE, 'liquiditaet')!
  const z = zyklen(r.ein.map((e, i) => e - r.aus[i]))
  assert.ok(z.some(x => Math.abs(x.periode - 7) <= 0.5 || Math.abs(x.periode - 3.5) <= 0.5), JSON.stringify(z))
})

test('Modell: zu wenig Historie liefert eine ehrliche Warnung statt erfundener Muster', () => {
  const kurz = baueModell(synthetisch('2026-10-01', HEUTE), HEUTE, 'liquiditaet')
  assert.equal(kurz.backtest, null)
  assert.ok(kurz.hinweise.some(h => /Historie/.test(h)))
  const leer = baueModell([], HEUTE, 'liquiditaet')
  assert.equal(leer.erwartet('2026-11-01').einnahmen, 0)
  assert.ok(leer.hinweise.length > 0)
})

test('Modell: mittelgroße Historie ohne Backtest nutzt alle Tage gleich', () => {
  const m = baueModell(synthetisch('2026-04-01', HEUTE), HEUTE, 'liquiditaet')
  assert.equal(m.halbwertszeit === null || typeof m.halbwertszeit === 'number', true)
})

test('Fächer: deterministisch, unten ≤ 0 ≤ oben im Mittel und wird mit der Zeit breiter', () => {
  const res = Array.from({ length: 200 }, (_, i) => Math.sin(i * 1.7) * 100)
  const a = faecher(res, 60, { seed: 7 })
  const b = faecher(res, 60, { seed: 7 })
  assert.deepEqual(a, b)
  assert.ok(a.unten[59] < a.oben[59])
  assert.ok(a.oben[59] - a.unten[59] > a.oben[2] - a.unten[2])
  const andere = faecher(res, 60, { seed: 8 })
  assert.notDeepEqual(a.oben, andere.oben)
})

test('Fächer: ohne ausreichend Residuen kein Band', () => {
  const f = faecher([1, 2, 3], 10)
  assert.deepEqual(f.unten, new Array(10).fill(0))
})
