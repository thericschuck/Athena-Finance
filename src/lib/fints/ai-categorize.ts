import { generateText, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import {
  KI_SYSTEM_PROMPT, baueAnfrage, pruefeAntwort,
  type KatOption, type KiAnfrage, type KiAntwortZeile, type KiBeispiel, type KiBuchung, type KiErgebnis,
} from './ai-categorize-regeln.ts'

/**
 * Ein Stapel Buchungen an das Modell. Genau ein erzwungenes Werkzeug (`ordneZu`) als einziger Ausgang: keine Freitext-
 * Antwort, keine IDs aus dem Modell, nur Kurzkennungen, die `pruefeAntwort` gegen die vorgegebene Liste prüft.
 * Ohne Datenbank, damit sich dieselbe Funktion in Auswertungen und im Cron nutzen lässt.
 */
const antwortSchema = z.object({
  zuordnungen: z.array(z.object({
    r: z.string().describe('Kurzkennung der Buchung, z. B. r3'),
    k: z.string().nullable().describe('Kurzkennung der Kategorie, z. B. k12, oder null'),
    sicherheit: z.enum(['hoch', 'mittel', 'niedrig']),
  })),
})

export type KiStapelErgebnis = {
  zuordnungen: KiErgebnis[]
  anfrage: KiAnfrage
  usage: { inputTokens: number; outputTokens: number }
  /** Wie viele Antwortzeilen verworfen wurden (unbekannt, falsche Richtung, zu unsicher). */
  verworfen: number
}

export async function klassifiziereStapel(args: {
  model: string
  stapel: KiBuchung[]
  optionen: KatOption[]
  beispiele: KiBeispiel[]
  korrekturen: KiBeispiel[]
  mindestens: 'hoch' | 'mittel'
  abortSignal?: AbortSignal
}): Promise<KiStapelErgebnis> {
  const { anfrage, zuordnung } = baueAnfrage(args.stapel, args.optionen, args.beispiele, args.korrekturen)
  let antwort: KiAntwortZeile[] = []

  const result = await generateText({
    model: anthropic(args.model),
    instructions: [{ role: 'system', content: KI_SYSTEM_PROMPT, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } }],
    prompt: JSON.stringify(anfrage),
    tools: {
      ordneZu: tool({
        description: 'Gibt die Zuordnung aller Buchungen dieses Stapels ab.',
        inputSchema: antwortSchema,
        execute: async (a) => { antwort = a.zuordnungen; return { angenommen: a.zuordnungen.length } },
      }),
    },
    toolChoice: { type: 'tool', toolName: 'ordneZu' },
    maxOutputTokens: 4_000,
    abortSignal: args.abortSignal,
  })

  const zuordnungen = pruefeAntwort(antwort, zuordnung, args.optionen, args.stapel, args.mindestens)
  return {
    zuordnungen,
    anfrage,
    usage: { inputTokens: result.usage?.inputTokens ?? 0, outputTokens: result.usage?.outputTokens ?? 0 },
    verworfen: antwort.length - zuordnungen.length,
  }
}
