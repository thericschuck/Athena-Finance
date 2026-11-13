/**
 * Zentraler Helfer gegen verschluckte Lesefehler (AUDIT.md B1), Gegenstück zu `requireRows` fuer Mutationen.
 *
 * Supabase wirft bei Fehlern nicht, sondern liefert `{ data: null, error }`. Mit `const { data } = await ...` und
 * `data ?? []` wird aus einer fehlgeschlagenen Abfrage ein leeres Ergebnis: „keine Konten“, „0 EUR Nettovermoegen“.
 * `lies` wirft stattdessen, die Seite zeigt ihre `error.tsx` statt eines falschen Leerzustands.
 *
 *   const konten = await lies(applyAccountScope(q, ctx, 'id').order('sort_order'), 'accounts')
 *
 * Eine Abfrage, die ohne Fehler 0 Zeilen liefert, bleibt `[]`; nur `error` fuehrt zum Wurf. Der Name erscheint in der Meldung
 * (Server-Log), damit sich die Abfrage zuordnen laesst. Die Datenbankmeldung selbst erreicht den Browser nicht, Next.js ersetzt
 * Fehlertexte aus Server Components in Produktion durch einen Digest.
 *
 * Ursache bei Netzfehlern: `TypeError: fetch failed` sagt allein nichts. Die eigentliche Ursache (`ECONNRESET`, `ETIMEDOUT`,
 * `ENOTFOUND` ...) steht bei postgrest-js in `error.details` („Caused by: …“); sie wird an die Meldung gehaengt, und der
 * urspruengliche Fehler haengt als `cause` am geworfenen Error (Next.js zeigt `cause` im Log mit an).
 *
 * Ein Wiederholversuch: Ein einzelner kurzer Netz-Aussetzer soll keine Fehlerseite ausloesen. Schlaegt die Abfrage mit einem
 * NETZFEHLER fehl, wartet `lies` kurz und fuehrt sie GENAU EINMAL erneut aus; scheitert auch der zweite Versuch, wird wie bisher
 * geworfen (ein anhaltender Fehler bleibt sichtbar). Nicht wiederholt werden Antworten der Datenbank/PostgREST mit Fehlercode
 * (z. B. 42501 fehlendes Recht): die wuerden beim zweiten Mal genauso ausfallen. Netzfehler und Gateway-Fehler tragen bei
 * postgrest-js keinen Code (`""`). Das zweite `await` desselben Query-Objekts schickt einen neuen Request ab (postgrest-js
 * fuehrt `fetch` in `then()` aus); das ist nur fuer LESENDE Abfragen gedacht und dort idempotent. Mutationen nie ueber `lies`.
 */

/** Fehlerform von supabase-js; `details` und `cause` koennen fehlen. */
type SupabaseFehler = { message: string; details?: string | null; code?: string | null; cause?: unknown }

type Antwort<T> = PromiseLike<{ data: T[] | null; error: SupabaseFehler | null }>

/** Pause vor dem zweiten Versuch (Millisekunden). */
export const LIES_WARTEZEIT_MS = 300

/** Die Ursache als Text „Caused by: Name: Meldung (Code)“, oder `null`. Aus `details` nur diese eine Zeile (sonst koennten Zeilenwerte durchsickern). */
function ursacheVon(error: SupabaseFehler): string | null {
  const ausDetails = error.details?.match(/Caused by: .*/)?.[0]
  if (ausDetails) return ausDetails
  const c = error.cause
  if (c && typeof c === 'object' && 'message' in c) {
    const { name, message, code } = c as { name?: unknown; message?: unknown; code?: unknown }
    return `Caused by: ${typeof name === 'string' ? name : 'Error'}: ${String(message)}${code ? ` (${String(code)})` : ''}`
  }
  return null
}

/** Netz- oder Gateway-Fehler: keine Antwort mit Datenbank-/PostgREST-Code. Nur diese lohnen einen zweiten Versuch. */
function istWiederholbar(error: SupabaseFehler): boolean {
  return !error.code
}

/** Fuehrt die Abfrage aus und gibt die Zeilen zurueck. Wirft `Error('<name>: <Meldung> (Caused by: …)')` bei einem Supabase-Fehler. */
export async function lies<T>(query: Antwort<T>, name: string, optionen: { wartezeitMs?: number } = {}): Promise<T[]> {
  let antwort = await query
  if (antwort.error && istWiederholbar(antwort.error)) {
    console.warn(`[lies] ${name}: ${antwort.error.message}${ursacheVon(antwort.error) ? ` (${ursacheVon(antwort.error)})` : ''}, zweiter Versuch`)
    await new Promise<void>(fertig => setTimeout(fertig, optionen.wartezeitMs ?? LIES_WARTEZEIT_MS))
    antwort = await query
  }
  const { data, error } = antwort
  if (error) {
    const ursache = ursacheVon(error)
    throw new Error(`${name}: ${error.message}${ursache ? ` (${ursache})` : ''}`, { cause: error })
  }
  return data ?? []
}
