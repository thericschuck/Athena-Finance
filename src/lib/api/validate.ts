import { NextResponse } from 'next/server'
import type { z } from 'zod'
import {
  parseInput,
  parseForm,
  formDataToObject,
  issueMessage,
  type ParseResult,
  type ValidationIssue,
} from './parse.ts'

/**
 * Eingabe-Validierung für Route Handler und Server Actions (zod 4, deutsche Meldungen).
 * Die Locale gilt nur pro Parse-Aufruf, nicht global (assistant/* nutzt zod ebenfalls).
 * Der reine Kern (ohne next/server) liegt in parse.ts und ist dort testbar.
 *
 * Route Handler:
 *   const q = parseQuery(req, schema); if (q.response) return q.response
 *   const b = await parseBody(req, schema); if (b.response) return b.response
 *   const p = parseParams(await params, schema); if (p.response) return p.response
 *
 * Server Action:
 *   const p = parseForm(formData, schema)
 *   if (!p.ok) return { error: issueMessage(p) }
 *   // Nicht-FormData-Argumente: parseInput(schema, arg)
 *
 * Gemeinsame Schema-Bausteine: schemas.ts.
 */

export { parseInput, parseForm, formDataToObject, issueMessage }
export type { ParseResult, ValidationIssue }

/** Einheitliches Fehlerformat der API: `{ error, issues }` mit Status 400. */
export function validationResponse(r: { error: string; issues: ValidationIssue[] }) {
  return NextResponse.json({ error: r.error, issues: r.issues }, { status: 400 })
}

type Guarded<T> = { data: T; response?: undefined } | { data?: undefined; response: NextResponse }

function guard<T>(r: ParseResult<T>): Guarded<T> {
  return r.ok ? { data: r.data } : { response: validationResponse(r) }
}

/** Query-Parameter einer Route (`?a=1&b=2`) → typed. */
export function parseQuery<T>(req: Request, schema: z.ZodType<T>): Guarded<T> {
  return guard(parseInput(schema, Object.fromEntries(new URL(req.url).searchParams)))
}

/** Pfad-Parameter (`{ params }` einer Route, bereits awaited) → typed. */
export function parseParams<T>(params: unknown, schema: z.ZodType<T>): Guarded<T> {
  return guard(parseInput(schema, params))
}

/** JSON-Body einer Route → typed. Ungültiges JSON liefert 400 mit deutscher Meldung. */
export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<Guarded<T>> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return { response: NextResponse.json({ error: 'Ungültiger JSON-Body', issues: [] }, { status: 400 }) }
  }
  return guard(parseInput(schema, json))
}
