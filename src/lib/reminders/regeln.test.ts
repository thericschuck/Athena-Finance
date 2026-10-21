import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erzeugeErinnerungen, planeAbgleich, type ErinnerungsEingabe } from './regeln.ts'

type Krypto = NonNullable<NonNullable<ErinnerungsEingabe['steuer']>['krypto']>

const LEER: ErinnerungsEingabe = {
  heute: '2026-10-22',
  vertraege: [],
  steuer: null,
  unkategorisiert: 0,
  kraken: { hatKraken: false, letzterSync: null },
}
const STEUER = {
  jahr: 2026,
  ruecklage: { soll: 0, ist: null, luecke: null },
  kleinunternehmer: { status: 'gruen' as const, umsatzLaufend: 0, grenzeLaufend: 100_000 },
  krypto: null,
}

test('Ohne Anlass entsteht nichts', () => {
  assert.deepEqual(erzeugeErinnerungen(LEER), [])
  assert.deepEqual(erzeugeErinnerungen({ ...LEER, steuer: STEUER }), [])
})

test('Kündigungsfrist: nur bei automatischer Verlängerung, im Fenster von 21 Tagen, Warnung ab 7 Tagen', () => {
  const v = (id: string, end: string, extra = {}) => ({ id, name: `V${id}`, end_date: end, notice_days: 30, auto_renews: true, ...extra })
  const r = erzeugeErinnerungen({
    ...LEER,
    vertraege: [
      v('1', '2026-11-26'),                         // letzter Tag 27.10. -> in 5 Tagen
      v('2', '2026-12-10'),                         // 10.11. -> in 19 Tagen
      v('3', '2027-03-01'),                         // zu weit weg
      v('4', '2026-11-26', { auto_renews: false }), // endet von selbst
      v('5', '2026-11-10'),                         // 11.10. bereits verstrichen
      { id: '6', name: 'V6', end_date: null, notice_days: 30, auto_renews: true },
    ],
  })
  assert.deepEqual(r.map(x => x.key), ['kuendigung:1:2026-11-26', 'kuendigung:2:2026-12-10'])
  assert.equal(r[0].severity, 'warning')
  assert.equal(r[1].severity, 'info')
  assert.ok(r[0].title.includes('5 Tagen'))
  assert.ok(r[0].body.includes('27.10.2026'))
})

test('Steuerrücklage: Lücke ab 50 € oder fehlendes Sparziel, sonst nichts', () => {
  const mit = (ruecklage: { soll: number; ist: number | null; luecke: number | null }) =>
    erzeugeErinnerungen({ ...LEER, steuer: { ...STEUER, ruecklage } })
  // toLocaleString setzt ein geschütztes Leerzeichen vor das €-Zeichen.
  assert.equal(mit({ soll: 1000, ist: 400, luecke: 600 })[0].title.replace(/ /g, ' '), 'Steuerrücklage 2026: 600 € fehlen')
  assert.ok(mit({ soll: 1000, ist: null, luecke: null })[0].title.includes('noch kein Sparziel'))
  assert.deepEqual(mit({ soll: 1000, ist: 980, luecke: 20 }), [])
  assert.deepEqual(mit({ soll: 0, ist: null, luecke: null }), [])
  assert.equal(mit({ soll: 1000, ist: 400, luecke: 600 })[0].key, 'ruecklage:2026:2026-Q4')
})

test('Kleinunternehmer: gelb Info, rot Warnung, grün nichts', () => {
  const mit = (status: 'gruen' | 'gelb' | 'rot' | 'unbekannt') =>
    erzeugeErinnerungen({ ...LEER, steuer: { ...STEUER, kleinunternehmer: { status, umsatzLaufend: 90_000, grenzeLaufend: 100_000 } } })
  assert.equal(mit('gelb')[0].severity, 'info')
  assert.equal(mit('rot')[0].severity, 'warning')
  assert.equal(mit('gruen').length, 0)
  assert.equal(mit('unbekannt').length, 0)
})

test('Krypto: Nähe zur Freigrenze, Überschreitung und Haltefrist in den nächsten 30 Tagen', () => {
  const krypto = (o: Partial<Krypto> = {}): Krypto => ({
    saldoSteuerpflichtig: 0, zuVersteuern: 0, freigrenze: 1000, offeneLose: [], ...o,
  })
  const mit = (k: Krypto) => erzeugeErinnerungen({ ...LEER, steuer: { ...STEUER, krypto: k } })

  assert.equal(mit(krypto({ saldoSteuerpflichtig: 850 }))[0].key, 'krypto-nah:2026')
  assert.equal(mit(krypto({ saldoSteuerpflichtig: 500 })).length, 0)
  const ueber = mit(krypto({ saldoSteuerpflichtig: 1200, zuVersteuern: 1200 }))
  assert.deepEqual(ueber.map(x => x.key), ['krypto-ueber:2026'])

  const lose = mit(krypto({
    offeneLose: [
      { anschaffungId: 'a', asset: 'BTC', quantity: 0.1, steuerfreiAb: '2026-11-05' },
      { anschaffungId: 'b', asset: 'ETH', quantity: 2, steuerfreiAb: '2027-01-01' },  // zu weit
      { anschaffungId: 'c', asset: 'SOL', quantity: 3, steuerfreiAb: '2026-10-01' },  // schon frei
    ],
  }))
  assert.deepEqual(lose.map(x => x.key), ['haltefrist:a:2026-11-05'])
  assert.ok(lose[0].title.includes('0,1 BTC'))
})

test('Datenpflege: unkategorisierte ab 10, Kraken-Sync nur mit Schlüssel und ab 3 Tagen Rückstand', () => {
  assert.equal(erzeugeErinnerungen({ ...LEER, unkategorisiert: 9 }).length, 0)
  assert.equal(erzeugeErinnerungen({ ...LEER, unkategorisiert: 10 })[0].key, 'unkategorisiert:2026-10')

  const kraken = (letzterSync: string | null, hatKraken = true) =>
    erzeugeErinnerungen({ ...LEER, kraken: { hatKraken, letzterSync } })
  assert.equal(kraken('2026-10-21T10:00:00Z').length, 0)
  assert.ok(kraken('2026-10-18T10:00:00Z')[0].title.includes('4 Tage'))
  assert.ok(kraken(null)[0].title.includes('noch nie'))
  assert.equal(kraken(null, false).length, 0)
  assert.match(kraken(null)[0].key, /^kraken-sync:2026-W43$/)
})

test('Abgleich: neue einfügen, bekannte (auch weggeklickte) nie wieder, erledigte archivieren', () => {
  const a = (key: string) => ({ key, severity: 'info' as const, title: key, body: '' })
  const plan = planeAbgleich(
    [a('neu'), a('bleibt'), a('weggeklickt')],
    [
      { id: '1', key: 'bleibt', dismissed_at: null },
      { id: '2', key: 'weggeklickt', dismissed_at: '2026-10-01T00:00:00Z' },
      { id: '3', key: 'erledigt', dismissed_at: null },
      { id: '4', key: 'laengst-erledigt', dismissed_at: '2026-09-01T00:00:00Z' },
    ],
  )
  assert.deepEqual(plan.einfuegen.map(x => x.key), ['neu'])
  assert.deepEqual(plan.archivieren, ['3'])
})
