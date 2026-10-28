import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { HERAB_SPALTEN, effektiveBuchung, herabstufungsIds } from '@/lib/haushalt/umbuchung'
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
// Herabstufung (Haushalt): eine Umbuchung ohne Gegenkonto im Scope zaehlt als echte Buchung (Art/Richtung effektiv, lib/haushalt/umbuchung.ts).
const SPALTEN = 'category_id, type, flow_kind, amount_eur, date'
const SPALTEN_HERAB = `${SPALTEN}, signed_amount, account_id, ${HERAB_SPALTEN}`
async function ladeBuchungen(supabase: DB, ctx: ScopeContext): Promise<BuchungKurz[]> {
  const herab = herabstufungsIds(ctx)
  const accountIds = new Set(ctx.accountIds)
  const basis = () =>
    applyAccountScope(
      supabase.from('unified_transactions').select(herab ? SPALTEN_HERAB : SPALTEN),
      ctx,
    )
      .not('category_id', 'is', null)

  const seite = (i: number) =>
    basis()
      .order('id', { ascending: true })
      .range(i * SEITE, i * SEITE + SEITE - 1)

  // Zaehlung und erste Seite sind unabhaengig: gleichzeitig starten. Bis 1.000 kategorisierte Buchungen (der Normalfall) ist damit
  // eine Rundreise genug; nur bei mehr Zeilen folgt die zweite Welle (Seiten 2..n parallel), wie bisher mit der Gesamtzahl.
  const [{ count }, erste] = await Promise.all([
    applyAccountScope(
      supabase.from('unified_transactions').select('id', { count: 'exact', head: true }),
      ctx,
    )
      .not('category_id', 'is', null),
    seite(0),
  ])
  const seiten = Math.min(MAX_SEITEN, Math.max(1, Math.ceil((count ?? SEITE) / SEITE)))

  const weitere = await Promise.all(Array.from({ length: seiten - 1 }, (_, i) => seite(i + 1)))
  const antworten = [erste, ...weitere]
  const zeilen: BuchungKurz[] = []
  for (const a of antworten) {
    for (const roh of (a.data ?? []) as unknown as (BuchungsQuelle[])) {
      const z = herab ? effektiveBuchung({ ...roh, signed_amount: Number(roh.signed_amount ?? 0), type: roh.type ?? '' }, accountIds) : roh
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

type BuchungsQuelle = {
  category_id: string | null
  type: string | null
  flow_kind: string
  amount_eur: number | string | null
  date: string | null
  signed_amount?: number | string | null
  account_id?: string | null
  counterpart_account_id?: string | null
  flow_kind_extern?: string | null
}

export async function ladeKategorienSeite(supabase: DB, ctx: ScopeContext, period: Period): Promise<KategorienSeitenDaten> {
  const [flat, settings, alleEuer, buchungen] = await Promise.all([
    getCategories(supabase, ctx.userId),
    getSettings(ctx.userId),
    // Nur Zeilen, in die Buchungen fliessen -- Summen- und Ergebniszeilen rechnet die App.
    getEuerZeilenForCategories(supabase),
    ladeBuchungen(supabase, ctx),
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
