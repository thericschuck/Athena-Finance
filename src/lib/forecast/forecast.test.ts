import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addMonate, addTage, median, tagImMonat, monateZwischen } from './datum.ts'
import { termineImFenster, type TerminVertrag } from './termine.ts'
import { leseAnnahmen, lohnImMonat, summeImMonat, type Annahme } from './annahmen.ts'
import { berechnePrognose, vertragsWirkung, type HistorieMonat, type PrognoseEingaben, type PrognoseVertrag } from './cashflow.ts'

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
  // "1.800,5" ist kein gültiges Zahlenformat nach Replace(',', '.') -> NaN -> fällt heraus
  assert.equal(a.length, 1)
  assert.equal(a[0].art, 'ausgabe')
  assert.equal(a[0].bis, null)   // bis vor von wird verworfen, nicht übernommen
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

test('Annahmen: ein leerer Betrag ist ungültig und wird nicht zu 0 €', () => {
  assert.equal(leseAnnahmen([{ art: 'ausgabe', von: '2027-01', betrag: '' }]).length, 0)
  assert.equal(leseAnnahmen([{ art: 'ausgabe', von: '2027-01', betrag: '  ' }]).length, 0)
  assert.equal(leseAnnahmen([{ art: 'ausgabe', von: '2027-01', betrag: '0' }]).length, 1)
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
function historie(n = 6, o: Partial<HistorieMonat> = {}): HistorieMonat[] {
  return Array.from({ length: n }, (_, i) => ({
    month: addMonate('2026-04', i),
    einnahmen: 3000, ausgaben: 2000, einnahmenEcht: 3000, ausgabenEcht: 2000, lohnNetto: 2000, ...o,
  }))
}

function eingaben(o: Partial<PrognoseEingaben> = {}): PrognoseEingaben {
  return {
    heute: '2026-10-15', monate: 3, liquideKontoIds: ['giro'], liquiditaet: 1000, vermoegen: 10_000,
    vertraege: [], historie: historie(), lohnTag: 1, annahmen: [], ...o,
  }
}

const vertrag = (o: Partial<PrognoseVertrag> = {}): PrognoseVertrag => ({
  id: 'v', name: 'Bauspar', type: 'building_savings', frequency: 'monthly', billing_day: 20, start_date: '2026-01-01',
  end_date: null, auto_renews: true, is_active: true, amount: 600, account_id: 'giro', to_account_id: 'bauspar', ...o,
})

test('Cashflow: Basis ist der Median, Monatsende-Saldo folgt aus Resttagen und vollen Monaten', () => {
  const p = berechnePrognose(eingaben())
  assert.equal(p.basis.lohn, 2000)
  assert.equal(p.basis.einnahmenOhneLohn, 1000)
  assert.equal(p.basis.ausgaben, 2000)
  // Oktober: Lohn (Tag 1) ist schon durch; 16 Resttage: +1000/31*16 − 2000/31*16
  nah(p.monate[0].liquiditaetEnde, 1000 - (1000 / 31) * 16)
  assert.equal(p.monate[0].teilmonat, true)
  // November voll: +3000 − 2000
  nah(p.monate[1].liquiditaetEnde - p.monate[0].liquiditaetEnde, 1000)
})

test('Cashflow: bekannte Abbuchung liegt auf ihrem Tag und wird nicht doppelt gezählt', () => {
  const ohne = berechnePrognose(eingaben())
  const mit = berechnePrognose(eingaben({ vertraege: [vertrag()] }))
  // Gesamtausgaben im November unverändert (600 stecken schon in den 2000 der Basis)…
  nah(mit.monate[1].ausgaben, ohne.monate[1].ausgaben)
  // …aber der Termin ist sichtbar
  assert.deepEqual(mit.termine.map(t => [t.datum, t.betrag]).slice(0, 2), [['2026-10-20', -600], ['2026-11-20', -600]])
})

test('Cashflow: Überträge zwischen zwei liquiden Konten verändern nichts', () => {
  const w = vertragsWirkung(vertrag({ to_account_id: 'tages' }), new Set(['giro', 'tages']))
  assert.equal(w, 0)
  assert.equal(vertragsWirkung(vertrag(), new Set(['giro'])), -600)
  assert.equal(vertragsWirkung(vertrag({ type: 'income', to_account_id: null }), new Set(['giro'])), 600)
})

test('Cashflow: höheres Gehalt ab Dezember ersetzt den Lohn und hebt die Einnahmen genau um die Differenz', () => {
  const basis = berechnePrognose(eingaben({ monate: 4 }))
  const as: Annahme[] = [{ id: 'g', label: 'Gehalt', art: 'lohn', von: '2026-12', bis: null, betrag: 3000, brutto: 4000 }]
  const mit = berechnePrognose(eingaben({ monate: 4, annahmen: as }))
  nah(mit.monate[2].einnahmen - basis.monate[2].einnahmen, 1000)   // Dezember
  nah(mit.monate[1].einnahmen, basis.monate[1].einnahmen)          // November unverändert
  assert.ok(mit.monate[3].liquiditaetEnde > basis.monate[3].liquiditaetEnde)
})

test('Cashflow: Zusatzausgabe wirkt auf Liquidität und Vermögen', () => {
  const as: Annahme[] = [{ id: 'm', label: 'Miete', art: 'ausgabe', von: '2026-11', bis: '2026-11', betrag: 500, brutto: null }]
  const basis = berechnePrognose(eingaben())
  const mit = berechnePrognose(eingaben({ annahmen: as }))
  nah(basis.monate[1].liquiditaetEnde - mit.monate[1].liquiditaetEnde, 500)
  nah(basis.monate[1].vermoegenEnde - mit.monate[1].vermoegenEnde, 500)
})

test('Cashflow: Anlage mindert die Liquidität, aber nicht das Vermögen', () => {
  // Ausgaben 2000, davon nur 1500 Konsum -> 500 gehen in Anlagen
  const p = berechnePrognose(eingaben({ historie: historie(6, { ausgabenEcht: 1500 }) }))
  const dLiq = p.monate[1].liquiditaetEnde - p.monate[0].liquiditaetEnde
  const dNw = p.monate[1].vermoegenEnde - p.monate[0].vermoegenEnde
  nah(dLiq, 1000)
  nah(dNw, 1500)   // Einnahmen 3000 − Konsum 1500
})

test('Cashflow: negative Liquidität erzeugt eine Warnung mit Datum', () => {
  const p = berechnePrognose(eingaben({ liquiditaet: 100, historie: historie(6, { ausgaben: 4000 }) }))
  assert.ok(p.tiefpunkt.betrag < 0)
  assert.ok(p.warnungen.some(w => /negativ/.test(w)))
})

test('Cashflow: ohne Historie bleibt eine ehrliche Warnung statt erfundener Zahlen', () => {
  const p = berechnePrognose(eingaben({ historie: [] }))
  assert.ok(p.warnungen.some(w => /keine abgeschlossenen Monate/.test(w)))
  assert.equal(p.basis.ausgaben, 0)
})

test('Cashflow: am letzten Tag des Monats gibt es keinen Teilmonat', () => {
  const p = berechnePrognose(eingaben({ heute: '2026-10-31', monate: 2 }))
  assert.equal(p.monate[0].month, '2026-11')
  assert.equal(p.monate[0].teilmonat, false)
})

test('Cashflow: Lohn kommt am Eingangstag (Tiefpunkt liegt davor)', () => {
  const p = berechnePrognose(eingaben({ lohnTag: 28, liquiditaet: 0 }))
  // Ausgaben laufen täglich, der Lohn kommt erst am 28.: der Tiefpunkt im November liegt am 27.
  assert.equal(p.monate[1].tiefpunktDatum, '2026-11-27')
})
