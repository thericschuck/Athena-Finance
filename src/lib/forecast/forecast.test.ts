import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addMonate, addTage, median, tagImMonat, monateZwischen, tageZwischen } from './datum.ts'
import { termineImFenster, type TerminVertrag } from './termine.ts'
import { leseAnnahmen, lohnImMonat, summeImMonat, type Annahme } from './annahmen.ts'
import {
  berechnePrognose, lohnNiveau, ohneVertragsbuchungen, vertragsWirkung,
  type PrognoseEingaben, type PrognoseVertrag,
} from './cashflow.ts'
import type { TagesSumme } from './zyklus.ts'

const nah = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`)

// ── datum ──────────────────────────────────────────────────────────────────────────────────
test('datum: Tage über Monats- und Jahresgrenzen, Schaltjahr', () => {
  assert.equal(addTage('2026-12-31', 1), '2027-01-01')
  assert.equal(addTage('2024-02-28', 1), '2024-02-29')
  assert.equal(addTage('2026-03-01', -1), '2026-02-28')
})

test('datum: Monate addieren und zählen, Tag im Monat wird begrenzt', () => {
  assert.equal(addMonate('2026-11', 3), '2027-02')
  assert.equal(addMonate('2026-01', -1), '2025-12')
  assert.equal(monateZwischen('2026-10', '2027-02'), 4)
  assert.equal(tagImMonat('2026-02', 31), '2026-02-28')
  assert.equal(tagImMonat('2024-02', 31), '2024-02-29')
})

test('datum: Median gerade/ungerade/leer', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 10]), 2.5)
  assert.equal(median([]), 0)
})

// ── termine ────────────────────────────────────────────────────────────────────────────────
const vt = (o: Partial<TerminVertrag> = {}): TerminVertrag => ({
  frequency: 'monthly', billing_day: 20, start_date: '2026-01-05', end_date: null, auto_renews: true, is_active: true, ...o,
})

test('Termine: monatlich am Abbuchungstag', () => {
  assert.deepEqual(termineImFenster(vt(), '2026-10-01', '2026-12-31'), ['2026-10-20', '2026-11-20', '2026-12-20'])
})

test('Termine: ohne billing_day gilt der Starttag', () => {
  assert.deepEqual(termineImFenster(vt({ billing_day: null }), '2026-10-01', '2026-11-30'), ['2026-10-05', '2026-11-05'])
})

test('Termine: Tag 31 wird im Februar auf den letzten Tag begrenzt', () => {
  assert.deepEqual(termineImFenster(vt({ billing_day: 31 }), '2027-02-01', '2027-03-31'), ['2027-02-28', '2027-03-31'])
})

test('Termine: vierteljährlich nur in den Monaten des Rhythmus', () => {
  const t = termineImFenster(vt({ frequency: 'quarterly', start_date: '2026-02-10', billing_day: 10 }), '2026-09-01', '2027-03-31')
  assert.deepEqual(t, ['2026-11-10', '2027-02-10'])
})

test('Termine: wöchentlich und zweiwöchentlich ab dem Starttag', () => {
  const w = termineImFenster(vt({ frequency: 'weekly', start_date: '2026-10-01' }), '2026-10-10', '2026-10-31')
  assert.deepEqual(w, ['2026-10-15', '2026-10-22', '2026-10-29'])
  const b = termineImFenster(vt({ frequency: 'biweekly', start_date: '2026-10-01' }), '2026-10-01', '2026-10-31')
  assert.deepEqual(b, ['2026-10-01', '2026-10-15', '2026-10-29'])
})

test('Termine: Ende ohne Verlängerung schneidet ab, mit Verlängerung läuft es weiter', () => {
  const ohne = termineImFenster(vt({ end_date: '2026-11-30', auto_renews: false }), '2026-10-01', '2027-01-31')
  assert.deepEqual(ohne, ['2026-10-20', '2026-11-20'])
  const mit = termineImFenster(vt({ end_date: '2026-11-30', auto_renews: true }), '2026-10-01', '2027-01-31')
  assert.equal(mit.length, 4)
})

test('Termine: inaktiv, Start in der Zukunft', () => {
  assert.deepEqual(termineImFenster(vt({ is_active: false }), '2026-10-01', '2026-12-31'), [])
  assert.deepEqual(termineImFenster(vt({ start_date: '2026-12-01' }), '2026-10-01', '2026-12-31'), ['2026-12-20'])
})

// ── annahmen ───────────────────────────────────────────────────────────────────────────────
test('Annahmen: ungültige Einträge fallen heraus, gültige werden normalisiert', () => {
  const a = leseAnnahmen([
    { id: 'x', label: ' Gehalt ', art: 'lohn', von: '2027-01', bis: null, betrag: '1.800,5', brutto: 2400 },
    { art: 'unbekannt', von: '2027-01', betrag: 5 },
    { art: 'ausgabe', von: '2027-13', betrag: 5 },
    { art: 'ausgabe', von: '2027-01', betrag: -5 },
    { art: 'ausgabe', von: '2027-03', bis: '2027-01', betrag: 50 },
    'quatsch', null,
  ])
  assert.equal(a.length, 1)
  assert.equal(a[0].art, 'ausgabe')
  assert.equal(a[0].bis, null)
})

test('Annahmen: ein leerer Betrag ist ungültig und wird nicht zu 0 €', () => {
  assert.equal(leseAnnahmen([{ art: 'ausgabe', von: '2027-01', betrag: '' }]).length, 0)
  assert.equal(leseAnnahmen([{ art: 'ausgabe', von: '2027-01', betrag: '  ' }]).length, 0)
  assert.equal(leseAnnahmen([{ art: 'ausgabe', von: '2027-01', betrag: '0' }]).length, 1)
})

test('Annahmen: Dezimalkomma wird gelesen, Brutto nur bei Lohn', () => {
  const a = leseAnnahmen([
    { art: 'lohn', von: '2027-01', betrag: '1800,5', brutto: '2400' },
    { art: 'einnahme', von: '2027-01', betrag: 10, brutto: 99 },
  ])
  assert.equal(a[0].betrag, 1800.5)
  assert.equal(a[0].brutto, 2400)
  assert.equal(a[1].brutto, null)
})

test('Annahmen: Lohn ersetzt, der späteste Beginn gewinnt; Zusätze addieren sich', () => {
  const l = (id: string, von: string, betrag: number, bis: string | null = null): Annahme =>
    ({ id, label: id, art: 'lohn', von, bis, betrag, brutto: null })
  const as: Annahme[] = [
    l('alt', '2026-01', 1000),
    l('neu', '2027-01', 2500),
    { id: 'z1', label: 'z1', art: 'einnahme', von: '2027-01', bis: '2027-03', betrag: 100, brutto: null },
    { id: 'z2', label: 'z2', art: 'einnahme', von: '2027-02', bis: null, betrag: 50, brutto: null },
  ]
  assert.equal(lohnImMonat(as, '2026-12')?.id, 'alt')
  assert.equal(lohnImMonat(as, '2027-02')?.id, 'neu')
  assert.equal(lohnImMonat(as, '2025-12'), null)
  assert.equal(summeImMonat(as, 'einnahme', '2027-02'), 150)
  assert.equal(summeImMonat(as, 'einnahme', '2027-04'), 50)
})

// ── cashflow ───────────────────────────────────────────────────────────────────────────────
const HEUTE = '2026-10-21'

/**
 * Synthetische Historie mit bekanntem Muster: Ausgaben nur an Werktagen, Einnahmen (ohne Lohn)
 * 1.000 € am 28., Lohn 1.500 € am 27. Optional eine Vertragsbuchung von 600 € am 20.
 */
function tage(von = '2025-01-01', bis = HEUTE, vertrag = false): TagesSumme[] {
  const out: TagesSumme[] = []
  const n = tageZwischen(von, bis)
  for (let i = 0; i <= n; i++) {
    const datum = addTage(von, i)
    const wd = (new Date(datum + 'T12:00:00Z').getUTCDay() + 6) % 7
    const d = Number(datum.slice(8, 10))
    const rausch = 1 + 0.2 * Math.sin(i * 12.9898)
    let aus = wd >= 5 ? 0 : (wd === 1 || wd === 3 ? 90 : 50) * rausch
    if (vertrag && d === 20) aus += 600
    const lohn = d === 27 ? 1500 : 0
    const ein = (d === 28 ? 1000 : 0) + lohn
    if (aus > 0 || ein > 0) out.push({ datum, einnahmen: ein, ausgaben: aus, einnahmenEcht: ein, ausgabenEcht: aus, lohn })
  }
  return out
}

const vertrag = (o: Partial<PrognoseVertrag> = {}): PrognoseVertrag => ({
  id: 'v', name: 'Bauspar', type: 'building_savings', frequency: 'monthly', billing_day: 20, start_date: '2025-01-01',
  end_date: null, auto_renews: true, is_active: true, amount: 600, account_id: 'giro', to_account_id: 'bauspar', ...o,
})

function eingaben(o: Partial<PrognoseEingaben> = {}): PrognoseEingaben {
  return {
    heute: HEUTE, monate: 4, liquideKontoIds: ['giro'], liquiditaet: 3000, vermoegen: 10_000,
    vertraege: [], tage: tage(), lohnTag: 27, annahmen: [], ...o,
  }
}

test('Cashflow: liefert eine Tageskurve ohne Lücken vom Folgetag bis Monatsende des Horizonts', () => {
  const p = berechnePrognose(eingaben())
  assert.equal(p.tage[0].datum, '2026-10-22')
  assert.equal(p.tage.at(-1)!.datum, '2027-01-31')
  for (let i = 1; i < p.tage.length; i++) assert.equal(p.tage[i].datum, addTage(p.tage[i - 1].datum, 1))
  assert.equal(p.monate[0].month, '2026-10')
  assert.equal(p.monate[0].teilmonat, true)
  assert.equal(p.monate[1].teilmonat, false)
})

test('Cashflow: die Kurve ist nicht flach — Einnahmen am Monatsende, leere Wochenenden', () => {
  const p = berechnePrognose(eingaben())
  const am = (d: string) => p.tage.find(t => t.datum === d)!.liquiditaet
  // 27. (Lohn) und 28. (Einnahme) heben die Kurve; am Wochenende davor (Sa/So) bewegt sie sich kaum
  assert.ok(am('2026-11-28') - am('2026-11-26') > 1500, 'Sprung am Monatsende')
  assert.ok(Math.abs(am('2026-11-15') - am('2026-11-14')) < 15, 'Sonntag: kaum Bewegung')
  assert.ok(am('2026-11-13') - am('2026-11-12') < 0, 'Werktag: Ausgaben')
})

test('Cashflow: Bereich um die Kurve beginnt eng, wird breiter, und umschließt die erwartete Kurve', () => {
  const p = berechnePrognose(eingaben({ monate: 6 }))
  assert.ok(p.tage.every(t => t.liquiditaetUnten <= t.liquiditaetOben))
  const innen = p.tage.filter(t => t.liquiditaetUnten <= t.liquiditaet && t.liquiditaet <= t.liquiditaetOben).length
  assert.ok(innen / p.tage.length > 0.9, `${innen} von ${p.tage.length} Tagen innerhalb des Bereichs`)
  const erste = p.tage[0], letzte = p.tage.at(-1)!
  assert.ok(letzte.liquiditaetOben - letzte.liquiditaetUnten > erste.liquiditaetOben - erste.liquiditaetUnten)
})

test('Cashflow: ein Vertrag zählt nicht doppelt — Termin sichtbar, Monatsausgaben unverändert', () => {
  const hist = tage('2025-01-01', HEUTE, true)           // Historie MIT den 600-€-Buchungen am 20.
  const ohne = berechnePrognose(eingaben({ tage: hist }))
  const mit = berechnePrognose(eingaben({ tage: hist, vertraege: [vertrag()] }))
  const nov = (p: typeof ohne) => p.monate.find(m => m.month === '2026-11')!.ausgaben
  assert.ok(Math.abs(nov(mit) - nov(ohne)) / nov(ohne) < 0.08, `${nov(mit)} ≈ ${nov(ohne)}`)
  assert.deepEqual(mit.termine.slice(0, 2).map(t => [t.datum, t.betrag]), [['2026-11-20', -600], ['2026-12-20', -600]])
  // am Termin selbst fällt die Kurve um mindestens 600
  const am = (d: string) => mit.tage.find(t => t.datum === d)!.liquiditaet
  assert.ok(am('2026-11-19') - am('2026-11-20') >= 600)
})

test('Cashflow: bisherige Vertragsbuchungen werden vor dem Lernen aus der Historie herausgerechnet', () => {
  const hist = tage('2026-09-01', HEUTE, true)
  const sauber = ohneVertragsbuchungen(hist, [vertrag()], new Set(['giro']), HEUTE)
  const am20 = (t: TagesSumme[], d: string) => t.find(x => x.datum === d)!.ausgaben
  assert.ok(am20(hist, '2026-10-20') > 600)
  assert.ok(am20(sauber, '2026-10-20') < 200)
  assert.equal(hist.length, sauber.length)
})

test('Cashflow: Überträge zwischen zwei liquiden Konten verändern nichts', () => {
  assert.equal(vertragsWirkung(vertrag({ to_account_id: 'tages' }), new Set(['giro', 'tages'])), 0)
  assert.equal(vertragsWirkung(vertrag(), new Set(['giro'])), -600)
  assert.equal(vertragsWirkung(vertrag({ type: 'income', to_account_id: null }), new Set(['giro'])), 600)
})

test('Cashflow: höheres Gehalt ab Dezember ersetzt den Lohn und hebt die Einnahmen genau um die Differenz', () => {
  assert.equal(lohnNiveau(tage(), HEUTE), 1500)
  const basis = berechnePrognose(eingaben())
  const as: Annahme[] = [{ id: 'g', label: 'Gehalt', art: 'lohn', von: '2026-12', bis: null, betrag: 2500, brutto: 3300 }]
  const mit = berechnePrognose(eingaben({ annahmen: as }))
  const monat = (p: typeof basis, m: string) => p.monate.find(x => x.month === m)!
  nah(monat(mit, '2026-12').einnahmen - monat(basis, '2026-12').einnahmen, 1000)
  nah(monat(mit, '2026-11').einnahmen, monat(basis, '2026-11').einnahmen)
})

test('Cashflow: Zusatzausgabe wirkt auf Liquidität und Vermögen', () => {
  const as: Annahme[] = [{ id: 'm', label: 'Miete', art: 'ausgabe', von: '2026-11', bis: '2026-11', betrag: 500, brutto: null }]
  const basis = berechnePrognose(eingaben())
  const mit = berechnePrognose(eingaben({ annahmen: as }))
  const ende = (p: typeof basis, f: 'liquiditaetEnde' | 'vermoegenEnde') => p.monate.find(m => m.month === '2026-11')![f]
  nah(ende(basis, 'liquiditaetEnde') - ende(mit, 'liquiditaetEnde'), 500)
  nah(ende(basis, 'vermoegenEnde') - ende(mit, 'vermoegenEnde'), 500)
})

test('Cashflow: Anlage mindert die Liquidität, aber nicht das Vermögen', () => {
  // Von den Ausgaben gehen 40 % in Anlagen: nur der Rest ist Konsum
  const hist = tage().map(t => ({ ...t, ausgabenEcht: t.ausgaben * 0.6 }))
  const p = berechnePrognose(eingaben({ tage: hist, monate: 6 }))
  const a = p.monate[2], b = p.monate[3]
  const dLiq = b.liquiditaetEnde - a.liquiditaetEnde
  const dNw = b.vermoegenEnde - a.vermoegenEnde
  assert.ok(dNw > dLiq + 100, `Vermögen (${dNw.toFixed(0)}) wächst stärker als Liquidität (${dLiq.toFixed(0)})`)
})

test('Cashflow: negative Liquidität erzeugt eine Warnung mit Datum', () => {
  const p = berechnePrognose(eingaben({ liquiditaet: 20 }))
  assert.ok(p.tiefpunkt.betrag < 20)
  const knapp = berechnePrognose(eingaben({ liquiditaet: -100 }))
  assert.ok(knapp.warnungen.some(w => /negativ/.test(w)))
})

test('Cashflow: ohne Historie bleibt es bei Terminen und Annahmen, mit ehrlicher Warnung', () => {
  const p = berechnePrognose(eingaben({ tage: [], vertraege: [vertrag()] }))
  assert.ok(p.warnungen.some(w => /keine Buchungen/.test(w)))
  assert.equal(p.modell.daten.tage, 0)
  assert.ok(p.termine.length > 0)
  assert.ok(p.tage.length > 0)
})

test('Cashflow: am letzten Tag des Monats gibt es keinen Teilmonat und keinen leeren Monat', () => {
  const p = berechnePrognose(eingaben({ heute: '2026-10-31', tage: tage('2025-01-01', '2026-10-31'), monate: 2 }))
  assert.equal(p.monate[0].month, '2026-11')
  assert.equal(p.monate[0].teilmonat, false)
})

test('Cashflow: der Lohn kommt am Eingangstag — davor ist der Tiefpunkt des Monats', () => {
  const p = berechnePrognose(eingaben({ liquiditaet: 0 }))
  const nov = p.monate.find(m => m.month === '2026-11')!
  assert.ok(nov.tiefpunktDatum <= '2026-11-27', nov.tiefpunktDatum)
})

test('Cashflow: gleiche Eingabe, gleiches Ergebnis (der Bereich ist deterministisch)', () => {
  const a = berechnePrognose(eingaben())
  const b = berechnePrognose(eingaben())
  assert.deepEqual(a.tage, b.tage)
})

test('Cashflow: das Modell berichtet, woraus es gelernt hat', () => {
  const p = berechnePrognose(eingaben())
  assert.ok(p.modell.daten.tage > 600)
  assert.ok(p.modell.backtest && p.modell.backtest.ursprunge > 10)
  assert.ok(p.modell.muster.length > 0)
})
