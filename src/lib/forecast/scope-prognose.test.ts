import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueTage } from './historie.ts'
import { erkenneEinmalposten, unregelmaessigeEinlagen, EINLAGE_GRUND, type EinmalBuchung } from './einmalig.ts'
import { baueScopeHistorie, type ScopeBuchung } from './scope-historie.ts'
import {
  annahmenKey, historieReicht, lernStart, steuerErlaubt, ueberschreibungKey, MIN_HISTORIE_TAGE,
} from './scope-regeln.ts'
import { ANNAHMEN_KEY } from './annahmen.ts'
import { UEBERSCHREIBUNG_KEY } from './einmalig.ts'
import { buchungenFuer, GETEILT, GIRO, HEUTE, laufFuer, STAND } from './scope-fixture.ts'

const KEINE = { aus: [], ein: [] }

test('Scope-Schlüssel: Ich behält den bisherigen Schlüssel, Partner/Gemeinsam bekommen ein Suffix', () => {
  assert.equal(annahmenKey('ich'), ANNAHMEN_KEY)
  assert.equal(ueberschreibungKey('ich'), UEBERSCHREIBUNG_KEY)
  assert.equal(annahmenKey('partner'), `${ANNAHMEN_KEY}:partner`)
  assert.equal(annahmenKey('gemeinsam'), `${ANNAHMEN_KEY}:gemeinsam`)
  assert.equal(ueberschreibungKey('partner'), `${UEBERSCHREIBUNG_KEY}:partner`)
  assert.equal(ueberschreibungKey('gemeinsam'), `${UEBERSCHREIBUNG_KEY}:gemeinsam`)
  assert.equal(new Set(['ich', 'partner', 'gemeinsam'].map(s => annahmenKey(s as 'ich'))).size, 3)
})

test('Steuerprognose nur in der Ansicht Ich', () => {
  assert.equal(steuerErlaubt('ich'), true)
  assert.equal(steuerErlaubt('partner'), false)
  assert.equal(steuerErlaubt('gemeinsam'), false)
})

test('Regression Ich: Historie und Einmalposten identisch zur bisherigen Rechnung, auch mit herabgestuften Zeilen', () => {
  // Die Partner-Fixture enthält herabgestufte Einlagen; für 'ich' dürfen sie keinen Unterschied machen.
  const roh = buchungenFuer('partner')
  const alt = (() => {
    const ohneFlag: EinmalBuchung[] = roh.map(b => ({ ...b, herabgestuft: undefined }))
    const einmal = erkenneEinmalposten(ohneFlag, KEINE, HEUTE)
    return { tage: baueTage(ohneFlag, einmal.ausgeschlossen), kandidaten: einmal.kandidaten }
  })()
  const neu = baueScopeHistorie('ich', roh, [GIRO, GETEILT], KEINE, HEUTE)
  assert.deepEqual(neu.tage, alt.tage)
  assert.deepEqual(neu.kandidaten, alt.kandidaten)
  assert.equal(neu.start, null)
  assert.equal(neu.zuWenigHistorie, false)
  // und die ganze Prognose für Ich ist alt = neu
  assert.deepEqual(laufFuer('ich', true).prognose, laufFuer('ich', false).prognose)
})

