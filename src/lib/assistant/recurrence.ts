/**
 * Wiederkehr-Logik für Verträge — absichtlich eine 1:1-Spiegelung von
 * `isDueToday` in `supabase/functions/execute-contracts/index.ts`.
 *
 * Das ist die einzige Stelle, an der ein zweites Mal entschieden wird, wann ein
 * Vertrag fällig ist. Wenn die beiden auseinanderlaufen, nennt Athena Termine,
 * an denen der Cron nichts bucht — schlimmer als kein Kalender. Änderungen
 * deshalb immer in beiden Dateien.
 *
 * Gerechnet wird in UTC, weil der Cron auf einem UTC-Server läuft und dort
 * `setHours(0,0,0,0)` und `getDate()` auf UTC-Mitternacht fallen. Lokale
 * Zeitzonen hier würden im Sommer einen Tag Versatz erzeugen.
 */
const INTERVAL_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, biannual: 6, yearly: 12 }
const INTERVAL_DAYS:   Record<string, number> = { weekly: 7, biweekly: 14 }

/** 'YYYY-MM-DD' → UTC-Mitternacht. */
export function alsTag(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function alsIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function tageDazu(d: Date, n: number): Date {
  const kopie = new Date(d)
  kopie.setUTCDate(kopie.getUTCDate() + n)
  return kopie
}

export function istFaellig(
  startDate: string,
  frequency: string | null,
  billingDay: number | null,
  d: Date,
): boolean {
  const start = alsTag(startDate)
  if (start > d) return false

  const freq = frequency ?? 'monthly'

  if (INTERVAL_DAYS[freq]) {
    const diff = Math.floor((d.getTime() - start.getTime()) / 86_400_000)
    return diff % INTERVAL_DAYS[freq] === 0
  }

  const months = INTERVAL_MONTHS[freq] ?? 1
  const monatsDiff =
    (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + (d.getUTCMonth() - start.getUTCMonth())

  if (billingDay) {
    if (d.getUTCDate() !== billingDay) return false
    return monatsDiff >= 0 && monatsDiff % months === 0
  }

  // Kein billing_day: derselbe Tag-des-Monats wie start_date. `> 0` und nicht
  // `>= 0` — der Starttag selbst gilt nicht als Ausführung, genau wie im Cron.
  if (d.getUTCDate() !== start.getUTCDate()) return false
  return monatsDiff > 0 && monatsDiff % months === 0
}

/**
 * Alle Fälligkeiten eines Vertrags in [von, bis]. Tag für Tag durchgehen statt
 * die nächsten Termine zu berechnen: das Fenster ist maximal ein Jahr, und die
 * Frage „hätte der Cron an diesem Tag gebucht" ist genau die, die der Cron
 * selbst stellt — damit kann die Antwort nicht abweichen.
 */
export function faelligkeitenIm(
  vertrag: { start_date: string | null; frequency: string | null; billing_day: number | null; end_date: string | null },
  von: Date,
  bis: Date,
): string[] {
  if (!vertrag.start_date) return []
  const ende = vertrag.end_date ? alsTag(vertrag.end_date) : null
  const treffer: string[] = []
  for (let d = new Date(von); d <= bis; d = tageDazu(d, 1)) {
    if (ende && d > ende) break
    if (istFaellig(vertrag.start_date, vertrag.frequency, vertrag.billing_day, d)) {
      treffer.push(alsIso(d))
    }
  }
  return treffer
}
