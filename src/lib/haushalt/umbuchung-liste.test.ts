import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  artFragment, effektiveBuchung, effektiveBuchungen, gueltigeKontoIds, herabstufungsIds, typFragment,
  wendeHerabFilterAn, type BuchungsZeile,
} from './umbuchung.ts'
import { summiereTreffer } from '../transaktionen/berechnen.ts'

// Konten (UUIDs): Eric Giro/Sparkonto, Malik Giro, gemeinsames Haushaltskonto, fremdes Konto
const E_GIRO = '11111111-1111-4111-8111-111111111111'
const E_SPAR = '22222222-2222-4222-8222-222222222222'
const M_GIRO = '33333333-3333-4333-8333-333333333333'
const GEMEINSAM = '44444444-4444-4444-8444-444444444444'
const FREMD = '55555555-5555-4555-8555-555555555555'

const SCOPE_ICH = [E_GIRO, E_SPAR]
const SCOPE_PARTNER = [M_GIRO]
const SCOPE_GEMEINSAM = [E_GIRO, E_SPAR, M_GIRO, GEMEINSAM]

type Z = BuchungsZeile & { id: string; amount: number }
const bank = (id: string, konto: string, gegen: string | null, signed: number, art = 'umbuchung', extern = 'echt'): Z => ({
  id, account_id: konto, counterpart_account_id: gegen, signed_amount: signed, amount: Math.abs(signed),
  type: art === 'umbuchung' ? 'transfer' : signed > 0 ? 'income' : 'expense', flow_kind: art, flow_kind_extern: extern,
})

const FIXTURE: Z[] = [
  bank('eric-zu-malik', E_GIRO, M_GIRO, -300), // Eric privat -> Malik privat
  bank('malik-zu-eric', E_GIRO, M_GIRO, 120), // Eingang von Malik auf Erics Giro
  bank('giro-zu-spar', E_GIRO, E_SPAR, -500), // intern in 'ich'
  bank('giro-zu-gemeinsam', E_GIRO, GEMEINSAM, -200), // privat -> geteilt
  bank('gehalt', E_GIRO, null, 2500, 'echt', 'echt'), // normale Buchung
  bank('depot-sparplan', E_GIRO, null, -100, 'anlage', 'anlage'),
  // manuelle Umbuchung (eine Zeile, transfer_to = counterpart_account_id)
  { id: 'manuell-extern', account_id: E_GIRO, counterpart_account_id: FREMD, signed_amount: -50, amount: 50, type: 'transfer', flow_kind: 'umbuchung', flow_kind_extern: 'echt' },
  { id: 'manuell-intern', account_id: E_GIRO, counterpart_account_id: E_SPAR, signed_amount: -70, amount: 70, type: 'transfer', flow_kind: 'umbuchung', flow_kind_extern: 'echt' },
]
const byId = (zeilen: Z[], id: string) => zeilen.find(z => z.id === id)!

test('Scope ich: Eric -> Malik wird Ausgabe, Gegenkonto in ich bleibt neutral', () => {
  const r = effektiveBuchungen(FIXTURE, SCOPE_ICH)
  const aus = byId(r, 'eric-zu-malik')
  assert.equal(aus.type, 'expense')
  assert.equal(aus.flow_kind, 'echt')
  assert.equal((aus as { herabgestuft?: boolean }).herabgestuft, true)
  assert.equal((aus as { type_db?: string }).type_db, 'transfer')
  assert.equal(byId(r, 'malik-zu-eric').type, 'income')
  assert.equal(byId(r, 'giro-zu-spar').flow_kind, 'umbuchung')
  assert.equal(byId(r, 'giro-zu-spar').type, 'transfer')
  // privat -> geteilt: das geteilte Konto ist NICHT in 'ich' -> Ausgabe
  assert.equal(byId(r, 'giro-zu-gemeinsam').type, 'expense')
  // nicht betroffen: unveraenderte Referenz
  assert.equal(byId(r, 'gehalt'), FIXTURE[4])
  assert.equal(byId(r, 'depot-sparplan'), FIXTURE[5])
})

