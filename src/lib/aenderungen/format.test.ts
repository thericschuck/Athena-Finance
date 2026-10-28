import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  akteurName, relativeZeit, maskiereIban, kuerze, beschreibeAenderung, objektName, objektLink,
  geaenderteFelder, bereichTabellen, zeitraumAb, cursorKodieren, cursorLesen,
} from './format.ts'

const ICH = '11111111-1111-4111-8111-111111111111'
const MALIK = '22222222-2222-4222-8222-222222222222'
const U = (old_values: Record<string, unknown> | null, new_values: Record<string, unknown> | null, action = 'UPDATE') =>
  ({ action, old_values, new_values })

test('akteurName: Du, System, Unbekannt, Mitgliedsname, Fallback', () => {
  const namen = new Map([[MALIK, 'Malik']])
  assert.equal(akteurName({ actor_id: ICH, actor_kind: 'user', actor_name: 'Eric' }, ICH, namen), 'Du')
  assert.equal(akteurName({ actor_id: null, actor_kind: 'system', actor_name: 'System' }, ICH, namen), 'System')
  assert.equal(akteurName({ actor_id: null, actor_kind: 'unknown', actor_name: 'Unbekannt' }, ICH), 'Unbekannt')
  assert.equal(akteurName({ actor_id: MALIK, actor_kind: 'user', actor_name: 'Mitglied' }, ICH, namen), 'Malik')
  assert.equal(akteurName({ actor_id: MALIK, actor_kind: 'user', actor_name: 'Malik S.' }, ICH), 'Malik S.')
  assert.equal(akteurName({ actor_id: MALIK, actor_kind: 'user', actor_name: null }, ICH), 'Mitglied')
})

test('relativeZeit', () => {
  const jetzt = new Date(2026, 9, 27, 15, 0, 0)
  const vor = (ms: number) => new Date(jetzt.getTime() - ms).toISOString()
  assert.equal(relativeZeit(vor(20_000), jetzt), 'gerade eben')
  assert.equal(relativeZeit(vor(60_000), jetzt), 'vor 1 Minute')
  assert.equal(relativeZeit(vor(5 * 60_000), jetzt), 'vor 5 Minuten')
  assert.equal(relativeZeit(vor(3 * 3_600_000), jetzt), 'vor 3 Stunden')
  assert.equal(relativeZeit(new Date(2026, 9, 26, 23, 0).toISOString(), jetzt), 'gestern')
  assert.equal(relativeZeit(new Date(2026, 9, 23, 9, 0).toISOString(), jetzt), 'vor 4 Tagen')
  assert.equal(relativeZeit(new Date(2026, 9, 1, 9, 0).toISOString(), jetzt), '01.10.2026')
  assert.equal(relativeZeit('kaputt', jetzt), '')
})

test('maskiereIban und kuerze', () => {
  assert.equal(maskiereIban('DE89 3704 0044 0532 0130 00'), 'DE89 •••• 3000')
  assert.equal(maskiereIban('DE12'), '••••')
  assert.equal(kuerze('kurz', 10), 'kurz')
  assert.equal(kuerze('a'.repeat(50), 10).length, 10)
  assert.ok(kuerze('a'.repeat(50), 10).endsWith('…'))
})

test('INSERT und DELETE', () => {
  assert.equal(beschreibeAenderung(U(null, { name: 'x' }, 'INSERT')), 'angelegt')
  assert.equal(beschreibeAenderung(U({ name: 'x' }, null, 'DELETE')), 'gelöscht')
})

test('UPDATE: ein Geldfeld mit Alt- und Neuwert', () => {
  const s = beschreibeAenderung(U({ amount: 12, currency: 'EUR' }, { amount: 15.5, currency: 'EUR' }))
  assert.match(s, /^Betrag von 12,00\s€ auf 15,50\s€$/)
})

test('UPDATE: Name, Datum, Status, Schalter', () => {
  assert.equal(beschreibeAenderung(U({ name: 'Alt' }, { name: 'Neu' })), 'Name von Alt auf Neu')
  assert.equal(beschreibeAenderung(U({ due_date: '2026-01-05' }, { due_date: '2026-02-01' })), 'Fälligkeit von 05.01.2026 auf 01.02.2026')
  assert.equal(beschreibeAenderung(U({ status: 'active' }, { status: 'reached' })), 'Status von active auf reached')
  assert.equal(beschreibeAenderung(U({ shared: false }, { shared: true })), 'mit dem Haushalt geteilt')
  assert.equal(beschreibeAenderung(U({ shared: true }, { shared: false })), 'nicht mehr mit dem Haushalt geteilt')
  assert.equal(beschreibeAenderung(U({ is_active: true }, { is_active: false })), 'deaktiviert')
  assert.equal(beschreibeAenderung(U({ interest_rate: 3 }, { interest_rate: 3.5 })), 'Zinssatz von 3 % auf 3,5 %')
})

