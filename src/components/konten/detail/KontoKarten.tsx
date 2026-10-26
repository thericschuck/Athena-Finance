import { fmtDate } from '@/lib/format'
import type { GegenparteiSumme, GrosseBuchung, KategorieSumme } from '@/lib/konten/detail'
import { formatBetrag } from './format'

/**
 * Karten-Reihe der Konto-Detailseite: Größte Ausgaben nach Kategorie, Häufigste Empfänger,
 * Größte Buchungen. Jede Karte nur mit Material (mind. 2 Einträge bzw. mind. eine Buchung);
 * Balken in Theme-Tokens, Kategorien in ihrer Farbe. Server-Komponente.
 */
function Karte({ kicker, rechts, children }: { kicker: string; rechts?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{kicker}</p>
        {rechts && <span className="shrink-0 text-[11px] text-muted-foreground">{rechts}</span>}
      </div>
      {children}
    </div>
  )
}

function Balkenzeile({ name, wert, anteil, farbe, extra }: {
  name: string
  wert: string
  anteil: number
  farbe: string
  extra?: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-3">
      <span className="truncate text-sm text-foreground">{name}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, anteil * 100)}%`, backgroundColor: farbe }} />
      </span>
      <span className="text-right text-sm tabular-nums text-danger">
        {wert}
        {extra && <span className="ml-1.5 text-[11px] text-muted-foreground">{extra}</span>}
      </span>
    </div>
  )
}

function GrosseListe({ titel, zeilen, vorzeichen, ton, currency, locale, dateFormat }: {
  titel: string
  zeilen: GrosseBuchung[]
  vorzeichen: '+' | '−'
  ton: 'text-danger' | 'text-success'
  currency: string
  locale: string
  dateFormat: string
}) {
  if (zeilen.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{titel}</p>
      <ul className="space-y-1.5">
        {zeilen.map(z => (
          <li key={z.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
            <span className="min-w-0">
              <span className="block truncate text-sm text-foreground">{z.titel}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{fmtDate(z.date, dateFormat)}</span>
            </span>
            <span className={`text-sm tabular-nums ${ton}`}>{vorzeichen}{formatBetrag(z.betrag, currency, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function KontoKarten({
  kategorien, kategorienMax, gegenparteien, groessteAusgaben, groessteEinnahmen,
  monatLabel, currency, locale, dateFormat,
}: {
  kategorien: KategorieSumme[]
  kategorienMax: number
  gegenparteien: GegenparteiSumme[]
  groessteAusgaben: GrosseBuchung[]
  groessteEinnahmen: GrosseBuchung[]
  monatLabel: string | null
  currency: string
  locale: string
  dateFormat: string
}) {
  const zeigeKategorien = kategorien.length >= 2
  const zeigeGegen = gegenparteien.length >= 2
  const zeigeGross = groessteAusgaben.length + groessteEinnahmen.length >= 2
  const rechts = monatLabel ?? 'ohne Umbuchungen'
  if (!zeigeKategorien && !zeigeGegen && !zeigeGross) return null

  const gegenMax = gegenparteien[0]?.total ?? 0

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {zeigeKategorien && (
        <Karte kicker="Größte Ausgaben nach Kategorie" rechts={rechts}>
          <div className="space-y-2.5">
            {kategorien.map(c => (
              <Balkenzeile
                key={c.name}
                name={c.name}
                wert={`−${formatBetrag(c.total, currency, locale)}`}
                anteil={kategorienMax ? c.total / kategorienMax : 0}
                farbe={c.color ?? 'var(--chart-expense)'}
              />
            ))}
          </div>
        </Karte>
      )}

      {zeigeGegen && (
        <Karte kicker="Häufigste Empfänger" rechts={rechts}>
          <div className="space-y-2.5">
            {gegenparteien.map(g => (
              <Balkenzeile
                key={g.name}
                name={g.name}
                wert={`−${formatBetrag(g.total, currency, locale)}`}
                extra={`${g.anzahl}×`}
                anteil={gegenMax ? g.total / gegenMax : 0}
                farbe="var(--chart-expense)"
              />
            ))}
          </div>
        </Karte>
      )}

      {zeigeGross && (
        <Karte kicker="Größte Buchungen" rechts={rechts}>
          <div className="space-y-4">
            <GrosseListe titel="Ausgaben" zeilen={groessteAusgaben} vorzeichen="−" ton="text-danger"
              currency={currency} locale={locale} dateFormat={dateFormat} />
            <GrosseListe titel="Einnahmen" zeilen={groessteEinnahmen} vorzeichen="+" ton="text-success"
              currency={currency} locale={locale} dateFormat={dateFormat} />
          </div>
        </Karte>
      )}
    </div>
  )
}
