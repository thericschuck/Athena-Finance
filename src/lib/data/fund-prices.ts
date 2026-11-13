/**
 * Schreibzugriff auf die globale Kurstabelle `fund_prices` (SECURITY-AUDIT.md S4).
 *
 * `fund_prices` gehoert niemandem und fliesst in Depotwert und Nettovermoegen ALLER Nutzer. Schreiben darf deshalb nur der
 * Server mit dem Service-Role-Client (der Aufrufer reicht ihn herein), nie der Browser-Client: die Policies
 * `fund_prices_insert_auth`/`fund_prices_update_auth` entfallen mit der Migration 20261113130000.
 *
 * Und auch der Server schreibt hier nur EINFUEGEND: Der Kurs stammt aus einem Formular (Bestandsuebernahme, manuelle Einzahlung,
 * manuelle Sparplan-Ausfuehrung). Ein Upsert liesse jeden angemeldeten Nutzer den Kurs einer ISIN fuer einen Tag ueberschreiben,
 * auch den, den der Cron (Edge Function fetch-fund-price) geholt hat. Mit `ignoreDuplicates` (INSERT ... ON CONFLICT DO NOTHING)
 * gewinnt immer der erste Eintrag fuer (ISIN, Datum); ein manuell eingegebener Kurs ersetzt einen vorhandenen nicht.
 * Der Kurs der eigenen Buchung steht ohnehin in `depot_transactions.price_per_share`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type KursZeile = {
  isin: string
  fund_name: string
  price: number
  /** YYYY-MM-DD */
  price_date: string
  currency: string
}

/** Legt den Kurs an, falls fuer (ISIN, Datum) noch keiner existiert; ueberschreibt nie. `db` muss der Service-Role-Client sein. */
export async function speichereKursFallsNeu(
  db: SupabaseClient<Database>,
  zeile: KursZeile,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from('fund_prices')
    .upsert(zeile, { onConflict: 'isin,price_date', ignoreDuplicates: true })
  return { error: error ? error.message : null }
}
