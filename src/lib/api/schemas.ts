import { z } from 'zod'

/**
 * Gemeinsame Schema-Bausteine für Server Actions (FormData → Strings) und Route Handler.
 *
 * Konventionen:
 *  - Formularfelder kommen als Strings an; leere Strings bedeuten "nicht ausgefüllt" und
 *    werden bei optionalen Feldern zu `null` (wie bisher `(value) || null`).
 *  - Zahlen: Dezimalpunkt oder (ohne Punkt) Dezimalkomma, endlich, |x| <= MAX_AMOUNT.
 *  - Meldungen bei Pflichtfeldern entsprechen den bisherigen Texten ("Name ist erforderlich").
 */

/** Obergrenze für Beträge/Mengen; weit über jedem realen Wert, aber weit unter Postgres-numeric. */
export const MAX_AMOUNT = 1e12

// ─── Primitive Prüfungen ──────────────────────────────────────────────────────

/** UUID (RFC-Varianten, wie `gen_random_uuid()` sie erzeugt). */
export const uuid = z.uuid()

/** Pflicht-ID: fehlt sie, kommt `missing` ("ID fehlt"), ist sie keine UUID `invalid`. */
export const idField = (missing = 'ID fehlt', invalid = 'ID ist ungültig') =>
  z.string({ error: missing }).min(1, missing).pipe(z.uuid({ error: invalid }))

/** Kalenderdatum JJJJ-MM-TT, auch inhaltlich gültig (kein 2026-02-31). */
export const isoDate = z
  .string({ error: 'Datum ist ungültig' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum ist ungültig')
  .refine(v => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
  }, 'Datum ist ungültig')

/** Betrag als JSON-Zahl: endlich und begrenzt. */
export const money = z
  .number({ error: 'Betrag ist ungültig' })
  .min(-MAX_AMOUNT, 'Betrag ist ungültig')
  .max(MAX_AMOUNT, 'Betrag ist ungültig')

// ─── Formular-Helfer (Eingabe: String aus FormData) ───────────────────────────

/** '' / nur Leerraum / fehlend → undefined; "12,5" → 12.5; sonst Number(...) (NaN fällt durch die Prüfung). */
function toNumber(v: unknown): unknown {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') return v
  const s = v.trim()
  if (s === '') return undefined
  return Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s)
}

/** '' / fehlend → null (für optionale Felder). */
const emptyToNull = (v: unknown): unknown =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v

/** Pflichtbetrag aus einem Formularfeld (String → Zahl). */
export const moneyField = (msg = 'Betrag ist ungültig') =>
  z.preprocess(toNumber, z.number({ error: msg }).min(-MAX_AMOUNT, msg).max(MAX_AMOUNT, msg))

/** Optionaler Betrag: leer → null. */
export const optMoneyField = (msg = 'Betrag ist ungültig') =>
  z.preprocess(
    v => emptyToNull(toNumber(v)),
    z.number({ error: msg }).min(-MAX_AMOUNT, msg).max(MAX_AMOUNT, msg).nullable(),
  )

/** Pflicht-Ganzzahl aus einem Formularfeld. */
export const intField = (msg = 'Zahl ist ungültig') =>
  z.preprocess(toNumber, z.number({ error: msg }).int(msg).min(-MAX_AMOUNT, msg).max(MAX_AMOUNT, msg))

/** Optionale Ganzzahl: leer → null. */
export const optIntField = (msg = 'Zahl ist ungültig') =>
  z.preprocess(
    v => emptyToNull(toNumber(v)),
    z.number({ error: msg }).int(msg).min(-MAX_AMOUNT, msg).max(MAX_AMOUNT, msg).nullable(),
  )

/** Pflichttext: getrimmt, nicht leer (Meldung `msg`), höchstens `max` Zeichen. */
export const reqText = (msg: string, max = 200) =>
  z.string({ error: msg }).trim().min(1, msg).max(max)

/** Optionaler Text: getrimmt, leer → null, höchstens `max` Zeichen. */
export const optText = (max = 500) =>
  z.string().max(max).optional().transform(v => v?.trim() || null)

/** Optionale UUID: leer → null. */
export const optUuid = (invalid = 'ID ist ungültig') =>
  z.preprocess(emptyToNull, z.uuid({ error: invalid }).nullable())

/** Optionales Datum JJJJ-MM-TT: leer → null. */
export const optDate = z.preprocess(emptyToNull, isoDate.nullable())

/** Pflichtdatum mit eigener Meldung für "fehlt". */
export const reqDate = (missing = 'Datum ist erforderlich') =>
  z.string({ error: missing }).min(1, missing).pipe(isoDate)

/** Checkbox/Schalter: 'on' oder 'true' → true, sonst false. */
export const checkbox = z
  .string()
  .optional()
  .transform(v => v === 'on' || v === 'true')

/** Nur 'true' → true (Schalter, die explizit "true" senden). */
export const boolTrue = z
  .string()
  .optional()
  .transform(v => v === 'true')

/** Währungscode (wie bisher: nicht leer, höchstens 10 Zeichen). */
export const currency = z
  .string({ error: 'Währung ist erforderlich' })
  .trim()
  .min(1, 'Währung ist erforderlich')
  .max(10)

/** Pflicht-Enum mit eigener Meldung für fehlenden/unbekannten Wert. */
export const reqEnum = <const T extends readonly [string, ...string[]]>(values: T, msg: string) =>
  z.enum(values, { error: msg })

/** Optionales Enum: leer/fehlend → null. */
export const optEnum = <const T extends readonly [string, ...string[]]>(values: T, msg: string) =>
  z.preprocess(emptyToNull, z.enum(values, { error: msg }).nullable())
