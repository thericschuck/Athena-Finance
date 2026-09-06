'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Json } from '@/types/database'
import { encrypt } from '@/lib/encryption'
import { leseSteuerprofil, schreibeSteuerprofil } from '@/lib/tax/profil'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  let avatarUrl = (formData.get('avatar_url') as string) || null

  // Handle file upload to Supabase Storage
  const file = formData.get('avatar_file') as File | null
  if (file && file.size > 0) {
    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
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
      display_name: (formData.get('display_name') as string) || null,
      avatar_url:   avatarUrl,
      timezone:     (formData.get('timezone') as string) || 'Europe/Berlin',
      currency:     (formData.get('currency') as string) || 'EUR',
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await upsertSettings(supabase, user.id, {
    theme_preset:   (formData.get('theme_preset') as string) || null,
    theme:          formData.get('theme') as string || 'system',
    primary_color:  formData.get('primary_color') as string || '#00B4D8',
    compact_tables: formData.get('compact_tables') === 'true',
    number_format:  formData.get('number_format') as string || 'de-DE',
    date_format:    formData.get('date_format') as string || 'dd.MM.yyyy',
  })

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const monthlyBudget = formData.get('monthly_budget') as string
  const taxRate       = formData.get('default_tax_rate') as string

  // Steuerprofil: ein jsonb-Wert unter dem Schluessel `tax_profile`. Gelesen
  // wird der bisherige Stand mit, weil das Datum `brutto_stand` NUR dann neu
  // gesetzt wird, wenn sich der Bruttolohn wirklich aendert -- sonst wuerde
  // jedes Speichern irgendeiner anderen Einstellung den Wert "frisch"
  // aussehen lassen, und die Warnung vor einem veralteten Lohn waere wertlos.
  const { data: bisher } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', 'tax_profile')
    .maybeSingle()
  const altesProfil = leseSteuerprofil(bisher?.value ?? null)

  const bruttoEingabe = formData.get('brutto_jahreslohn') as string
  const bruttoNeu = bruttoEingabe ? parseFloat(bruttoEingabe) : null
  const bruttoGeaendert = (bruttoNeu ?? null) !== (altesProfil.bruttoJahreslohn ?? null)

  const zahlOderStandard = (feld: string, standard: number) => {
    const roh = formData.get(feld) as string
    const n = roh ? parseFloat(roh) : NaN
    return Number.isFinite(n) ? n : standard
  }

  const neuesProfil = schreibeSteuerprofil(
    leseSteuerprofil({
      brutto_jahreslohn: bruttoNeu,
      brutto_stand: bruttoGeaendert
        ? new Date().toISOString().slice(0, 10)
        : altesProfil.bruttoStand,
      vorsorge_anteil_pct: zahlOderStandard('vorsorge_anteil_pct', altesProfil.vorsorgeAnteilPct),
      kirchensteuer_pct:   zahlOderStandard('kirchensteuer_pct', altesProfil.kirchensteuerPct),
      netto_quote:         zahlOderStandard('netto_quote', altesProfil.nettoQuote),
      kleinunternehmer:    formData.get('kleinunternehmer') === 'on',
    }),
  )

  const { error } = await upsertSettings(supabase, user.id, {
    monthly_budget:   monthlyBudget ? parseFloat(monthlyBudget) : null,
    default_tax_rate: taxRate ? parseFloat(taxRate) : null,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const period      = formData.get('analyse_default_period') as string
  const heatmapMode = formData.get('analyse_default_heatmap_mode') as string
  // Multiple checkboxes share the name "analyse_default_accounts" — getAll collects every
  // checked value. Empty array is a valid, meaningful choice ("alle Konten").
  const accountIds  = formData.getAll('analyse_default_accounts') as string[]

  const { error } = await upsertSettings(supabase, user.id, {
    analyse_default_period:       period || null,
    analyse_default_heatmap_mode: heatmapMode || null,
    analyse_default_accounts:     accountIds,
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
  const supabase    = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const current = formData.get('current_password') as string
  const next    = formData.get('new_password') as string
  const confirm = formData.get('confirm_password') as string

  if (!current || !next || !confirm) return { error: 'Alle Felder ausfüllen' }
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const exchange  = (formData.get('exchange')   as string)?.trim()
  const api_key   = (formData.get('api_key')    as string)?.trim()
  const api_secret = (formData.get('api_secret') as string)?.trim()

  if (!exchange || !api_key || !api_secret) {
    return { error: 'Alle Felder sind erforderlich' }
  }

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const exchange = (formData.get('exchange') as string)?.trim() ?? 'kraken'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const riskPct   = formData.get('risk_per_trade_pct') as string
  const maxTrades = formData.get('max_open_trades') as string

  const { error } = await upsertSettings(supabase, user.id, {
    default_asset_class: formData.get('default_asset_class') as string || 'major',
    default_timeframe:   (formData.get('default_timeframe') as string) || null,
    risk_per_trade_pct:  riskPct ? parseFloat(riskPct) : null,
    max_open_trades:     maxTrades ? parseInt(maxTrades) : null,
  })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}