test('Invarianten der Stände: Liquidität und Vermögen gehören zum selben Scope', () => {
  // Gemeinsam = Ich-Konten + Partner-Konten, das geteilte Konto genau einmal.
  assert.deepEqual([...STAND.gemeinsam.liquide].sort(), [GETEILT, GIRO].sort())
  assert.equal(new Set(STAND.gemeinsam.liquide).size, STAND.gemeinsam.liquide.length)
  assert.equal(STAND.gemeinsam.liquiditaet, STAND.ich.liquiditaet)   // Ich enthält das geteilte Konto bereits
  assert.ok(STAND.partner.liquiditaet < STAND.gemeinsam.liquiditaet)
  // Startvermögen nach dem Fix: Reihe des Scopes, nicht der Snapshot des Eigentümers.
  for (const scope of ['ich', 'partner', 'gemeinsam'] as const) {
    const alt = laufFuer(scope, false).prognose.start
    const neu = laufFuer(scope, true).prognose.start
    assert.equal(neu.vermoegen, STAND[scope].vermoegenReihe)
    assert.ok(neu.vermoegen >= neu.liquiditaet - 0.01, `${scope}: Vermögen >= Liquidität`)
    assert.equal(alt.vermoegen, STAND[scope].vermoegenSnapshot)
  }
  // Der Vorfehler: im Scope Partner stand das Vermögen des Eigentümers über der Liquidität des Scopes.
  assert.ok(laufFuer('partner', false).prognose.start.vermoegen > 100 * laufFuer('partner', false).prognose.start.liquiditaet)
  assert.ok(laufFuer('partner', true).prognose.start.vermoegen < 2 * laufFuer('partner', true).prognose.start.liquiditaet)
})

const einmal = (id: string, date: string, type: 'income' | 'expense', amount: number): EinmalBuchung => ({
  id, date, type, amount, flow_kind: 'echt', tax_role: null, gegenpartei: null, kategorie: null, herabgestuft: true,
})

test('Einlagen: gleicher Betrag und Tag in 3 Monaten = regelmäßig, sonst unregelmäßig', () => {
  const regelmaessig = [
    einmal('r1', '2026-08-05', 'income', 450), einmal('r2', '2026-09-06', 'income', 460), einmal('r3', '2026-10-04', 'income', 440),
  ]
  assert.equal(unregelmaessigeEinlagen(regelmaessig).size, 0)
  // nur zwei Monate: kein Muster
  assert.equal(unregelmaessigeEinlagen(regelmaessig.slice(0, 2)).size, 2)
  // unterschiedliche Beträge: kein Muster
  const bunt = [einmal('b1', '2026-08-05', 'income', 900), einmal('b2', '2026-09-05', 'income', 1500), einmal('b3', '2026-10-05', 'income', 750)]
  assert.equal(unregelmaessigeEinlagen(bunt).size, 3)
  // Einnahme und Ausgabe zählen getrennt
  const gemischt = [...regelmaessig.slice(0, 2), einmal('x', '2026-10-05', 'expense', 450)]
  assert.equal(unregelmaessigeEinlagen(gemischt).size, 3)
  // Nicht herabgestufte Buchungen sind nie Einlagen
  assert.equal(unregelmaessigeEinlagen([{ ...einmal('n', '2026-10-05', 'income', 450), herabgestuft: false }]).size, 0)
})

test('Einlagen: unregelmäßige sind Kandidaten "Einlage/Entnahme Haushalt", standardmäßig ausgeschlossen, regelmäßige bleiben im Lernen', () => {
  const roh: EinmalBuchung[] = [
    einmal('r1', '2026-08-05', 'income', 450), einmal('r2', '2026-09-06', 'income', 460), einmal('r3', '2026-10-04', 'income', 440),
    einmal('u1', '2026-09-18', 'expense', 900), einmal('u2', '2026-10-02', 'expense', 1500),
  ]
  const e = erkenneEinmalposten(roh, KEINE, HEUTE)
  const ids = e.kandidaten.map(k => k.id).sort()
  assert.deepEqual(ids, ['u1', 'u2'])
  assert.ok(e.kandidaten.every(k => k.grund === EINLAGE_GRUND && k.einlage === true && k.ausgeschlossen))
  assert.deepEqual([...e.ausgeschlossen].sort(), ['u1', 'u2'])
  const tage = baueTage(roh, e.ausgeschlossen)
  assert.equal(tage.reduce((s, t) => s + t.ausgaben, 0), 0)       // die Entnahmen verzerren die Standardprognose nicht
  assert.equal(tage.reduce((s, t) => s + t.einnahmen, 0), 1350)   // die regelmäßige Einlage bleibt
  // Der Nutzer holt einen Posten zurück (Überschreibung `ein`).
  const zurueck = erkenneEinmalposten(roh, { aus: [], ein: ['u1'] }, HEUTE)
  assert.equal(zurueck.ausgeschlossen.has('u1'), false)
  assert.equal(zurueck.ausgeschlossen.has('u2'), true)
})

