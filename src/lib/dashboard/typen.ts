import type { NetWorthPunkt } from '@/lib/verlauf/types'
import type { ScopeContext } from '@/lib/haushalt/scope'
import type { InsightListRow } from '@/lib/data/overview'
import type { FixedCostContract, UpcomingContract } from '@/lib/finance/dashboard-calc'
import type { getLastRebalancing } from '@/app/(dashboard)/crypto/actions'
import type { getDepotsSummaries } from '@/lib/data/depot'

/**
 * Gemeinsame Formen des Dashboards. Die Seite rechnet den Kern EINMAL (lib/data/dashboard-seite.ts)
 * und reicht ihn an die Abschnitte; die kennen nur diese Typen. So lassen sie sich unabhängig
 * bauen, und alle zeigen dieselben Zahlen (Monat = Monat; Net Worth = Summe der Posten PLUS Konten im Minus — der Ring zeigt die
 * Posten und weist Minus/Kreditkonten gesondert aus).
 */

export interface DashKonto {
  id: string
  name: string
  type: string
  color: string | null
  currency: string
  saldo: number
  /** false bei Konten ohne jede Buchung: dort zeigt das Dashboard „—" statt 0 €. */
  hatBuchungen: boolean
}

export type DashDepot = Awaited<ReturnType<typeof getDepotsSummaries>>[number]

export interface DashFluss {
  income: number
  expense: number
}

export interface DashboardKern {
  /** Scope der Seite (nur fuer Server-Abschnitte, die zusaetzlich laden; nicht an Client-Komponenten weiterreichen). */
  scopeCtx: ScopeContext
  /** Heutiges Datum (YYYY-MM-DD) in deutscher Zeit. */
  heute: string
  locale: string
  dateFormat: string

  /** Nettovermögen = Konten + Krypto + Depot (festgelegt 2026-09-02, siehe dashboard-seite.ts). */
  netWorth: number
  /** Die Posten, die zusammen `netWorth` ergeben. */
  buckets: { konten: number; geschaeftsanteile: number; depot: number; krypto: number }
  /** Steht daneben, ist NICHT Teil des Net Worth. */
  nichtImNetWorth: { sparziele: number; ichSchulde: number; mirGeschuldet: number }
  /** Verlauf der letzten 2 Jahre, aufsteigend, der letzte Punkt ist der Live-Stand von heute. */
  snapshots: NetWorthPunkt[]

  monat: {
    /** „Oktober 2026" */
    label: string
    /** Erster Tag des Monats YYYY-MM-01 */
    start: string
    einnahmen: number
    ausgaben: number
    netto: number
    /** Konsum = nur `echt`-Ausgaben (Basis des Budgets). */
    konsum: number
    echt: DashFluss
    anlage: DashFluss
    forderung: DashFluss
    /** Sparquote auf Konsum in Prozent; null ohne echte Einnahmen. */
    sparquote: number | null
    /** Gar keine Buchungen im Monat. */
    leer: boolean
  }
  /** Monatsbudget aus den Einstellungen (Konsum); null = keins gesetzt. */
  monatsBudget: number | null

  konten: DashKonto[]
  depots: DashDepot[]
  krypto: {
    gesamt: number
    kosten: number | null
    rebalancingVolumen: number
    lastRebalancing: Awaited<ReturnType<typeof getLastRebalancing>>
    topAssets: { symbol: string; value: number; pct: number }[]
  }
  inventar: { wert: number; stueck: number }
  sparziele: { id: string; description: string; current: number; target: number }[]
  fixkosten: { total: number; vertraege: FixedCostContract[]; konten: { id: string; name: string }[] }
  /** Verträge, deren Kündigungsfrist in den nächsten 45 Tagen endet (bzw. überfällig ist). */
  kuendbar: UpcomingContract[]
  /** Offene Athena-Hinweise (neueste zuerst). */
  insights: InsightListRow[]
  /** Monatssummen der letzten 12 Monate für die Finanzanalyse-Charts. */
  analytik: {
    summaries: { month: string; total_income: number; total_expenses: number; net_balance: number }[]
    categorySeries: ReturnType<typeof import('@/lib/finance/flow-calc').monthlyCategorySeries>
  }
}

/** Props jedes Abschnitts. */
export interface DashAbschnittProps {
  kern: DashboardKern
}
