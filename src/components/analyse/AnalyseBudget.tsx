import Link from 'next/link'
import { getAuthUser } from '@/lib/supabase/server'
import { getBudgetCategories, getBudgetItems, getIncomeTarget } from '@/lib/data/finance-budget'
import { fmtCurrency } from '@/lib/format'
import {
  berechneBudget, einkommensVergleich, mindestNetto, statusFarbe,
  type BudgetStatus,
} from '@/lib/analyse/budget'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'
import { AnalyseBudgetListe } from './AnalyseBudgetListe'

/**
 * Budget: Soll gegen Ist. Lädt die (kleinen) Budget-Stammdaten selbst und rechnet mit dem
 * gemeinsamen Kern der Seite (`daten.monatsZeilen`), damit die Zahlen zu allen anderen Abschnitten
 * passen. Die Zuordnung Budgetkategorie -> Buchungskategorie und ihre Grenzen stehen in
 * lib/analyse/budget.ts.
 *
 * Fenster: bei mehreren Monaten gilt Soll x Monate (Monatsebene wie überall in der Analyse; eine
 * Woche zählt als ihr Monat). Die Prognose gilt immer dem laufenden Monat und erscheint nur, wenn
 * er im Fenster liegt.
 */

const STATUS_TEXT: Record<BudgetStatus, string> = {
  gruen: 'im Rahmen',
  gelb: 'knapp',
  rot: 'über Budget',
}

export async function AnalyseBudget({ daten }: AnalyseAbschnittProps) {
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  const [kategorien, posten, ziel] = await Promise.all([
    getBudgetCategories(supabase, user.id),
    getBudgetItems(supabase, user.id),
    getIncomeTarget(supabase, user.id),
  ])

  const eur = (n: number) => fmtCurrency(n, 'EUR', daten.locale)
  const hatBudget = kategorien.some(k => (k.monthly_budget ?? 0) > 0)

  if (!hatBudget) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Budget</h2>
        <p className="mt-1 text-sm text-muted-foreground">Noch kein Budget.</p>
        <Link
          href="/finance/budget"
          className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Jetzt anlegen
        </Link>
      </section>
    )
  }

  const fenster = daten.fenster
  const e = berechneBudget({
    budgets: kategorien.map(k => ({
      id: k.id, name: k.name, icon: k.icon, monatsBudget: k.monthly_budget == null ? null : Number(k.monthly_budget),
    })),
    kategorien: daten.categories,
    zeilen: daten.monatsZeilen,
    fenster,
    fruehesterMonat: daten.fruehesterMonat,
    heute: daten.heute,
  })
  const einkommen = einkommensVergleich(
    daten.monatsZeilen, fenster, e.monate,
    mindestNetto(
      posten.map(p => ({ unit_price: Number(p.unit_price), quantity: Number(p.quantity), interval_days: Number(p.interval_days) })),
      ziel ? { buffer_pct: Number(ziel.buffer_pct), tax_pct: Number(ziel.tax_pct), savings_pct: Number(ziel.savings_pct) } : null,
    ),
  )
  const g = e.gesamt
  const p = e.prognose

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Budget: Soll gegen Ist</h2>
        <Link href="/finance/budget" className="inline-flex min-h-10 items-center text-xs text-muted-foreground hover:text-foreground">
          Budget bearbeiten
        </Link>
      </div>

      {g ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: statusFarbe(g.status) }}>
              {eur(g.ist)}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">von {eur(g.soll)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(g.auslastung ?? 0, 1) * 100}%`, background: statusFarbe(g.status) }}
            />
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {g.auslastung != null ? `${Math.round(g.auslastung * 100)} % · ` : ''}
            {g.rest < 0 ? `${eur(-g.rest)} über Budget` : `${eur(g.rest)} übrig`}
            {e.monate > 1 ? ` · ${e.monate} Monate` : ''}
          </p>
          {p && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Bei diesem Tempo{' '}
              <span className="font-semibold tabular-nums" style={{ color: statusFarbe(p.status) }}>
                {eur(p.hochrechnung)}
              </span>{' '}
              bis Monatsende ({STATUS_TEXT[p.status]}, Budget {eur(p.sollMonat)}) · noch {p.tageBisMonatsende}{' '}
              {p.tageBisMonatsende === 1 ? 'Tag' : 'Tage'}. Einfache lineare Hochrechnung: feste Kosten wie
              Miete, die erst später im Monat abgehen, verzerren sie.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Keine Budgetkategorie passt zu einer Buchungskategorie. Gib beiden denselben Namen, dann
          erscheint hier das Ist.
        </p>
      )}

      {e.zeilen.length > 0 && <AnalyseBudgetListe zeilen={e.zeilen} locale={daten.locale} />}

      {e.offen.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Nicht zugeordnet (keine Buchungskategorie gleichen Namens): {e.offen.map(b => b.name).join(', ')}.
        </p>
      )}

      {einkommen && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">Einkommensziel</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {eur(einkommen.ist)} von {eur(einkommen.soll)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(einkommen.erreicht ?? 0, 1) * 100}%`,
                background: (einkommen.erreicht ?? 0) >= 1 ? 'var(--success)' : 'var(--chart-accent)',
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Netto-Mindestgehalt aus den Posten der Budget-Seite (inkl. Puffer und Sparen) gegen die
            Einnahmen im Zeitraum.
          </p>
        </div>
      )}
    </section>
  )
}
