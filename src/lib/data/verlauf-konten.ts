import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { sampleReihe, type KontoPunkt } from '@/lib/verlauf/konten'
import type { AccountBalanceHistoryRow } from '@/lib/data/overview'

/**
 * Datenzugriff fuer den Konten-Tab der Verlauf-Seite. account_balances hat ein Saldo je Konto
 * und Tag (~18k Zeilen) und kein user_id — gefiltert wird deshalb ueber die Konto-IDs des
 * Nutzers (RLS zusaetzlich). Die Seite laedt nie alles: die Reihen werden auf Spalten
 * (Datum, Saldo) und den gewaehlten Zeitraum beschraenkt und serverseitig gesampelt.
 */

type Client = SupabaseClient<Database>

export type VerlaufKonto = {
  id: string; name: string; type: string; color: string | null; is_active: boolean
}

/** Alle Konten des Nutzers inkl. inaktiver (deren Historie bleibt ja sichtbar), aktive zuerst. */
export async function getVerlaufKonten(supabase: Client, userId: string): Promise<VerlaufKonto[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, type, color, is_active')
    .eq('user_id', userId)
    .order('name')
  if (error) throw new Error(`accounts: ${error.message}`)
  const liste = (data ?? []) as VerlaufKonto[]
  return [...liste.filter(k => k.is_active), ...liste.filter(k => !k.is_active)]
}

/** PostgREST kappt Antworten bei 1000 Zeilen (Standard-`max-rows`) — darunter bleiben. */
const SEITE = 1000

/**
 * Saldoreihe EINES Kontos ab `start` (ISO) aufsteigend. Holt nur Datum und Saldo, seitenweise
 * bis die letzte Seite nicht mehr voll ist, und sampelt danach auf `maxPunkte`. Der letzte
 * Punkt ist damit immer der aktuelle Saldo. `balance` kommt als number oder numeric-String.
 */
async function ladeReihe(
  supabase: Client, kontoId: string, start: string | null, maxPunkte: number,
): Promise<KontoPunkt[]> {
  const alle: KontoPunkt[] = []
  for (let von = 0; ; von += SEITE) {
    let q = supabase
      .from('account_balances')
      .select('snapshot_date, balance')
      .eq('account_id', kontoId)
    if (start) q = q.gte('snapshot_date', start)
    const { data, error } = await q
      .order('snapshot_date', { ascending: true })
      .range(von, von + SEITE - 1)
    // Ein Fehler mitten in der Schleife hiesse sonst: Seite fehlt, Schleife endet, die Reihe
    // wirkt einfach kuerzer — ohne jeden Hinweis.
    if (error) throw new Error(`account_balances: ${error.message}`)
    const zeilen = data ?? []
    for (const z of zeilen) alle.push({ datum: z.snapshot_date, saldo: Number(z.balance) })
    if (zeilen.length < SEITE) break
  }
  return sampleReihe(alle, maxPunkte)
}

/** Reihen mehrerer Konten parallel (je Konto ein Abruf-Strang), Schluessel = Konto-ID. */
export async function getKontenReihen(
  supabase: Client, kontoIds: string[], start: string | null, maxPunkte: number,
): Promise<Record<string, KontoPunkt[]>> {
  const reihen = await Promise.all(kontoIds.map(id => ladeReihe(supabase, id, start, maxPunkte)))
  return Object.fromEntries(kontoIds.map((id, i) => [id, reihen[i]]))
}

/** Tabellenseite, gefiltert nach Konten und optional ab `start`, neueste zuerst. */
export async function getKontoSaldenSeite(
  supabase: Client, kontoIds: string[], start: string | null, range: { from: number; to: number },
): Promise<{ rows: AccountBalanceHistoryRow[]; count: number }> {
  // Ohne Konten gar nicht erst fragen: `.in('account_id', ['__none__'])` ist bei einer
  // uuid-Spalte ein Typfehler in Postgres und wurde nur durch den ignorierten Fehler leer.
  if (kontoIds.length === 0) return { rows: [], count: 0 }
  let q = supabase
    .from('account_balances')
    .select('id, account_id, snapshot_date, balance, currency, source', { count: 'exact' })
    .in('account_id', kontoIds)
  if (start) q = q.gte('snapshot_date', start)
  const { data, count, error } = await q
    .order('snapshot_date', { ascending: false })
    .order('account_id')
    .range(range.from, range.to)
  if (error) throw new Error(`account_balances: ${error.message}`)
  return { rows: (data ?? []) as AccountBalanceHistoryRow[], count: count ?? 0 }
}
