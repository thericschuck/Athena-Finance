import Link from 'next/link'
import { formatUsd } from '@/lib/assistant/cost'
import { formatTokensKompakt, type KostenAuswertung } from '@/lib/assistant/kosten'
import { chipKlasse } from '@/components/assistant/verwaltung/chip'
import { cn } from '@/lib/utils'
import { KostenChartLazy } from './KostenChartLazy'

/**
 * Ansicht „Kosten" der Logs: Kennzahlenleiste, Zeitraum-Chips, Chart, Tabelle nach Modell.
 * Server-Komponente ohne Zustand; nur das Chart ist ein Client-Baustein (lazy).
 * Alle Beträge sind Schätzungen (Listenpreise, siehe cost.ts).
 */

const ZEITRAEUME = [30, 90] as const

export function KostenAnsicht({ auswertung, tage }: { auswertung: KostenAuswertung; tage: 30 | 90 }) {
  const { summe, modelle } = auswertung
  const leer = summe.tokens === 0 && summe.antworten === 0 && summe.autoLaeufe === 0
  const zellen = [
    { titel: `Kosten ≈ (${tage} T)`, wert: formatUsd(summe.kosten) },
    { titel: 'Tokens gesamt', wert: formatTokensKompakt(summe.tokens) },
    {
      titel: 'Ø pro Antwort',
      wert: auswertung.kostenProAntwort !== null ? formatUsd(auswertung.kostenProAntwort) : '—',
    },
    {
      titel: 'Cache-Quote',
      wert: auswertung.cacheQuote !== null ? `${Math.round(auswertung.cacheQuote * 100)} %` : '—',
    },
  ]
  const preisModelle = modelle.filter((m) => m.kosten !== null && m.kosten > 0).map((m) => m.model)

  return (
    <>
      <section
        aria-label={`Kennzahlen der letzten ${tage} Tage`}
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4"
      >
        {zellen.map((z, i) => (
          <div
            key={z.titel}
            className={cn(
              'flex min-w-0 flex-col justify-center px-4 py-2.5',
              i % 2 === 1 && 'border-l border-border',
              i >= 2 && 'border-t border-border',
              'sm:border-t-0',
              i > 0 && 'sm:border-l sm:border-border',
            )}
          >
            <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {z.titel}
            </span>
            <span className="mt-0.5 text-base font-semibold tabular-nums tracking-tight">{z.wert}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {ZEITRAEUME.map((t) => (
          <Link
            key={t}
            href={t === 30 ? '/assistant/logs?ansicht=kosten' : `/assistant/logs?ansicht=kosten&tage=${t}`}
            aria-current={tage === t ? 'true' : undefined}
            className={chipKlasse(tage === t)}
          >
            {t} T
          </Link>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">Schätzung nach Listenpreisen</span>
      </div>

      {leer ? (
        <p className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Keine Nutzungsdaten in den letzten {tage} Tagen.
        </p>
      ) : (
        <>
          <KostenChartLazy tage={auswertung.tage} modelle={preisModelle} mitAuto={summe.autoLaeufe > 0} />

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Nach Modell</th>
                    <th className="px-2 py-2 text-right font-medium">Läufe</th>
                    <th className="px-2 py-2 text-right font-medium">Tokens</th>
                    <th className="px-4 py-2 text-right font-medium">≈ USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {modelle.map((m) => (
                    <tr key={m.model}>
                      <td className="max-w-0 truncate px-4 py-2">{m.model}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{m.laeufe}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatTokensKompakt(m.tokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {m.kosten !== null ? formatUsd(m.kosten) : <span className="text-muted-foreground">ohne Preis</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {summe.ohnePreis > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {summe.ohnePreis} Lauf/Läufe mit Modell ohne hinterlegten Preis: Tokens gezählt, Kosten nicht enthalten.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Chat-Antworten stammen aus dem Gesprächsverlauf. „Automatisch“ (Wochenlauf, KI-Kategorisierung) kommt aus den
            Logs und fehlt für Tage, deren Logs über „Älter als 7 Tage löschen“ entfernt wurden.
            Läufe in der Tabelle: Chat-Antworten plus automatische Läufe. Neu generierte (ersetzte) und abgebrochene
            Antworten sowie die Textauszüge aus Projektdateien sind nicht enthalten — die Summe ist eine Untergrenze.
          </p>
        </>
      )}
    </>
  )
}
