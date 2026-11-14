/**
 * Speichert die Kategorie fuer mehrere Bankbuchungen ueber den Sammel-Endpunkt PATCH /api/bank/transactions/bulk
 * (statt je Buchung ein eigener PATCH, AUDIT.md C5). Reine Funktion mit austauschbarem `fetch`, damit sie sich ohne Browser testen laesst.
 *
 * WIRFT bei jedem Fehler (Antwort nicht ok, nicht alle IDs gespeichert, Netzfehler). Frueher fing der Hook den Fehler und lieferte
 * "erfolgreich": die UI entfernte den Vorschlag, obwohl nichts gespeichert war. Aufrufer muessen den Fehler anzeigen und die
 * Vorschlaege stehen lassen.
 */

/** Obergrenze des Endpunkts je Aufruf (`MAX_IDS` in app/api/bank/transactions/bulk/route.ts). */
export const BULK_MAX = 200

type Antwort = { ok: boolean; status: number; json: () => Promise<unknown> }
export type FetchFunktion = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Antwort>

/** Gibt die Zahl der gespeicherten Buchungen zurueck (bei Erfolg immer die Zahl der verschiedenen IDs). */
export async function speichereKategorie(
  ids: readonly string[],
  categoryId: string | null,
  fetchFn: FetchFunktion = (url, init) => fetch(url, init),
): Promise<number> {
  const einzigartig = [...new Set(ids)]
  let gespeichert = 0
  for (let i = 0; i < einzigartig.length; i += BULK_MAX) {
    const teil = einzigartig.slice(i, i + BULK_MAX)
    let grund: string | null = null
    try {
      const res = await fetchFn('/api/bank/transactions/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: teil, category_id: categoryId }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; updated?: number } | null
      if (!res.ok) grund = body?.error ?? `Fehler ${res.status}`
      // Die RLS zaehlt fremde oder geloeschte IDs einfach nicht mit: weniger gespeichert als verlangt ist ein Fehler.
      else if ((body?.updated ?? 0) < teil.length) grund = `nur ${body?.updated ?? 0} von ${teil.length} Buchungen gefunden`
      else gespeichert += teil.length
    } catch (e) {
      grund = e instanceof Error ? e.message : 'Netzfehler'
    }
    if (grund) {
      const davor = gespeichert > 0 ? ` (${gespeichert} von ${einzigartig.length} waren schon gespeichert)` : ''
      throw new Error(`Kategorie konnte nicht gespeichert werden: ${grund}${davor}`)
    }
  }
  return gespeichert
}
