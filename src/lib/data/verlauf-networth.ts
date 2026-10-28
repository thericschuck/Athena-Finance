import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { NetWorthPunkt } from '@/lib/verlauf/types'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { getNetWorthReihe, nutztSnapshotFunktion } from '@/lib/data/networth-reihe'

/**
 * Datenzugriff des Net-Worth-Tabs. Lädt ALLE Snapshots (keine Seite): Aggregation (Woche/Monat), Deltas, Kennzahlen und Datenqualität
 * brauchen die vollständige Reihe, nicht eine Seite. Bei einer Zeile pro Tag sind das einige
 * hundert Zeilen; die Seitenschleife umgeht nur PostgREST' 1.000-Zeilen-Deckel.
 */

type Client = SupabaseClient<Database>

/** Snapshot samt Zeilen-ID und Quelle — die braucht die Tabelle für Korrigieren/Löschen. */
export type NetWorthZeile = NetWorthPunkt & { id: string; source: string }

const SPALTEN =
  'id, snapshot_date, net_worth, total_assets, total_checking, total_investment, total_savings, total_cash, total_depot, total_crypto, total_bausparer, total_business, total_debts, source'

/**
 * Alle Snapshots, aufsteigend nach Datum. Normalfall: die bisherigen net_worth_snapshots des Nutzers
 * (OWNER-ONLY-Tabelle). Wenn `nutztSnapshotFunktion(ctx)` gilt: berechnete Reihe aus `net_worth_series`
 * (lib/data/networth-reihe.ts), damit das geteilte Konto nicht doppelt zaehlt; Zeilen haben dann source 'berechnet'.
 */
export async function getNetWorthZeilen(supabase: Client, ctx: ScopeContext): Promise<NetWorthZeile[]> {
  return (await getNetWorthZeilenMitHinweis(supabase, ctx)).zeilen
}

export type NetWorthZeilenErgebnis = {
  zeilen: NetWorthZeile[]
  quelle: 'snapshots' | 'funktion'
  /** Gesetzt, wenn die berechnete Reihe (net_worth_series) fehlschlug: die UI zeigt dann einen Hinweis statt einer leeren Reihe. */
  fehler: string | null
}

/** Wie `getNetWorthZeilen`, zusaetzlich mit Quelle und Fehlertext (Verlauf-Tab). */
export async function getNetWorthZeilenMitHinweis(supabase: Client, ctx: ScopeContext): Promise<NetWorthZeilenErgebnis> {
  if (nutztSnapshotFunktion(ctx)) {
    const { rows, fehler } = await getNetWorthReihe(supabase, ctx)
    if (fehler) console.error(`[verlauf] net_worth_series: ${fehler}`)
    return { zeilen: rows.map(({ snapshot_date, ...r }) => ({ ...r, datum: snapshot_date })), quelle: 'funktion', fehler }
  }
  return { zeilen: await ausSnapshotTabelle(supabase, ctx.userId), quelle: 'snapshots', fehler: null }
}

async function ausSnapshotTabelle(supabase: Client, userId: string): Promise<NetWorthZeile[]> {
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
