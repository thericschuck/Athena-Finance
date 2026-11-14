import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alsTag, faelligkeitenIm } from './recurrence.ts'
import { termineImFenster } from '../forecast/termine.ts'

/**
 * BEKANNTE INKONSISTENZ (AUDIT.md C6): Athena (`recurrence.ts`) und Dashboard/Prognose (`forecast/termine.ts`) rechnen die
 * Faelligkeiten eines Vertrags verschieden. Diese Tests halten die Unterschiede fest, damit sie nicht unbemerkt waeren und eine
 * spaetere Angleichung eine bewusste Entscheidung bleibt (dann hier die Erwartung aendern, nicht stillschweigend den Code).
 *
 * Warum nicht einfach angleichen: `recurrence.ts` bildet die Edge Function `execute-contracts` nach (Starttag zaehlt nicht,
 * kurze Monate werden uebersprungen), mit Sollwerten aus echten `contract_executions` (recurrence.test.ts). `termine.ts` rechnet
 * nach vorne fuer die Anzeige. Welche Fachregel gilt, seit die Edge Function stillgelegt ist (AUDIT.md), ist eine Entscheidung,
 * kein Refactoring: sie aendert, was Athena unter „nicht bezahlt" und „Termine" meldet.
 */

const vertrag = (over: Partial<{ start: string; freq: string; tag: number | null; ende: string | null; verlaengert: boolean }>) => {
  const v = { start: '2026-01-01', freq: 'monthly', tag: null as number | null, ende: null as string | null, verlaengert: false, ...over }
  return {
    athena: (von: string, bis: string) =>
      faelligkeitenIm({ start_date: v.start, frequency: v.freq, billing_day: v.tag, end_date: v.ende }, alsTag(von), alsTag(bis)),
    prognose: (von: string, bis: string) =>
      termineImFenster(
        { frequency: v.freq, billing_day: v.tag, start_date: v.start, end_date: v.ende, auto_renews: v.verlaengert, is_active: true },
        von, bis,
      ),
  }
}

test('Abweichung 1: billing_day 31 im November. Athena: kein Termin, Prognose: der 30.11.', () => {
  const v = vertrag({ tag: 31 })
  assert.deepEqual(v.athena('2026-11-01', '2026-11-30'), [])
  assert.deepEqual(v.prognose('2026-11-01', '2026-11-30'), ['2026-11-30'])
})

test('Abweichung 2: Starttag ohne billing_day. Athena: zaehlt nicht, Prognose: zaehlt', () => {
  const v = vertrag({ start: '2026-06-23' })
  assert.deepEqual(v.athena('2026-06-01', '2026-07-31'), ['2026-07-23'])
  assert.deepEqual(v.prognose('2026-06-01', '2026-07-31'), ['2026-06-23', '2026-07-23'])
})

test('Abweichung 3: abgelaufener Vertrag mit automatischer Verlaengerung. Athena: endet, Prognose: laeuft weiter', () => {
  const v = vertrag({ start: '2026-01-05', tag: 5, ende: '2026-03-31', verlaengert: true })
  assert.deepEqual(v.athena('2026-03-01', '2026-06-30'), ['2026-03-05'])
  assert.deepEqual(v.prognose('2026-03-01', '2026-06-30'), ['2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05'])
})

test('Gemeinsamer Fall zur Kontrolle: monatlich mit billing_day nach dem Start ist in beiden gleich', () => {
  const v = vertrag({ start: '2026-03-09', tag: 15 })
  assert.deepEqual(v.athena('2026-03-01', '2026-05-31'), ['2026-03-15', '2026-04-15', '2026-05-15'])
  assert.deepEqual(v.prognose('2026-03-01', '2026-05-31'), ['2026-03-15', '2026-04-15', '2026-05-15'])
})
