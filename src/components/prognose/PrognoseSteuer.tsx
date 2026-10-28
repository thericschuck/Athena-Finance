import type { SteuerPrognose } from '@/lib/forecast/steuer'
import { STEUER_HINWEIS } from '@/lib/forecast/scope-regeln'

/**
 * Steuerprognose je Jahr (Server-Komponente): aus dem bisherigen Verlauf hochgerechnet, mit derselben
 * Engine wie die Steuerseite. Kompakt: kleine Zeilen, keine großen Zahlen. Lange Werte brechen um
 * (`min-w-0`), damit auf 360 px nichts übersteht.
 */

const KU_STATUS = {
  gruen: { text: 'Innerhalb der Grenzen', klasse: 'text-success' },
  gelb: { text: 'Nähert sich einer Grenze', klasse: 'text-warning' },
  rot: { text: 'Grenze überschritten', klasse: 'text-danger' },
  unbekannt: { text: 'Unbekannt (kein Vorjahr)', klasse: 'text-muted-foreground' },
} as const

type Euro = (n: number, digits?: number) => string

function Zeile({ label, wert, klasse = '' }: { label: string; wert: string; klasse?: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 py-1.5">
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className={`shrink-0 text-right tabular-nums ${klasse}`}>{wert}</dd>
    </div>
  )
}

function SteuerKarte({ s, eur, mitAnnahmen }: { s: SteuerPrognose; eur: Euro; mitAnnahmen: boolean }) {
  const p = s.szenario.position
  const h = s.szenario.hochrechnung
  const ku = KU_STATUS[p.kleinunternehmer.status]
  const hinweise = [...p.warnungen, ...s.hinweise].slice(0, 5)
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <h3 className="text-sm font-semibold">{s.jahr}</h3>
      <dl className="mt-1 divide-y divide-border/60 text-sm">
        <Zeile label="Gewinn aus dem Gewerbe" wert={eur(h.gewinn)} klasse={h.gewinn < 0 ? 'text-danger' : ''} />
        <Zeile label="Betriebseinnahmen / -ausgaben" wert={`${eur(h.betriebseinnahmen)} / ${eur(h.betriebsausgaben)}`} />
        <Zeile
          label={'Lohn (netto)' + (h.lohnBrutto !== null ? ' · brutto' : '')}
          wert={h.lohnBrutto !== null ? `${eur(h.lohnNetto)} · ${eur(h.lohnBrutto)}` : eur(h.lohnNetto)}
        />
        <Zeile label="Zu versteuerndes Einkommen" wert={eur(p.zve.betrag)} />
        <Zeile label="Einkommensteuer gesamt" wert={eur(p.steuer.gesamt)} klasse="font-medium" />
        <Zeile label="Grenzsteuersatz (nächster Euro)" wert={`${p.grenzsteuersatz.naechster_euro_pct} %`} />
        {mitAnnahmen && (
          <Zeile
            label="Mehrsteuer durch Annahmen"
            wert={(s.mehrsteuer >= 0 ? '+' : '−') + eur(Math.abs(s.mehrsteuer))}
            klasse={s.mehrsteuer > 0 ? 'text-danger' : 'text-success'}
          />
        )}
        <Zeile label="Steuer, die der Gewinn kostet" wert={eur(p.gewinn_kostet.steuer)} />
        <Zeile label="Rücklage: Soll / Ist" wert={`${eur(s.ruecklage.soll)} / ${s.ruecklage.ist === null ? 'kein Ziel' : eur(s.ruecklage.ist)}`} />
        {s.ruecklage.proMonat !== null && s.ruecklage.luecke! > 0 && (
          <Zeile label={`Zurücklegen pro Monat (${s.ruecklage.monateBisJahresende} Mon.)`} wert={eur(s.ruecklage.proMonat)} klasse="font-medium" />
        )}
        <Zeile label="Kleinunternehmer-Umsatz" wert={`${eur(p.kleinunternehmer.umsatz_laufend)} von ${eur(p.kleinunternehmer.grenze_laufend)}`} klasse={ku.klasse} />
      </dl>
      <p className={`mt-2 text-xs ${ku.klasse}`}>Kleinunternehmer-Status: {ku.text}</p>
      {hinweise.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {hinweise.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </article>
  )
}

export function PrognoseSteuer({
  steuer, eur, mitAnnahmen, laufrateQuelle,
}: {
  steuer: SteuerPrognose[]
  eur: Euro
  mitAnnahmen: boolean
  laufrateQuelle: string
}) {
  // Steuer ist persönlich: in Ansichten ohne Steuerdaten (Partner/Gemeinsam) steht nur der Hinweis.
  if (steuer.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm font-medium">Keine Steuerprognose in dieser Ansicht</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{STEUER_HINWEIS}</p>
      </div>
    )
  }
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-xs text-muted-foreground">
        Hochgerechnet aus dem bisherigen Verlauf ({laufrateQuelle}), gerechnet mit derselben Engine wie die Steuerseite. Eine
        Schätzung, kein Steuerbescheid.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {steuer.map(s => <SteuerKarte key={s.jahr} s={s} eur={eur} mitAnnahmen={mitAnnahmen} />)}
      </div>
    </div>
  )
}
