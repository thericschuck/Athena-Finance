import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyOwnerScope, type ScopeContext } from '@/lib/haushalt/scope'
import { getFlowTransactionsScope } from '@/lib/data/flows-scope'
import { fetchSettingValue } from '@/lib/data/settings'
import { erkenneWiederkehrend, type Kandidat, type WiederkehrBuchung } from '@/lib/finance/wiederkehrend'
import { vertragsEntwurf, type Vertragsentwurf } from '@/lib/finance/vertragsvorschlag'
import { TRANSFER_TYPES } from '@/lib/finance/contract-constants'

type DB = SupabaseClient<Database>

/** In `user_settings`: die Schlüssel der Vorschläge, die du ausgeblendet hast. */
export const AUSGEBLENDET_KEY = 'vertrags_vorschlaege_ausgeblendet'

export type Vorschlag = Pick<
  Kandidat,
  'schluessel' | 'bezeichnung' | 'betrag' | 'betrag_variabel' | 'betrag_min' | 'betrag_max' | 'frequenz' | 'tag_im_monat' | 'anzahl' |
  'erste_buchung' | 'letzte_buchung' | 'jahreskosten' | 'konfidenz' | 'naechste_erwartet' | 'ueberfaellig' | 'ueber_abwickler' |
  'kategorie_name' | 'begruendung'
> & { entwurf: Vertragsentwurf }

export function leseAusgeblendet(roh: unknown): string[] {
  return Array.isArray(roh) ? [...new Set(roh.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 200))].slice(0, 500) : []
}

/**
 * Wiederkehrende Ausgaben der letzten ~20 Monate, für die es noch keinen Vertrag gibt. Gerechnet wird über ALLE Konten und Zahlwege, auch
 * Karte und PayPal (der Händler steht dort im Verwendungszweck). Nicht vorgeschlagen werden Serien, die nicht mehr laufen, Einnahmen, schon
 * ausgeblendete und Überweisungen auf eigene Konten bzw. Sparpläne (Typ transfer/savings_plan/building_savings): das sind keine Kosten.
 */
export async function ladeVertragsVorschlaege(
  supabase: DB, ctx: ScopeContext, heute = new Date().toISOString().slice(0, 10),
): Promise<{ vorschlaege: Vorschlag[]; ausgeblendet: number }> {
  const von = new Date(Date.parse(`${heute}T00:00:00Z`) - 20 * 30.4375 * 86_400_000).toISOString().slice(0, 10)

  const [flows, vertraegeRes, ausgeblendetRoh] = await Promise.all([
    getFlowTransactionsScope(supabase, ctx, { from: von, to: heute, include: { anlage: true, forderung: false } }),
    applyOwnerScope(supabase.from('contracts').select('name, amount, is_active'), ctx),
    fetchSettingValue(supabase, ctx.userId, AUSGEBLENDET_KEY),
  ])
  if (vertraegeRes.error) throw new Error(vertraegeRes.error.message)

  const buchungen: WiederkehrBuchung[] = flows
    .filter(t => t.type === 'expense')
    .map(t => ({
      id: t.id, datum: t.date, betrag: -t.amount, beschreibung: t.description, merchant: t.merchant,
      konto_id: t.account_id, kategorie_id: t.category_id, kategorie_name: t.category_name, kategorie_wurzel: t.root_category_name,
    }))

  const kandidaten = erkenneWiederkehrend(
    buchungen,
    (vertraegeRes.data ?? []).map(v => ({ name: v.name, betrag: Number(v.amount), aktiv: v.is_active !== false })),
    heute,
  )

  const ausgeblendet = new Set(leseAusgeblendet(ausgeblendetRoh))
  const offen = kandidaten.filter(k => k.richtung === 'ausgabe' && k.laeuft_noch && !k.hat_vertrag)
  const vorschlaege: Vorschlag[] = offen
    .filter(k => !ausgeblendet.has(k.schluessel))
    .map(k => ({ ...k, entwurf: vertragsEntwurf(k) }))
    .filter(v => !TRANSFER_TYPES.has(v.entwurf.type))
    // Als Nächstes fällig zuerst (überfällige ganz oben), ohne Termin zuletzt; bei gleichem Tag das Teuerste.
    .sort((a, b) => (a.naechste_erwartet ?? '9999').localeCompare(b.naechste_erwartet ?? '9999') || b.jahreskosten - a.jahreskosten)

  return { vorschlaege, ausgeblendet: offen.filter(k => ausgeblendet.has(k.schluessel)).length }
}
