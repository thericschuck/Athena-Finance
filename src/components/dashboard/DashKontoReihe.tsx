import Link from 'next/link'

/**
 * Gemeinsamer Rahmen der Reihen "Konten" und "Anlagen" auf dem Dashboard: Kopfzeile (Titel,
 * gedimmter Zaehler, Link rechts) und darunter die Kartenreihe im Muster der Bank-Kontokarten
 * (BankKontokartenListe): ab lg gleichmaessig nebeneinander, darunter waagerecht scrollbar mit
 * Snap, versteckter Scrollbar und Fades an den Raendern.
 *
 * `min-w-0` an der Section ist Pflicht: ohne waere der Container so breit wie alle Karten zusammen
 * und zoege die SEITE in die Breite; so scrollt nur die Reihe.
 */
export function DashKartenReihe({
  titel, zaehler, linkHref, linkText, children,
}: {
  titel: string
  zaehler?: string
  linkHref: string
  linkText: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={titel} className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {titel}
          {zaehler && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{zaehler}</span>}
        </h2>
        {/* -my/py: Tap-Ziel von 40 px Hoehe, ohne die Kopfzeile selbst hoeher zu machen. */}
        <Link
          href={linkHref}
          className="-my-2 flex min-h-10 items-center rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {linkText}
        </Link>
      </div>
      <div className="relative">
        <div className="flex snap-x gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background to-transparent lg:hidden" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent lg:hidden" />
      </div>
    </section>
  )
}

/** Klassen einer Karte der Reihe: 72 px hoch, 224 px breit, ab lg gleichmaessig verteilt. */
export const DASH_KARTE =
  'flex h-[72px] w-56 shrink-0 snap-start items-center gap-2 rounded-lg border border-border bg-card px-3 transition-colors hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-auto lg:min-w-0 lg:flex-1'
