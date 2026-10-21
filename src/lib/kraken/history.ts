/**
 * Kraken-Handelshistorie fuer die Steuer: laedt Trades und Ledger-Eintraege vollstaendig und legt sie in
 * `kraken_trades` / `kraken_ledger` ab (idempotent ueber txid bzw. ledger_id).
 *
 * Kraken drosselt TradesHistory und Ledgers stark (je Aufruf 2 Punkte, ein Starter-Konto fasst 15 und
 * erholt sich mit 0,33 Punkten pro Sekunde). Deshalb ist der Abruf bewusst fortsetzbar statt "alles auf
 * einmal":
 *   1. Neues zuerst: ab dem letzten gespeicherten Zeitpunkt vorwaerts. Im Normalbetrieb ein einziger Aufruf.
 *   2. Danach der Rueckstand: rueckwaerts ab dem aeltesten gespeicherten Zeitpunkt, bis Kraken nichts
 *      Aelteres mehr liefert. Bei Drosselung wird abgebrochen und beim naechsten Sync fortgesetzt.
 * `user_settings.kraken_history_state` merkt sich, welche Richtung fertig ist.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { KRAKEN_API, nextNonce, signKrakenRequest, type KrakenAssetPair } from '@/lib/kraken'

type DB = SupabaseClient<Database>

const SEITE = 50
const PAUSE_MS = 1500
const STATE_KEY = 'kraken_history_state'

export type KrakenTradeRoh = {
  pair: string
  type: 'buy' | 'sell'
  price: string
  cost: string
  fee: string
  vol: string
  time: number
}

export type KrakenLedgerRoh = {
  refid?: string
  time: number
  type: string
  subtype?: string
  asset: string
  amount: string
  fee: string
}

type Abruf<T> = { items: [string, T][]; erschoepft: boolean; gedrosselt: boolean }

const schlafe = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Fehler, nach denen ein spaeterer Lauf weitermachen kann, statt den Sync abzubrechen. */
const istDrosselung = (e: string) => /rate limit|lockout/i.test(e)

