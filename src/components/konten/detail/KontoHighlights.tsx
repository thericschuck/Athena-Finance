import { fmtDate } from '@/lib/format'
import type { GrosseBuchung, SaldoSpanne } from '@/lib/konten/detail'
import { formatBetrag } from './format'

/**
 * Schmale Highlight-Leiste unter den Kennzahlen: tiefster/höchster Stand, größte Ausgabe,
 * Ø Ausgaben pro Monat. Zellen erscheinen nur, wenn Daten da sind; ist keine übrig, entfällt die
 * Leiste. Mobil scrollt sie waagerecht (Fades an den Rändern). Server-Komponente.
 */
function Zelle({ kicker, wert, nebenan, ton }: {
  kicker: string
  wert: string
  nebenan?: string
  ton?: 'danger' | 'success'
}) {
  return (
    <div className="flex h-14 shrink-0 flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{kicker}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-sm font-semibold tabular-nums ${ton === 'danger' ? 'text-danger' : ton === 'success' ? 'text-success' : ''}`}>
          {wert}
        </span>
        {nebenan && <span className="max-w-40 truncate text-xs text-muted-foreground">{nebenan}</span>}
      </span>
    </div>
  )
}

export function KontoHighlights({
  spanne, groessteAusgabe, proMonat, currency, locale, dateFormat,
}: {
  spanne: SaldoSpanne | null
  groessteAusgabe: GrosseBuchung | null
  proMonat: { einnahmen: number; ausgaben: number; monate: number } | null
  currency: string
  locale: string
  dateFormat: string
}) {
  const betrag = (n: number) => formatBetrag(n, currency, locale)
  const zeigeSpanne = spanne !== null && spanne.tiefst.date !== spanne.hoechst.date
  const zellen: React.ReactNode[] = []

  if (zeigeSpanne && spanne) {
    zellen.push(
      <Zelle key="tief" kicker="Tiefster Stand" wert={betrag(spanne.tiefst.balance)}
        ton={spanne.tiefst.balance < 0 ? 'danger' : undefined} nebenan={fmtDate(spanne.tiefst.date, dateFormat)} />,
      <Zelle key="hoch" kicker="Höchster Stand" wert={betrag(spanne.hoechst.balance)}
        nebenan={fmtDate(spanne.hoechst.date, dateFormat)} />,
    )
  }
  if (groessteAusgabe) {
    zellen.push(
      <Zelle key="gross" kicker="Größte Ausgabe" wert={`−${betrag(groessteAusgabe.betrag)}`} ton="danger"
        nebenan={groessteAusgabe.titel} />,
    )
  }
  if (proMonat && proMonat.monate >= 2) {
    zellen.push(
      <Zelle key="pm" kicker="Ø Ausgaben / Monat" wert={`−${betrag(proMonat.ausgaben)}`} ton="danger"
        nebenan={`Ø Einnahmen ${betrag(proMonat.einnahmen)}`} />,
    )
  }
  if (zellen.length === 0) return null

  return (
    <section aria-label="Highlights" className="relative rounded-lg border border-border bg-card">
      <div className="flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {zellen}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
