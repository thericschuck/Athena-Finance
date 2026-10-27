import { getAllMonthlyTotals } from '@/lib/data/verlauf-monate'
import {
  balkenPunkte, heatmapZeilen, jahresGruppen, kennzahlen, monatsIndex, seite, sparquote, vorjahresVergleich,
  type MonatRow, type MonatSumme, type Vorjahr,
} from '@/lib/verlauf/monate'
import { Th, Td, Pagination, PAGE_SIZE, fmtEur, heuteBerlin, type TabCtx } from './shared'
import { SparquoteHeatmap } from './SparquoteHeatmap'
import { MonatsBalkenLazy } from './MonatsBalkenLazy'
import { CalendarDays } from 'lucide-react'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'

// ─── Tab: Monthly ─────────────────────────────────────────────────────────────
// Aus `monthly_flow_totals` (live aus monthly_flows) statt der früheren Cron-Tabelle. Einnahmen und
// Ausgaben zählen alles, was zählt; Konsum, Anlage und Forderungen stehen getrennt daneben.
// Die Sparquote rechnet nur auf Konsum (siehe lib/finance/flow-calc).
//
// Die View hält nur rund 30 Monate: alle werden geladen und im Code gruppiert (Jahressummen,
// Vorjahresvergleich und Heatmap brauchen Monate außerhalb der aktuellen Seite). Geblättert wird
// trotzdem in Monaten, damit die Seitenlogik zu den anderen Tabs passt; `from`/`to` aus dem
// TabCtx gelten deshalb nicht.

const pctText = (q: number | null) => (q === null ? '–' : `${q} %`)

const signed = (n: number, locale: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtEur(Math.abs(n), locale)}`

function Kennzahl({ label, wert, hinweis, ton }: { label: string; wert: string; hinweis?: string; ton?: 'success' | 'danger' }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums tracking-tight ${ton === 'success' ? 'text-success' : ton === 'danger' ? 'text-danger' : ''}`}>
        {wert}
      </p>
      {hinweis && <p className="mt-0.5 text-[11px] text-muted-foreground">{hinweis}</p>}
    </div>
  )
}

/** Mehr Einnahmen ist gut (grün), mehr Ausgaben schlecht (rot); die Richtung entscheidet die Farbe. */
function VorjahrZelle({ v, locale }: { v: Vorjahr | null; locale: string }) {
  if (!v) return <span className="text-muted-foreground">–</span>
  const ton = (delta: number, gutWennPlus: boolean) =>
    delta === 0 ? 'text-muted-foreground' : (delta > 0) === gutWennPlus ? 'text-success' : 'text-danger'
  const pct = (p: number | null) => (p === null ? '' : ` (${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(Math.round(p))} %)`)
  return (
    <span className="inline-flex flex-col items-end text-xs leading-tight">
      <span className={ton(v.income, true)}>Einn. {signed(v.income, locale)}{pct(v.incomePct)}</span>
      <span className={ton(v.expense, false)}>Ausg. {signed(v.expense, locale)}{pct(v.expensePct)}</span>
    </span>
  )
}

function Zahlen({ s, locale, label, gruppe }: { s: MonatSumme; locale: string; label: React.ReactNode; gruppe?: boolean }) {
  const net = s.income - s.expense
  const pos = net >= 0
  const q = sparquote(s)
  return (
    <>
      <Td><span className={gruppe ? 'font-semibold' : 'font-medium'}>{label}</span></Td>
      <Td right mono><span className="text-success font-medium">{fmtEur(s.income, locale)}</span></Td>
      <Td right mono><span className="text-danger">{fmtEur(s.expense, locale)}</span></Td>
      <Td right mono>
        <span className={pos ? 'text-success font-semibold' : 'text-danger font-semibold'}>
          {pos ? '+' : ''}{fmtEur(net, locale)}
        </span>
      </Td>
      <Td right mono dim>{fmtEur(s.echt_income, locale)}</Td>
      <Td right mono dim>{fmtEur(s.echt_expense, locale)}</Td>
      <Td right mono dim>{pctText(q)}</Td>
      <Td right mono dim>{fmtEur(s.anlage_expense, locale)}</Td>
      <Td right mono dim>{fmtEur(s.anlage_income, locale)}</Td>
      <Td right mono dim>{fmtEur(s.forderung_expense, locale)}</Td>
      <Td right mono dim>{fmtEur(s.forderung_income, locale)}</Td>
      <Td right mono dim>{s.tx_count}</Td>
    </>
  )
}