async function blaettere<T>(
  pfad: '/0/private/TradesHistory' | '/0/private/Ledgers',
  wurzel: 'trades' | 'ledger',
  apiKey: string, apiSecret: string,
  params: { start?: number; end?: number },
  maxSeiten: number,
): Promise<Abruf<T>> {
  const items: [string, T][] = []
  for (let seite = 0; seite < maxSeiten; seite++) {
    if (seite > 0) await schlafe(PAUSE_MS)
    const nonce = nextNonce()
    const felder = new URLSearchParams({ nonce, ofs: String(seite * SEITE) })
    if (params.start !== undefined) felder.set('start', String(params.start))
    if (params.end !== undefined) felder.set('end', String(params.end))
    const postData = felder.toString()

    const res = await fetch(`${KRAKEN_API}${pfad}`, {
      method: 'POST',
      headers: {
        'API-Key': apiKey,
        'API-Sign': signKrakenRequest(pfad, nonce, postData, apiSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
      cache: 'no-store',
    })
    const json = await res.json() as { error: string[]; result?: Record<string, unknown> & { count?: number } }
    if (json.error?.length) {
      const text = json.error.join(', ')
      if (istDrosselung(text)) return { items, erschoepft: false, gedrosselt: true }
      throw new Error(text)
    }
    const eintraege = Object.entries((json.result?.[wurzel] ?? {}) as Record<string, T>)
    items.push(...eintraege)
    const gesamt = json.result?.count ?? items.length
    if (eintraege.length === 0 || items.length >= gesamt) return { items, erschoepft: true, gedrosselt: false }
  }
  return { items, erschoepft: false, gedrosselt: false }
}

type Zustand = { trades_fertig: boolean; ledger_fertig: boolean }

function leseZustand(roh: unknown): Zustand {
  const o = roh && typeof roh === 'object' ? roh as Record<string, unknown> : {}
  return { trades_fertig: o.trades_fertig === true, ledger_fertig: o.ledger_fertig === true }
}

async function zeitpunkt(supabase: DB, userId: string, tabelle: 'kraken_trades' | 'kraken_ledger', richtung: 'min' | 'max'): Promise<number | null> {
  const spalte = tabelle === 'kraken_trades' ? 'traded_at' : 'occurred_at'
  const { data } = await supabase.from(tabelle).select(spalte)
    .eq('user_id', userId).order(spalte, { ascending: richtung === 'min' }).limit(1)
  const wert = (data?.[0] as Record<string, string> | undefined)?.[spalte]
  return wert ? Math.floor(Date.parse(wert) / 1000) : null
}

/** Faktor Quote -> EUR. Nur EUR (exakt) und USD (Kurs zum Sync-Zeitpunkt, deshalb als Schaetzung markiert). */
function eurKurs(quote: string, usdPerEur: number): { kurs: number | null; geschaetzt: boolean } {
  if (quote === 'ZEUR' || quote === 'EUR') return { kurs: 1, geschaetzt: false }
  if ((quote === 'ZUSD' || quote === 'USD') && usdPerEur > 0) return { kurs: 1 / usdPerEur, geschaetzt: true }
  return { kurs: null, geschaetzt: false }
}

export type GespeicherterTrade = {
  base: string
  side: string
  traded_at: string
  vol: number
  cost: number
  fee: number
  eur_kurs: number | null
}

export type HistorieErgebnis = {
  trades: GespeicherterTrade[]
  /** true, wenn Trades UND Ledger bis zum Anfang geladen sind. */
  vollstaendig: boolean
  warnungen: string[]
}

async function ladeAlleTrades(supabase: DB, userId: string): Promise<GespeicherterTrade[]> {
  const aus: GespeicherterTrade[] = []
  for (let seite = 0; seite < 100; seite++) {
    const { data, error } = await supabase.from('kraken_trades')
      .select('base, side, traded_at, vol, cost, fee, eur_kurs')
      .eq('user_id', userId).order('traded_at', { ascending: true }).order('txid', { ascending: true })
      .range(seite * 1000, seite * 1000 + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) aus.push({ ...r, vol: Number(r.vol), cost: Number(r.cost), fee: Number(r.fee), eur_kurs: r.eur_kurs === null ? null : Number(r.eur_kurs) })
    if (!data || data.length < 1000) break
  }
  return aus
}

export async function syncKrakenHistorie(
  supabase: DB,
  userId: string,
  apiKey: string,
  apiSecret: string,
  assetPairs: Record<string, KrakenAssetPair>,
  usdPerEur: number,
): Promise<HistorieErgebnis> {
  const warnungen: string[] = []
  const { data: stateRow } = await supabase.from('user_settings').select('value')
    .eq('user_id', userId).eq('key', STATE_KEY).maybeSingle()
  const zustand = leseZustand(stateRow?.value)

  // ── Trades ────────────────────────────────────────────────────────────────
  const speichereTrades = async (items: [string, KrakenTradeRoh][]): Promise<number> => {
    let unbekannt = 0
    const zeilen: Database['public']['Tables']['kraken_trades']['Insert'][] = []
    for (const [txid, t] of items) {
      const paar = assetPairs[t.pair]
      const preis = parseFloat(t.price), kosten = parseFloat(t.cost), menge = parseFloat(t.vol), gebuehr = parseFloat(t.fee)
      if (!paar || [preis, kosten, menge, gebuehr].some(Number.isNaN) || !(menge > 0)) { unbekannt++; continue }
      const { kurs, geschaetzt } = eurKurs(paar.quote, usdPerEur)
      zeilen.push({
        user_id: userId, txid, pair: t.pair, base: paar.base, quote: paar.quote, side: t.type,
        traded_at: new Date(t.time * 1000).toISOString(), price: preis, vol: menge, cost: kosten, fee: gebuehr,
        eur_kurs: kurs, eur_kurs_geschaetzt: geschaetzt,
      })
    }
    if (zeilen.length > 0) {
      const { error } = await supabase.from('kraken_trades').upsert(zeilen, { onConflict: 'user_id,txid' })
      if (error) throw new Error(error.message)
    }
    return unbekannt
  }

  try {
    const neuesterT = await zeitpunkt(supabase, userId, 'kraken_trades', 'max')
    const neu = await blaettere<KrakenTradeRoh>('/0/private/TradesHistory', 'trades', apiKey, apiSecret,
      neuesterT === null ? {} : { start: neuesterT - 1 }, 10)
    let unbekannt = await speichereTrades(neu.items)
    // Ohne gespeicherten Bestand liefert der erste Abruf schon alles, wenn er erschoepft ist.
    if (neuesterT === null && neu.erschoepft) zustand.trades_fertig = true

    if (!zustand.trades_fertig && !neu.gedrosselt) {
      const aeltesterT = await zeitpunkt(supabase, userId, 'kraken_trades', 'min')
      await schlafe(PAUSE_MS)
      const alt = await blaettere<KrakenTradeRoh>('/0/private/TradesHistory', 'trades', apiKey, apiSecret,
        aeltesterT === null ? {} : { end: aeltesterT }, 6)
      unbekannt += await speichereTrades(alt.items)
      if (alt.erschoepft) zustand.trades_fertig = true
    }
    if (unbekannt > 0) warnungen.push(`${unbekannt} Kraken-Trades wurden uebersprungen, weil ihr Handelspaar nicht mehr bekannt ist.`)
  } catch (e) {
    warnungen.push(`Kraken-Trades fuer die Steuer nicht abrufbar (API-Key-Berechtigung "Query Closed Orders & Trades" pruefen): ${(e as Error).message}`)
  }

  // ── Ledger ────────────────────────────────────────────────────────────────
  const speichereLedger = async (items: [string, KrakenLedgerRoh][]) => {
    const zeilen: Database['public']['Tables']['kraken_ledger']['Insert'][] = []
    for (const [ledgerId, l] of items) {
      const betrag = parseFloat(l.amount), gebuehr = parseFloat(l.fee)
      if (Number.isNaN(betrag) || Number.isNaN(gebuehr)) continue
      zeilen.push({
        user_id: userId, ledger_id: ledgerId, refid: l.refid ?? null, type: l.type, subtype: l.subtype || null,
        asset: l.asset, amount: betrag, fee: gebuehr, occurred_at: new Date(l.time * 1000).toISOString(),
      })
    }
    if (zeilen.length > 0) {
      const { error } = await supabase.from('kraken_ledger').upsert(zeilen, { onConflict: 'user_id,ledger_id' })
      if (error) throw new Error(error.message)
    }
  }

  try {
    await schlafe(PAUSE_MS)
    const neuesterL = await zeitpunkt(supabase, userId, 'kraken_ledger', 'max')
    const neu = await blaettere<KrakenLedgerRoh>('/0/private/Ledgers', 'ledger', apiKey, apiSecret,
      neuesterL === null ? {} : { start: neuesterL - 1 }, 6)
    await speichereLedger(neu.items)
    if (neuesterL === null && neu.erschoepft) zustand.ledger_fertig = true

    if (!zustand.ledger_fertig && !neu.gedrosselt) {
      const aeltesterL = await zeitpunkt(supabase, userId, 'kraken_ledger', 'min')
      await schlafe(PAUSE_MS)
      const alt = await blaettere<KrakenLedgerRoh>('/0/private/Ledgers', 'ledger', apiKey, apiSecret,
        aeltesterL === null ? {} : { end: aeltesterL }, 4)
      await speichereLedger(alt.items)
      if (alt.erschoepft) zustand.ledger_fertig = true
    }
  } catch (e) {
    warnungen.push(`Kraken-Ledger (Ein-/Auszahlungen, Staking) nicht abrufbar (API-Key-Berechtigung "Query Ledger Entries" pruefen): ${(e as Error).message}`)
  }

  await supabase.from('user_settings').upsert(
    { user_id: userId, key: STATE_KEY, value: zustand as unknown as Json },
    { onConflict: 'user_id,key' },
  )

  return {
    trades: await ladeAlleTrades(supabase, userId),
    vollstaendig: zustand.trades_fertig && zustand.ledger_fertig,
    warnungen,
  }
}
