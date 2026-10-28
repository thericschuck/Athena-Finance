import Link from 'next/link'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { heuteBerlin } from '@/lib/transaktionen/formular'
import { ladePrognose } from '@/lib/forecast/laden'
import { baueChartDaten } from '@/lib/forecast/chartdaten'
import { gruppiereAnnahmen, prognoseKennzahlen } from '@/lib/prognose-seite/berechnen'
import { PrognoseChart } from '@/components/finance/prognose-chart'
import { PrognoseKennzahlenLeiste } from '@/components/prognose/PrognoseKennzahlenLeiste'
import { PrognoseMethode } from '@/components/prognose/PrognoseMethode'
import { PrognoseTabs } from '@/components/prognose/PrognoseTabs'
import { AnnahmenListe } from '@/components/prognose/AnnahmenListe'
import { EinmalpostenListe } from '@/components/prognose/EinmalpostenListe'
import { PrognoseSteuer } from '@/components/prognose/PrognoseSteuer'

export const metadata = { title: 'Prognose' }
// Das Datum (heute, Berlin) und die Daten des Nutzers bestimmen die Seite; nichts davon darf gecacht werden.
export const dynamic = 'force-dynamic'

const HORIZONTE = [6, 12, 18, 24] as const
const STANDARD_HORIZONT = 12

