// Prüfung des manuellen `?date=`-Parameters von daily-snapshot.
//
// Der Parameter ist ein Wartungsweg: einen verpassten Tag nachträglich neu rechnen. `fn_take_snapshot`
// überschreibt dabei die Zeilen dieses Tages mit den AKTUELLEN Beständen (Preise, Mengen von heute).
// Für einen Tag weit in der Vergangenheit zerstört das die damalige Historie. Deshalb nur heute und
// die sieben Tage davor; alles andere ist ein Fehler des Aufrufers (400), kein stilles Weiterlaufen.
//
// Rein und ohne `Deno`-Global, damit der Node-Testlauf des Projekts sie direkt laden kann.

/** Wie viele Tage vor `heute` ein Nachtrag höchstens liegen darf (heute selbst = 0). */
export const BACKFILL_MAX_TAGE = 7

export type BackfillDatum = { ok: true; datum: string } | { ok: false; fehler: string }

const TAG_MS = 86_400_000

/**
 * @param param `?date=`-Wert, so wie er ankam (auch ein leerer String ist ein Wert und wird geprüft)
 * @param heute  heutiges Datum als `JJJJ-MM-TT` in UTC (dieselbe Sicht wie `isoDate()` in index.ts)
 */
export function pruefeBackfillDatum(param: string, heute: string): BackfillDatum {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return { ok: false, fehler: 'date muss das Format JJJJ-MM-TT haben' }
  }
  const t = Date.parse(`${param}T00:00:00Z`)
  // Gegenprobe über die Rückumwandlung: 2026-02-31 wird je nach Laufzeit zu NaN oder zum 3. März.
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== param) {
    return { ok: false, fehler: 'date ist kein gültiges Datum' }
  }
  const tageZurueck = Math.round((Date.parse(`${heute}T00:00:00Z`) - t) / TAG_MS)
  if (tageZurueck < 0) return { ok: false, fehler: 'date liegt in der Zukunft' }
  if (tageZurueck > BACKFILL_MAX_TAGE) {
    return { ok: false, fehler: `date darf höchstens ${BACKFILL_MAX_TAGE} Tage zurückliegen` }
  }
  return { ok: true, datum: param }
}
