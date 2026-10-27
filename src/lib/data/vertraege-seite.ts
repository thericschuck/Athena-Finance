import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { getSettings } from '@/lib/settings'
import { getContract, getContracts, getSavingsPlansForContracts, type SavingsPlanRow } from '@/lib/data/finance-planning'
import { getAccountNames } from '@/lib/data/finance-accounts'
import { getCategoryNames } from '@/lib/data/finance-transactions'
import { ladeVertragsVorschlaege, type Vorschlag } from '@/lib/data/vertragsvorschlaege'
import { ladeVertragsAbgleich } from '@/lib/data/vertrag-abgleich'
import type { Abgleich } from '@/lib/forecast/vertrag-abgleich'
import { addTage } from '@/lib/forecast/datum'
import { heuteBerlin } from '@/lib/transaktionen/formular'
import type { Vertrag } from '@/lib/vertraege/rechnen'
import type { VerlaufBuchung } from '@/lib/vertraege/verlauf'

type DB = SupabaseClient<Database>

export type Auswahl = { id: string; name: string }

export type VertraegeSeite = {
  heute: string
  locale: string
  dateFormat: string
  vertraege: Vertrag[]
  depotPlaene: SavingsPlanRow[]
  konten: Auswahl[]
  kategorien: Auswahl[]
  vorschlaege: Vorschlag[]
  ausgeblendet: number
  /** Abgleich je Vertrags-ID (nur prüfbare, aktive Verträge). */
  abgleich: Map<string, Abgleich>
  /** Der Abgleich ließ sich nicht laden (dann fehlt nur die Statusmarke). */
  abgleichFehlt: boolean
}

/** Alles, was die Verträge-Seite braucht. Vorschläge und Abgleich sind Zugaben: scheitern sie, bleibt die Seite benutzbar. */
export async function ladeVertraegeSeite(supabase: DB, ctx: ScopeContext): Promise<VertraegeSeite> {
  let abgleichFehlt = false
  const [vertraege, konten, kategorien, depotPlaene, settings, vorschlag, abgleiche] = await Promise.all([
    getContracts(supabase, ctx),
    getAccountNames(supabase, ctx),
    getCategoryNames(supabase),
    getSavingsPlansForContracts(supabase, ctx),
    getSettings(ctx.userId),
    ladeVertragsVorschlaege(supabase, ctx).catch(() => ({ vorschlaege: [] as Vorschlag[], ausgeblendet: 0 })),
    ladeVertragsAbgleich(supabase, ctx).catch(() => { abgleichFehlt = true; return [] }),
  ])
  return {
    heute: heuteBerlin(),
    locale: (settings.number_format as string) ?? 'de-DE',
    dateFormat: (settings.date_format as string) ?? 'dd.MM.yyyy',
    vertraege: vertraege.map(v => ({ ...v, amount: Number(v.amount), auto_renews: v.auto_renews === true })),
    depotPlaene,
    konten,
    kategorien: kategorien ?? [],
    vorschlaege: vorschlag.vorschlaege,
    ausgeblendet: vorschlag.ausgeblendet,
    abgleich: new Map(abgleiche.map(a => [a.vertrag.id, a.abgleich])),
    abgleichFehlt,
  }
}

export type VertragDetail = {
  heute: string
  locale: string
  dateFormat: string
  vertrag: Vertrag
  konten: Auswahl[]
  kategorien: Auswahl[]
  /** Ausgaben auf dem Vertragskonto der letzten ~14 Monate plus alle mit dem Vertrag verknüpften Buchungen. */
  buchungen: VerlaufBuchung[]
  /** Buchungen, die direkt mit dem Vertrag verknüpft sind (früher vom Cron gebucht). */
  verknuepft: VerlaufBuchung[]
}

/** Ein Vertrag mit den Buchungen, aus denen sich Verlauf und Abgleich ergeben; `null`, wenn er nicht existiert oder nicht zum Haushalt gehört. */
export async function ladeVertragDetail(supabase: DB, ctx: ScopeContext, id: string): Promise<VertragDetail | null> {
  const [vertrag, konten, kategorien, settings] = await Promise.all([
    getContract(supabase, id),
    getAccountNames(supabase, ctx),
    getCategoryNames(supabase),
    getSettings(ctx.userId),
  ])
  if (!vertrag) return null
  const heute = heuteBerlin()

  const spalten = 'id, account_id, date, amount, type, description, merchant, contract_id'
  const [kontoRes, linkRes] = await Promise.all([
    vertrag.account_id
      ? applyAccountScope(supabase.from('unified_transactions').select(spalten), ctx)
        .eq('account_id', vertrag.account_id).eq('type', 'expense')
        .gte('date', addTage(heute, -800)).order('date', { ascending: false }).limit(2000)
      : Promise.resolve({ data: [] }),
    // Verknuepfte Buchungen per Vertrags-ID: RLS (Haushalt) genuegt, kein Konten-Scope (Buchung kann ohne Konto sein).
    supabase.from('unified_transactions').select(spalten)
      .eq('contract_id', id).order('date', { ascending: false }).limit(500),
  ])

  const alsBuchung = (r: { id: string | null; account_id: string | null; date: string | null; amount: number | null; type: string | null; description: string | null; merchant: string | null }): VerlaufBuchung[] =>
    r.id && r.date && r.amount !== null && r.type
      ? [{ id: r.id, account_id: r.account_id, date: r.date, amount: Math.abs(Number(r.amount)), type: r.type, text: r.merchant || r.description || '' }]
      : []

  const verknuepft = (linkRes.data ?? []).flatMap(alsBuchung)
  const alle = new Map<string, VerlaufBuchung>()
  for (const b of [...(kontoRes.data ?? []).flatMap(alsBuchung), ...verknuepft]) alle.set(b.id, b)

  return {
    heute,
    locale: (settings.number_format as string) ?? 'de-DE',
    dateFormat: (settings.date_format as string) ?? 'dd.MM.yyyy',
    vertrag: { ...vertrag, amount: Number(vertrag.amount), auto_renews: vertrag.auto_renews === true },
    konten,
    kategorien: kategorien ?? [],
    buchungen: [...alle.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
    verknuepft,
  }
}
