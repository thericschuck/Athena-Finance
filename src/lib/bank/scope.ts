import type { BankSeitenDaten, BankScope, BankFlowZeile } from './typen.ts'

/**
 * Berechnet die Sichten (Zeitraum, Konto, Monat) aus den ungefilterten Seitendaten.
 * Rein, damit sich die Regeln testen lassen (scope.test.ts).
 *
 * Regeln (unveraendert aus der alten Client-Seite uebernommen):
 *  - Der Zeitraum greift bei Flows auf MONATSEBENE (ganzer Monat ab dem Monat des Cutoffs),
 *    bei Rohbuchungen auf den Tag.
 *  - Keine Zukunftsmonate im Trend.
 *  - Konto: Rohbuchungen ueber die IBAN, Flows ueber die verknuepfte `account_id`. Ein
 *    gewaehltes Konto ohne verknuepfte account_id ergibt KEINE Flows (statt aller).
 *  - Der Monatsfilter greift auf alles ausser dem Monatschart (`...OhneMonat`).
 */
export function normIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

export function berechneScope(d: BankSeitenDaten): BankScope {
  const kontoAccountId = d.konto
    ? d.balances.find(b => normIban(b.account_iban) === normIban(d.konto!))?.account_id ?? null
    : null

  const abMonat = d.cutoff ? `${d.cutoff.slice(0, 7)}-01` : null
  const dieserMonat = `${d.heute.slice(0, 7)}-01`

  const flowsOhneMonat = d.flowRows.filter((r: BankFlowZeile) =>
    (!abMonat || r.month >= abMonat) &&
    r.month <= dieserMonat &&
    (!d.konto || (kontoAccountId !== null && r.account_id === kontoAccountId)),
  )
  const flows = d.monat ? flowsOhneMonat.filter(r => r.month.slice(0, 7) === d.monat) : flowsOhneMonat

  const buchungenOhneMonat = d.transactions.filter(t =>
    (!d.cutoff || t.value_date >= d.cutoff) &&
    (!d.konto || normIban(t.account_iban) === normIban(d.konto)),
  )
  const buchungen = d.monat
    ? buchungenOhneMonat.filter(t => t.value_date.slice(0, 7) === d.monat)
    : buchungenOhneMonat

  const liste = d.transactions.filter(t =>
    (!d.konto || normIban(t.account_iban) === normIban(d.konto)) &&
    (!d.monat || t.value_date.slice(0, 7) === d.monat),
  )

  return { buchungen, buchungenOhneMonat, liste, flows, flowsOhneMonat, kontoAccountId }
}
