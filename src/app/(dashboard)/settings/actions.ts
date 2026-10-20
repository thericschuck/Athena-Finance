'use server'

import { createClient, getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Json } from '@/types/database'
import { encrypt } from '@/lib/encryption'
import { leseSteuerprofil, schreibeSteuerprofil } from '@/lib/tax/profil'
import { fetchSettingValue } from '@/lib/data/settings'
import { z } from 'zod'
import { parseForm, parseInput, formDataToObject, issueMessage } from '@/lib/api/validate'
import { uuid, optText, optMoneyField, optIntField, boolTrue, checkbox } from '@/lib/api/schemas'

/** Leer/fehlend → Standardwert (wie bisher `value || default`). */
const textOr = (fallback: string, max: number) =>
  z.string().max(max).optional().transform(v => v || fallback)

const profileSchema = z.object({
  avatar_url: optText(2000),
  display_name: optText(100),
  timezone: textOr('Europe/Berlin', 64),
  currency: textOr('EUR', 10),
})

const appearanceSchema = z.object({
  theme_preset: optText(64),
  theme: textOr('system', 20),
  primary_color: z
    .string()
    .optional()
    .transform(v => v || '#00B4D8')
    .pipe(z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Primärfarbe muss ein Hex-Wert sein (#RRGGBB)')),
  compact_tables: boolTrue,
  number_format: textOr('de-DE', 20),
  date_format: textOr('dd.MM.yyyy', 30),
})

const financeSchema = z.object({
  monthly_budget: optMoneyField('Monatsbudget ist ungültig'),
  default_tax_rate: optMoneyField('Steuersatz ist ungültig'),
  brutto_jahreslohn: optMoneyField('Bruttojahreslohn ist ungültig'),
  vorsorge_anteil_pct: optMoneyField('Vorsorgeanteil ist ungültig'),
  kirchensteuer_pct: optMoneyField('Kirchensteuer ist ungültig'),
  netto_quote: optMoneyField('Nettoquote ist ungültig'),
  kleinunternehmer: checkbox,
})

const analyseSchema = z.object({
  analyse_default_period: optText(20),
  analyse_default_heatmap_mode: optText(40),
  analyse_default_accounts: z.preprocess(
    v => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(uuid).max(200),
  ),
})

const exchangeName = z
  .string({ error: 'Alle Felder sind erforderlich' })
  .trim()
  .regex(/^[a-z0-9_]{1,40}$/, 'Börse ist ungültig')

const exchangeKeySchema = z.object({
  exchange: exchangeName,
  api_key: z.string({ error: 'Alle Felder sind erforderlich' }).trim().min(1, 'Alle Felder sind erforderlich').max(1000),
  api_secret: z.string({ error: 'Alle Felder sind erforderlich' }).trim().min(1, 'Alle Felder sind erforderlich').max(4000),
})

const tradingSchema = z.object({
  default_asset_class: textOr('major', 20),
  default_timeframe: optText(20),
  risk_per_trade_pct: optMoneyField('Risiko pro Trade ist ungültig'),
  max_open_trades: optIntField('Max. offene Trades ist ungültig'),
})

const passwordSchema = z.object({
  current_password: z.string({ error: 'Alle Felder ausfüllen' }).min(1, 'Alle Felder ausfüllen').max(256),
  new_password: z.string({ error: 'Alle Felder ausfüllen' }).min(1, 'Alle Felder ausfüllen').max(256),
  confirm_password: z.string({ error: 'Alle Felder ausfüllen' }).min(1, 'Alle Felder ausfüllen').max(256),
})

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export type SettingsState = { error: string } | { success: true } | null

const REVALIDATE = () => revalidatePath('/settings')

async function upsertSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  settings: Record<string, unknown>
) {
  const rows = Object.entries(settings).map(([key, value]) => ({
    user_id: userId,
    key,
    value: value as Json,
  }))
  return supabase
    .from('user_settings')
    .upsert(rows, { onConflict: 'user_id,key' })
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export async function saveProfile(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, profileSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  let avatarUrl = parsed.data.avatar_url

  // Handle file upload to Supabase Storage
  const file = formData.get('avatar_file') as File | null
  if (file && file.size > 0) {
    if (file.size > MAX_AVATAR_BYTES) return { error: 'Bild ist zu groß (max. 5 MB)' }
    if (!file.type.startsWith('image/')) return { error: 'Nur Bilddateien sind erlaubt' }
    const rawExt   = file.name.split('.').pop()?.toLowerCase() ?? ''
    const ext      = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'jpg'
    const filePath = `${user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true, contentType: file.type })

    if (uploadError) return { error: `Bild-Upload fehlgeschlagen: ${uploadError.message}` }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
    avatarUrl = publicUrl
  }

  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      id:           user.id,
      display_name: parsed.data.display_name,
      avatar_url:   avatarUrl,
      timezone:     parsed.data.timezone,
      currency:     parsed.data.currency,
      updated_at:   new Date().toISOString(),
    })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}

// ─── Appearance ───────────────────────────────────────────────────────────────
export async function saveAppearance(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, appearanceSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await upsertSettings(supabase, user.id, parsed.data)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}

// ─── Finance ──────────────────────────────────────────────────────────────────
export async function saveFinance(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, financeSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const f = parsed.data

  // Steuerprofil: ein jsonb-Wert unter dem Schluessel `tax_profile`. Gelesen
  // wird der bisherige Stand mit, weil das Datum `brutto_stand` NUR dann neu
  // gesetzt wird, wenn sich der Bruttolohn wirklich aendert -- sonst wuerde
  // jedes Speichern irgendeiner anderen Einstellung den Wert "frisch"
  // aussehen lassen, und die Warnung vor einem veralteten Lohn waere wertlos.
  const altesProfil = leseSteuerprofil(await fetchSettingValue(supabase, user.id, 'tax_profile'))

  const bruttoNeu = f.brutto_jahreslohn
  const bruttoGeaendert = (bruttoNeu ?? null) !== (altesProfil.bruttoJahreslohn ?? null)

  const zahlOderStandard = (wert: number | null, standard: number) => wert ?? standard

  const neuesProfil = schreibeSteuerprofil(
    leseSteuerprofil({
      brutto_jahreslohn: bruttoNeu,
      brutto_stand: bruttoGeaendert
        ? new Date().toISOString().slice(0, 10)
        : altesProfil.bruttoStand,
      vorsorge_anteil_pct: zahlOderStandard(f.vorsorge_anteil_pct, altesProfil.vorsorgeAnteilPct),
      kirchensteuer_pct:   zahlOderStandard(f.kirchensteuer_pct, altesProfil.kirchensteuerPct),
      netto_quote:         zahlOderStandard(f.netto_quote, altesProfil.nettoQuote),
      kleinunternehmer:    f.kleinunternehmer,
    }),
  )

  const { error } = await upsertSettings(supabase, user.id, {
    monthly_budget:   f.monthly_budget,
    default_tax_rate: f.default_tax_rate,
    tax_profile:      neuesProfil,
  })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}

// ─── Analyse ──────────────────────────────────────────────────────────────────
export async function saveAnalyseDefaults(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, analyseSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await upsertSettings(supabase, user.id, {
    analyse_default_period:       parsed.data.analyse_default_period,
    analyse_default_heatmap_mode: parsed.data.analyse_default_heatmap_mode,
    analyse_default_accounts:     parsed.data.analyse_default_accounts,
  })

  if (error) return { error: error.message }
  revalidatePath('/analyse')
  REVALIDATE()
  return { success: true }
}

// ─── Password ─────────────────────────────────────────────────────────────────
export async function changePassword(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, passwordSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { current_password: current, new_password: next, confirm_password: confirm } = parsed.data

  if (next.length < 8) return { error: 'Passwort muss mindestens 8 Zeichen haben' }
  if (next !== confirm) return { error: 'Neue Passwörter stimmen nicht überein' }

  // Verify current password
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email:    user.email!,
    password: current,
  })
  if (signInError) return { error: 'Aktuelles Passwort ist falsch' }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Exchange Keys ────────────────────────────────────────────────────────────
export async function saveExchangeKey(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, exchangeKeySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { exchange, api_key, api_secret } = parsed.data

  let encryptedKey: string
  let encryptedSecret: string
  try {
    encryptedKey    = encrypt(api_key)
    encryptedSecret = encrypt(api_secret)
  } catch (e) {
    return { error: `Verschlüsselung fehlgeschlagen: ${(e as Error).message}` }
  }

  const { error } = await supabase
    .from('exchange_keys')
    .upsert(
      {
        user_id:    user.id,
        exchange,
        api_key:    encryptedKey,
        api_secret: encryptedSecret,
      },
      { onConflict: 'user_id,exchange' }
    )

  if (error) return { error: error.message }
  revalidatePath('/depot')
  return { success: true }
}

export async function deleteExchangeKey(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseInput(
    z.object({ exchange: exchangeName.optional().transform(v => v ?? 'kraken') }),
    formDataToObject(formData),
  )
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { exchange } = parsed.data

  const { error } = await supabase
    .from('exchange_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('exchange', exchange)

  if (error) return { error: error.message }
  revalidatePath('/depot')
  return { success: true }
}

// ─── Trading ──────────────────────────────────────────────────────────────────
export async function saveTrading(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, tradingSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await upsertSettings(supabase, user.id, parsed.data)

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}
