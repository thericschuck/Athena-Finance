import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Landmark } from 'lucide-react'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import type { StandAnzeige } from '@/lib/konten/berechnen'
import { AbweichungAusgleichen } from '@/components/konten/AbweichungAusgleichen'
import { formatBetrag, formatIban, formatMitVorzeichen } from './format'
import { IbanKopieren } from './IbanKopieren'

/**
 * Dezente Zeile mit den Kontodaten: IBAN (mit Kopieren), Bankanbindung, Frische des Stands,
 * Warnmarke bei Abweichung zwischen Bank-Saldo und Buchungssumme und der Sprung in die Analyse.
 * Einzeilig, bricht mobil um. Server-Komponente; nur der Kopieren-Knopf ist Client.
 */
export function KontoDatenZeile({
  kontoId, name, iban, istBank, stand, bankSaldo, buchungssumme, abweichung, currency, locale, period,
}: {
  kontoId: string
  name: string
  iban: string | null
  istBank: boolean
  stand: StandAnzeige | null
  bankSaldo: number | null
  buchungssumme: number | null
  abweichung: number | null
  currency: string
  locale: string
  period: string
}) {
  const analyseHref = `/analyse?accounts=${encodeURIComponent(kontoId)}&period=${encodeURIComponent(period)}`

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
      {iban && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-[11px] tracking-tight text-foreground/80">{formatIban(iban)}</span>
          <IbanKopieren iban={iban} />
        </span>
      )}

      <span className="inline-flex items-center gap-1">
        <Landmark className="size-3.5" aria-hidden />
        {istBank ? 'Bankanbindung' : 'Manuell geführt'}
      </span>

      {stand && (
        <span className={stand.ton === 'alt' ? 'font-medium text-warning' : undefined}>{stand.text}</span>
      )}

      {abweichung !== null && bankSaldo !== null && buchungssumme !== null && (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <AnalyseKennzahlInfo
            className="inline-flex min-h-8 cursor-help items-center gap-1 rounded-full border border-warning/40 bg-warning/5 px-2 py-0.5 font-medium text-warning outline-none focus-visible:ring-2 focus-visible:ring-ring"
            titel="Abweichung zur Bank"
            zeilen={[
              ['Bank meldet', formatBetrag(bankSaldo, currency, locale)],
              ['Buchungen ergeben', formatBetrag(buchungssumme, currency, locale)],
              ['Abweichung', formatMitVorzeichen(abweichung, currency, locale)],
            ]}
            text={`Die Bank meldet ${formatBetrag(bankSaldo, currency, locale)}, alle Buchungen (inkl. Umbuchungen) summieren sich auf ${formatBetrag(buchungssumme, currency, locale)}. Es fehlt der Saldo vor der ersten Buchung — FinTS liefert nur ein Zeitfenster.`}
          >
            <AlertTriangle className="size-3.5" aria-hidden />
            Abweichung {formatMitVorzeichen(abweichung, currency, locale)}
          </AnalyseKennzahlInfo>
          <AbweichungAusgleichen kontoId={kontoId} name={name} abweichung={abweichung} waehrung={currency} locale={locale} />
        </span>
      )}

      <Link
        href={analyseHref}
        className="ml-auto inline-flex min-h-8 items-center gap-0.5 font-medium text-foreground/80 transition-colors hover:text-foreground"
      >
        In Analyse öffnen
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  )
}
