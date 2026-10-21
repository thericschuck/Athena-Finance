/**
 * Private Veräußerungsgeschäfte mit Kryptowerten (§ 23 EStG) nach dem FIFO-Verfahren.
 *
 * Reine Funktion, keine Datenbank, keine Börsenanbindung: sie rechnet nur, was ihr als
 * Anschaffungen, Veräußerungen und Überträgen übergeben wird. Damit bleibt sie testbar und
 * unabhängig davon, ob die Trades von Kraken, einer Trezor-/MetaMask-Auswertung oder per Hand kommen.
 *
 * Verfahren (`optionen.verfahren`):
 *   'je-wallet' (Standard)  FIFO getrennt je Wallet/Depot. Ein Übertrag zwischen eigenen Wallets ist
 *                           keine Veräußerung, nimmt aber Anschaffungsdatum und Kosten der übertragenen
 *                           Einheiten (in FIFO-Reihenfolge der Quell-Wallet) mit. Ohne Angabe einer
 *                           Wallet gelten alle Vorgänge als eine einzige — dann ist das Ergebnis
 *                           dasselbe wie beim Gesamtverfahren.
 *   'gesamt'                FIFO über alle Wallets zusammen, Überträge werden ignoriert.
 * WELCHES Verfahren die Finanzverwaltung für welches Jahr verlangt, ist eine Rechtsfrage: nach meinem
 * Kenntnisstand verlangt das BMF-Schreiben vom 06.03.2025 für spätere Zeiträume eine wallet-bezogene
 * Betrachtung, mit einer Übergangsregelung für das Gesamtverfahren. Vor jeder Verwendung vom
 * Steuerberater bestätigen lassen; die Funktion rechnet beides.
 *
 * Haltefrist: Gewinne sind steuerfrei, wenn zwischen Anschaffung und Veräußerung MEHR als ein Jahr
 * liegen. Die Frist beginnt am Tag nach der Anschaffung und endet mit Ablauf des Tages, der durch
 * seine Zahl dem Anschaffungstag entspricht (§§ 187, 188 BGB): angeschafft am 10.03.2025, ist ein
 * Verkauf am 10.03.2026 noch steuerpflichtig, am 11.03.2026 steuerfrei. Gibt es den Tag im Zielmonat
 * nicht (29.02.), endet die Frist am letzten Tag des Monats.
 *
 * Freigrenze (nicht Freibetrag): liegt der Gesamtgewinn eines Jahres aus steuerpflichtigen
 * Veräußerungen UNTER der Freigrenze, bleibt er steuerfrei; erreicht er sie, wird der GANZE Betrag
 * steuerpflichtig. Die Höhe kommt vom Aufrufer (ab 2024: 1.000 €; vor jeder Verwendung gegen die
 * aktuelle Rechtslage prüfen).
 *
 * Nicht abgedeckt, bewusst: Gebühren müssen vom Aufrufer schon in `costEur` (Anschaffung) bzw.
 * `proceedsEur` (Veräußerung) eingerechnet sein; Staking-/Lending-Erträge, Airdrops und Hard Forks
 * sind andere Einkunftsarten und gehören nicht hierher; Verlustvorträge über Jahre hinweg.
 */

export type Anschaffung = {
  id: string
  asset: string
  /** Kalenderdatum der Anschaffung, YYYY-MM-DD (Ortszeit). */
  date: string
  /** Reihenfolge innerhalb desselben Tages, z. B. Unix-Zeit. Kleiner = früher. */
  seq: number
  quantity: number
  /** Gesamte Anschaffungskosten in EUR inklusive Nebenkosten. */
  costEur: number
  /** Wallet/Depot, in der die Einheiten landen (z. B. "kraken", "trezor"). Fehlt sie: "default". */
  wallet?: string
}

export type Veraeusserung = {
  id: string
  asset: string
  date: string
  seq: number
  quantity: number
  /** Gesamterlös in EUR abzüglich Nebenkosten. */
  proceedsEur: number
  /** Wallet/Depot, aus der verkauft wird. Fehlt sie: "default". */
  wallet?: string
}

