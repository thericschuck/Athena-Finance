import { AlertTriangle, CalendarClock, Info } from 'lucide-react'
import { getAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { ymd } from '@/lib/period'
import { ladePrognose } from '@/lib/forecast/laden'
import type { SteuerPrognose } from '@/lib/forecast/steuer'
import { baueChartDaten } from '@/lib/forecast/chartdaten'
import { PrognoseChart } from '@/components/finance/prognose-chart'
import { AnnahmenForm } from '@/components/finance/annahmen-form'

export const metadata = { title: 'Prognose' }

const KU_STATUS = {
  gruen: { text: 'Innerhalb der Grenzen', klasse: 'text-success' },
  gelb: { text: 'Nähert sich einer Grenze', klasse: 'text-warning' },
  rot: { text: 'Grenze überschritten', klasse: 'text-danger' },
  unbekannt: { text: 'Unbekannt (kein Vorjahr)', klasse: 'text-muted-foreground' },
} as const

function Karte({ titel, wert, unter, klasse = '' }: { titel: string; wert: string; unter?: string; klasse?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titel}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${klasse}`}>{wert}</p>
      {unter && <p className="mt-1 text-xs text-muted-foreground">{unter}</p>}
    </div>
  )
}

export default async function PrognosePage() {
  const { supabase, user } = await getAuthUser()
  if (!user) return null
  const settings = await getSettings(user.id)
  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'
  const eur = (n: number, digits = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: digits })

  const heute = ymd(new Date())
  const d = await ladePrognose(supabase, user.id, heute, { monate: 18 })
  const mitAnnahmen = d.annahmen.length > 0
  const sz = d.szenario

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
  const in12 = sz.monate[Math.min(11, sz.monate.length - 1)]
  const monatsLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const warnungen = [...d.hinweise, ...sz.warnungen]
  const m = sz.modell

  return (
    <div className="space-y-8 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Prognose</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          Wie entwickeln sich Liquidität, Vermögen und Steuer in den nächsten Monaten? Eine Fortschreibung deiner letzten
          Monate plus die Annahmen unten — keine Vorhersage und keine Steuerberatung.
        </p>
      </header>

      {warnungen.length > 0 && (
        <ul className="space-y-2" aria-label="Hinweise">
          {warnungen.map((w, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ── Kennzahlen ─────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Kennzahlen">
        <Karte titel="Liquidität heute" wert={eur(d.stand.liquiditaet)}
          unter={`${d.stand.liquideKonten} liquide${d.stand.liquideKonten === 1 ? 's Konto' : ' Konten'} (Giro, Spar, Bargeld)`} />
        <Karte titel="Tiefster Stand (erwartet)" wert={eur(sz.tiefpunkt.betrag)}
          unter={`am ${fmtDate(sz.tiefpunkt.datum, dateFormat)} · in 1 von 10 Verläufen bis ${eur(sz.risikoTiefpunkt.betrag)}`}
          klasse={sz.tiefpunkt.betrag < 0 ? 'text-danger' : ''} />
        <Karte titel={`Liquidität ${in12 ? monatsLabel(in12.month) : ''}`} wert={in12 ? eur(in12.liquiditaetEnde) : '–'}
          unter={`Vermögen dann ${in12 ? eur(in12.vermoegenEnde) : '–'}`} />
        <Karte titel="Überschuss pro Monat" wert={eur(d.basis.basis.saldo)}
          unter="Durchschnitt der nächsten 30 Tage laut Modell, ohne Termine und Annahmen"
          klasse={d.basis.basis.saldo < 0 ? 'text-danger' : 'text-success'} />
      </section>

      {/* ── Kurven ─────────────────────────────────────────────────────────────── */}
      <PrognoseChart daten={chart} mitAnnahmen={mitAnnahmen} />

      {/* ── Monatstabelle ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="monate">
        <h2 id="monate" className="mb-3 text-sm font-semibold">Monat für Monat</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
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
              {sz.monate.map(m => (
                <tr key={m.month} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2">{monatsLabel(m.month)}{m.teilmonat && <span className="ml-1 text-xs text-muted-foreground">(Rest)</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">{eur(m.einnahmen)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-danger">{eur(m.ausgaben)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${m.liquiditaetEnde < 0 ? 'text-danger' : ''}`}>{eur(m.liquiditaetEnde)}</td>
                  <td className={`hidden px-3 py-2 text-right tabular-nums sm:table-cell ${m.tiefpunkt < 0 ? 'text-danger' : 'text-muted-foreground'}`}>{eur(m.tiefpunkt)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground md:table-cell">{eur(m.vermoegenEnde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 rounded-lg border border-border bg-card p-4 text-sm" open>
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <Info className="size-4 shrink-0" /> Wie die Prognose entsteht
          </summary>
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              Gelernt aus <strong className="text-foreground">{m.daten.tage} Tagen</strong> ({fmtDate(m.daten.von, dateFormat)} bis{' '}
              {fmtDate(m.daten.bis, dateFormat)}): die gesamte Historie zählt.{' '}
              {m.halbwertszeit === null
                ? 'Alle Tage zählen gleich — im Rückblick-Test war das besser als ein kürzeres Gedächtnis.'
                : `Jüngere Tage zählen stärker (Halbwertszeit ${m.halbwertszeit} Tage) — das hat im Rückblick-Test am besten abgeschnitten.`}{' '}
              Das Modell wählt die Gewichtung selbst und prüft sie bei neuen Daten erneut.
            </p>
            {m.muster.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4">
                {m.muster.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
            {m.zyklen.length > 0 && (
              <p>
                Periodogramm (Fourier): auffällige Zyklen{' '}
                {m.zyklen.map(z => `${String(z.periode).replace('.', ',')} Tage (${String(z.staerke).replace('.', ',')}× über dem Rauschniveau)`).join(', ')}.
                Ein Jahreszyklus ist in deinen Daten nicht nachweisbar.
              </p>
            )}
            {m.backtest && (
              <p>
                Rückblick-Test über {m.backtest.ursprunge} Ausgangspunkte (jeweils 30 Tage voraus, nur mit damals bekannten Daten):
                mittlerer Fehler der Kurve <strong className="text-foreground">{eur(m.backtest.fehlerModell)}</strong> gegenüber{' '}
                {eur(m.backtest.fehlerFlach)} bei einem flachen Verlauf —{' '}
                {Math.abs(m.backtest.verbesserungPct) <= 2
                  ? 'etwa gleich gut'
                  : m.backtest.verbesserungPct > 0 ? `${m.backtest.verbesserungPct} % besser` : `${-m.backtest.verbesserungPct} % schlechter`}.{' '}
                Das ist kein Mangel des Modells, sondern deiner Daten: Gehalt, Verträge und Wochenenden liegen fest auf ihren Tagen,
                alles darüber bestimmen einzelne Großposten, deren Zeitpunkt sich nicht vorhersagen lässt. Genau dafür ist das Band da.
              </p>
            )}
            <p>
              Das Band zeigt, wo die Liquidität in 8 von 10 möglichen Verläufen liegt (aus den echten Abweichungen des Modells,
              nicht geschätzt). Ø pro Monat: Einnahmen ohne Lohn {eur(d.basis.basis.einnahmenOhneLohn)}, Lohn {eur(d.basis.basis.lohn)},
              Ausgaben {eur(d.basis.basis.ausgaben)} — inklusive Einzahlungen in Anlagen, denn das Geld ist vom Konto weg.
              Verträge liegen auf ihrem Tag; ihre bisherigen Buchungen sind aus dem Muster herausgerechnet, damit sie nicht doppelt zählen.
            </p>
          </div>
        </details>
      </section>

      {/* ── Bekannte Termine ───────────────────────────────────────────────────── */}
      {sz.termine.length > 0 && (
        <section aria-labelledby="termine">
          <h2 id="termine" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4" /> Bekannte Termine
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {sz.termine.slice(0, 8).map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-muted-foreground">{fmtDate(t.datum, dateFormat)}</span>
                <span className="flex-1 truncate">{t.name}</span>
                <span className={`tabular-nums ${t.betrag < 0 ? 'text-danger' : 'text-success'}`}>{eur(t.betrag)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Steuer ─────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="steuer" className="space-y-4">
        <div>
          <h2 id="steuer" className="text-sm font-semibold">Steuerprognose</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Hochgerechnet aus dem bisherigen Verlauf ({d.laufrateQuelle}), gerechnet mit derselben Engine wie die Steuerseite.
            Eine Schätzung, kein Steuerbescheid.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {d.steuer.map(s => <SteuerKarte key={s.jahr} s={s} eur={eur} mitAnnahmen={mitAnnahmen} />)}
        </div>
      </section>

      {/* ── Annahmen ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="annahmen" className="space-y-3">
        <div>
          <h2 id="annahmen" className="text-sm font-semibold">Annahmen</h2>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Was sich ändern wird und in der Vergangenheit noch nicht steht. Ein Gehalt <em>ersetzt</em> das bisherige ab dem
            Monat; alles andere kommt pro Monat obendrauf. Die fein gestrichelte graue Linie oben zeigt die Prognose ohne diese Annahmen.
          </p>
        </div>
        <AnnahmenForm initial={d.annahmen} ersterMonat={heute.slice(0, 7)} />
      </section>
    </div>
  )
}

function SteuerKarte({ s, eur, mitAnnahmen }: { s: SteuerPrognose; eur: (n: number, d?: number) => string; mitAnnahmen: boolean }) {
  const p = s.szenario.position
  const h = s.szenario.hochrechnung
  const ku = KU_STATUS[p.kleinunternehmer.status]
  const zeile = (label: string, wert: string, klasse = '') => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${klasse}`}>{wert}</dd>
    </div>
  )
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-base font-semibold">{s.jahr}</h3>
      <dl className="mt-2 divide-y divide-border/60 text-sm">
        {zeile('Gewinn aus dem Gewerbe', eur(h.gewinn), h.gewinn < 0 ? 'text-danger' : '')}
        {zeile('Betriebseinnahmen / -ausgaben', `${eur(h.betriebseinnahmen)} / ${eur(h.betriebsausgaben)}`)}
        {zeile('Lohn (netto)' + (h.lohnBrutto !== null ? ' · brutto' : ''), h.lohnBrutto !== null ? `${eur(h.lohnNetto)} · ${eur(h.lohnBrutto)}` : eur(h.lohnNetto))}
        {zeile('Zu versteuerndes Einkommen', eur(p.zve.betrag))}
        {zeile('Einkommensteuer gesamt', eur(p.steuer.gesamt), 'font-medium')}
        {zeile('Grenzsteuersatz auf den nächsten Euro', `${p.grenzsteuersatz.naechster_euro_pct} %`)}
        {mitAnnahmen && zeile('Mehrsteuer durch deine Annahmen', (s.mehrsteuer >= 0 ? '+' : '') + eur(s.mehrsteuer), s.mehrsteuer > 0 ? 'text-danger' : 'text-success')}
        {zeile('Steuer, die der Gewinn kostet', eur(p.gewinn_kostet.steuer))}
        {zeile('Rücklage: Soll / Ist', `${eur(s.ruecklage.soll)} / ${s.ruecklage.ist === null ? 'kein Ziel' : eur(s.ruecklage.ist)}`)}
        {s.ruecklage.proMonat !== null && s.ruecklage.luecke! > 0 &&
          zeile(`Zurücklegen pro Monat (${s.ruecklage.monateBisJahresende} Monate)`, eur(s.ruecklage.proMonat), 'font-medium')}
        {zeile('Kleinunternehmer-Umsatz', `${eur(p.kleinunternehmer.umsatz_laufend)} von ${eur(p.kleinunternehmer.grenze_laufend)}`, ku.klasse)}
      </dl>
      <p className={`mt-2 text-xs ${ku.klasse}`}>Kleinunternehmer-Status: {ku.text}</p>
      {[...p.warnungen, ...s.hinweise].length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {[...p.warnungen, ...s.hinweise].slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </article>
  )
}
