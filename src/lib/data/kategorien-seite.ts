import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getCategories,
  getEuerZeilenForCategories,
  type CategoryRow,
  type EuerZeileRow,
} from '@/lib/data/finance-transactions'
import { getSettings } from '@/lib/settings'
import { effektiveRollen } from '@/lib/tax/rollen'
import { periodCutoff, type Period } from '@/lib/period'
import {
  baueKategorieBaum,
  nutzungJeKategorie,
  type BuchungKurz,
  type KategorieKnoten,
} from '@/lib/kategorien/berechnen'

type DB = SupabaseClient<Database>

export interface KategorienSeitenDaten {
  period: Period
  baum: KategorieKnoten[]
  /** Die flache Liste fuer die Formulare (Eltern-Auswahl, Ziele beim Loeschen). */
  flat: CategoryRow[]
  euerZeilen: EuerZeileRow[]
  locale: string
  /** Wie viele Buchungen ueberhaupt gelesen wurden (zur Plausibilisierung). */
  buchungen: number
}

const SEITE = 1000
const MAX_SEITEN = 60

/**
 * Alle kategorisierten Buchungen (manuell + Bank) in Auszug: category_id, type, flow_kind, amount_eur, date.
 * PostgREST kappt bei 1.000 Zeilen, deshalb seitenweise mit stabiler Sortierung; die erste Welle
 * laeuft parallel, sobald die Gesamtzahl bekannt ist.
 */
async function ladeBuchungen(supabase: DB, userId: string): Promise<BuchungKurz[]> {
  const basis = () =>
    supabase
      .from('unified_transactions')
      .select('category_id, type, flow_kind, amount_eur, date')
      .eq('user_id', userId)
      .not('category_id', 'is', null)

  const { count } = await supabase
    .from('unified_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('category_id', 'is', null)
  const seiten = Math.min(MAX_SEITEN, Math.max(1, Math.ceil((count ?? SEITE) / SEITE)))

  const antworten = await Promise.all(
    Array.from({ length: seiten }, (_, i) =>
      basis()
        .order('id', { ascending: true })
        .range(i * SEITE, i * SEITE + SEITE - 1),
    ),
  )
  const zeilen: BuchungKurz[] = []
  for (const a of antworten) {
    for (const z of a.data ?? []) {
      zeilen.push({
        category_id: z.category_id,
        type: z.type ?? '',
        flow_kind: z.flow_kind,
        amount_eur: z.amount_eur === null ? null : Number(z.amount_eur),
        date: String(z.date ?? ''),
      })
    }
  }
  return zeilen
}

export async function ladeKategorienSeite(supabase: DB, userId: string, period: Period): Promise<KategorienSeitenDaten> {
  const [flat, settings, alleEuer, buchungen] = await Promise.all([
    getCategories(supabase, userId),
    getSettings(userId),
    // Nur Zeilen, in die Buchungen fliessen -- Summen- und Ergebniszeilen rechnet die App.
    getEuerZeilenForCategories(supabase),
    ladeBuchungen(supabase, userId),
  ])

  // Nur der juengste hinterlegte Jahrgang: zwei Jahrgaenge nebeneinander waeren im Auswahlfeld nicht unterscheidbar.
  const euerJahr = alleEuer[0]?.jahr ?? null
  const euerZeilen = euerJahr === null ? [] : alleEuer.filter((z) => z.jahr === euerJahr)

  const eigene = nutzungJeKategorie(buchungen, periodCutoff(period))
  const baum = baueKategorieBaum(
    flat.map((k) => ({ ...k, budget_monthly: k.budget_monthly === null ? null : Number(k.budget_monthly) })),
    eigene,
    effektiveRollen(flat),
  )

  return {
    period,
    baum,
    flat,
    euerZeilen,
    locale: (settings.number_format as string) ?? 'de-DE',
    buchungen: buchungen.length,
  }
}
