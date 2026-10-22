import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { expandiereLaeufe, type BalanceRun, type BalanceSnapshot } from '@/lib/account-history-runs'

export type { BalanceSnapshot }

/**
 * Saldenhistorie aus `account_balances` — vollstaendig, in EINER Anfrage.
 *
 * Fruehere Fassung: Tageszeilen seitenweise a 1.000 holen (PostgREST deckelt jede Antwort still bei 1.000, und weil
 * aufsteigend sortiert wird, schneidet der Deckel das JUENGSTE Ende ab, ohne Fehler). Das waren bei 18.324 Zeilen
 * (6 Konten x 3.054 Tage seit 2018) drei bis vier Anfragen NACHEINANDER; ein Lesen aller Zeilen unter RLS dauerte rund 300 ms.
 *
 * Jetzt liefert die DB-Funktion `balance_series` (Migration 20261023100000) Laeufe: aufeinanderfolgende Tage mit gleichem Stand
 * in einer Zeile (386 statt 18.324 Zeilen). Der Code rekonstruiert daraus exakt dieselben Tageszeilen wie zuvor
 * (`expandiereLaeufe`), denn Sparkline und Chart verteilen ihre Punkte nach Index und brauchen die volle Tagesreihe.
 *
 * Die 1.000-Zeilen-Grenze gilt auch fuer das Ergebnis der Funktion. Heute reicht eine Anfrage (386 Laeufe); die Schleife
 * blaettert trotzdem, falls die Zahl der Laeufe einmal darueber waechst. Die Funktion sortiert nach (Konto, von),
 * das ist eine stabile Gesamtordnung, ein Lauf kommt also nie doppelt oder gar nicht.
 */

const PAGE_SIZE = 1000

/** Sicherheitsnetz gegen eine Endlosschleife, falls `range` je ignoriert wuerde. */
const MAX_PAGES = 50

export async function fetchBalanceHistory(
  supabase: SupabaseClient<Database>,
  { accountId, from }: { accountId?: string; from?: string | null } = {},
): Promise<BalanceSnapshot[]> {
  const laeufe: BalanceRun[] = []
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .rpc('balance_series', { p_account_id: accountId, p_from: from ?? undefined })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      laeufe.push({ account_id: row.account_id, von: row.von, bis: row.bis, balance: Number(row.balance) })
    }
    offset += data.length
    if (data.length < PAGE_SIZE) break
  }

  return expandiereLaeufe(laeufe)
}
