import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueAnalyseKategorien, kategorienFenster, TREND_MONATE, WEITERE_KEY, type KategorienEingabe } from './kategorien.ts'

const zeile = (month: string, root: string | null, expense: number, income = 0) => ({
  flow_kind: 'echt', income, expense, month,
  root_category_id: root, root_category_name: root ? `Kat ${root}` : null,
  category_id: root, category_name: root ? `Kat ${root}` : null,
})

const basis = (extra: Partial<KategorienEingabe> = {}): KategorienEingabe => ({
  monatsZeilen: [],
  categories: [{ id: 'a', color: '#123456', icon: 'X' }],
  include: { anlage: true, forderung: true },
  heute: '2026-10-23',
  // 6M: Mai..Okt, Vergleich Nov..Apr davor.
  fenster: { von: '2026-05-01', bis: '2026-10-01' },
  vergleichsFenster: { von: '2025-11-01', bis: '2026-04-01' },
  vergleich: 'vorperiode',
  fruehesterMonat: '2025-01-01',
  monat: null,
  locale: 'de-DE',
  ...extra,
})

test('Fenster: Seite gilt, solange kein Monat gewaehlt und Historie reicht', () => {
  const f = kategorienFenster(basis())
  assert.deepEqual(f.aktuell, { von: '2026-05-01', bis: '2026-10-01' })
  assert.deepEqual(f.vor, { von: '2025-11-01', bis: '2026-04-01' })
})

test('Fenster: Historie beginnt nach dem Vergleichsfenster -> kein Vergleich', () => {
  assert.equal(kategorienFenster(basis({ fruehesterMonat: '2026-02-01' })).vor, null)
})

test('Fenster: Monats-Drilldown vergleicht mit Vormonat bzw. Vorjahresmonat', () => {
  assert.deepEqual(kategorienFenster(basis({ monat: '2026-07' })).vor, { von: '2026-06-01', bis: '2026-06-01' })
  const jahr = kategorienFenster(basis({ monat: '2026-07', vergleich: 'vorjahr' }))
  assert.deepEqual(jahr.aktuell, { von: '2026-07-01', bis: '2026-07-01' })
  assert.deepEqual(jahr.vor, { von: '2025-07-01', bis: '2025-07-01' })
  assert.equal(kategorienFenster(basis({ monat: '2026-07', vergleich: 'aus' })).vor, null)
})

test('Fenster: Vergleichsmonat jenseits der geladenen 24 Monate -> kein Vergleich', () => {
  assert.equal(kategorienFenster(basis({ monat: '2024-09', fruehesterMonat: '2020-01-01' })).vor, null)
})

test('Ansicht: nur Zeilen im Fenster zaehlen, Vorperiode aus dem Vergleichsfenster', () => {
  const d = baueAnalyseKategorien(basis({
    monatsZeilen: [
      zeile('2026-09-01', 'a', 100), zeile('2026-10-01', 'a', 50),
      zeile('2026-03-01', 'a', 90), // Vergleichsfenster
      zeile('2025-06-01', 'a', 999), // weder noch
    ],
  }))
  const a = d.modi.ausgaben.ansicht
  assert.equal(a.total, 150)
  assert.equal(a.vorTotal, 90)
  assert.equal(a.zeilen[0].vorBetrag, 90)
  assert.equal(d.vergleich.aktiv, true)
  assert.equal(d.vergleich.art, 'vorperiode')
  assert.equal(d.modi.ausgaben.darstellung['a'].farbe, '#123456')
})

test('Ansicht: ohne belastbaren Vergleich kein Vorbetrag', () => {
  const d = baueAnalyseKategorien(basis({ fruehesterMonat: '2026-06-01', monatsZeilen: [zeile('2026-09-01', 'a', 10)] }))
  assert.equal(d.vergleich.aktiv, false)
  assert.equal(d.vergleich.art, null)
  assert.equal(d.modi.ausgaben.ansicht.vorTotal, null)
})

test('Ansicht: Zeitraum Alles nimmt alle Zeilen', () => {
  const d = baueAnalyseKategorien(basis({
    fenster: null, vergleichsFenster: null,
    monatsZeilen: [zeile('2025-01-01', 'a', 10), zeile('2026-10-01', 'a', 5)],
  }))
  assert.equal(d.modi.ausgaben.ansicht.total, 15)
  assert.equal(d.ganzeHistorie, true)
})

test('Ausgaben und Einnahmen getrennt', () => {
  const d = baueAnalyseKategorien(basis({
    monatsZeilen: [zeile('2026-10-01', 'a', 40), zeile('2026-10-01', 'b', 0, 300)],
  }))
  assert.equal(d.modi.ausgaben.ansicht.total, 40)
  assert.equal(d.modi.einnahmen.ansicht.total, 300)
})

test('Trend: 12 Monate bis zum laufenden Monat, Luecken sind 0', () => {
  const d = baueAnalyseKategorien(basis({
    monatsZeilen: [zeile('2026-10-01', 'a', 50), zeile('2026-08-01', 'a', 30), zeile('2026-08-01', 'a', 20)],
  }))
  assert.equal(d.monate.length, TREND_MONATE)
  assert.equal(d.monate[0], '2025-11-01')
  assert.equal(d.monate[TREND_MONATE - 1], '2026-10-01')
  const t = d.modi.ausgaben.trend['a']
  assert.equal(t[TREND_MONATE - 1], 50)
  assert.equal(t[TREND_MONATE - 2], 0)
  assert.equal(t[TREND_MONATE - 3], 50)
})

test('Trend: Weitere ist die Summe der zusammengefassten Kategorien', () => {
  const ids = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']
  const d = baueAnalyseKategorien(basis({
    monatsZeilen: ids.map((id, i) => zeile('2026-10-01', id, 100 - i)),
  }))
  const m = d.modi.ausgaben
  assert.equal(m.ansicht.weitere.length, 2)
  assert.equal(m.trend[WEITERE_KEY][TREND_MONATE - 1], 94 + 93)
  assert.equal(m.trend['k1'][TREND_MONATE - 1], 100)
})

test('Laufender Monat: unvollstaendig, bis er vorbei ist', () => {
  assert.deepEqual(baueAnalyseKategorien(basis()).laufenderMonat, { tag: 23, tageImMonat: 31, unvollstaendig: true })
  assert.equal(baueAnalyseKategorien(basis({ heute: '2026-10-31' })).laufenderMonat.unvollstaendig, false)
  assert.equal(baueAnalyseKategorien(basis({ heute: '2028-02-29' })).laufenderMonat.tageImMonat, 29)
})