test('UPDATE: mehrere Felder werden aufgezaehlt, viele zusammengefasst', () => {
  assert.equal(beschreibeAenderung(U({ name: 'a', provider: 'x' }, { name: 'b', provider: 'y' })), 'Name und Anbieter geändert')
  assert.equal(
    beschreibeAenderung(U({ name: 'a', provider: 'x', amount: 1 }, { name: 'b', provider: 'y', amount: 2 })),
    'Betrag, Name und Anbieter geändert',
  )
  const alt = { name: 'a', provider: 'x', amount: 1, frequency: 'monthly' }
  const neu = { name: 'b', provider: 'y', amount: 2, frequency: 'yearly' }
  assert.equal(beschreibeAenderung(U(alt, neu)), '4 Angaben geändert')
})

test('Datenschutz: IBAN, Notizen und Beschreibung nie im Wortlaut', () => {
  const iban = 'DE89370400440532013000'
  const s1 = beschreibeAenderung(U({ bank_iban: iban }, { bank_iban: 'DE02120300000000202051' }))
  assert.equal(s1, 'IBAN geändert')
  assert.ok(!s1.includes('DE89') && !s1.includes('3000'))
  const s2 = beschreibeAenderung(U({ notes: 'Geheimer Text' }, { notes: 'Anderer geheimer Text' }))
  assert.equal(s2, 'Notizen geändert')
  const s3 = beschreibeAenderung(U({ description: 'Miete an X' }, { description: 'Miete an Y' }))
  assert.equal(s3, 'Beschreibung geändert')
  // Textfeld mit IBAN-Inhalt wird maskiert
  const s4 = beschreibeAenderung(U({ name: iban }, { name: 'Konto' }))
  assert.ok(!s4.includes(iban) && s4.includes('••••'))
  // Seriennummer
  assert.equal(beschreibeAenderung(U({ seriennummer: 'ABC123' }, { seriennummer: 'XYZ' })), 'Seriennummer geändert')
})

test('UPDATE: Rauschen allein ergibt "geändert", unbekannte Felder "Weitere Angaben"', () => {
  assert.equal(beschreibeAenderung(U({ sort_order: 1 }, { sort_order: 2 })), 'geändert')
  assert.equal(beschreibeAenderung(U({ foo: 1 }, { foo: 2 })), 'Weitere Angaben geändert')
  assert.deepEqual(geaenderteFelder({ amount: 1, amount_base: 1 }, { amount: 2, amount_base: 2 }).map(f => f.label), ['Betrag'])
})

test('lange Texte im Namen werden gekuerzt, objektName maskiert IBAN', () => {
  const lang = 'N'.repeat(100)
  assert.ok(objektName({ table_name: 'accounts', old_values: null, new_values: { name: lang } }).length <= 40)
  assert.equal(objektName({ table_name: 'accounts', old_values: null, new_values: { name: 'DE89370400440532013000' } }), 'DE89 •••• 3000')
  assert.equal(objektName({ table_name: 'bank_transactions', old_values: null, new_values: { counterpart_name: 'REWE', description: 'geheim' } }), 'REWE')
  assert.equal(objektName({ table_name: 'bank_transactions', old_values: null, new_values: { description: 'geheim' } }), 'Bankbuchung')
  assert.equal(objektName({ table_name: 'valuables', old_values: { marke: 'Rolex', modell: 'GMT' }, new_values: null }), 'Rolex GMT')
})

test('objektLink: Detailseiten, Bereichsseiten, keine Links fuer Geloeschtes', () => {
  const id = '33333333-3333-4333-8333-333333333333'
  assert.equal(objektLink({ table_name: 'accounts', record_id: id, action: 'UPDATE' }), `/finance/accounts/${id}`)
  assert.equal(objektLink({ table_name: 'contracts', record_id: id, action: 'INSERT' }), `/finance/contracts/${id}`)
  assert.equal(objektLink({ table_name: 'contracts', record_id: id, action: 'DELETE' }), null)
  assert.equal(objektLink({ table_name: 'accounts', record_id: 'x/../y', action: 'UPDATE' }), '/finance/accounts')
  assert.equal(objektLink({ table_name: 'debts', record_id: id, action: 'UPDATE' }), '/finance/debts')
  assert.equal(objektLink({ table_name: 'unbekannt', record_id: id, action: 'UPDATE' }), null)
})

test('Bereich, Zeitraum, Cursor', () => {
  assert.deepEqual(bereichTabellen('buchungen'), ['transactions', 'bank_transactions'])
  assert.equal(bereichTabellen('nix'), null)
  assert.equal(zeitraumAb('alle'), null)
  const jetzt = new Date('2026-10-27T12:00:00.000Z')
  assert.equal(zeitraumAb('24h', jetzt), '2026-10-26T12:00:00.000Z')
  assert.equal(zeitraumAb('7d', jetzt), '2026-10-20T12:00:00.000Z')
  const c = { createdAt: '2026-10-27T10:00:00.123+00:00', id: 42 }
  assert.deepEqual(cursorLesen(cursorKodieren(c)), c)
  assert.equal(cursorLesen('2026-10-27T10:00:00Z|1),id.gt.0'), null)
  assert.equal(cursorLesen('quatsch'), null)
  assert.equal(cursorLesen(null), null)
})
