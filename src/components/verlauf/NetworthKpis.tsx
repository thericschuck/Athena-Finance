import type { DeltaZumStichtag, Kennzahlen } from '@/lib/verlauf/networth'
import { fmtEur, fmtNum, fmtDate } from './shared'

/**
 * Änderung als „+1.234 € (+2,3 %)“, grün bei Plus, rot bei Minus, grau bei 0 oder fehlend.
 * Net Worth ist hier immer „mehr ist besser“, deshalb gilt dieselbe Farblogik für alle Δ.
 */
export function Delta({ delta, prozent, locale, nurBetrag }: {
  delta: number | null
  prozent: number | null
  locale: string
  nurBetrag?: boolean
}) {
  if (delta == null) return <span className="text-muted-foreground">—</span>
  const rund = Math.round(delta)
  const farbe = rund > 0 ? 'text-success' : rund < 0 ? 'text-danger' : 'text-muted-foreground'
  const vz = rund > 0 ? '+' : ''
  return (
    <span className={`tabular-nums ${farbe}`}>
      {vz}{fmtEur(delta, locale)}
      {!nurBetrag && prozent != null && (
        <span className="ml-1 text-xs opacity-80">({vz}{fmtNum(prozent, 1, locale)} %)</span>
      )}
    </span>
  )
}

function Kachel({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-tight tabular-nums">{children}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function DeltaKachel({ label, d, locale }: { label: string; d: DeltaZumStichtag | null; locale: string }) {
  return (
    <Kachel label={label}>
      <Delta delta={d?.betrag ?? null} prozent={d?.prozent ?? null} locale={locale} />
    </Kachel>
  )
}

/** Kachelleiste über dem Net-Worth-Verlauf: Stand heute, Δ-Zeiträume, Allzeithoch, Schulden. */
export function NetworthKpis({ kz, locale, dateFormat }: { kz: Kennzahlen; locale: string; dateFormat: string }) {
  if (!kz.aktuell) return null
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      <Kachel label="Net Worth" sub={`Stand ${fmtDate(kz.aktuell.datum, dateFormat)}`}>
        {fmtEur(kz.aktuell.net_worth, locale)}
      </Kachel>
      <DeltaKachel label="Δ 1 Monat" d={kz.monat1} locale={locale} />
      <DeltaKachel label="Δ 3 Monate" d={kz.monate3} locale={locale} />
      <DeltaKachel label="Δ 12 Monate" d={kz.monate12} locale={locale} />
      <DeltaKachel label="Δ seit Jahresanfang" d={kz.ytd} locale={locale} />
      <Kachel label="Allzeithoch" sub={kz.hoch ? fmtDate(kz.hoch.datum, dateFormat) : undefined}>
        {fmtEur(kz.hoch?.wert, locale)}
      </Kachel>
      <Kachel label="Abstand zum Hoch">
        {kz.abstandHoch && Math.round(kz.abstandHoch.betrag) === 0
          ? <span className="text-success">Am Hoch</span>
          : <Delta delta={kz.abstandHoch?.betrag ?? null} prozent={kz.abstandHoch?.prozent ?? null} locale={locale} />}
      </Kachel>
      <Kachel label="Schulden">
        <span className={kz.schulden ? 'text-danger' : ''}>{fmtEur(kz.schulden, locale)}</span>
      </Kachel>
    </div>
  )
}
