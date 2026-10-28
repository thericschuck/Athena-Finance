import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { VerlaufZustand } from '@/lib/dashboard/leer'

/**
 * Geister-Platzhalter fuer Dashboard-Flaechen, die ohne Daten sonst leer blieben (Verlauf, Aufteilung).
 * Reine Server-Bausteine. Die Zeichnung ist bewusst ohne Zahlen, gedaempft und aria-hidden: sie soll
 * die Form des kommenden Diagramms andeuten, keinen Datenanschein erwecken.
 */

/** Verlauf: gleiche Rolle und Mindesthoehe (320 px) wie der echte Chart; waechst mit der Zeile ("Als Naechstes"). */
export function VerlaufPlatzhalter({ zustand }: { zustand: Exclude<VerlaufZustand, 'daten'> }) {
  const leer = zustand === 'leer'
  return (
    <section
      aria-label="Vermögensverlauf"
      className="relative flex h-full min-h-[320px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center"
    >
      <svg
        aria-hidden
        viewBox="0 0 600 240"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 w-full text-muted-foreground"
      >
        <defs>
          <linearGradient id="verlauf-geist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.10" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 100, 160, 220].map(y => (
          <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        <path d="M0 200 C80 190 140 170 210 150 S330 120 400 90 S520 50 600 30 L600 240 L0 240 Z" fill="url(#verlauf-geist)" />
        <path
          d="M0 200 C80 190 140 170 210 150 S330 120 400 90 S520 50 600 30"
          fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="relative z-10 flex max-w-sm flex-col items-center">
        <p className="text-sm font-medium text-foreground">
          {leer ? 'Dein Vermögensverlauf erscheint hier' : 'Dein Vermögensverlauf entsteht gerade'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {leer
            ? 'Sobald Konten und erste Buchungen da sind, siehst du hier, wie sich dein Vermögen entwickelt.'
            : 'Für den Verlauf braucht es mindestens zwei Tage Daten. Schau morgen wieder vorbei.'}
        </p>
        {leer && (
          <Button asChild size="sm" className="mt-4">
            <Link href="/finance/accounts">Konto anlegen</Link>
          </Button>
        )}
      </div>
    </section>
  )
}

/** Aufteilung: Ring-Silhouette; fuellt die restliche Hoehe der Spalte (flex-1). */
export function AufteilungPlatzhalter() {
  return (
    <section
      aria-label="Vermögensaufteilung"
      className="flex min-h-[200px] min-w-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-4 text-center"
    >
      <svg aria-hidden width="96" height="96" viewBox="0 0 96 96" className="-rotate-90 text-muted-foreground">
        <circle cx="48" cy="48" r="36" fill="none" stroke="var(--border)" strokeWidth="12" opacity="0.6" />
        <circle
          cx="48" cy="48" r="36" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="12"
          strokeDasharray="70 157" strokeLinecap="butt"
        />
      </svg>
      <p className="mt-3 text-sm font-medium text-foreground">Hier erscheint deine Vermögensaufteilung</p>
      <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
        Sobald Konten, Depots oder Krypto Werte haben, siehst du hier, woraus dein Vermögen besteht.
      </p>
    </section>
  )
}
