import { test } from 'node:test'
import assert from 'node:assert/strict'
import { herabgestufteBuchungen, herabgestufteMonate, monatsTotals, type UmbBuchung, type UmbMonatsZeile } from './herabstufung.ts'

const ICH = new Set(['eric-privat', 'geteilt'])
const ALLE = new Set(['eric-privat', 'geteilt', 'malik-privat'])
const ARTEN = new Set(['echt', 'anlage', 'forderung'])

const mz = (o: Partial<UmbMonatsZeile>): UmbMonatsZeile => ({
  month: '2026-10-01', account_id: 'eric-privat', counterpart_account_id: null, source: 'bank_sync', flow_kind_extern: 'echt',
  category_id: null, category_name: null, root_category_id: null, root_category_name: null, tax_role_effective: null,
  income: 0, expense: 0, tx_count: 1, ...o,
})

test('Monate: Umbuchung zu Konto ausserhalb des Scopes wird echte Ausgabe, intern bleibt neutral', () => {
  const rows = [
    mz({ counterpart_account_id: 'malik-privat', expense: 100 }),   // ich: Haushalt, nicht im Scope -> herab
    mz({ counterpart_account_id: 'geteilt', expense: 50 }),         // beide im Scope -> neutral
    mz({ account_id: 'malik-privat', counterpart_account_id: 'eric-privat', income: 70 }), // Konto nicht im Scope -> weg
  ]
  const ich = herabgestufteMonate(rows, ICH, ARTEN)
  assert.equal(ich.length, 1)
  assert.equal(ich[0].expense, 100)
  assert.equal(ich[0].flow_kind, 'echt')
  // gemeinsam: alle Konten im Scope -> alles neutral
  assert.equal(herabgestufteMonate(rows, ALLE, ARTEN).length, 0)
})

test('Monate: ohne Gegenkonto herabgestuft; Art nicht im Filter faellt weg', () => {
  const rows = [mz({ counterpart_account_id: null, income: 10, flow_kind_extern: 'anlage' })]
  assert.equal(herabgestufteMonate(rows, ICH, ARTEN).length, 1)
  assert.equal(herabgestufteMonate(rows, ICH, new Set(['echt'])).length, 0)
  assert.equal(herabgestufteMonate([mz({ flow_kind_extern: null, expense: 5 })], ICH, ARTEN).length, 0)
})

const bu = (o: Partial<UmbBuchung>): UmbBuchung => ({
  id: 'b1', date: '2026-10-05', amount_eur: 30, signed_amount: -30, source: 'bank_sync', account_id: 'eric-privat',
  counterpart_account_id: 'malik-privat', flow_kind_extern: 'echt', category_id: null, category_name: null,
  root_category_id: null, root_category_name: null, description: null, merchant: null, tax_role_effective: null, ...o,
})

test('Buchungen: Richtung aus signed_amount, Betrag positiv', () => {
  const [aus] = herabgestufteBuchungen([bu({})], ICH, ICH, ARTEN)
  assert.equal(aus.type, 'expense')
  assert.equal(aus.amount, 30)
  const [ein] = herabgestufteBuchungen([bu({ id: 'b2', signed_amount: 30 })], ICH, ICH, ARTEN)
  assert.equal(ein.type, 'income')
})

test('Buchungen: manuelle Umbuchung zaehlt auf der Zugangsseite als Einnahme, wenn nur das Gegenkonto im Scope liegt', () => {
  const r = bu({ id: 'm1', source: 'manual', account_id: 'malik-privat', counterpart_account_id: 'eric-privat', signed_amount: -30 })
  const out = herabgestufteBuchungen([r], ICH, ICH, ARTEN)
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'm1:zu')
  assert.equal(out[0].type, 'income')
  assert.equal(out[0].account_id, 'eric-privat')
  // Bank-Sync hat beide Seiten als eigene Zeilen: keine synthetische Zugangsseite
  assert.equal(herabgestufteBuchungen([{ ...r, source: 'bank_sync' }], ICH, ICH, ARTEN).length, 0)
})

test('Buchungen: Kontenauswahl schraenkt ein', () => {
  assert.equal(herabgestufteBuchungen([bu({})], new Set(['geteilt']), ICH, ARTEN).length, 0)
})