function MobilKarte({ titel, s, vorjahr, locale, gruppe }: {
  titel: string; s: MonatSumme; vorjahr?: Vorjahr | null; locale: string; gruppe?: boolean
}) {
  const net = s.income - s.expense
  const q = sparquote(s)
  return (
    <div className={`rounded-lg border border-border px-4 py-3 ${gruppe ? 'bg-muted/40' : 'bg-card'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={gruppe ? 'text-sm font-semibold' : 'text-sm font-medium'}>{titel}</span>
        <span className={`text-sm font-semibold tabular-nums ${net >= 0 ? 'text-success' : 'text-danger'}`}>
          {net >= 0 ? '+' : ''}{fmtEur(net, locale)}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Einnahmen</dt>
        <dd className="text-right tabular-nums text-success">{fmtEur(s.income, locale)}</dd>
        <dt className="text-muted-foreground">Ausgaben</dt>
        <dd className="text-right tabular-nums text-danger">{fmtEur(s.expense, locale)}</dd>
        <dt className="text-muted-foreground">Konsum</dt>
        <dd className="text-right tabular-nums">{fmtEur(s.echt_expense, locale)}</dd>
        <dt className="text-muted-foreground">Sparquote</dt>
        <dd className="text-right tabular-nums">{pctText(q)}</dd>
        {(s.anlage_expense > 0 || s.anlage_income > 0) && (
          <>
            <dt className="text-muted-foreground">Anlage (A. / E.)</dt>
            <dd className="text-right tabular-nums">{fmtEur(s.anlage_expense, locale)} / {fmtEur(s.anlage_income, locale)}</dd>
          </>
        )}
        {(s.forderung_expense > 0 || s.forderung_income > 0) && (
          <>
            <dt className="text-muted-foreground">Forderung (A. / E.)</dt>
            <dd className="text-right tabular-nums">{fmtEur(s.forderung_expense, locale)} / {fmtEur(s.forderung_income, locale)}</dd>
          </>
        )}
        {vorjahr !== undefined && (
          <>
            <dt className="text-muted-foreground">Vorjahr</dt>
            <dd className="text-right"><VorjahrZelle v={vorjahr} locale={locale} /></dd>
          </>
        )}
      </dl>
    </div>
  )
}

export async function MonthlyTab({ supabase, ctx, locale, page, params }: TabCtx) {
  const rows: MonatRow[] = await getAllMonthlyTotals(supabase, ctx)

  if (rows.length === 0) {
    return (
      <div className="space-y-4 p-4">
        <ScopeHinweisFuer ctx={ctx} thema="Buchungen" />
        <LeerZustand
          variante="eingebettet"
          icon={CalendarDays}
          titel="Noch keine Monatsdaten"
          text="Die Monatsübersicht fasst Einnahmen, Ausgaben und Sparquote je Monat zusammen. Sie füllt sich mit deinen ersten Buchungen."
          aktion={{ label: 'Buchungen hinzufügen', href: '/finance/transactions' }}
        />
      </div>
    )
  }

  const k = kennzahlen(rows, 12, heuteBerlin())
  const index = monatsIndex(rows)
  // Der laufende Monat ist unvollstaendig: gegen einen vollen Vorjahresmonat waere jede Differenz Zufall.
  const aktuellerMonat = heuteBerlin().slice(0, 7)
  const laufend = (month: string) => month.slice(0, 7) >= aktuellerMonat
  const gruppen = seite(jahresGruppen(rows), page, PAGE_SIZE)
  const monatFmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const monatName = (m: string) => monatFmt.format(new Date(`${m.slice(0, 7)}-01T00:00:00Z`))

  return (
    <div className="space-y-4">
      {/* Kopf: Kennzahlen über die jüngsten 12 Monate */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kennzahl
          label="Ø Sparquote"
          wert={pctText(k.durchschnittSparquote)}
          hinweis={`letzte ${k.monate} Monate, auf Konsum`}
          ton={k.durchschnittSparquote === null ? undefined : k.durchschnittSparquote >= 0 ? 'success' : 'danger'}
        />
        <Kennzahl
          label="Bester Monat"
          wert={k.bester ? pctText(k.bester.wert) : '–'}
          hinweis={k.bester ? monatName(k.bester.month) : undefined}
          ton={k.bester ? 'success' : undefined}
        />
        <Kennzahl
          label="Schwächster Monat"
          wert={k.schlechtester ? pctText(k.schlechtester.wert) : '–'}
          hinweis={k.schlechtester ? monatName(k.schlechtester.month) : undefined}
          ton={k.schlechtester ? (k.schlechtester.wert < 0 ? 'danger' : undefined) : undefined}
        />
        <Kennzahl
          label="Median Konsum"
          wert={k.medianKonsum === null ? '–' : fmtEur(k.medianKonsum, locale)}
          hinweis="pro Monat, letzte 12 Monate"
        />
      </div>

      <SparquoteHeatmap zeilen={heatmapZeilen(rows)} locale={locale} />

      <MonatsBalkenLazy punkte={balkenPunkte(rows)} locale={locale} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Monate und Jahre</h2>
        <a
          href="/api/export/monthly"
          download
          className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
        >
          CSV exportieren
        </a>
      </div>

      {/* Desktop: Tabelle mit Jahres-Zwischenzeilen */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <Th>Monat</Th>
              <Th right>Einnahmen</Th>
              <Th right>Ausgaben</Th>
              <Th right>Saldo</Th>
              <Th right>Konsum&nbsp;E.</Th>
              <Th right>Konsum&nbsp;A.</Th>
              <Th right>Sparquote</Th>
              <Th right>Anlage&nbsp;A.</Th>
              <Th right>Anlage&nbsp;E.</Th>
              <Th right>Forderung&nbsp;A.</Th>
              <Th right>Forderung&nbsp;E.</Th>
              <Th right>Buchungen</Th>
              <Th right>Δ&nbsp;Vorjahresmonat</Th>
            </tr>
          </thead>
          <tbody>
            {gruppen.map(g => (
              <JahrBlock key={g.jahr}>
                <tr className="border-b border-border bg-muted/40">
                  <Zahlen s={g.summe} locale={locale} gruppe label={`${g.jahr} · Summe`} />
                  <Td right>{' '}</Td>
                </tr>
                {g.monate.map((r, i) => (
                  <tr key={r.month} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <Zahlen s={r} locale={locale} label={r.month.slice(0, 7)} />
                    <Td right><VorjahrZelle v={laufend(r.month) ? null : vorjahresVergleich(index, r)} locale={locale} /></Td>
                  </tr>
                ))}
              </JahrBlock>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: Karten statt breiter Tabelle */}
      <div className="space-y-2 sm:hidden">
        {gruppen.map(g => (
          <div key={g.jahr} className="space-y-2">
            <MobilKarte titel={`${g.jahr} · Summe`} s={g.summe} locale={locale} gruppe />
            {g.monate.map(r => (
              <MobilKarte key={r.month} titel={monatName(r.month)} s={r} vorjahr={laufend(r.month) ? null : vorjahresVergleich(index, r)} locale={locale} />
            ))}
          </div>
        ))}
      </div>

      <Pagination tab="monthly" page={page} total={rows.length} params={params} />
    </div>
  )
}

/** Fragment mit Name, damit der Key im Tabellenkörper an einer Stelle sitzt. */
function JahrBlock({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
