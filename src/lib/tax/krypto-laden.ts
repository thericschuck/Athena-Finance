import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { berechneKrakenSteuer, type KrakenLedgerZeile, type KrakenSteuer, type KrakenTradeZeile } from './krypto-kraken.ts'

type DB = SupabaseClient<Database>

const SEITE = 1000

/** Rohzeilen der gespeicherten Kraken-Historie. Jahrunabhängig: lässt sich für mehrere Steuerjahre teilen. */
export type KrakenRoh = { trades: KrakenTradeZeile[]; ledger: KrakenLedgerZeile[]; vollstaendig: boolean | null }

/**
 * Laedt die gespeicherte Kraken-Historie (unter RLS, fuer genau einen Nutzer). Seitenweise, weil PostgREST bei 1.000 Zeilen
 * stillschweigend kappt -- bei einer Steuerrechnung waere das ein fehlender Kauf ohne jede Fehlermeldung (dieselbe Falle wie in
 * laden.ts). Trades, Ledger und Ladezustand werden gleichzeitig abgefragt statt nacheinander.
 */
export async function ladeKrakenRoh(supabase: DB, userId: string): Promise<KrakenRoh> {
  const ladeTrades = async (): Promise<KrakenTradeZeile[]> => {
    const trades: KrakenTradeZeile[] = []
    for (let seite = 0; seite < 100; seite++) {
      const { data, error } = await supabase.from('kraken_trades')
        .select('txid, base, side, traded_at, vol, cost, fee, eur_kurs, eur_kurs_geschaetzt')
        .eq('user_id', userId).order('traded_at', { ascending: true }).order('txid', { ascending: true })
        .range(seite * SEITE, seite * SEITE + SEITE - 1)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) {
        trades.push({
          txid: r.txid, base: r.base, side: r.side === 'sell' ? 'sell' : 'buy', traded_at: r.traded_at,
          vol: Number(r.vol), cost: Number(r.cost), fee: Number(r.fee),
          eur_kurs: r.eur_kurs === null ? null : Number(r.eur_kurs), eur_kurs_geschaetzt: r.eur_kurs_geschaetzt,
        })
      }
      if (!data || data.length < SEITE) break
    }
    return trades
  }

  const ladeLedger = async (): Promise<KrakenLedgerZeile[]> => {
    const ledger: KrakenLedgerZeile[] = []
    for (let seite = 0; seite < 100; seite++) {
      const { data, error } = await supabase.from('kraken_ledger')
        .select('ledger_id, refid, type, subtype, asset, amount, fee, occurred_at')
        .eq('user_id', userId).order('occurred_at', { ascending: true }).order('ledger_id', { ascending: true })
        .range(seite * SEITE, seite * SEITE + SEITE - 1)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) ledger.push({ ...r, amount: Number(r.amount), fee: Number(r.fee) })
      if (!data || data.length < SEITE) break
    }
    return ledger
  }

  const [trades, ledger, zustand] = await Promise.all([
    ladeTrades(),
    ladeLedger(),
    supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', 'kraken_history_state').maybeSingle(),
  ])
  const z = zustand.data?.value && typeof zustand.data.value === 'object' ? zustand.data.value as Record<string, unknown> : null
  const vollstaendig = z === null ? null : z.trades_fertig === true && z.ledger_fertig === true
  return { trades, ledger, vollstaendig }
}

/** Rechnet das FIFO fuer ein Jahr. Ohne `roh` wird hier geladen; wer mehrere Jahre rechnet, laedt einmal und teilt `roh`. */
export async function ladeKrakenSteuer(supabase: DB, userId: string, jahr: number, roh?: KrakenRoh): Promise<KrakenSteuer> {
  const r = roh ?? await ladeKrakenRoh(supabase, userId)
  return berechneKrakenSteuer(r.trades, r.ledger, jahr, { historieVollstaendig: r.vollstaendig })
}
