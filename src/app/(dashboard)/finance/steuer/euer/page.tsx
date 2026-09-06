import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ladeSteuerdaten } from '@/lib/tax/laden'
import { berechneEuer, type EuerZeileErgebnis } from '@/lib/tax/euer'
import { AlertTriangle, Download } from 'lucide-react'

const euro = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

const datum = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE')

function Zeile({ z }: { z: EuerZeileErgebnis }) {
  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer items-baseline gap-4 px-4 py-3 hover:bg-muted/30">
        <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
          {z.zeile}
        </span>
        <span className="flex-1 text-sm">{z.bezeichnung}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{euro(z.betrag)}</span>
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {z.buchungen.length} {z.buchungen.length === 1 ? 'Buchung' : 'Buchungen'}
        </span>
      </summary>
      <div className="border-t border-border bg-muted/20 px-4 py-2">
        {z.buchungen
          .slice()
          .sort((a, b) => a.datum.localeCompare(b.datum))
          .map((b, i) => (
            // Der Index gehoert hier in den Schluessel: zwei identische Betraege
            // am selben Tag in derselben Kategorie sind moeglich (zwei Rechnungen
            // ueber dieselbe Summe), und einen stabilen Bezeichner tragen die
            // Buchungen an dieser Stelle nicht. Die Liste wird deterministisch
            // sortiert und nie umgeordnet, damit ist der Index stabil.
            <div
              key={`${b.datum}-${b.betrag}-${i}`}
              className="flex items-baseline gap-3 py-1 text-xs"
            >
              <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                {datum(b.datum)}
              </span>
              <span className="flex-1 truncate">{b.beschreibung ?? b.kategorie}</span>
              <span className="shrink-0 text-muted-foreground">{b.kategorie}</span>
              <span className="w-24 shrink-0 text-right tabular-nums">
                {euro(Math.abs(b.betrag))}
              </span>
            </div>
          ))}
      </div>
    </details>
  )
}

export default async function EuerPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { jahr: jahrParam } = await searchParams
  const geparst = Number(jahrParam)
  const jahr = Number.isInteger(geparst) && geparst >= 2020 && geparst <= 2100
    ? geparst
    : new Date().getFullYear()

  let daten
  try {
    daten = await ladeSteuerdaten(supabase, user.id, jahr)
  } catch (fehler) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Anlage EÜR {jahr}</h1>
        <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          {fehler instanceof Error ? fehler.message : 'Nicht berechenbar.'}
        </div>
      </div>
    )
  }

  const e = berechneEuer({ jahr, ...daten.euer })
  const leer = e.einnahmen.length === 0 && e.ausgaben.length === 0

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anlage EÜR {jahr}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Zeilennummern des Jahrgangs {e.zeilen_jahr} ·{' '}
            <Link href={`/finance/steuer?jahr=${jahr}`} className="underline">
              zur Steuerposition
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[jahr - 1, jahr, jahr + 1].map(j => (
            <Link
              key={j}
              href={`/finance/steuer/euer?jahr=${j}`}
              className={`rounded-md px-3 py-1.5 text-sm ${
                j === jahr
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border hover:bg-muted/50'
              }`}
            >
              {j}
            </Link>
          ))}
          <a
            href={`/api/export/euer?jahr=${jahr}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            <Download className="size-3.5" />
            Für das Steuerbüro
          </a>
        </div>
      </div>

      {/* Warnungen zuerst — was hier steht, ändert die Zahlen darunter. */}
      {e.warnungen.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          {e.warnungen.map(w => (
            <div key={w} className="flex gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {leer ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Für {jahr} fließt nichts in die EÜR. Das ist richtig, solange keine Kategorie eine
            steuerliche Rolle trägt —{' '}
            <Link href="/finance/categories" className="underline">
              hier zuordnen
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Betriebseinnahmen</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {e.einnahmen.map(z => <Zeile key={z.zeile} z={z} />)}
              {e.summe_einnahmen && (
                <div className="flex items-baseline gap-4 border-t border-border bg-muted/40 px-4 py-3">
                  <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {e.summe_einnahmen.zeile}
                  </span>
                  <span className="flex-1 text-sm font-medium">{e.summe_einnahmen.bezeichnung}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {euro(e.summe_einnahmen.betrag)}
                  </span>
                  <span className="w-16 shrink-0" />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Betriebsausgaben</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {e.ausgaben.map(z => <Zeile key={z.zeile} z={z} />)}
              {e.summe_ausgaben && (
                <div className="flex items-baseline gap-4 border-t border-border bg-muted/40 px-4 py-3">
                  <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {e.summe_ausgaben.zeile}
                  </span>
                  <span className="flex-1 text-sm font-medium">{e.summe_ausgaben.bezeichnung}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {euro(e.summe_ausgaben.betrag)}
                  </span>
                  <span className="w-16 shrink-0" />
                </div>
              )}
            </div>
          </section>

          {e.ergebnis && (
            <div className="flex items-baseline gap-4 rounded-lg border border-border bg-card px-4 py-4">
              <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                {e.ergebnis.zeile}
              </span>
              <span className="flex-1 font-medium">{e.ergebnis.bezeichnung}</span>
              <span className="shrink-0 text-xl font-semibold tabular-nums">
                {euro(e.ergebnis.betrag)}
              </span>
              <span className="w-16 shrink-0" />
            </div>
          )}
        </div>
      )}

      <div className="max-w-prose space-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">So benutzt du das:</strong> In Mein ELSTER die
          Anlage EÜR öffnen und die Beträge in die Zeilen übertragen, die hier links stehen.
          Aufklappen zeigt, aus welchen Buchungen eine Zeile besteht — das ist die Antwort auf
          jede Rückfrage vom Finanzamt.
        </p>
        <p>
          Die Zeilennummern gelten für den Jahrgang {e.zeilen_jahr} und verschieben sich von Jahr
          zu Jahr. Vor dem Abtippen kurz gegen das amtliche Formular prüfen.{' '}
          <strong className="text-foreground">Das hier ist keine Steuerberatung</strong> — die
          Verantwortung für das, was im Formular steht, bleibt bei dir.
        </p>
      </div>
    </div>
  )
}
