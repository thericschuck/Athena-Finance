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
}

export function estimateCostUsd(model: string | null, usage: UsageLike | null): number | null {
  if (!model || !usage) return null
  const price = PRICING[model]
  if (!price) return null
  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0
  if (input === 0 && output === 0) return null
  return (input * price.input + output * price.output) / 1_000_000
}

export function formatUsd(value: number): string {
  // Läufe kosten typischerweise Bruchteile eines Cents bis wenige Cent — mit
  // zwei Nachkommastellen stünde dort fast immer „$0.00".
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}
