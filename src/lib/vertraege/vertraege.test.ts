import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ansichtVon, datumText, fixkostenNachKonto, gruppiere, kennzahlen, kuendigung, naechsterTermin, proJahr, proMonat, relativTage,
  type Vertrag,
} from './rechnen.ts'
import { abbuchungsVerlauf, verlaufKennzahlen, type VerlaufBuchung } from './verlauf.ts'

const basis: Vertrag = {
  id: 'a', name: 'Netflix', type: 'subscription', provider: null, amount: 12, currency: 'EUR', frequency: 'monthly',
  start_date: '2026-01-10', end_date: null, notice_days: 0, auto_renews: true, billing_day: null, is_active: true,
  account_id: 'k1', to_account_id: null, category_id: null, notes: null,
}
const v = (o: Partial<Vertrag>): Vertrag => ({ ...basis, ...o })

test('Monatsumrechnung aller Intervalle', () => {
  assert.equal(proMonat(12, 'monthly'), 12)
  assert.equal(proMonat(30, 'quarterly'), 10)
  assert.equal(proMonat(60, 'biannual'), 10)
  assert.equal(proMonat(120, 'yearly'), 10)
  assert.ok(Math.abs(proMonat(12, 'weekly') - 52) < 1e-9)
  assert.ok(Math.abs(proMonat(12, 'biweekly') - 26) < 1e-9)
  assert.equal(proJahr(10, 'monthly'), 120)
  assert.equal(proMonat(5, 'unbekannt'), 5)
})

test('Nächster Termin: Abrechnungstag, heute zählt, Monatsende gekappt, Quartal', () => {
  assert.equal(naechsterTermin(v({ billing_day: 16 }), '2026-10-26'), '2026-11-16')
  assert.equal(naechsterTermin(v({ billing_day: 26 }), '2026-10-26'), '2026-10-26')
  assert.equal(naechsterTermin(v({ billing_day: 31 }), '2026-02-01'), '2026-02-28')
  // Quartal ab Januar: Jan, Apr, Jul, Okt
  assert.equal(naechsterTermin(v({ frequency: 'quarterly', billing_day: 5 }), '2026-10-26'), '2027-01-05')
  assert.equal(naechsterTermin(v({ frequency: 'yearly', start_date: '2026-03-01' }), '2026-10-26'), '2027-03-01')
})

test('Nächster Termin: ohne Verlängerung nach dem Ende kein Termin; inaktiv nie', () => {
  assert.equal(naechsterTermin(v({ end_date: '2026-09-01', auto_renews: false }), '2026-10-26'), null)
  assert.equal(naechsterTermin(v({ is_active: false }), '2026-10-26'), null)
  assert.equal(naechsterTermin(v({ frequency: 'weekly', start_date: '2026-10-01' }), '2026-10-26'), '2026-10-29')
})

test('Kündigung: bald, später, verstrichen, endet, beendet, keine', () => {
  const heute = '2026-10-26'
  assert.deepEqual(kuendigung(v({}), heute), { status: 'keine', frist: null, tage: null })
  assert.deepEqual(kuendigung(v({ end_date: '2026-12-01', notice_days: 14 }), heute), { status: 'bald', frist: '2026-11-17', tage: 22 })
  assert.equal(kuendigung(v({ end_date: '2027-06-01', notice_days: 30 }), heute).status, 'spaeter')
  assert.equal(kuendigung(v({ end_date: '2026-11-10', notice_days: 30 }), heute).status, 'verstrichen')
  // Frist ist heute: noch möglich
  assert.equal(kuendigung(v({ end_date: '2026-11-25', notice_days: 30 }), heute).status, 'bald')
  assert.equal(kuendigung(v({ end_date: '2026-12-01', auto_renews: false }), heute).status, 'endet')
  assert.equal(kuendigung(v({ end_date: '2026-09-01', auto_renews: false }), heute).status, 'beendet')
  // Enddatum vorbei, verlängert sich: keine Frist mehr relevant
  assert.equal(kuendigung(v({ end_date: '2026-09-01' }), heute).status, 'keine')
  assert.equal(kuendigung(v({ end_date: '2026-12-01', is_active: false }), heute).status, 'keine')
  // Frist 0 Tage: Frist = Enddatum
  assert.equal(kuendigung(v({ end_date: '2026-10-26', notice_days: 0 }), heute).status, 'bald')
})

test('Datum und relative Tage', () => {
  assert.equal(datumText('2026-10-05'), '05.10.2026')
  assert.equal(datumText('2026-10-05', 'MM/dd/yyyy'), '10/05/2026')
  assert.equal(datumText('2026-10-05T10:00:00Z', 'yyyy-MM-dd'), '2026-10-05')
  assert.equal(datumText(null), '—')
  assert.equal(relativTage(0), 'heute')
  assert.equal(relativTage(1), 'morgen')
  assert.equal(relativTage(5), 'in 5 Tagen')
  assert.equal(relativTage(-2), 'vor 2 Tagen')
})

test('Ansicht aus URL-Parameter', () => {
  assert.equal(ansichtVon('sparraten'), 'sparraten')
  assert.equal(ansichtVon(['inaktiv', 'x']), 'inaktiv')
  assert.equal(ansichtVon('quatsch'), 'alle')
  assert.equal(ansichtVon(undefined), 'alle')
})

