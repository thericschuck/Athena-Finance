import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ScopeContext } from '@/lib/haushalt/scope'

/**
 * Nettovermoegensverlauf im Scope.
 *
 * `net_worth_snapshots` ist pro User und Tag aggregiert (der Besitzer-Snapshot enthaelt das geteilte Konto): zwei Snapshots zu
 * addieren zaehlt es doppelt, "nur Malik" und "gemeinsam" sind daraus nicht zu rekonstruieren. Fuer den Haushalt rechnet die
 * DB-Funktion `net_worth_series` (Migration 20261029110000_net_worth_series_scope.sql) die Toepfe je Tag aus account_balances,
 * portfolio_snapshots und depot_transactions im Scope.
 *
 * SCHALTER: `nutztSnapshotFunktion(ctx)`: Scope 'partner' und 'gemeinsam' IMMER ueber die Funktion; Scope 'ich' liest
 * `net_worth_snapshots` (exakt wie bisher, die Funktion wird nie aufgerufen und muss nicht existieren).
 * ANNAHME fuer 'ich': Solange nur der Owner geteilte Konten besitzt, enthaelt sein Snapshot genau 'eigene + geteilte'
 * und ist fuer 'ich' korrekt. Sobald ein Peer ein eigenes geteiltes Konto besitzt (`ctx.sharedFremdBesitz`), fehlt es im
 * Snapshot des Nutzers; dann nutzt auch 'ich' die Funktion. Nicht erfasst: geteilte Assets/Depots anderer (ctx kennt nur
 * Konten) - ebenfalls ein Fall fuer die Funktion, sobald es ihn gibt.
 * Fehlt die Funktion oder schlaegt sie fehl, steht der Grund in `NetWorthReihe.fehler`; die Aufrufer zeigen ihn an
 * (Verlauf-Tab: Hinweis statt stiller leerer Reihe). Scope 'ich' ohne fremdes geteiltes Konto braucht die Funktion nie.
 *
 * Reparieren/Loeschen (snapshot-actions.ts) bleibt owner-only auf net_worth_snapshots; berechnete Zeilen haben
 * `source = 'berechnet'` und keine echte ID (`fn:<datum>`), die Tabelle bietet dafuer keine Bearbeitung an.
 */

type DB = SupabaseClient<Database>

export type NetWorthReihenZeile = {
  id: string
  source: string
  snapshot_date: string
  net_worth: number
  total_assets: number
  total_checking: number
  total_investment: number
  total_savings: number
  total_cash: number
  total_depot: number
  total_crypto: number
  total_bausparer: number
  total_business: number
  total_debts: number
}

export type NetWorthReihe = {
  rows: NetWorthReihenZeile[]
  quelle: 'snapshots' | 'funktion'
  /** Gesetzt, wenn die Funktion gebraucht wurde, aber fehlschlug (dann ggf. leere Reihe). */
  fehler: string | null
}

export const BERECHNET = 'berechnet'

export function nutztSnapshotFunktion(ctx: ScopeContext): boolean {
  return ctx.scope !== 'ich' || ctx.sharedFremdBesitz
}

const SPALTEN =
  'id, snapshot_date, net_worth, total_assets, total_checking, total_investment, total_savings, total_cash, total_depot, total_crypto, total_bausparer, total_business, total_debts, source'

const SEITE = 1000

type SeriesRow = Omit<NetWorthReihenZeile, 'id' | 'source'>
type RpcRange = { range: (from: number, to: number) => PromiseLike<{ data: SeriesRow[] | null; error: { message: string } | null }> }
type RpcFn = (fn: string, args: Record<string, unknown>) => RpcRange

const n = (v: unknown) => Number(v ?? 0)

async function ausSnapshots(supabase: DB, userId: string, ab: string | null): Promise<NetWorthReihenZeile[]> {
  const out: NetWorthReihenZeile[] = []
  for (let von = 0; ; von += SEITE) {
    let q = supabase.from('net_worth_snapshots').select(SPALTEN).eq('user_id', userId)
    if (ab) q = q.gte('snapshot_date', ab)
    const { data, error } = await q.order('snapshot_date', { ascending: true }).range(von, von + SEITE - 1)
    if (error) throw new Error(`net_worth_snapshots: ${error.message}`)
    const zeilen = data ?? []
    for (const r of zeilen) {
      out.push({
        id: r.id, source: r.source, snapshot_date: String(r.snapshot_date).slice(0, 10),
        net_worth: n(r.net_worth), total_assets: n(r.total_assets), total_checking: n(r.total_checking),
        total_investment: n(r.total_investment), total_savings: n(r.total_savings), total_cash: n(r.total_cash),
        total_depot: n(r.total_depot), total_crypto: n(r.total_crypto), total_bausparer: n(r.total_bausparer),
        total_business: n(r.total_business), total_debts: n(r.total_debts),
      })
    }
    if (zeilen.length < SEITE) break
  }
  return out
}

async function ausFunktion(supabase: DB, ctx: ScopeContext, ab: string | null): Promise<NetWorthReihenZeile[]> {
  // Der generierte Typ kennt die Funktion erst nach `supabase gen types`; deshalb schmal getippt.
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn
  const out: NetWorthReihenZeile[] = []
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await rpc('net_worth_series', {
      p_account_ids: ctx.accountIds,
      p_owner_ids: ctx.ownerIds,
      p_include_shared: ctx.includeShared,
      p_from: ab,
    }).range(von, von + SEITE - 1)
    if (error) throw new Error(`net_worth_series: ${error.message}`)
    const zeilen = data ?? []
    for (const r of zeilen) {
      const datum = String(r.snapshot_date).slice(0, 10)
      out.push({
        id: `fn:${datum}`, source: BERECHNET, snapshot_date: datum,
        net_worth: n(r.net_worth), total_assets: n(r.total_assets), total_checking: n(r.total_checking),
        total_investment: n(r.total_investment), total_savings: n(r.total_savings), total_cash: n(r.total_cash),
        total_depot: n(r.total_depot), total_crypto: n(r.total_crypto), total_bausparer: n(r.total_bausparer),
        total_business: n(r.total_business), total_debts: n(r.total_debts),
      })
    }
    if (zeilen.length < SEITE) break
  }
  return out
}

/** Die Verlaufsreihe (aufsteigend) ab `ab` (YYYY-MM-DD) oder komplett. Wirft nur im Snapshot-Pfad bei DB-Fehlern wie bisher. */
export async function getNetWorthReihe(supabase: DB, ctx: ScopeContext, ab: string | null = null): Promise<NetWorthReihe> {
  if (!nutztSnapshotFunktion(ctx)) {
    return { rows: await ausSnapshots(supabase, ctx.userId, ab), quelle: 'snapshots', fehler: null }
  }
  try {
    return { rows: await ausFunktion(supabase, ctx, ab), quelle: 'funktion', fehler: null }
  } catch (e) {
    const fehler = e instanceof Error ? e.message : 'net_worth_series fehlgeschlagen'
    // Kein stiller Rueckfall auf Snapshots: sie waeren fuer diesen Scope falsch (Doppelzaehlung / fehlendes Konto).
    return { rows: [], quelle: 'funktion', fehler }
  }
}
