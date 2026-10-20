import { z } from 'zod'

/**
 * Reiner Kern der Eingabe-Validierung (ohne next/server), damit er unter
 * `node --experimental-strip-types` testbar ist. validate.ts re-exportiert alles und
 * ergänzt die Route-Handler-Helfer.
 */

const de = z.locales.de().localeError

export interface ValidationIssue {
  path: string
  message: string
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues: ValidationIssue[] }

/** Schema auf beliebige Eingabe anwenden (deutsche Meldungen nur für diesen Aufruf). */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const res = schema.safeParse(input, { error: de })
  if (res.success) return { ok: true, data: res.data }
  const issues = res.error.issues.map(i => ({
    path: i.path.join('.'),
    message: i.message,
  }))
  const first = issues[0]
  const error = first
    ? `Ungültige Eingabe${first.path ? ` (${first.path})` : ''}: ${first.message}`
    : 'Ungültige Eingabe'
  return { ok: false, error, issues }
}

/** FormData → Objekt. Mehrfach vorkommende Keys werden zum Array, leere Strings bleiben leer. */
export function formDataToObject(fd: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {}
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key)
    out[key] = all.length > 1 ? all : all[0]
  }
  return out
}

/** Server-Action-Input: FormData gegen ein Schema prüfen (z. B. mit `z.coerce.number()`). */
export function parseForm<T>(fd: FormData, schema: z.ZodType<T>): ParseResult<T> {
  return parseInput(schema, formDataToObject(fd))
}

/**
 * Kurze Fehlermeldung für `{ error: string }`-Rückgaben von Server Actions: die Meldung des
 * ersten Problems ohne "Ungültige Eingabe (feld):"-Präfix (so zeigen die Formulare Texte
 * wie "Name ist erforderlich").
 */
export function issueMessage(r: { error: string; issues: ValidationIssue[] }): string {
  return r.issues[0]?.message ?? r.error
}
