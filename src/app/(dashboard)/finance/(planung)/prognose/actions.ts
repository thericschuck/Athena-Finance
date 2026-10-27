'use server'

import { resolveScope } from '@/lib/haushalt/resolve'
import { applyAccountScope } from '@/lib/haushalt/scope'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { fetchSettingValue } from '@/lib/data/settings'
import { ANNAHMEN_KEY, ANNAHME_ARTEN, leseAnnahmen } from '@/lib/forecast/annahmen'
import { leseUeberschreibung, UEBERSCHREIBUNG_KEY } from '@/lib/forecast/einmalig'
import { pruefeAnnahme } from '@/lib/prognose-seite/annahme-eingabe'
import { mischeUeberschreibung } from '@/lib/prognose-seite/berechnen'
import type { Json } from '@/types/database'

export type AnnahmenState = { error?: string; success?: boolean } | null

/**
 * Besitz: Annahmen und Auswahl liegen als JSON in der `user_settings`-Zeile des angemeldeten Nutzers
 * (user_id kommt aus der Sitzung, nie aus dem Formular). Eine Annahme-Id, die nicht in SEINER Liste
 * steht, wird abgelehnt; Buchungs-Ids der Einmalposten müssen ihm gehören.
 */

const annahmeSchema = z.object({
  id: z.string().max(40).optional(),
  label: z.string().max(200),
  art: z.enum(ANNAHME_ARTEN),
  von: z.string().max(10),
  bis: z.string().max(10),
  betrag: z.string().max(40),
  brutto: z.string().max(40),
})

const text = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

/** Legt eine Annahme an oder ändert sie (mit `id`). */
export async function speichereAnnahme(_prev: AnnahmenState, formData: FormData): Promise<AnnahmenState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = annahmeSchema.safeParse({
    id: text(formData, 'id') || undefined,
    label: text(formData, 'label'),
    art: text(formData, 'art'),
    von: text(formData, 'von'),
    bis: text(formData, 'bis'),
    betrag: text(formData, 'betrag'),
    brutto: text(formData, 'brutto'),
  })
  if (!parsed.success) return { error: 'Bitte alle Felder prüfen (Bezeichnung, Art, Monate, Betrag).' }
  const { id, ...roh } = parsed.data

  const geprueft = pruefeAnnahme(roh)
  if (!geprueft.ok) return { error: geprueft.fehler }

  const bisher = leseAnnahmen(await fetchSettingValue(supabase, user.id, ANNAHMEN_KEY))
  let liste = bisher
  if (id) {
    if (!bisher.some(a => a.id === id)) return { error: 'Diese Annahme gibt es nicht mehr. Bitte die Seite neu laden.' }
    liste = bisher.map(a => (a.id === id ? { ...a, ...geprueft.wert } : a))
  } else {
    if (bisher.length >= 50) return { error: 'Es sind höchstens 50 Annahmen möglich.' }
    liste = [...bisher, { id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...geprueft.wert }]
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, key: ANNAHMEN_KEY, value: liste as unknown as Json }, { onConflict: 'user_id,key' })
  if (error) return { error: error.message }

  revalidatePath('/finance/prognose')
  return { success: true }
}

/** Entfernt eine Annahme aus der Liste des Nutzers. */
export async function loescheAnnahme(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  if (typeof id !== 'string' || id.length === 0 || id.length > 40) return { error: 'Ungültige Annahme' }

  const bisher = leseAnnahmen(await fetchSettingValue(supabase, user.id, ANNAHMEN_KEY))
  if (!bisher.some(a => a.id === id)) return {}
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: user.id, key: ANNAHMEN_KEY, value: bisher.filter(a => a.id !== id) as unknown as Json },
      { onConflict: 'user_id,key' },
    )
  if (error) return { error: error.message }

  revalidatePath('/finance/prognose')
  return {}
}

/**
 * Speichert, welche großen Posten das Modell nicht lernen soll. Das Formular schickt die
 * ABWEICHUNGEN vom Standard (`ueberschreibung`: `aus` zusätzlich ausgeschlossen, `ein` extremer Posten
 * zurückgeholt) und die Ids, die es angezeigt hat (`sichtbar`). Nur für diese Ids wird die gespeicherte
 * Auswahl ersetzt; Entscheidungen zu Posten außerhalb der Liste bleiben erhalten.
 */
export async function speichereEinmalposten(_prev: AnnahmenState, formData: FormData): Promise<AnnahmenState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const lies = (key: string): unknown => {
    const roh = formData.get(key)
    if (typeof roh !== 'string' || roh.length > 100_000) return undefined
    try { return JSON.parse(roh) } catch { return undefined }
  }
  const auswahl = lies('ueberschreibung')
  const sichtbarRoh = lies('sichtbar')
  if (auswahl === undefined || sichtbarRoh === undefined) return { error: 'Die Auswahl konnte nicht gelesen werden' }

  const neu = leseUeberschreibung(auswahl)
  const sichtbar = leseUeberschreibung({ aus: sichtbarRoh }).aus
  const alleIds = [...new Set([...neu.aus, ...neu.ein])]

  // Besitzprüfung: nur Buchungen im Scope des angemeldeten Nutzers.
  let erlaubt = new Set<string>()
  if (alleIds.length > 0) {
    // Buchungen der Konten im Scope (Haushalt); die Auswahl selbst landet owner-only in user_settings.
    const ctx = await resolveScope(supabase, user)
    const { data, error: ownErr } = await applyAccountScope(supabase.from('unified_transactions').select('id'), ctx)
      .in('id', alleIds)
    if (ownErr) return { error: ownErr.message }
    erlaubt = new Set((data ?? []).map(r => String(r.id)))
  }

  const bisher = leseUeberschreibung(await fetchSettingValue(supabase, user.id, UEBERSCHREIBUNG_KEY))
  const gueltig = mischeUeberschreibung(bisher, sichtbar, neu, erlaubt)

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, key: UEBERSCHREIBUNG_KEY, value: gueltig as unknown as Json }, { onConflict: 'user_id,key' })
  if (error) return { error: error.message }

  revalidatePath('/finance/prognose')
  return { success: true }
}
