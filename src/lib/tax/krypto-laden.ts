import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { berechneKrakenSteuer, type KrakenLedgerZeile, type KrakenSteuer, type KrakenTradeZeile } from './krypto-kraken.ts'

type DB = SupabaseClient<Database>

const SEITE = 1000

/**
 * Laedt die gespeicherte Kraken-Historie (unter RLS, fuer genau einen Nutzer) und rechnet das FIFO.
 * Seitenweise, weil PostgREST bei 1.000 Zeilen stillschweigend kappt -- bei einer Steuerrechnung
 * waere das ein fehlender Kauf ohne jede Fehlermeldung (dieselbe Falle wie in laden.ts).
 */
export async function ladeKrakenSteuer(supabase: DB, userId: string, jahr: number): Promise<KrakenSteuer> {
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

  const { data: zustand } = await supabase.from('user_settings').select('value')
    .eq('user_id', userId).eq('key', 'kraken_history_state').maybeSingle()
  const z = zustand?.value && typeof zustand.value === 'object' ? zustand.value as Record<string, unknown> : null
  const vollstaendig = z === null ? null : z.trades_fertig === true && z.ledger_fertig === true

  return berechneKrakenSteuer(trades, ledger, jahr, { historieVollstaendig: vollstaendig })
}
