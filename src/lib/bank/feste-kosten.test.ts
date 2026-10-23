import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneFesteKosten, pruefePreisaenderung, type FesteKostenEingabe } from './feste-kosten.ts'

type Tx = FesteKostenEingabe['transactions'][number]

let n = 0
const tx = (datum: string, betrag: number, name: string, extra: Partial<Tx> = {}): Tx =>
  ({
    id: `t${++n}`, account_iban: 'DE01', value_date: datum, amount: betrag, description: null,
    counterpart_name: name, counterpart_iban: null, category_id: null, ...extra,
  }) as unknown as Tx

const monatlich = (name: string, betraege: number[], tag = 5, start = '2026-01'): Tx[] =>
  betraege.map((b, i) => {
    const m = Number(start.slice(5)) + i
    return tx(`${start.slice(0, 4)}-${String(m).padStart(2, '0')}-${String(tag).padStart(2, '0')}`, -b, name)
  })

const eingabe = (transactions: Tx[], heute = '2026-06-20', extra: Partial<FesteKostenEingabe> = {}): FesteKostenEingabe => ({
  transactions, categories: [], kontoIds: new Map(), eigeneIbans: [], heute, ...extra,
})

test('Monatsabo wird erkannt, Monatsaequivalent und Summe stimmen', () => {
  const r = berechneFesteKosten(eingabe([
    ...monatlich('Disney Streaming', [12.99, 12.99, 12.99, 12.99, 12.99, 12.99]),
    ...monatlich('Fitnessstudio Muster', [30, 30, 30, 30, 30, 30], 1),
  ]), [])
  assert.equal(r.anzahl, 2)
  assert.equal(r.summeProMonat, 42.99)
  assert.equal(r.ohneVertrag, 2)
})

test('Wiederholung braucht mindestens drei Buchungen', () => {
  const r = berechneFesteKosten(eingabe(monatlich('Disney Streaming', [12.99, 12.99], 5, '2026-05')), [])
  assert.equal(r.anzahl, 0)
})

test('Umbuchung auf eigene IBAN ist keine feste Kosten', () => {
  const buchungen = monatlich('Eigenes Konto Eric', [500, 500, 500, 500, 500, 500]).map(t => ({ ...t, counterpart_iban: 'DE 99 0000' }))
  const r = berechneFesteKosten(eingabe(buchungen, '2026-06-20', { eigeneIbans: ['DE990000'] }), [])
  assert.equal(r.anzahl, 0)
})

test('Vierteljaehrlich und jaehrlich werden auf den Monat umgerechnet', () => {
  const quartal = ['2025-09-10', '2025-12-10', '2026-03-10', '2026-06-10'].map(d => tx(d, -90, 'Haftpflicht Versicherung AG'))
  const jahr = ['2023-06-15', '2024-06-15', '2025-06-15'].map(d => tx(d, -120, 'Domain Registrar Verein'))
  const r = berechneFesteKosten(eingabe([...quartal, ...jahr], '2026-06-20'), [])
  const q = r.posten.find(p => p.frequenz === 'quarterly')
  assert.equal(q?.monatsaequivalent, 30)
  // Jaehrlich: letzte Buchung vor ~370 Tagen, laeuft noch (Toleranz 1,5 Jahre).
  assert.equal(r.posten.find(p => p.frequenz === 'yearly')?.monatsaequivalent, 10)
})

test('Vertragsabgleich: passender aktiver Vertrag setzt hatVertrag', () => {
  const r = berechneFesteKosten(
    eingabe(monatlich('Disney Streaming', [12.99, 12.99, 12.99, 12.99, 12.99, 12.99])),
    [{ name: 'Disney', betrag: 12.99, aktiv: true }],
  )
  assert.equal(r.posten[0].hatVertrag, true)
  assert.equal(r.ohneVertrag, 0)
})

test('Preisaenderung: letzter Betrag >3 % ueber dem Median der vorherigen', () => {
  assert.equal(pruefePreisaenderung([10, 10, 10, 10.2]), null)
  const p = pruefePreisaenderung([10, 10, 10, 11.5])
  assert.deepEqual(p, { vorher: 10, letzter: 11.5, differenz: 1.5, teurer: true })
  assert.equal(pruefePreisaenderung([10, 10]), null)
  assert.equal(pruefePreisaenderung([10, 10, 9])?.teurer, false)
})

test('Preisaenderung erscheint am Posten', () => {
  const r = berechneFesteKosten(eingabe(monatlich('Spotify Premium', [10, 10, 10, 10, 10.9, 10.9])), [])
  // 10,90 gegen Median(10,10,10,10,10,9)=10 -> +9 %
  assert.equal(r.posten[0].preisaenderung?.teurer, true)
  assert.equal(r.posten[0].preisaenderung?.differenz, 0.9)
})

test('Ausgeblieben: erwarteter Termin mehr als 7 Tage zurueck, Serie laeuft sonst noch', () => {
  // Letzte Buchung 5.5., erwartet 5.6.; heute 20.6. = 15 Tage zurueck, 46 Tage seit letzter: ausserhalb 1,5 x 30 -> Serie gilt als beendet.
  const beendet = berechneFesteKosten(eingabe(monatlich('Disney Streaming', [12.99, 12.99, 12.99, 12.99], 5, '2026-01'), '2026-06-20'), [])
  assert.equal(beendet.anzahl, 0)
  // Letzte Buchung 5.5. (4 Buchungen Feb-Mai), heute 14.6.: erwartet 5.6. = 9 Tage zurueck, 40 Tage seit letzter -> noch innerhalb.
  const r = berechneFesteKosten(eingabe(monatlich('Disney Streaming', [12.99, 12.99, 12.99, 12.99], 5, '2026-02'), '2026-06-14'), [])
  assert.equal(r.posten[0].ausgeblieben?.erwartetSeit, '2026-06-05')
  assert.equal(r.posten[0].ausgeblieben?.tage, 9)
  assert.equal(r.posten[0].naechsteErwartet, null)
  // Nur 5 Tage zurueck: noch kein Hinweis.
  const knapp = berechneFesteKosten(eingabe(monatlich('Disney Streaming', [12.99, 12.99, 12.99, 12.99], 5, '2026-02'), '2026-06-10'), [])
  assert.equal(knapp.posten[0].ausgeblieben, null)
})

test('Sparplan-Typ zaehlt nicht als Kosten', () => {
  const r = berechneFesteKosten(eingabe(monatlich('Sparplan ETF Depot Broker', [100, 100, 100, 100, 100, 100])), [])
  assert.equal(r.anzahl, 0)
})

test('Preisaenderung: nach einem alten Sprung kein Dauerhinweis mehr', () => {
  // Sprung liegt drei Buchungen zurueck, der letzte Betrag entspricht den davor.
  assert.equal(pruefePreisaenderung([10, 10, 10, 12, 12, 12, 12]), null)
  // Die Buchung, die den Sprung selbst ausloest, meldet weiterhin.
  assert.equal(pruefePreisaenderung([10, 10, 10, 12])?.teurer, true)
})
