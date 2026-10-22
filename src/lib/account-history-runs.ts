/**
 * Rekonstruiert die Tageszeilen der Kontostand-Historie aus den Läufen der DB-Funktion `balance_series`
 * (Migration 20261023100000). Rein und ohne Imports, damit `node --test` die Datei direkt lädt.
 *
 * Ein Lauf steht für aufeinanderfolgende Tage mit demselben Stand (`von`..`bis`, beide inklusive). Daraus entstehen wieder
 * genau die Zeilen, die `account_balances` hatte: Sparkline und Chart verteilen ihre Punkte nach Index und brauchen die
 * volle Tagesreihe, nur die Übertragung wird kleiner. Die Reihenfolge ist wie bisher: Datum aufsteigend, dann Konto.
 */

export interface BalanceRun {
  account_id: string
  /** YYYY-MM-DD, erster Tag des Laufs. */
  von: string
  /** YYYY-MM-DD, letzter Tag des Laufs (inklusive). */
  bis: string
  balance: number
}

export interface BalanceSnapshot {
  account_id:    string
  snapshot_date: string
  balance:       number
}

const TAG_MS = 86_400_000

/** Tage von `von` bis `bis` als YYYY-MM-DD, in UTC gezählt (keine Sommerzeit-Sprünge). */
export function tageVonBis(von: string, bis: string): string[] {
  const start = Date.parse(`${von}T00:00:00Z`)
  const ende = Date.parse(`${bis}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(ende) || ende < start) return []
  const out: string[] = []
  for (let t = start; t <= ende; t += TAG_MS) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

export function expandiereLaeufe(laeufe: BalanceRun[]): BalanceSnapshot[] {
  const rows: BalanceSnapshot[] = []
  for (const l of laeufe) {
    for (const tag of tageVonBis(l.von, l.bis)) {
      rows.push({ account_id: l.account_id, snapshot_date: tag, balance: l.balance })
    }
  }
  return rows.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date) || a.account_id.localeCompare(b.account_id))
}
