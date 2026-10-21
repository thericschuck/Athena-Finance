import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berechneKryptoFifo, haltefristEnde, istInnerhalbHaltefrist,
  type Anschaffung, type Veraeusserung,
} from './krypto-fifo.ts'

const kauf = (id: string, date: string, quantity: number, costEur: number, asset = 'BTC', seq = 0, wallet?: string): Anschaffung =>
  ({ id, asset, date, seq, quantity, costEur, wallet })
const verkauf = (id: string, date: string, quantity: number, proceedsEur: number, asset = 'BTC', seq = 0, wallet?: string): Veraeusserung =>
  ({ id, asset, date, seq, quantity, proceedsEur, wallet })

test('Haltefrist: Ende ein Jahr nach dem Anschaffungstag, der Tag selbst zählt noch dazu', () => {
  assert.equal(haltefristEnde('2025-03-10'), '2026-03-10')
  assert.equal(istInnerhalbHaltefrist('2025-03-10', '2026-03-10'), true)   // letzter steuerpflichtiger Tag
  assert.equal(istInnerhalbHaltefrist('2025-03-10', '2026-03-11'), false)  // erster steuerfreier Tag
})

test('Haltefrist: 29. Februar endet am letzten Tag des Februars', () => {
  assert.equal(haltefristEnde('2024-02-29'), '2025-02-28')
  assert.equal(istInnerhalbHaltefrist('2024-02-29', '2025-02-28'), true)
  assert.equal(istInnerhalbHaltefrist('2024-02-29', '2025-03-01'), false)
})

test('FIFO: ältester Kauf wird zuerst verbraucht, Kosten und Erlös anteilig', () => {
  const r = berechneKryptoFifo(
    [kauf('k1', '2026-01-01', 1, 100), kauf('k2', '2026-02-01', 1, 300)],
    [verkauf('v1', '2026-03-01', 1.5, 600)],
    1000,
  )
  const v = r.veraeusserungen[0]
  assert.equal(v.posten.length, 2)
  assert.deepEqual(v.posten.map(p => p.anschaffungId), ['k1', 'k2'])
  assert.equal(v.posten[0].kostenEur, 100)
  assert.equal(v.posten[1].kostenEur, 150)       // halbes zweites Los
  assert.equal(v.posten[0].erloesEur, 400)       // 1 / 1,5 des Erlöses
  assert.equal(v.posten[1].erloesEur, 200)
  assert.equal(v.gewinnEur, 350)                 // 600 - 250
  assert.deepEqual(r.bestand, [{ asset: 'BTC', wallet: 'default', quantity: 0.5, kostenEur: 150 }])
})

test('Gewinn nach Ablauf der Haltefrist ist steuerfrei und zählt nicht ins Jahresergebnis', () => {
  const r = berechneKryptoFifo(
    [kauf('k1', '2024-01-01', 1, 100)],
    [verkauf('v1', '2026-06-01', 1, 5000)],
    1000,
  )
  assert.equal(r.veraeusserungen[0].steuerpflichtigerGewinnEur, 0)
  assert.equal(r.jahre[0].saldoSteuerpflichtigEur, 0)
  assert.equal(r.jahre[0].steuerfreierGewinnEur, 4900)
  assert.equal(r.jahre[0].zuVersteuernEur, 0)
})

test('Freigrenze: knapp darunter steuerfrei, erreicht = der GANZE Gewinn steuerpflichtig', () => {
  const unter = berechneKryptoFifo([kauf('k', '2026-01-01', 1, 100)], [verkauf('v', '2026-02-01', 1, 1099)], 1000)
  assert.equal(unter.jahre[0].saldoSteuerpflichtigEur, 999)
  assert.equal(unter.jahre[0].zuVersteuernEur, 0)

  const gleich = berechneKryptoFifo([kauf('k', '2026-01-01', 1, 100)], [verkauf('v', '2026-02-01', 1, 1100)], 1000)
  assert.equal(gleich.jahre[0].zuVersteuernEur, 1000)   // nicht 0 und nicht „nur der Teil über 1.000"
})

test('Verlust: kein Steuerbetrag, Verlust wird ausgewiesen', () => {
  const r = berechneKryptoFifo([kauf('k', '2026-01-01', 1, 500)], [verkauf('v', '2026-02-01', 1, 200)], 1000)
  assert.equal(r.jahre[0].zuVersteuernEur, 0)
  assert.equal(r.jahre[0].verlustEur, 300)
})

test('Gewinne und Verluste desselben Jahres werden saldiert', () => {
  const r = berechneKryptoFifo(
    [kauf('a', '2026-01-01', 1, 100, 'BTC'), kauf('b', '2026-01-01', 1, 1000, 'ETH')],
    [verkauf('v1', '2026-03-01', 1, 2500, 'BTC'), verkauf('v2', '2026-03-02', 1, 500, 'ETH')],
    1000,
  )
  assert.equal(r.jahre[0].saldoSteuerpflichtigEur, 1900)   // +2400 - 500
  assert.equal(r.jahre[0].zuVersteuernEur, 1900)
})

test('Fehlmenge: Verkauf über den Bestand hinaus wird gemeldet und nicht erfunden', () => {
  const r = berechneKryptoFifo([kauf('k', '2026-01-01', 1, 100)], [verkauf('v', '2026-02-01', 2, 300)], 1000)
  assert.equal(r.veraeusserungen[0].fehlmenge, 1)
  assert.equal(r.warnungen.length, 1)
  assert.match(r.warnungen[0], /fehlt die Anschaffung/)
})