/** Übertrag zwischen eigenen Wallets: keine Veräußerung, Kosten und Datum wandern mit. */
export type Uebertrag = {
  id: string
  asset: string
  date: string
  seq: number
  quantity: number
  vonWallet: string
  nachWallet: string
}

export type FifoOptionen = {
  verfahren?: 'je-wallet' | 'gesamt'
  uebertraege?: Uebertrag[]
}

export type VerbrauchterPosten = {
  anschaffungId: string
  anschaffungDatum: string
  quantity: number
  kostenEur: number
  erloesEur: number
  gewinnEur: number
  haltedauerTage: number
  /** true = innerhalb der Haltefrist verkauft, also steuerpflichtig. */
  steuerpflichtig: boolean
}

export type VeraeusserungErgebnis = {
  veraeusserungId: string
  asset: string
  date: string
  quantity: number
  erloesEur: number
  /** Menge, für die keine Anschaffung vorlag (z. B. Zugang ohne Kaufhistorie). Nicht berechnet. */
  fehlmenge: number
  posten: VerbrauchterPosten[]
  gewinnEur: number
  steuerpflichtigerGewinnEur: number
}

export type JahresErgebnis = {
  jahr: number
  /** Saldo aller steuerpflichtigen Veräußerungen (Gewinne minus Verluste). */
  saldoSteuerpflichtigEur: number
  /** Gewinn/Verlust aus Veräußerungen nach Ablauf der Haltefrist (steuerfrei, nur zur Information). */
  steuerfreierGewinnEur: number
  freigrenzeEur: number
  /** Der Betrag, der in die Steuererklärung fließt (Anlage SO). 0 bei Verlust oder unter der Freigrenze. */
  zuVersteuernEur: number
  /** Verlust, der nur mit anderen privaten Veräußerungsgewinnen verrechnet werden darf. */
  verlustEur: number
}

export type FifoErgebnis = {
  veraeusserungen: VeraeusserungErgebnis[]
  jahre: JahresErgebnis[]
  /** Bestand nach allen Vorgängen (Menge und Restkosten); `wallet` ist im Gesamtverfahren null. */
  bestand: { asset: string; wallet: string | null; quantity: number; kostenEur: number }[]
  /** Noch nicht verkaufte Lose mit dem Tag, ab dem ein Verkauf steuerfrei ist (Tag nach Ablauf der Haltefrist). */
  offeneLose: { asset: string; wallet: string | null; anschaffungId: string; anschaffungDatum: string; quantity: number; kostenEur: number; steuerfreiAb: string }[]
  warnungen: string[]
}

const rund = (n: number) => Math.round(n * 100) / 100
const EPS = 1e-12
const TRENNER = '\u0000'

function parseDatum(d: string): { y: number; m: number; d: number } {
  const [y, m, t] = d.split('-').map(Number)
  return { y, m, d: t }
}

function tageZwischen(von: string, bis: string): number {
  const a = parseDatum(von), b = parseDatum(bis)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}

/** Letzter Tag der Haltefrist (YYYY-MM-DD): ein Jahr nach dem Anschaffungstag, bei 29.02. der 28.02. */
export function haltefristEnde(anschaffung: string): string {
  const { y, m, d } = parseDatum(anschaffung)
  const ziel = y + 1
  const letzterTag = new Date(Date.UTC(ziel, m, 0)).getUTCDate()
  const tag = Math.min(d, letzterTag)
  return `${ziel}-${String(m).padStart(2, '0')}-${String(tag).padStart(2, '0')}`
}

export function istInnerhalbHaltefrist(anschaffung: string, veraeusserung: string): boolean {
  return veraeusserung <= haltefristEnde(anschaffung)
}

type Ereignis =
  | { art: 'kauf'; e: Anschaffung }
  | { art: 'uebertrag'; e: Uebertrag }
  | { art: 'verkauf'; e: Veraeusserung }

const REIHENFOLGE = { kauf: 0, uebertrag: 1, verkauf: 2 } as const

type Los = { id: string; date: string; restMenge: number; menge: number; kosten: number }

