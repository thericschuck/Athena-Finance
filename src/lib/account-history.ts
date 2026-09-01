import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Saldenhistorie aus `account_balances` — vollstaendig, nicht nur die ersten 1.000 Zeilen.
 *
 * PostgREST deckelt jede Antwort serverseitig (`db-max-rows`, bei Supabase 1.000). Die
 * Abfragen hier sortieren aufsteigend nach Datum, der Deckel schneidet also ausgerechnet
 * das JUENGSTE Ende ab — und das faellt nicht auf, weil kein Fehler zurueckkommt, sondern
 * einfach weniger Daten. Konkret beobachtet (Stand 31.08.2026):
 *
 *   - Kontenuebersicht, Zeitraum 1J: 1.308 Zeilen vorhanden, 1.000 geliefert (bis 10.07.).
 *     Das „Geteilte Konto" beginnt erst am 15.07. — es bekam damit KEINEN einzigen Punkt
 *     und zeigte statt der Sparkline den gestrichelten Platzhalter. Bei den uebrigen Konten
 *     fehlten die letzten sieben Wochen, wodurch auch die Veraenderung daneben falsch war.
 *   - Kontodetailseite „Geschaeftsanteile": 3.002 Snapshots seit 2018, geliefert bis
 *     08.03.2021. Der angezeigte Kontostand stammt aus `at(-1)` — also aus 2021.
 *
 * Deshalb seitenweise abholen statt einer einzelnen Abfrage. Abbruch erst bei einer leeren
 * Seite und Vorruecken um die tatsaechlich gelieferte Zeilenzahl: so bleibt die Schleife
 * auch dann richtig, wenn der serverseitige Deckel kleiner ist als `PAGE_SIZE`.
 */

export interface BalanceSnapshot {
  account_id:    string
  snapshot_date: string
  balance:       number
}

const PAGE_SIZE = 1000

/** Sicherheitsnetz gegen eine Endlosschleife, falls `range` je ignoriert wuerde. */
const MAX_PAGES = 50

export async function fetchBalanceHistory(
  supabase: SupabaseClient<Database>,
  { accountId, from }: { accountId?: string; from?: string | null } = {},
): Promise<BalanceSnapshot[]> {
  const rows: BalanceSnapshot[] = []
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = supabase
      .from('account_balances')
      .select('account_id, snapshot_date, balance')
      // Zweites Sortierkriterium ist Pflicht, nicht Kosmetik: `snapshot_date` allein ist
      // nicht eindeutig (mehrere Konten pro Tag). Ohne stabile Gesamtordnung darf Postgres
      // gleich datierte Zeilen zwischen zwei Seiten anders anordnen — einzelne Snapshots
      // kaemen dann doppelt, andere gar nicht.
      .order('snapshot_date', { ascending: true })
      .order('account_id',    { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (accountId) query = query.eq('account_id', accountId)
    if (from)      query = query.gte('snapshot_date', from)

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      rows.push({
        account_id:    row.account_id,
        snapshot_date: row.snapshot_date,
        balance:       Number(row.balance),
      })
    }
    offset += data.length
  }

  return rows
}
