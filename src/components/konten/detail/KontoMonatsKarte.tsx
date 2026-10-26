import { AccountMonthChart, type MonthDatum } from '@/components/finance/account-month-chart'

/** Karte „Monat für Monat“; ein Klick auf eine Säule setzt `month` (wirkt auf alles darunter). */
export function KontoMonatsKarte({
  monate, aktiverMonat, currency,
}: {
  monate: MonthDatum[]
  aktiverMonat: string | null
  currency: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Monat für Monat</p>
        <span className="text-right text-[11px] text-muted-foreground">Monat anklicken zum Eingrenzen</span>
      </div>
      <AccountMonthChart data={monate} currency={currency} selectedMonth={aktiverMonat} />
    </div>
  )
}
