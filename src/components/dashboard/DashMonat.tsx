import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { budgetStand, nettoVorzeichen, type BudgetTon } from '@/lib/dashboard/monat'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'

const BALKEN: Record<BudgetTon, string> = { gut: 'bg-success', warnung: 'bg-warning', schlecht: 'bg-danger' }
const TEXT: Record<BudgetTon, string> = { gut: 'text-success', warnung: 'text-warning', schlecht: 'text-danger' }

/**
 * Kompakte Monatskarte (oben in Spalte 1, so hoch wie ihr Inhalt, ohne Mindesthoehe): Monatsname, Netto in
 * text-2xl mit Pfeil, darunter Einnahmen | Ausgaben | Sparquote. Die Aufschluesselung nach
 * Konsum / Anlage / Forderung steckt in einer Erklaerungskarte (Hover, Fokus, Tippen) statt in
 * einer grossen Liste. Der Budgetbalken (Konsum gegen Monatsbudget) ist einzeilig.
 * Alle Zahlen kommen fertig aus dem Kern; hier wird nichts neu gerechnet.
 */
export function DashMonat({ kern }: DashAbschnittProps) {
  const { monat, locale, monatsBudget } = kern
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const euro2 = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })
  const vz = nettoVorzeichen(monat.netto)
  const budget = budgetStand(monatsBudget, monat.konsum)
  const netto = (f: { income: number; expense: number }) => euro2(f.income - f.expense)

  const kopf = (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold">{monat.label}</h2>
      <Link
        href="/analyse"
        className="-my-2 flex min-h-10 items-center rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Zur Analyse
      </Link>
    </div>
  )

  if (monat.leer) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        {kopf}
        <p className="py-4 text-center text-sm text-muted-foreground/70">
          Noch keine Buchungen in diesem Monat
        </p>
      </div>
    )
  }

  const Pfeil = vz === 'plus' ? ArrowUpRight : vz === 'minus' ? ArrowDownRight : Minus
  const nettoFarbe = vz === 'plus' ? 'text-success' : vz === 'minus' ? 'text-danger' : 'text-muted-foreground'

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {kopf}

      <div className="mt-3">
        <p className="text-xs text-muted-foreground">Netto</p>
        <p className={`flex items-center gap-1.5 text-2xl font-semibold tabular-nums tracking-tight ${nettoFarbe}`}>
          <Pfeil className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{euro2(monat.netto)}</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Zelle label="Einnahmen" wert={euro(monat.einnahmen)} />
        <Zelle label="Ausgaben" wert={euro(monat.ausgaben)} />
        <Zelle
          label="Sparquote"
          wert={monat.sparquote === null ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(monat.sparquote)} %`}
        />
      </div>

      {/* Aufschluesselung: eine kleine Zeile, die Details stehen in der Erklaerungskarte. */}
      <AnalyseKennzahlInfo
        titel="Wohin das Geld geht"
        zeilen={[
          ['Konsum', `${euro2(monat.echt.income)} / −${euro2(monat.echt.expense)}`],
          ['Anlage', netto(monat.anlage)],
          ['Forderung', netto(monat.forderung)],
        ]}
        text="Je Bereich Einnahmen und Ausgaben des Monats (Konsum, Anlage, Forderung). Anlage und Forderung sind Vermögensumschichtungen, kein Verbrauch; nur Konsum zählt für Budget und Sparquote."
        className="mt-1 flex min-h-10 cursor-help items-center rounded-md text-[11px] tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">
          Konsum {euro(monat.echt.expense)} · Anlage {euro(monat.anlage.expense)} · Forderung {euro(monat.forderung.expense)}
        </span>
      </AnalyseKennzahlInfo>

      {budget ? (
        <div className="mt-1 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          <span className="shrink-0">Budget</span>
          <span
            role="progressbar"
            aria-valuenow={Math.round(budget.prozent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Budget zu ${Math.round(budget.prozent)} Prozent verbraucht`}
            className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span className={`block h-full rounded-full ${BALKEN[budget.ton]}`} style={{ width: `${budget.balken}%` }} />
          </span>
          <span className={`shrink-0 font-medium ${TEXT[budget.ton]}`}>
            {budget.rest >= 0 ? `noch ${euro(budget.rest)}` : `${euro(-budget.rest)} drüber`}
          </span>
        </div>
      ) : (
        <Link
          href="/settings"
          className="mt-0.5 inline-flex min-h-10 items-center text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Budget festlegen
        </Link>
      )}
    </div>
  )
}

function Zelle({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{wert}</p>
    </div>
  )
}