test('Kauf und Verkauf am selben Tag: der Kauf zählt zuerst, keine Fehlmenge', () => {
  const r = berechneKryptoFifo(
    [kauf('k', '2026-05-05', 1, 100, 'BTC', 99)],
    [verkauf('v', '2026-05-05', 1, 150, 'BTC', 1)],
    1000,
  )
  assert.equal(r.veraeusserungen[0].fehlmenge, 0)
  assert.equal(r.veraeusserungen[0].gewinnEur, 50)
})

test('Coins sind getrennte Warteschlangen', () => {
  const r = berechneKryptoFifo(
    [kauf('b', '2026-01-01', 1, 100, 'BTC'), kauf('e', '2026-01-02', 1, 10, 'ETH')],
    [verkauf('v', '2026-03-01', 1, 50, 'ETH')],
    1000,
  )
  assert.equal(r.veraeusserungen[0].posten[0].anschaffungId, 'e')
  assert.deepEqual(r.bestand.map(b => b.asset), ['BTC'])
})

test('Ungültige Mengen werden ignoriert und gemeldet', () => {
  const r = berechneKryptoFifo([kauf('k', '2026-01-01', 0, 10)], [verkauf('v', '2026-02-01', -1, 10)], 1000)
  assert.equal(r.warnungen.length, 2)
  assert.equal(r.veraeusserungen.length, 0)
})

test('je Wallet: Verkauf aus einer Wallet ohne Bestand ist eine Fehlmenge, auch wenn eine andere Wallet Bestand hat', () => {
  const k = [kauf('k', '2026-01-01', 1, 100, 'BTC', 0, 'kraken')]
  const v = [verkauf('v', '2026-02-01', 1, 500, 'BTC', 0, 'trezor')]
  const je = berechneKryptoFifo(k, v, 1000, { verfahren: 'je-wallet' })
  assert.equal(je.veraeusserungen[0].fehlmenge, 1)
  const gesamt = berechneKryptoFifo(k, v, 1000, { verfahren: 'gesamt' })
  assert.equal(gesamt.veraeusserungen[0].fehlmenge, 0)
  assert.equal(gesamt.veraeusserungen[0].gewinnEur, 400)
})

test('Übertrag: Anschaffungsdatum und Kosten wandern mit, es entsteht kein Gewinn', () => {
  // Kraken -> Trezor am 2026-06-01; Verkauf aus dem Trezor am 2027-03-01 liegt NACH der Haltefrist
  // (Anschaffung 2025-12-01), obwohl der Trezor erst seit 2026 befüllt wurde.
  const r = berechneKryptoFifo(
    [kauf('k', '2025-12-01', 1, 100, 'BTC', 0, 'kraken')],
    [verkauf('v', '2027-03-01', 1, 900, 'BTC', 0, 'trezor')],
    1000,
    { uebertraege: [{ id: 'u', asset: 'BTC', date: '2026-06-01', seq: 0, quantity: 1, vonWallet: 'kraken', nachWallet: 'trezor' }] },
  )
  assert.equal(r.warnungen.length, 0)
  assert.equal(r.veraeusserungen[0].posten[0].anschaffungDatum, '2025-12-01')
  assert.equal(r.veraeusserungen[0].posten[0].steuerpflichtig, false)
  assert.equal(r.veraeusserungen[0].posten[0].kostenEur, 100)
})

test('Teilübertrag: nur die FIFO-ältesten Einheiten wandern, die Kosten teilen sich', () => {
  const r = berechneKryptoFifo(
    [kauf('a', '2026-01-01', 1, 100, 'BTC', 0, 'kraken'), kauf('b', '2026-02-01', 1, 300, 'BTC', 0, 'kraken')],
    [],
    1000,
    { uebertraege: [{ id: 'u', asset: 'BTC', date: '2026-03-01', seq: 0, quantity: 1.5, vonWallet: 'kraken', nachWallet: 'trezor' }] },
  )
  const trezor = r.bestand.find(b => b.wallet === 'trezor')!
  const kraken = r.bestand.find(b => b.wallet === 'kraken')!
  assert.equal(trezor.quantity, 1.5)
  assert.equal(trezor.kostenEur, 250)    // 100 + halbes zweites Los (150)
  assert.equal(kraken.quantity, 0.5)
  assert.equal(kraken.kostenEur, 150)
})

test('Übertrag über den Bestand hinaus meldet eine Warnung', () => {
  const r = berechneKryptoFifo(
    [kauf('a', '2026-01-01', 1, 100, 'BTC', 0, 'kraken')], [], 1000,
    { uebertraege: [{ id: 'u', asset: 'BTC', date: '2026-03-01', seq: 0, quantity: 2, vonWallet: 'kraken', nachWallet: 'trezor' }] },
  )
  assert.equal(r.warnungen.length, 1)
  assert.match(r.warnungen[0], /Übertrag u/)
})

test('Mehrere Teilverkäufe aus demselben Los rechnen die Kosten korrekt weiter', () => {
  const r = berechneKryptoFifo(
    [kauf('k', '2026-01-01', 4, 400)],
    [verkauf('v1', '2026-02-01', 1, 150), verkauf('v2', '2026-03-01', 3, 600)],
    1000,
  )
  assert.equal(r.veraeusserungen[0].gewinnEur, 50)    // 150 - 100
  assert.equal(r.veraeusserungen[1].gewinnEur, 300)   // 600 - 300
  assert.deepEqual(r.bestand, [])
})