test('manuelle Umbuchung: nur die Abgangsseite wird herabgestuft, wenn transfer_to nicht im Scope liegt', () => {
  const r = effektiveBuchungen(FIXTURE, SCOPE_ICH)
  assert.equal(byId(r, 'manuell-extern').type, 'expense')
  assert.equal(byId(r, 'manuell-extern').signed_amount, -50)
  assert.equal(byId(r, 'manuell-intern').type, 'transfer')
  assert.equal(byId(r, 'manuell-intern'), FIXTURE[7])
})

test('Scope partner: Malik-Giro -> geteiltes Konto ist dort eine Ausgabe', () => {
  const z = bank('malik-zu-gemeinsam', M_GIRO, GEMEINSAM, -80)
  const e = effektiveBuchung(z, SCOPE_PARTNER)
  assert.equal(e.type, 'expense')
  assert.equal(e.flow_kind, 'echt')
})

test('Scope gemeinsam: Umbuchungen zwischen Haushaltskonten bleiben neutral', () => {
  const r = effektiveBuchungen(FIXTURE, SCOPE_GEMEINSAM)
  for (const id of ['eric-zu-malik', 'malik-zu-eric', 'giro-zu-spar', 'giro-zu-gemeinsam', 'manuell-intern']) {
    assert.equal(byId(r, id).flow_kind, 'umbuchung', id)
    assert.equal(byId(r, id).type, 'transfer', id)
  }
  // Gegenkonto extern = echte Buchung (Regel wirdHerabgestuft)
  assert.equal(byId(r, 'manuell-extern').type, 'expense')
})

test('herabgestufte Zeile traegt flow_kind_extern (anlage), Umbuchung ohne Gegenkonto wird zur normalen Buchung', () => {
  const sparplan = bank('u1', E_GIRO, FREMD, -25, 'umbuchung', 'anlage')
  assert.equal(effektiveBuchung(sparplan, SCOPE_ICH).flow_kind, 'anlage')
  const ohneGegen = bank('u2', E_GIRO, null, 40, 'umbuchung', 'echt')
  assert.equal(effektiveBuchung(ohneGegen, SCOPE_ICH).type, 'income')
})

test('fehlende Herab-Spalten oder leeres flow_kind_extern: Zeile bleibt unveraendert', () => {
  const ohneSpalten = { type: 'transfer', flow_kind: 'umbuchung', signed_amount: -5, account_id: E_GIRO }
  assert.equal(effektiveBuchung(ohneSpalten, SCOPE_ICH), ohneSpalten)
  const ohneExtern = { ...ohneSpalten, counterpart_account_id: FREMD, flow_kind_extern: null }
  assert.equal(effektiveBuchung(ohneExtern, SCOPE_ICH), ohneExtern)
})

test('Summen und Zaehlungen: herabgestufte Zeilen zaehlen als Einnahme/Ausgabe, ohneFluss sinkt', () => {
  const alt = summiereTreffer(FIXTURE)
  const neu = summiereTreffer(effektiveBuchungen(FIXTURE, SCOPE_ICH))
  assert.equal(alt.ohneFluss, 6)
  assert.equal(neu.ohneFluss, 2) // giro-zu-spar, manuell-intern
  assert.equal(neu.einnahmen, alt.einnahmen + 120)
  assert.equal(neu.ausgaben, alt.ausgaben + 300 + 200 + 50)
  assert.equal(neu.anzahl, alt.anzahl)
})

test('Regression: alle Gegenkonten im Scope bzw. kein Partner => Zeilen und Summen identisch', () => {
  const nurIntern: Z[] = [FIXTURE[2], FIXTURE[4], FIXTURE[5], FIXTURE[7]]
  const neu = effektiveBuchungen(nurIntern, SCOPE_ICH)
  neu.forEach((z, i) => assert.equal(z, nurIntern[i])) // gleiche Referenzen
  assert.deepEqual(summiereTreffer(neu), summiereTreffer(nurIntern))
  // ohne Partner: undefined => gleiche Array-Referenz, keine Abbildung
  assert.equal(effektiveBuchungen(FIXTURE, undefined), FIXTURE)
  // Haushalt, alles im Scope (gemeinsam): interne Zeilen unveraendert
  const gem = effektiveBuchungen([FIXTURE[0], FIXTURE[1], FIXTURE[2], FIXTURE[3]], SCOPE_GEMEINSAM)
  gem.forEach(z => assert.equal(z.flow_kind, 'umbuchung'))
})

