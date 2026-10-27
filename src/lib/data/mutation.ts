/**
 * Zentraler Helfer gegen stille 0-Zeilen-Mutationen.
 *
 * Mit Haushalts-RLS fehlt in Actions oft das alte `.eq('user_id', userId)`; trifft die RLS dann 0 Zeilen (fremde Zeile,
 * keine Berechtigung, falsche ID), liefert Supabase KEIN `error`, die UI meldete trotzdem Erfolg. `requireRows` haengt
 * `.select('id')` an die Mutation und macht aus 0 Zeilen einen Fehler.
 *
 *   const { error } = await requireRows(supabase.from('debts').update(patch).eq('id', id))
 *   if (error) return { error: error.message }
 */

export const KEINE_BERECHTIGUNG = 'Nicht gefunden oder keine Berechtigung'

type Selektierbar<R> = {
  select: (columns: string) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>
}

/** Fuehrt `query.select('id')` aus. Ergebnis wie bei Supabase: `{ error: { message } | null, count }` (Drop-in fuer `const { error } = await ...`). */
export async function requireRows<R = { id: string }>(
  query: Selektierbar<R>,
  meldung: string = KEINE_BERECHTIGUNG,
): Promise<{ error: { message: string } | null; count: number }> {
  const { data, error } = await query.select('id')
  if (error) return { error: { message: error.message }, count: 0 }
  const count = data?.length ?? 0
  return count === 0 ? { error: { message: meldung }, count: 0 } : { error: null, count }
}
