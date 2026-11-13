/**
 * Zentraler Helfer gegen verschluckte Lesefehler (AUDIT.md B1), Gegenstück zu `requireRows` fuer Mutationen.
 *
 * Supabase wirft bei Fehlern nicht, sondern liefert `{ data: null, error }`. Mit `const { data } = await ...` und
 * `data ?? []` wird aus einer fehlgeschlagenen Abfrage ein leeres Ergebnis: „keine Konten“, „0 EUR Nettovermoegen“.
 * `lies` wirft stattdessen, die Seite zeigt ihre `error.tsx` statt eines falschen Leerzustands.
 *
 *   const konten = await lies(applyAccountScope(q, ctx, 'id').order('sort_order'), 'accounts')
 *
 * Eine Abfrage, die ohne Fehler 0 Zeilen liefert, bleibt `[]`; nur `error` fuehrt zum Wurf. Der Name erscheint in der
 * Meldung (Server-Log), damit sich die Abfrage zuordnen laesst. Die Datenbankmeldung selbst erreicht den Browser nicht,
 * Next.js ersetzt Fehlertexte aus Server Components in Produktion durch einen Digest.
 */

type Antwort<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Fuehrt die Abfrage aus und gibt die Zeilen zurueck. Wirft `Error('<name>: <Meldung>')` bei einem Supabase-Fehler. */
export async function lies<T>(query: Antwort<T>, name: string): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(`${name}: ${error.message}`)
  return data ?? []
}
