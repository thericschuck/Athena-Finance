/**
 * Kostenschätzung für Athena-Läufe.
 *
 * Preise in USD pro 1 Mio. Token, Stand der Anthropic-Preisliste. Bewusst eine
 * SCHÄTZUNG und im UI auch so beschriftet: Cache-Reads und Cache-Writes werden
 * anders abgerechnet als normale Input-Token, und die serverseitigen Web-Tools
 * kosten zusätzlich pro Suche. Für die Frage „welcher Lauf war teuer" reicht
 * das; für eine Abrechnung wäre die Anthropic-Konsole die richtige Quelle.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

export type UsageLike = {
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  /** Aufteilung von `inputTokens`; `inputTokens` enthaelt Cache-Zugriffe bereits mit. */
  inputTokenDetails?: {
    noCacheTokens?: number | null
    cacheReadTokens?: number | null
    cacheWriteTokens?: number | null
  } | null
}

/** Anthropic: Cache-Lesen kostet 0,1x, Cache-Schreiben 1,25x des Eingabepreises. */
const CACHE_READ_FAKTOR = 0.1
const CACHE_WRITE_FAKTOR = 1.25

export function estimateCostUsd(model: string | null, usage: UsageLike | null): number | null {
  if (!model || !usage) return null
  const price = PRICING[model]
  if (!price) return null
  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0
  if (input === 0 && output === 0) return null
  const lesen = usage.inputTokenDetails?.cacheReadTokens ?? 0
  const schreiben = usage.inputTokenDetails?.cacheWriteTokens ?? 0
  // Ohne Cache-Angaben wie bisher; mit ihnen werden gelesene und geschriebene Token zum jeweiligen Satz gerechnet.
  const normal = Math.max(0, input - lesen - schreiben)
  const eingabe = normal * price.input + lesen * price.input * CACHE_READ_FAKTOR + schreiben * price.input * CACHE_WRITE_FAKTOR
  return (eingabe + output * price.output) / 1_000_000
}

export function formatUsd(value: number): string {
  // Läufe kosten typischerweise Bruchteile eines Cents bis wenige Cent — mit
  // zwei Nachkommastellen stünde dort fast immer „$0.00".
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}
