import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { NetWorthPunkt } from '@/lib/verlauf/types'

/**
 * Datenzugriff des Net-Worth-Tabs. Anders als `getNetWorthHistoryPage` (overview.ts) lädt
 * dies ALLE Snapshots: Aggregation (Woche/Monat), Deltas, Kennzahlen und Datenqualität
 * brauchen die vollständige Reihe, nicht eine Seite. Bei einer Zeile pro Tag sind das einige
 * hundert Zeilen; die Seitenschleife umgeht nur PostgREST' 1.000-Zeilen-Deckel.
 */

type Client = SupabaseClient<Database>

/** Snapshot samt Zeilen-ID und Quelle — die braucht die Tabelle für Korrigieren/Löschen. */
export type NetWorthZeile = NetWorthPunkt & { id: string; source: string }

const SPALTEN =
  'id, snapshot_date, net_worth, total_assets, total_checking, total_investment, total_savings, total_cash, total_depot, total_crypto, total_bausparer, total_business, total_debts, source'

/** Alle Snapshots des Nutzers, aufsteigend nach Datum. */
export async function getNetWorthZeilen(supabase: Client, userId: string): Promise<NetWorthZeile[]> {
  const out: NetWorthZeile[] = []
  const SEITE = 1000
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await supabase
      .from('net_worth_snapshots')
      .select(SPALTEN)
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: true })
      .range(von, von + SEITE - 1)
    if (error) throw new Error(`net_worth_snapshots: ${error.message}`)
    const zeilen = data ?? []
    for (const r of zeilen) {
      // numeric kommt je nach Treiber als Zahl oder String zurück — einheitlich zu Number.
      out.push({
        id: r.id,
        source: r.source,
        datum: r.snapshot_date,
        net_worth: Number(r.net_worth),
        total_assets: Number(r.total_assets),
        total_checking: Number(r.total_checking),
        total_investment: Number(r.total_investment),
        total_savings: Number(r.total_savings),
        total_cash: Number(r.total_cash),
        total_depot: Number(r.total_depot),
        total_crypto: Number(r.total_crypto),
        total_bausparer: Number(r.total_bausparer),
        total_business: Number(r.total_business),
        total_debts: Number(r.total_debts),
      })
    }
    if (zeilen.length < SEITE) break
  }
  return out
}