test('monatsTotals summiert wie monthly_flow_totals und sortiert absteigend', () => {
  const t = monatsTotals([
    { month: '2026-09-01', flow_kind: 'echt', income: 100, expense: 40, tx_count: 3 },
    { month: '2026-10-01', flow_kind: 'echt', income: 0, expense: 10, tx_count: 1 },
    { month: '2026-10-01', flow_kind: 'anlage', income: 5, expense: 20, tx_count: 2 },
    { month: '2026-10-01', flow_kind: 'forderung', income: 1, expense: 2, tx_count: 1 },
  ])
  assert.deepEqual(t.map(m => m.month), ['2026-10-01', '2026-09-01'])
  const okt = t[0]
  assert.equal(okt.income, 6)
  assert.equal(okt.expense, 32)
  assert.equal(okt.echt_expense, 10)
  assert.equal(okt.anlage_expense, 20)
  assert.equal(okt.forderung_income, 1)
  assert.equal(okt.tx_count, 4)
})

// ─── Szenarien: Ich / Partner / Gemeinsam, jede Umbuchung genau einmal ──────────────────────────
// Konten: E = Eric privat, G = geteilt, M = Malik privat. Zeilen wie die View monthly_umbuchungen sie liefert:
// manuell = eine Zeile je Umbuchung -> Abgang (Konto, Gegenkonto) UND Spiegelzeile (Gegenkonto, Konto) mit Zugang.

type Umb = { von: string; nach: string | null; betrag: number }
const SC = { ich: new Set(['E', 'G']), partner: new Set(['M', 'G']), gemeinsam: new Set(['E', 'G', 'M']) }

function viewZeilen(umb: Umb[]): UmbMonatsZeile[] {
  const out: UmbMonatsZeile[] = []
  for (const u of umb) {
    out.push(mz({ account_id: u.von, counterpart_account_id: u.nach, source: 'manual', expense: u.betrag }))
    if (u.nach) out.push(mz({ account_id: u.nach, counterpart_account_id: u.von, source: 'manual', income: u.betrag }))
  }
  return out
}
/** Wie die Abfrage: nur Zeilen mit Konto im Scope laden, dann herabstufen. */
function netto(zeilen: UmbMonatsZeile[], scope: ReadonlySet<string>, nurKonto?: string): number {
  const geladen = zeilen.filter(z => z.account_id && scope.has(z.account_id))
  return herabgestufteMonate(geladen, scope, ARTEN)
    .filter(r => !nurKonto || r.account_id === nurKonto)
    .reduce((s, r) => s + r.income - r.expense, 0)
}
function pruefe(umb: Umb[], erwartet: { ich: number; partner: number; gemeinsam: number }) {
  const z = viewZeilen(umb)
  const ich = netto(z, SC.ich), partner = netto(z, SC.partner), gemeinsam = netto(z, SC.gemeinsam)
  assert.deepEqual({ ich, partner, gemeinsam }, erwartet)
  // Gemeinsam = Ich + Partner - was auf dem geteilten Konto G in beiden Sichten steckt
  assert.equal(gemeinsam, ich + partner - netto(z, SC.ich, 'G') - netto(z, SC.partner, 'G'))
}

test('Szenario privat -> geteilt: Ich neutral, Malik +100, Gemeinsam neutral', () => {
  pruefe([{ von: 'E', nach: 'G', betrag: 100 }], { ich: 0, partner: 100, gemeinsam: 0 })
})
test('Szenario privat -> extern: Ich -40, Malik 0, Gemeinsam -40 (einmal)', () => {
  pruefe([{ von: 'E', nach: null, betrag: 40 }], { ich: -40, partner: 0, gemeinsam: -40 })
})
test('Szenario Eric-privat -> Malik-privat: Ich -30, Malik +30, Gemeinsam neutral', () => {
  pruefe([{ von: 'E', nach: 'M', betrag: 30 }], { ich: -30, partner: 30, gemeinsam: 0 })
})
test('Szenario alle drei zusammen: Identitaet gilt, jede Umbuchung zaehlt genau einmal', () => {
  pruefe(
    [{ von: 'E', nach: 'G', betrag: 100 }, { von: 'E', nach: null, betrag: 40 }, { von: 'E', nach: 'M', betrag: 30 }, { von: 'G', nach: 'M', betrag: 7 }],
    { ich: -30 - 40 - 7, partner: 100 + 30 + 0, gemeinsam: -40 },
  )
})

test('flows.ts liefert nur die Basis (keine zweite Herabstufung neben flows-scope.ts)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../data/flows.ts', import.meta.url), 'utf8')
  assert.ok(!/wirdHerabgestuft|monthly_umbuchungen|flow_kind_extern/.test(src))
})
