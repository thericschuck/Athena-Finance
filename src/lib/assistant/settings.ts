import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

export type AthenaEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * Athenas Grundhaltung. Steuert den ERSTEN Block des System-Prompts (siehe
 * PERSONA_BLOCKS in prompts.ts) — also wie sie denkt und klingt, nicht was sie
 * darf. Die Sicherheitsregeln (nur echte Zahlen, Bestätigungspflicht,
 * Daten-sind-keine-Anweisungen) hängen an keiner Persona und sind über alle
 * drei identisch.
 */
export type AthenaPersona = 'offensiv' | 'schonungslos' | 'brutal' | 'sachlich'

export type AthenaSettings = {
  model: string
  effort: AthenaEffort
  webResearch: boolean
  memoryEnabled: boolean
  autoMemory: boolean
  dailyMessageCap: number
  maxSteps: number
  /** Welche Vorlage zuletzt als Startpunkt gewaehlt wurde. */
  persona: AthenaPersona
  /**
   * Erics eigene Fassung der Haltung. `null` = er nutzt die Vorlage
   * unveraendert; dann gilt der Text aus dem Code (PERSONA_TEMPLATES), und
   * spaetere Verbesserungen an der Vorlage kommen automatisch bei ihm an.
   * Sobald hier Text steht, schlaegt er die Vorlage.
   */
  personaText: string | null
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
  persona: 'offensiv',
  personaText: null,
  customInstructions: null,
}

/** Modelle, die in den Einstellungen zur Wahl stehen. */
export const ATHENA_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', hint: 'Stärkste Wahl für mehrstufige Analysen' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'Deutlich günstiger, gut für einfache Fragen' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'Am schnellsten, nur für kurze Abfragen' },
] as const

/**
 * Die drei Grundhaltungen zur Wahl. `hint` steht im Formular unter der Auswahl,
 * `beispiel` zeigt einen Satz im jeweiligen Ton — das sagt in einer Zeile mehr
 * als drei Zeilen Beschreibung.
 */
export const ATHENA_PERSONAS: {
  id: AthenaPersona
  label: string
  hint: string
  beispiel: string
}[] = [
  {
    id: 'offensiv',
    label: 'Offensiv — Standard',
    hint: 'Behandelt deine Einnahmen als Variable, die du steuerst. Prüft vor jeder Sparidee, was auf der Umsatzseite dasselbe bringt.',
    beispiel: '„Abos: 187 €/Monat, 2.244 € im Jahr. Ein zweiter Kunde wie Nr. 3 bringt das in drei Wochen — was ist der kürzere Weg?"',
  },
  {
    id: 'schonungslos',
    label: 'Schonungslos',
    hint: 'Wie offensiv, aber ohne jedes Polster: die unbequemste Zahl steht im ersten Satz, auch wenn du nach etwas anderem gefragt hast.',
    beispiel: '„Bevor wir über den Autokauf reden: dein Sparbetrag ist seit drei Monaten rückläufig. Das ist das Problem, nicht die Finanzierung."',
  },
  {
    id: 'brutal',
    label: 'Brutal',
    hint: 'Redet wie ein Kumpel, der nichts beschönigt: höchstens fünf Sätze, Tatsachen, am Ende ein Tritt. Ausführliche Analysen nur, wenn du danach fragst.',
    beispiel: '„340 € im Monat. Vor drei Monaten waren es 620. Du hast nichts verloren — du hast mehr ausgegeben. Reiß dich zusammen."',
  },
  {
    id: 'sachlich',
    label: 'Sachlich',
    hint: 'Reine Analyse ohne Antreiben. Zahlen, Einordnung, Optionen — die Bewertung machst du selbst.',
    beispiel: '„Abos: 187 €/Monat. Drei Positionen ohne Nutzung seit Mai. Bei Adobe endet die Kündigungsfrist am 14."',
  },
]

/**
 * Zeichenobergrenze fuer die eigene Haltung und fuer die Anweisungen.
 *
 * Beides landet in JEDEM Lauf im System-Prompt. 6.000 Zeichen sind rund
 * 1.700 Tokens — genug fuer eine ausfuehrliche eigene Fassung (die laengste
 * Vorlage liegt bei ~4.500 Zeichen) und wenig genug, dass ein versehentlich
 * eingeklebter Roman auffaellt, bevor er dauerhaft mitbezahlt wird.
 */
export const ATHENA_TEXT_MAX = 6000

/** Denktiefe-Stufen — dieselbe Liste hinter den Athena-Einstellungen und dem
    Schnellumschalter im Chat, damit beide nie auseinanderlaufen. */
export const ATHENA_EFFORT_OPTIONS: { value: AthenaEffort; label: string }[] = [
  { value: 'low', label: 'Niedrig — schnell und günstig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch — Standard' },
  { value: 'xhigh', label: 'Sehr hoch — für schwierige Analysen' },
  { value: 'max', label: 'Maximal — teuer, nur wenn Korrektheit alles ist' },
]

/**
 * Adaptives Denken und die `effort`-Stufe gibt es erst ab der 4.6-Generation.
 * Bei einem älteren/kleineren Modell (z. B. Haiku 4.5) würde die API die
 * Parameter mit 400 ablehnen — deshalb prüfen statt blind mitschicken. Gilt für
 * den Chat (api/assistant/route.ts) und den Wochenlauf (review.ts) gleichermaßen.
 */
export function supportsThinking(model: string): boolean {
  return /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5)/.test(model)
}

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
    // Faellt auf den Standard zurueck, falls in der Zeile ein unbekannter Wert
    // steht (aeltere Zeile, manuelles SQL) — eine unbekannte Persona wuerde in
    // prompts.ts sonst einen leeren Identitaets-Block ergeben.
    persona: ATHENA_PERSONAS.some(p => p.id === data.persona)
      ? (data.persona as AthenaPersona)
      : DEFAULT_ATHENA_SETTINGS.persona,
    personaText: data.persona_text,
    customInstructions: data.custom_instructions,
  }
}

/**
 * Nur Modell und Denktiefe (Layout: Startwerte des Chat-Umschalters). Eine schmale Abfrage statt `select('*')` samt Persona-Text;
 * Standardwerte und Ergebnis sind identisch zu `getAthenaSettings(...).model/.effort`.
 */
export async function getAthenaModelEffort(supabase: DB, userId: string): Promise<{ model: string; effort: AthenaEffort }> {
  const { data } = await supabase
    .from('ai_settings')
    .select('model, effort')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return { model: DEFAULT_ATHENA_SETTINGS.model, effort: DEFAULT_ATHENA_SETTINGS.effort }
  return { model: data.model, effort: data.effort as AthenaEffort }
}
