import Link from 'next/link'
import { fmtCurrency } from '@/lib/format'
import { kontotypLabel } from '@/lib/dashboard/anlagen'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { DASH_KARTE, DashKartenReihe } from './DashKontoReihe'

/**
 * Konten als EINE kompakte Reihe (Muster der Bank-Kontokarten, aber ohne Sparkline: der Kern
 * enthaelt kein Verlaufsmaterial). Konten ohne jede Buchung zeigen "—" statt 0 EUR, damit ein
 * frisch angelegtes Konto nicht wie ein leeres aussieht. Negativer Saldo ist rot.
 * Die Salden kommen unveraendert aus dem Kern.
 */
export function DashKonten({ kern }: DashAbschnittProps) {
  if (kern.konten.length === 0) return null

  return (
    <DashKartenReihe
      titel="Konten"
      zaehler={`(${kern.konten.length} aktiv)`}
      linkHref="/finance/accounts"
      linkText="Alle"
    >
      {kern.konten.map(k => {
        const imMinus = k.hatBuchungen && k.saldo < 0
        return (
          <Link key={k.id} href={`/finance/accounts/${k.id}`} className={DASH_KARTE}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
                  style={k.color ? { backgroundColor: k.color } : undefined}
                />
                <span className="truncate text-[11px] font-medium text-muted-foreground">{k.name}</span>
              </span>
              <span className={`block truncate font-mono text-base font-semibold tabular-nums ${imMinus ? 'text-danger' : ''}`}>
                {k.hatBuchungen ? fmtCurrency(k.saldo, k.currency, kern.locale, { fractionDigits: 2 }) : '—'}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">{kontotypLabel(k.type)}</span>
            </span>
          </Link>
        )
      })}
    </DashKartenReihe>
  )
}