test('herabstufungsIds: nur mit Partner, nur gueltige UUIDs', () => {
  assert.equal(herabstufungsIds({ partnerId: null, accountIds: SCOPE_ICH }), undefined)
  assert.deepEqual(herabstufungsIds({ partnerId: 'p', accountIds: [...SCOPE_ICH, 'x)'] }), SCOPE_ICH)
  assert.equal(herabstufungsIds({ partnerId: 'p', accountIds: [] }), undefined)
  assert.deepEqual(gueltigeKontoIds([E_GIRO, 'abc', "1' or 1=1", `${E_SPAR})`]), [E_GIRO])
})

test('Filterfragmente enthalten nur validierte UUIDs bzw. feste Art-Namen', () => {
  const boese = [E_GIRO, 'x),or(a.eq.1', "'; drop table", M_GIRO]
  const art = artFragment(boese, ['echt', 'anlage', 'forderung', 'a),b(', 'umbuchung'])
  const typ = typFragment(boese, 'expense')
  for (const f of [art, typ]) {
    assert.ok(!f.includes('drop table'))
    assert.ok(!f.includes('or(a.eq.1'))
  }
  // Konten-Liste: ausschliesslich die zwei gueltigen UUIDs
  const kontoListe = /counterpart_account_id\.not\.in\.\(([^)]*)\)/.exec(art)
  assert.deepEqual(kontoListe?.[1].split(','), [E_GIRO, M_GIRO])
  // Art-Liste: nur [a-z_], ungueltige und 'umbuchung' fallen weg
  assert.match(
    art,
    /^flow_kind\.in\.\(echt,anlage,forderung\),and\(flow_kind\.eq\.umbuchung,flow_kind_extern\.in\.\(echt,anlage,forderung\),or\(counterpart_account_id\.is\.null,counterpart_account_id\.not\.in\.\(/,
  )
})

test('Fragmente: effektive Einnahme/Ausgabe nach Vorzeichen', () => {
  assert.equal(
    typFragment(SCOPE_ICH, 'income'),
    `type.eq.income,and(flow_kind.eq.umbuchung,signed_amount.gt.0,or(counterpart_account_id.is.null,counterpart_account_id.not.in.(${SCOPE_ICH.join(',')})))`,
  )
  assert.match(typFragment(SCOPE_ICH, 'expense'), /signed_amount\.lte\.0/)
})

test('wendeHerabFilterAn: Umbuchung = Gegenkonto im Scope, Einnahme/Ausgabe/Art per or()', () => {
  const log: string[] = []
  const b = {
    eq(s: string, w: string) { log.push(`eq:${s}=${w}`); return b },
    in(s: string, w: string[]) { log.push(`in:${s}=${w.join(',')}`); return b },
    or(a: string) { log.push(`or:${a}`); return b },
  }
  wendeHerabFilterAn(b, SCOPE_ICH, { art: 'umbuchung', type: 'transfer' })
  assert.deepEqual(log, [
    'eq:type=transfer', `in:counterpart_account_id=${SCOPE_ICH.join(',')}`,
    'eq:flow_kind=umbuchung', `in:counterpart_account_id=${SCOPE_ICH.join(',')}`,
  ])
  log.length = 0
  wendeHerabFilterAn(b, SCOPE_ICH, { art: 'echt', type: 'income' })
  assert.deepEqual(log, [`or:${typFragment(SCOPE_ICH, 'income')}`, `or:${artFragment(SCOPE_ICH, ['echt'])}`])
  log.length = 0
  wendeHerabFilterAn(b, SCOPE_ICH, {})
  assert.deepEqual(log, [])
})
