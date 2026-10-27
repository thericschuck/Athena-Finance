import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { ErsteSchritteListe } from './ErsteSchritteListe'
import { ScopeLeerHinweis } from './ScopeLeerHinweis'
import type { Schritt } from '@/lib/leer/erste-schritte'
import type { ScopeHinweis } from '@/lib/leer/hinweis'

/**
 * Ersatz für das Dashboard, solange gar keine Daten da sind: eine ruhige Willkommenskarte mit der
 * Checkliste statt Kennzahlenleiste voller Nullen und leerer Charts. Sobald ein Konto, eine
 * Buchung oder eine Anlage existiert, rendert die Seite wieder das normale Dashboard.
 */
export function DashboardEinstieg({ schritte, hinweis }: { schritte: Schritt[]; hinweis: ScopeHinweis | null }) {
  return (
    <div className="space-y-4">
      {hinweis && <ScopeLeerHinweis hinweis={hinweis} />}
      <section aria-label="Erste Schritte" className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Willkommen bei Athena Finance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hier laufen Konten, Buchungen, Verträge, Sparziele und Anlagen zusammen. Das Dashboard zeigt dir
              Vermögen, Monat und Ausblick, sobald die ersten Daten da sind.
            </p>
          </div>
        </div>
        <ErsteSchritteListe schritte={schritte} />
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Bank direkt anbinden? Das geht in den{' '}
          <Link href="/settings" className="text-primary underline-offset-4 hover:underline">Einstellungen</Link>.
        </p>
      </section>
    </div>
  )
}