export function berechneKryptoFifo(
  anschaffungen: Anschaffung[],
  veraeusserungen: Veraeusserung[],
  freigrenzeEur: number,
  optionen: FifoOptionen = {},
): FifoErgebnis {
  const verfahren = optionen.verfahren ?? 'je-wallet'
  const warnungen: string[] = []
  const walletOf = (w: string | undefined) => w ?? 'default'
  const schluessel = (asset: string, wallet: string | undefined) =>
    verfahren === 'gesamt' ? asset : `${asset}${TRENNER}${walletOf(wallet)}`

  const ereignisse: Ereignis[] = [
    ...anschaffungen.map(e => ({ art: 'kauf' as const, e })),
    ...(verfahren === 'je-wallet' ? (optionen.uebertraege ?? []).map(e => ({ art: 'uebertrag' as const, e })) : []),
    ...veraeusserungen.map(e => ({ art: 'verkauf' as const, e })),
  ].sort((a, b) =>
    a.e.date.localeCompare(b.e.date) ||
    // Am selben Tag: erst Anschaffungen, dann Überträge, dann Verkäufe. Sonst entstünde eine scheinbare
    // Fehlmenge, obwohl am selben Tag gekauft und verkauft bzw. übertragen wurde.
    (a.art === b.art ? a.e.seq - b.e.seq : REIHENFOLGE[a.art] - REIHENFOLGE[b.art]),
  )

  const lose = new Map<string, Los[]>()
  const ergebnisse: VeraeusserungErgebnis[] = []

  for (const ev of ereignisse) {
    if (ev.art === 'kauf') {
      const a = ev.e
      if (!(a.quantity > 0)) { warnungen.push(`Anschaffung ${a.id}: Menge ${a.quantity} wird ignoriert.`); continue }
      const k = schluessel(a.asset, a.wallet)
      const liste = lose.get(k) ?? []
      liste.push({ id: a.id, date: a.date, restMenge: a.quantity, menge: a.quantity, kosten: a.costEur })
      lose.set(k, liste)
      continue
    }

    if (ev.art === 'uebertrag') {
      const u = ev.e
      if (!(u.quantity > 0)) { warnungen.push(`Übertrag ${u.id}: Menge ${u.quantity} wird ignoriert.`); continue }
      if (walletOf(u.vonWallet) === walletOf(u.nachWallet)) continue
      const quelle = lose.get(schluessel(u.asset, u.vonWallet)) ?? []
      const zielKey = schluessel(u.asset, u.nachWallet)
      const ziel = lose.get(zielKey) ?? []
      let offen = u.quantity
      for (const los of quelle) {
        if (offen <= EPS) break
        if (los.restMenge <= EPS) continue
        const nimm = Math.min(offen, los.restMenge)
        // Kosten und Anschaffungsdatum wandern mit; die Teilmenge behält die Los-ID, damit der
        // Bericht zeigt, aus welcher Anschaffung sie stammt.
        const kosten = los.kosten * (nimm / los.menge)
        ziel.push({ id: los.id, date: los.date, restMenge: nimm, menge: nimm, kosten })
        los.kosten -= kosten
        los.menge -= nimm
        los.restMenge -= nimm
        offen -= nimm
      }
      lose.set(zielKey, ziel)
      if (offen > EPS) {
        warnungen.push(
          `${u.asset}: Übertrag ${u.id} am ${u.date} von ${u.vonWallet} nach ${u.nachWallet} übersteigt den bekannten ` +
          `Bestand der Quell-Wallet um ${offen}. Für diese Menge fehlt die Anschaffung — sie wandert ohne Kostenbasis nicht mit.`,
        )
      }
      continue
    }

    const v = ev.e
    if (!(v.quantity > 0)) { warnungen.push(`Veräußerung ${v.id}: Menge ${v.quantity} wird ignoriert.`); continue }
    const liste = lose.get(schluessel(v.asset, v.wallet)) ?? []
    let offen = v.quantity
    const posten: VerbrauchterPosten[] = []

    for (const los of liste) {
      if (offen <= EPS) break
      if (los.restMenge <= EPS) continue
      const nimm = Math.min(offen, los.restMenge)
      const anteil = nimm / v.quantity
      const kosten = los.kosten * (nimm / los.menge)
      const erloes = v.proceedsEur * anteil
      posten.push({
        anschaffungId: los.id,
        anschaffungDatum: los.date,
        quantity: nimm,
        kostenEur: rund(kosten),
        erloesEur: rund(erloes),
        gewinnEur: rund(erloes - kosten),
        haltedauerTage: tageZwischen(los.date, v.date),
        steuerpflichtig: istInnerhalbHaltefrist(los.date, v.date),
      })
      // Kosten und Menge schrumpfen gemeinsam, damit die Rechnung je Los auch nach mehreren
      // Teilverkäufen oder Überträgen stimmt.
      los.kosten -= kosten
      los.menge -= nimm
      los.restMenge -= nimm
      offen -= nimm
    }

    const fehlmenge = offen > EPS ? offen : 0
    if (fehlmenge > 0) {
      const wo = verfahren === 'je-wallet' ? ` der Wallet ${walletOf(v.wallet)}` : ''
      warnungen.push(
        `${v.asset}: Veräußerung ${v.id} am ${v.date} übersteigt den bekannten Bestand${wo} um ${fehlmenge}. ` +
        'Für diese Menge fehlt die Anschaffung (z. B. Zugang ohne Kaufhistorie oder nicht erfasster Übertrag) — sie ist nicht berechnet.',
      )
    }

    ergebnisse.push({
      veraeusserungId: v.id,
      asset: v.asset,
      date: v.date,
      quantity: v.quantity,
      erloesEur: rund(v.proceedsEur),
      fehlmenge,
      posten,
      gewinnEur: rund(posten.reduce((s, p) => s + p.gewinnEur, 0)),
      steuerpflichtigerGewinnEur: rund(posten.filter(p => p.steuerpflichtig).reduce((s, p) => s + p.gewinnEur, 0)),
    })
  }

  // Jahresergebnis nach Veräußerungsjahr.
  const jahre = new Map<number, { pflichtig: number; frei: number }>()
  for (const r of ergebnisse) {
    const jahr = parseDatum(r.date).y
    const j = jahre.get(jahr) ?? { pflichtig: 0, frei: 0 }
    for (const p of r.posten) {
      if (p.steuerpflichtig) j.pflichtig += p.gewinnEur
      else j.frei += p.gewinnEur
    }
    jahre.set(jahr, j)
  }
  const jahresErgebnisse: JahresErgebnis[] = [...jahre.entries()]
    .sort(([a], [b]) => a - b)
    .map(([jahr, j]) => {
      const saldo = rund(j.pflichtig)
      return {
        jahr,
        saldoSteuerpflichtigEur: saldo,
        steuerfreierGewinnEur: rund(j.frei),
        freigrenzeEur,
        zuVersteuernEur: saldo >= freigrenzeEur && saldo > 0 ? saldo : 0,
        verlustEur: saldo < 0 ? rund(-saldo) : 0,
      }
    })

  const bestand = [...lose.entries()].map(([key, liste]) => {
    const [asset, wallet] = key.split(TRENNER)
    const quantity = liste.reduce((sum, l) => sum + l.restMenge, 0)
    const kostenEur = liste.reduce((sum, l) => sum + (l.menge > 0 ? l.kosten * (l.restMenge / l.menge) : 0), 0)
    return { asset, wallet: verfahren === 'gesamt' ? null : (wallet ?? 'default'), quantity, kostenEur: rund(kostenEur) }
  }).filter(b => b.quantity > EPS)

  const offeneLose = [...lose.entries()].flatMap(([key, liste]) => {
    const [asset, wallet] = key.split(TRENNER)
    return liste.filter(l => l.restMenge > EPS).map(l => ({
      asset,
      wallet: verfahren === 'gesamt' ? null : (wallet ?? 'default'),
      anschaffungId: l.id,
      anschaffungDatum: l.date,
      quantity: l.restMenge,
      kostenEur: rund(l.menge > 0 ? l.kosten * (l.restMenge / l.menge) : 0),
      steuerfreiAb: tagNach(haltefristEnde(l.date)),
    }))
  }).sort((a, b) => a.steuerfreiAb.localeCompare(b.steuerfreiAb))

  return { veraeusserungen: ergebnisse, jahre: jahresErgebnisse, bestand, offeneLose, warnungen }
}

/** Der Kalendertag nach `datum` (YYYY-MM-DD). */
function tagNach(datum: string): string {
  const { y, m, d } = parseDatum(datum)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}