const liste: Vertrag[] = [
  v({ id: '1', name: 'Zeitung', billing_day: 20, amount: 10 }),
  v({ id: '2', name: 'Anthropic', billing_day: 28, amount: 100 }),
  v({ id: '3', name: 'Bauspar', type: 'building_savings', billing_day: 3, amount: 15, account_id: null, to_account_id: 'k2' }),
  v({ id: '4', name: 'Alt', is_active: false, amount: 99 }),
  v({ id: '5', name: 'Versicherung', type: 'insurance', frequency: 'yearly', start_date: '2026-03-01', amount: 120, end_date: '2026-12-01', notice_days: 30 }),
  v({ id: '6', name: 'Dollar', currency: 'USD', amount: 5, billing_day: 1 }),
]

test('Gruppen: Fixkosten/Sparraten/Inaktiv, nach nächstem Termin sortiert', () => {
  const g = gruppiere(liste, '2026-10-26')
  assert.deepEqual(g.fixkosten.map(x => x.id), ['2', '6', '1', '5'])
  assert.deepEqual(g.sparraten.map(x => x.id), ['3'])
  assert.deepEqual(g.inaktiv.map(x => x.id), ['4'])
})

test('Kennzahlen: Sparraten zählen nicht als Fixkosten, Fremdwährung getrennt', () => {
  const k = kennzahlen(liste, 25, new Set(['1', '4']), '2026-10-26')
  assert.equal(k.anzahlFixkosten, 4)
  assert.equal(k.anzahlSparraten, 1)
  assert.equal(k.monatlich, 10 + 100 + 10) // Zeitung, Anthropic, Versicherung (120/12); Dollar nicht
  assert.equal(k.jahr, 1440)
  assert.equal(k.sparMonatlich, 15 + 25)
  assert.equal(k.fremdwaehrung, 1)
  assert.equal(k.ohneAbbuchung, 1) // '4' ist inaktiv und zählt nicht
  assert.equal(k.naechsteAbbuchung?.id, '2')
  assert.equal(k.naechsteAbbuchung?.tage, 2)
  // Frist der Versicherung: 2026-12-01 minus 30 Tage = 2026-11-01
  assert.equal(k.naechsteKuendigung?.id, '5')
  assert.equal(k.naechsteKuendigung?.frist, '2026-11-01')
})

test('Fixkosten nach Konto', () => {
  const r = fixkostenNachKonto(liste, id => (id === 'k1' ? 'Giro' : undefined))
  assert.deepEqual(r.map(x => [x.name, Math.round(x.monatlich)]), [['Giro', 120]])
})

const sparplan = v({ id: 's', amount: 50, billing_day: 10 })
const b = (id: string, date: string, amount: number, extra: Partial<VerlaufBuchung> = {}): VerlaufBuchung =>
  ({ id, account_id: 'k1', date, amount, type: 'expense', text: 'X', ...extra })

test('Verlauf: Zuordnung, Verzug, fehlende Buchung, keine Doppelzuordnung', () => {
  const heute = '2026-10-26'
  const z = abbuchungsVerlauf(sparplan, [
    b('1', '2026-10-10', 50),
    b('2', '2026-09-12', 50.4), // zwei Tage später, kleine Abweichung
    b('3', '2026-07-10', 50),
    b('4', '2026-08-10', 50, { account_id: 'anderes' }),
    b('5', '2026-06-10', 50, { type: 'income' }),
  ], heute, 5)
  assert.deepEqual(z.map(x => x.termin), ['2026-10-10', '2026-09-10', '2026-08-10', '2026-07-10', '2026-06-10'])
  assert.deepEqual(z.map(x => x.status), ['eingegangen', 'eingegangen', 'offen', 'eingegangen', 'offen'])
  assert.ok(Math.abs((z[1].abweichung ?? 0) - 0.4) < 1e-9)
  const k = verlaufKennzahlen(z, 50)
  assert.equal(k.anzahlGebucht, 3)
  assert.equal(k.offen, 2)
  assert.equal(k.letzterBetrag, null)
})

test('Verlauf: Termin in Karenzzeit ist erwartet; Preisänderung wird gemeldet', () => {
  const z = abbuchungsVerlauf(sparplan, [b('1', '2026-09-10', 58)], '2026-10-12', 2)
  // 58 liegt außerhalb der Toleranz (2,50): keine Zuordnung
  assert.deepEqual(z.map(x => x.status), ['erwartet', 'offen'])
  const z2 = abbuchungsVerlauf(sparplan, [b('1', '2026-09-10', 52)], '2026-10-12', 2)
  assert.equal(verlaufKennzahlen(z2, 50).letzterBetrag, 52)
})

test('Verlauf: ohne Konto leer', () => {
  assert.deepEqual(abbuchungsVerlauf({ ...sparplan, account_id: null }, [], '2026-10-26'), [])
})

test('Verlauf: Gleichstand beim Datum entscheidet der nähere Betrag, nicht die Reihenfolge', () => {
  // Amazon 8,99 am 16.; am 18. liegen „Amazon 8,99“ und „REWE 8,98“ beide zwei Tage daneben.
  const amazon = v({ id: 'a', amount: 8.99, billing_day: 16 })
  const rewe = b('r', '2026-10-18', 8.98, { text: 'REWE' })
  const richtig = b('a', '2026-10-18', 8.99, { text: 'Amazon' })
  for (const reihenfolge of [[rewe, richtig], [richtig, rewe]]) {
    const z = abbuchungsVerlauf(amazon, reihenfolge, '2026-10-26', 1)
    assert.equal(z[0].buchung?.id, 'a')
    assert.equal(z[0].abweichung, 0)
  }
})
