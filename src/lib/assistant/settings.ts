import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

export type AthenaEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AthenaSettings = {
  model: string
  effort: AthenaEffort
  webResearch: boolean
  memoryEnabled: boolean
  autoMemory: boolean
  dailyMessageCap: number
  maxSteps: number
  customInstructions: string | null
}

/**
 * Standardwerte, wenn für den Nutzer noch keine Zeile in `ai_settings` liegt.
 *
 * `claude-opus-5` statt des früheren `claude-sonnet-5`: der agentische Betrieb
 * lebt davon, dass das Modell über mehrere Werkzeugaufrufe hinweg einen Plan
 * hält und Zwischenergebnisse richtig interpretiert — genau das, woran ein
 * schwächeres Modell in Schritt 6 von 20 scheitert. Wer den Preis nicht will,
 * stellt das Modell in den Athena-Einstellungen um; deshalb liegt es in der
 * Datenbank und nicht im Code.
 */
export const DEFAULT_ATHENA_SETTINGS: AthenaSettings = {
  model: 'claude-opus-5',
  effort: 'high',
  webResearch: true,
  memoryEnabled: true,
  autoMemory: true,
  dailyMessageCap: 200,
  maxSteps: 24,
  customInstructions: null,
}

/** Modelle, die in den Einstellungen zur Wahl stehen. */
export const ATHENA_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', hint: 'Stärkste Wahl für mehrstufige Analysen' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'Deutlich günstiger, gut für einfache Fragen' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'Am schnellsten, nur für kurze Abfragen' },
] as const

/** Denktiefe-Stufen — dieselbe Liste hinter den Athena-Einstellungen und dem
    Schnellumschalter im Chat, damit beide nie auseinanderlaufen. */
export const ATHENA_EFFORT_OPTIONS: { value: AthenaEffort; label: string }[] = [
  { value: 'low', label: 'Niedrig — schnell und günstig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch — Standard' },
  { value: 'xhigh', label: 'Sehr hoch — für schwierige Analysen' },
  { value: 'max', label: 'Maximal — teuer, nur wenn Korrektheit alles ist' },
]

export async function getAthenaSettings(supabase: DB, userId: string): Promise<AthenaSettings> {
  const { data } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return DEFAULT_ATHENA_SETTINGS

  return {
    model: data.model,
    effort: data.effort as AthenaEffort,
    webResearch: data.web_research,
    memoryEnabled: data.memory_enabled,
    autoMemory: data.auto_memory,
    dailyMessageCap: data.daily_message_cap,
    maxSteps: data.max_steps,
    customInstructions: data.custom_instructions,
  }
}