test('Einlagen in der Partner-Ansicht: die unregelmäßigen Einlagen der Fixture bleiben aus dem Muster', () => {
  const h = baueScopeHistorie('partner', buchungenFuer('partner'), [GETEILT], KEINE, HEUTE)
  const einlagen = h.kandidaten.filter(k => k.einlage)
  assert.equal(einlagen.length, 12)
  const alt = baueScopeHistorie('ich', buchungenFuer('partner'), [GETEILT], KEINE, HEUTE)
  const summe = (t: { einnahmen: number; ausgaben: number }[]) => t.reduce((s, x) => s + x.einnahmen + x.ausgaben, 0)
  assert.ok(summe(h.tage) < summe(alt.tage) - 10000)
})

test('Lernbeginn: Ich unbegrenzt, Partner/Gemeinsam ab dem jüngsten ersten Buchungstag der liquiden Konten', () => {
  const erste = new Map([[GIRO, '2024-08-20'], [GETEILT, '2026-07-15']])
  assert.equal(lernStart('ich', erste, [GIRO, GETEILT]), null)
  assert.equal(lernStart('gemeinsam', erste, [GIRO, GETEILT]), '2026-07-15')
  assert.equal(lernStart('partner', erste, [GETEILT]), '2026-07-15')
  // Konten ohne Buchungen blockieren nicht
  assert.equal(lernStart('gemeinsam', erste, [GIRO, 'leer']), '2024-08-20')
  const h = baueScopeHistorie('gemeinsam', buchungenFuer('gemeinsam'), [GIRO, GETEILT], KEINE, HEUTE)
  assert.ok(h.start !== null && h.start >= '2026-07-15')
  assert.ok(h.tage.every(t => t.datum >= '2026-07-15'))
})

test('Mindesthistorie: unter 3 Monaten im Scope keine Prognose, Ich nie betroffen', () => {
  assert.equal(MIN_HISTORIE_TAGE, 90)
  assert.equal(historieReicht(null, HEUTE), true)
  assert.equal(historieReicht('2026-07-30', HEUTE), true)    // 90 Tage
  assert.equal(historieReicht('2026-07-31', HEUTE), false)   // 89 Tage
  // Fixture mit erster Buchung 6 Wochen vor heute
  const jung: ScopeBuchung[] = buchungenFuer('partner').filter(b => b.date >= '2026-09-15')
  assert.equal(baueScopeHistorie('partner', jung, [GETEILT], KEINE, HEUTE).zuWenigHistorie, true)
  assert.equal(baueScopeHistorie('ich', jung, [GETEILT], KEINE, HEUTE).zuWenigHistorie, false)
  // Die echten Daten reichen (104 Tage)
  assert.equal(laufFuer('partner', true).historie.zuWenigHistorie, false)
})

test('Lohn: ohne erkennbaren Lohn (Partner) keine Lohn-Warnung, kein Lohn-Artefakt am 1. des Monats', () => {
  const partner = laufFuer('partner', true).prognose
  assert.equal(partner.basis.lohn, 0)
  assert.equal(partner.warnungen.some(w => w.includes('kein Lohn')), false)
  // Ich behält die Warnung, wenn kein Lohn gebucht ist (Verhalten unverändert)
  assert.equal(laufFuer('ich', true).prognose.warnungen.some(w => w.includes('kein Lohn')), true)
})

test('Gemeinsam enthält jeden Vertrag genau einmal, Partner ohne eigene Verträge hat keine Termine', () => {
  const gem = laufFuer('gemeinsam', true).eingaben.vertraege
  assert.equal(new Set(gem.map(v => v.id)).size, gem.length)
  assert.equal(laufFuer('partner', true).prognose.termine.length, 0)
})
