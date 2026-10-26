import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'

/**
 * Schmale Kennzahlen-Leiste für Verträge-Seite und Vertrags-Detail (Muster: KontenKennzahlenLeiste):
 * eine Karte mit dünnen Trennlinien, am Handy waagerecht scrollbar im EIGENEN Container (Snap, Fades),
 * Erklärung per Portal-Hover. Server-Komponente; die Zellen kommen als Daten.
 */

export type Zelle = {
  titel: string
  wert: string
  /** Kleiner Zusatz hinter dem Wert (z. B. „/ Jahr“). */
  zusatz?: string
  ton?: 'danger' | 'warning' | 'success'
  info: { titel: string; zeilen?: [string, string][]; text: string }
}

const ZELLE =
  'flex h-14 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

const TON = { danger: 'text-danger', warning: 'text-warning', success: 'text-success' } as const

export function VertraegeKennzahlenLeiste({ zellen }: { zellen: Zelle[] }) {
  return (
    <section aria-label="Kennzahlen" className="relative min-w-0 rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {zellen.map(z => (
          <AnalyseKennzahlInfo key={z.titel} className={ZELLE} titel={z.info.titel} zeilen={z.info.zeilen} text={z.info.text}>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{z.titel}</span>
            <span className="mt-0.5 flex items-baseline gap-1">
              <span className={`text-base font-semibold tabular-nums tracking-tight sm:text-lg ${z.ton ? TON[z.ton] : ''}`}>{z.wert}</span>
              {z.zusatz && <span className="max-w-[9rem] truncate text-xs text-muted-foreground">{z.zusatz}</span>}
            </span>
          </AnalyseKennzahlInfo>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
