'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type IndicatorActionState = { error: string } | { success: true } | null
export type PerfActionState      = { error: string } | { success: true } | null

const REVALIDATE = () => revalidatePath('/strategy/indicators')

// ─── Indicators ───────────────────────────────────────────────────────────────
export async function createIndicator(
  _prev: IndicatorActionState,
  formData: FormData
): Promise<IndicatorActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name   = (formData.get('name') as string)?.trim()
  const author = (formData.get('author') as string)?.trim()
  const type   = (formData.get('type') as string)?.trim()

  if (!name)   return { error: 'Name ist erforderlich' }
  if (!author) return { error: 'Author ist erforderlich' }
  if (!type)   return { error: 'Typ ist erforderlich' }

  const { error } = await supabase.from('indicators').insert({
    name,
    author,
    type,
    subtype:          (formData.get('subtype') as string) || null,
    repaints:         formData.get('repaints') === 'true',
    is_forbidden:     formData.get('is_forbidden') === 'true',
    forbidden_reason: (formData.get('forbidden_reason') as string) || null,
    tv_url:           (formData.get('tv_url') as string) || null,
    notes:            (formData.get('notes') as string) || null,
    user_id:          user.id,
  })

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function updateIndicator(
  _prev: IndicatorActionState,
  formData: FormData
): Promise<IndicatorActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id     = formData.get('id') as string
  const name   = (formData.get('name') as string)?.trim()
  const author = (formData.get('author') as string)?.trim()
  const type   = (formData.get('type') as string)?.trim()

  if (!id)     return { error: 'ID fehlt' }
  if (!name)   return { error: 'Name ist erforderlich' }
  if (!author) return { error: 'Author ist erforderlich' }
  if (!type)   return { error: 'Typ ist erforderlich' }

  const { error } = await supabase
    .from('indicators')
    .update({
      name,
      author,
      type,
      subtype:          (formData.get('subtype') as string) || null,
      repaints:         formData.get('repaints') === 'true',
      is_forbidden:     formData.get('is_forbidden') === 'true',
      forbidden_reason: (formData.get('forbidden_reason') as string) || null,
      tv_url:           (formData.get('tv_url') as string) || null,
      notes:            (formData.get('notes') as string) || null,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function deleteIndicator(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('indicators')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE()
  return {}
}

// ─── Performance entries ──────────────────────────────────────────────────────
function parseOptFloat(fd: FormData, key: string): number | null {
  const v = fd.get(key) as string
  if (!v?.trim()) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function parseOptDate(fd: FormData, key: string): string | null {
  const v = fd.get(key) as string
  return v?.trim() || null
}

export async function createPerformance(
  _prev: PerfActionState,
  formData: FormData
): Promise<PerfActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const indicator_id = formData.get('indicator_id') as string
  const asset        = (formData.get('asset') as string)?.trim()
  const asset_class  = (formData.get('asset_class') as string)?.trim()
  const timeframe    = (formData.get('timeframe') as string)?.trim()

  if (!indicator_id) return { error: 'Indicator-ID fehlt' }
  if (!asset)        return { error: 'Asset ist erforderlich' }
  if (!asset_class)  return { error: 'Asset-Klasse ist erforderlich' }
  if (!timeframe)    return { error: 'Timeframe ist erforderlich' }

  const { error } = await supabase.from('indicator_performance').insert({
    indicator_id,
    asset,
    asset_class,
    timeframe,
    cobra_green:    parseOptFloat(formData, 'cobra_green'),
    cobra_red:      parseOptFloat(formData, 'cobra_red'),
    net_profit_pct: parseOptFloat(formData, 'net_profit_pct'),
    profit_factor:  parseOptFloat(formData, 'profit_factor'),
    win_rate:       parseOptFloat(formData, 'win_rate'),
    trades:         parseOptFloat(formData, 'trades'),
    sharpe:         parseOptFloat(formData, 'sharpe'),
    sortino:        parseOptFloat(formData, 'sortino'),
    omega_ratio:    parseOptFloat(formData, 'omega_ratio'),
    equity_max_dd:  parseOptFloat(formData, 'equity_max_dd'),
    intra_trade_dd: parseOptFloat(formData, 'intra_trade_dd'),
    test_start:     parseOptDate(formData, 'test_start'),
    test_end:       parseOptDate(formData, 'test_end'),
    settings:       (formData.get('settings') as string) || null,
  })

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function updatePerformance(
  _prev: PerfActionState,
  formData: FormData
): Promise<PerfActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id          = formData.get('id') as string
  const asset       = (formData.get('asset') as string)?.trim()
  const asset_class = (formData.get('asset_class') as string)?.trim()
  const timeframe   = (formData.get('timeframe') as string)?.trim()

  if (!id)          return { error: 'ID fehlt' }
  if (!asset)       return { error: 'Asset ist erforderlich' }
  if (!asset_class) return { error: 'Asset-Klasse ist erforderlich' }
  if (!timeframe)   return { error: 'Timeframe ist erforderlich' }

  const { error } = await supabase
    .from('indicator_performance')
    .update({
      asset,
      asset_class,
      timeframe,
      cobra_green:    parseOptFloat(formData, 'cobra_green'),
      cobra_red:      parseOptFloat(formData, 'cobra_red'),
      net_profit_pct: parseOptFloat(formData, 'net_profit_pct'),
      profit_factor:  parseOptFloat(formData, 'profit_factor'),
      win_rate:       parseOptFloat(formData, 'win_rate'),
      trades:         parseOptFloat(formData, 'trades'),
      sharpe:         parseOptFloat(formData, 'sharpe'),
      sortino:        parseOptFloat(formData, 'sortino'),
      omega_ratio:    parseOptFloat(formData, 'omega_ratio'),
      equity_max_dd:  parseOptFloat(formData, 'equity_max_dd'),
      intra_trade_dd: parseOptFloat(formData, 'intra_trade_dd'),
      test_start:     parseOptDate(formData, 'test_start'),
      test_end:       parseOptDate(formData, 'test_end'),
      settings:       (formData.get('settings') as string) || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function deletePerformance(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('indicator_performance')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  REVALIDATE()
  return {}
}