export default async function PrognosePage({
  searchParams,
}: {
  searchParams: Promise<{ monate?: string }>
}) {
  const [{ monate: rohMonate }, { supabase, user }] = await Promise.all([searchParams, getAuthUser()])
  if (!user) return null
  const gewaehlt = Number(rohMonate)
  const monate = HORIZONTE.find(h => h === gewaehlt) ?? STANDARD_HORIZONT

  // Scope und Einstellungen sind unabhaengig: eine Rundreise-Stufe statt zwei (Layout teilt dieselben Ergebnisse per cache()).
  const [settings, scopeCtx] = await Promise.all([getSettings(user.id), resolveScope(supabase, user)])
  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'
  const eur = (n: number, digits = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: digits })
  // YYYY-MM-DD mit lokalem Mittag, damit keine Zeitzone den Tag verschiebt.
  const datumText = (iso: string) => fmtDate(`${iso.slice(0, 10)}T12:00:00`, dateFormat)
  const monatsLabel = (m: string) =>
    new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })

  // Berliner Kalendertag (nicht UTC): der Server läuft in UTC, nachts wäre „heute“ sonst gestern.
  const heute = heuteBerlin()
  // Ohne Konto gibt es nichts fortzuschreiben: gar nicht erst rechnen, sondern erklaeren.
  if (scopeCtx.accountIds.length === 0) {
    return <PrognoseLeer ctx={scopeCtx} grund="konto" />
  }
  const d = await ladePrognose(supabase, scopeCtx, heute, { monate })
  // Ansicht (Partner/Gemeinsam) mit weniger als 3 Monaten Historie: keine Scheinprognose.
  if (d.zuWenigHistorie) {
    return <PrognoseLeer ctx={scopeCtx} grund="historie" />
  }
  // Konto da, aber keine Buchung, aus der das Modell lernen koennte.
  if (d.szenario.modell.daten.tage === 0) {
    return <PrognoseLeer ctx={scopeCtx} grund="buchungen" />
  }
  const sz = d.szenario
  const mitAnnahmen = d.annahmen.length > 0
  const startMonat = heute.slice(0, 7)
  const endMonat = sz.monate.length > 0 ? sz.monate[sz.monate.length - 1].month : startMonat

  // Rückblick (Tageswerte aus den Snapshots) durchgezogen, ab heute die Prognose gestrichelt mit Schwankungsbereich.
  const chart = baueChartDaten({
    heute,
    verlauf: d.verlauf,
    start: sz.start,
    szenario: sz.tage,
    basis: d.basis.tage,
    tiefpunkt: sz.tiefpunkt,
    mitAnnahmen,
  })
  const kennzahlen = prognoseKennzahlen({
    heute, start: sz.start, tage: sz.tage, tiefpunkt: sz.tiefpunkt, risikoTiefpunkt: sz.risikoTiefpunkt,
  })
  const warnungen = [...d.hinweise, ...sz.warnungen]
  const m = sz.modell
  const gruppen = gruppiereAnnahmen(d.annahmen, startMonat, endMonat)

  const monateTabelle = (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Monat</th>
            <th className="px-3 py-2 text-right font-medium">Einnahmen</th>
            <th className="px-3 py-2 text-right font-medium">Ausgaben</th>
            <th className="px-3 py-2 text-right font-medium">Liquidität Ende</th>
            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Tiefster Stand</th>
            <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Vermögen Ende</th>
          </tr>
        </thead>
        <tbody>
          {sz.monate.map(z => (
            <tr key={z.month} className="border-b border-border/50 last:border-0">
              <td className="whitespace-nowrap px-3 py-2">
                {monatsLabel(z.month)}{z.teilmonat && <span className="ml-1 text-xs text-muted-foreground">(Rest)</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-success">{eur(z.einnahmen)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-danger">{eur(z.ausgaben)}</td>
              <td className={`px-3 py-2 text-right font-medium tabular-nums ${z.liquiditaetEnde < 0 ? 'text-danger' : ''}`}>{eur(z.liquiditaetEnde)}</td>
              <td className={`hidden px-3 py-2 text-right tabular-nums sm:table-cell ${z.tiefpunkt < 0 ? 'text-danger' : 'text-muted-foreground'}`}>{eur(z.tiefpunkt)}</td>
              <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground md:table-cell">{eur(z.vermoegenEnde)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const termine = sz.termine.length > 0 ? (
    <ul className="divide-y divide-border rounded-lg border border-border text-sm">
      {sz.termine.slice(0, 12).map((t, i) => (
        <li key={i} className="flex min-w-0 items-center gap-3 px-3 py-2">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{datumText(t.datum)}</span>
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          <span className={`shrink-0 tabular-nums ${t.betrag < 0 ? 'text-danger' : 'text-success'}`}>{t.betrag < 0 ? '−' : '+'}{eur(Math.abs(t.betrag))}</span>
        </li>
      ))}
    </ul>
  ) : (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium">Keine bekannten Termine</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Hier stehen die nächsten Abbuchungen und Eingänge aus deinen aktiven Verträgen. Aktive Verträge legst du unter Verträge an.
      </p>
    </div>
  )

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Prognose</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Zeitraum" className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
            {HORIZONTE.map(h => (
              <Link
                key={h} href={h === STANDARD_HORIZONT ? '?' : `?monate=${h}`} scroll={false}
                aria-current={h === monate ? 'true' : undefined}
                className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors sm:min-h-8 sm:text-xs ${
                  h === monate ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {h} Mon.
              </Link>
            ))}
          </div>
          <PrognoseMethode>
            <p>
              Eine Fortschreibung deiner letzten Monate plus die Annahmen, keine Vorhersage und keine Steuerberatung. Gelernt aus{' '}
              <strong className="text-foreground">{m.daten.tage} Tagen</strong> ({datumText(m.daten.von)} bis {datumText(m.daten.bis)}).{' '}
              {m.halbwertszeit === null
                ? 'Alle Tage zählen gleich; im Rückblick-Test war das besser als ein kürzeres Gedächtnis.'
                : `Jüngere Tage zählen stärker (Halbwertszeit ${m.halbwertszeit} Tage); das hat im Rückblick-Test am besten abgeschnitten.`}{' '}
              Das Modell wählt die Gewichtung selbst und prüft sie bei neuen Daten erneut.
            </p>
            {m.muster.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4">{m.muster.map((t, i) => <li key={i}>{t}</li>)}</ul>
            )}
            {m.zyklen.length > 0 && (
              <p>
                Auffällige Zyklen (Periodogramm):{' '}
                {m.zyklen.map(z => `${String(z.periode).replace('.', ',')} Tage (${String(z.staerke).replace('.', ',')}× über dem Rauschniveau)`).join(', ')}.
                Ein Jahreszyklus ist in deinen Daten nicht nachweisbar.
              </p>
            )}
            {m.backtest && (
              <p>
                Rückblick-Test über {m.backtest.ursprunge} Ausgangspunkte (je 30 Tage voraus, nur mit damals bekannten Daten): mittlerer
                Fehler der Kurve <strong className="text-foreground">{eur(m.backtest.fehlerModell)}</strong> gegenüber {eur(m.backtest.fehlerFlach)}{' '}
                bei einem flachen Verlauf, {Math.abs(m.backtest.verbesserungPct) <= 2
                  ? 'also etwa gleich gut'
                  : m.backtest.verbesserungPct > 0 ? `${m.backtest.verbesserungPct} % besser` : `${-m.backtest.verbesserungPct} % schlechter`}.{' '}
                Gehalt, Verträge und Wochenenden liegen fest auf ihren Tagen; alles darüber bestimmen einzelne Großposten, deren Zeitpunkt
                sich nicht vorhersagen lässt. Dafür ist das Band da.
              </p>
            )}
            <p>
              Das Band zeigt, wo die Liquidität in 8 von 10 möglichen Verläufen liegt (aus den echten Abweichungen des Modells). Ø pro
              Monat in den nächsten 30 Tagen: Einnahmen ohne Lohn {eur(d.basis.basis.einnahmenOhneLohn)}, Lohn {eur(d.basis.basis.lohn)},
              Ausgaben {eur(d.basis.basis.ausgaben)}, inklusive Einzahlungen in Anlagen, denn das Geld ist vom Konto weg. Verträge liegen auf
              ihrem Tag; ihre bisherigen Buchungen sind aus dem Muster herausgerechnet, damit sie nicht doppelt zählen.
            </p>
          </PrognoseMethode>
        </div>
      </div>

      {warnungen.length > 0 && (
        <ul className="space-y-1.5" aria-label="Hinweise">
          {warnungen.map((w, i) => (
            <li key={i} className="flex min-w-0 items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs sm:text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span className="min-w-0">{w}</span>
            </li>
          ))}
        </ul>
      )}

      <PrognoseKennzahlenLeiste
        k={kennzahlen} locale={locale} datumText={datumText} monate={monate}
        risikoBetrag={sz.risikoTiefpunkt.betrag} risikoDatum={sz.risikoTiefpunkt.datum}
      />

      <PrognoseChart daten={chart} mitAnnahmen={mitAnnahmen} />

      <PrognoseTabs
        tabs={[
          {
            key: 'annahmen', label: 'Annahmen', anzahl: d.annahmen.length,
            inhalt: <AnnahmenListe gruppen={gruppen} ersterMonat={startMonat} />,
          },
          { key: 'monate', label: 'Monate', inhalt: monateTabelle },
          { key: 'termine', label: 'Termine', anzahl: sz.termine.length, inhalt: termine },
          {
            key: 'steuer', label: 'Steuer',
            inhalt: <PrognoseSteuer steuer={d.steuer} eur={eur} mitAnnahmen={mitAnnahmen} laufrateQuelle={d.laufrateQuelle} />,
          },
          {
            key: 'posten', label: 'Einmalposten', anzahl: d.einmalposten.length,
            inhalt: (
              <div className="space-y-2">
                {d.ausgeschlossen > 0 && (
                  <p className="text-xs text-muted-foreground">{d.ausgeschlossen} Buchung{d.ausgeschlossen === 1 ? '' : 'en'} vom Lernen ausgenommen.</p>
                )}
                <EinmalpostenListe kandidaten={d.einmalposten} />
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

function PrognoseLeer({ ctx, grund }: { ctx: Parameters<typeof ScopeHinweisFuer>[0]['ctx']; grund: 'konto' | 'buchungen' | 'historie' }) {
  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Prognose</h1>
      <ScopeHinweisFuer ctx={ctx} thema="Konten und Buchungen" />
      <LeerZustand
        icon={TrendingUp}
        titel={grund === 'konto' ? 'Noch keine Konten für eine Prognose' : grund === 'historie' ? 'Noch zu wenig Historie für diese Ansicht' : 'Noch keine Buchungen zum Lernen'}
        text={grund === 'historie'
          ? 'Für diese Ansicht gibt es erst weniger als 3 Monate Buchungen auf allen Konten. Die Prognose lernt ab dem Tag, an dem alle Konten der Ansicht Buchungen haben, und startet, sobald genug Verlauf da ist. In der Ansicht Ich ist sie bereits verfügbar.'
          : grund === 'konto'
          ? 'Die Prognose schreibt deine letzten Monate fort und zeigt, wie sich Liquidität und Vermögen entwickeln. Dafür braucht sie mindestens ein Konto mit Buchungen.'
          : 'Die Prognose lernt aus deinen Buchungen. Sobald ein paar Wochen davon da sind, zeigt sie dir Liquidität und Vermögen der nächsten Monate, samt Verträgen und Terminen.'}
        aktion={grund === 'konto'
          ? { label: 'Konto anlegen', href: '/finance/accounts' }
          : { label: 'Buchungen hinzufügen', href: '/finance/transactions' }}
        sekundaer={{ label: 'Bank verbinden', href: '/settings' }}
      />
    </div>
  )
}
