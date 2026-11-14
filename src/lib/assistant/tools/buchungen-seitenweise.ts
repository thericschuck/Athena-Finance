import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database.ts'
import type { ScopeContext } from '../../haushalt/scope.ts'
import { scopeKonten } from './scope.ts'

type BuchungKurz = { category_id: string | null; type: string | null; amount: number | null; date: string | null; description: string | null; merchant: string | null }

/**
 * Alle Buchungen seit `seitIso` im Scope, SEITENWEISE. Eine einzelne Abfrage lieferte still nur die ersten 1.000 Zeilen
 * (PostgREST-Deckel): bei mehr Buchungen im Zeitraum (bis 36 Monate) waren Zaehler, Summen und Haendlerliste abgeschnitten, ohne
 * Fehlermeldung. Stabile Reihenfolge ueber `id`, wie in recurring.ts. Rueckgabeform wie eine einzelne Abfrage (`data`/`error`).
 */
export async function ladeBuchungenSeitenweise(supabase: SupabaseClient<Database>, ctx: ScopeContext, seitIso: string) {
  const SEITE = 1000
  const MAX_SEITEN = 50
  const zeilen: BuchungKurz[] = []
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const { data, error } = await scopeKonten(
      supabase.from('unified_transactions').select('id, category_id, type, amount, date, description, merchant'),
      ctx,
    )
      .gte('date', seitIso)
      .order('id', { ascending: true })
      .range(seite * SEITE, seite * SEITE + SEITE - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    for (const r of data) {
      zeilen.push({
        category_id: r.category_id, type: r.type, amount: r.amount, date: r.date, description: r.description, merchant: r.merchant,
      })
    }
    if (data.length < SEITE) break
  }
  return { data: zeilen, error: null }
}
