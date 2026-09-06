import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart2, Gem, LayoutDashboard, LineChart, Sparkles, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { MeanderFrieze } from '@/components/landing/olive-vines'

export const metadata: Metadata = {
  // Das Template der Root-Metadata haengt „· Athena Finance" an.
  title: 'Seite nicht gefunden',
}

/**
 * Die Sprungziele bei einem Fehlgriff — dieselben Bereiche wie in der
 * Seitenleiste, ohne Einstellungen (wer sich vertippt hat, will weiterarbeiten,
 * nicht konfigurieren). Die Liste ist der eigentliche Inhalt der Seite: ein
 * toter Link ist ein Navigationsproblem, und eine 404 ohne Weg heraus loest es
 * nicht.
 */
const ZIELE = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/finance/accounts', label: 'Finance', icon: TrendingUp },
  { href: '/crypto', label: 'Investing', icon: LineChart },
  { href: '/analyse', label: 'Analyse', icon: BarChart2 },
  { href: '/inventar', label: 'Inventar', icon: Gem },
]

/**
 * Eigene 404-Seite (`app/not-found.tsx`), zustaendig sowohl fuer `notFound()`
 * aus einem Segment als auch fuer Routen, die es gar nicht gibt.
 *
 * Ausschliesslich mit semantischen Tokens (`background`, `foreground`,
 * `muted-foreground`, `primary`, `border`) gebaut, und das ist hier keine
 * Stilfrage: die Theme-Presets haengen an `data-theme`, das der
 * SettingsProvider setzt — und der lebt in `(dashboard)/layout.tsx`. Beim
 * direkten Aufruf einer unbekannten URL rendert diese Seite ausserhalb davon,
 * hat also nur die Basis-Palette samt `light`/`dark` von next-themes. Ein
 * Preset-spezifischer Farbwert (etwa der Goldton von Athena) waere dort
 * schlicht nicht definiert.
 *
 * Server-Komponente ohne Interaktion: der Maeander ist reines SVG, die Ziele
 * sind Links.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <Link
          href="/"
          className="mb-10 flex items-center gap-2.5 rounded-md text-sm font-semibold tracking-tight text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Logo size={22} />
          Athena Finance
        </Link>

        {/* Playfair statt der Grotesk des restlichen UI: die Zahl ist das
            einzige Ornament der Seite, und die Serif ist im Athena-Theme
            ohnehin die Stimme fuer Grosses (Landing-Hero, Kennzahlen). */}
        <p className="font-[family-name:var(--font-playfair)] text-7xl leading-none tracking-tight text-primary sm:text-8xl">
          404
        </p>

        <div className="mt-6 w-full max-w-56 text-muted-foreground">
          <MeanderFrieze id="notfound-meander" color="currentColor" opacity={0.35} scale={0.6} />
        </div>

        <h1 className="mt-6 text-lg font-semibold tracking-tight">Diese Seite gibt es nicht</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Entweder ist die Adresse vertippt, oder die Seite ist umgezogen. Deine Daten sind davon
          nicht betroffen.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard">Zum Dashboard</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/assistant">
              <Sparkles className="size-3.5" />
              Athena fragen
            </Link>
          </Button>
        </div>

        <div className="mt-10 w-full border-t border-border pt-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Bereiche</p>
          <nav className="mt-3 flex flex-wrap justify-center gap-1.5">
            {ZIELE.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Icon className="size-3.5 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </main>
  )
}
