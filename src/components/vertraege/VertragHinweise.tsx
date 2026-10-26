import { AlertTriangle, Check, Clock, RefreshCw } from 'lucide-react'
import { HoverInfo } from '@/components/ui/hover-info'
import { datumText, relativTage, type Kuendigung } from '@/lib/vertraege/rechnen'
import type { Abgleich } from '@/lib/forecast/vertrag-abgleich'

/**
 * Die zwei Hinweise einer Vertragszeile, ruhig gehalten: Warnfarbe nur, wenn etwas zu tun ist.
 * Abgleich mit den Bankbuchungen (Logik in lib/forecast/vertrag-abgleich.ts, hier nur Anzeige)
 * und Kündigungsfrist. Erklärungen als Hover-Karte statt Browser-Tooltip.
 */

const ZEILE = 'flex min-w-0 max-w-full items-center gap-1 text-xs'

export function AbgleichHinweis({ abgleich, dateFormat }: { abgleich: Abgleich; dateFormat: string }) {
  const termin = datumText(abgleich.termin, dateFormat)
  if (abgleich.status === 'eingegangen') {
    return (
      <HoverInfo
        bare className={`${ZEILE} text-muted-foreground`} popClassName="left-0"
        titel="Abbuchung eingegangen"
        zeilen={[['Termin', termin], ['Gebucht am', datumText(abgleich.buchungDatum, dateFormat)]]}
        text="Zum letzten Termin gibt es eine passende Ausgabe auf dem Vertragskonto (Betrag innerhalb von 5 %, Datum von 3 Tagen davor bis 7 Tage danach)."
      >
        <Check className="size-3 shrink-0 text-success" aria-hidden />
        <span className="truncate">Abgebucht am {datumText(abgleich.buchungDatum ?? abgleich.termin, dateFormat)}</span>
      </HoverInfo>
    )
  }
  const offen = abgleich.status === 'offen'
  return (
    <HoverInfo
      bare className={`${ZEILE} ${offen ? 'font-medium text-warning' : 'text-muted-foreground'}`} popClassName="left-0"
      titel={offen ? 'Abbuchung nicht eingegangen' : 'Abbuchung noch nicht gebucht'}
      zeilen={[['Termin', termin]]}
      text={offen
        ? 'Zum letzten Termin ist keine passende Ausgabe auf dem Vertragskonto eingegangen, obwohl die Bank-Karenzzeit von 7 Tagen vorbei ist. Bank-Sync prüfen oder der Betrag hat sich geändert. Bei Zahlung über Karte oder PayPal landet die Buchung oft auf einem anderen Konto.'
        : 'Der Termin ist erst vor Kurzem: Die Bank bucht oft einige Tage später. Erst nach 7 Tagen gilt die Abbuchung als nicht eingegangen.'}
    >
      {offen ? <AlertTriangle className="size-3 shrink-0" aria-hidden /> : <Clock className="size-3 shrink-0" aria-hidden />}
      <span className="truncate">
        {offen ? `Abbuchung vom ${termin} nicht eingegangen` : `Abbuchung vom ${termin} noch nicht gebucht`}
      </span>
    </HoverInfo>
  )
}

export function KuendigungHinweis({
  k, endDate, dateFormat, autoRenews,
}: { k: Kuendigung; endDate: string | null; dateFormat: string; autoRenews: boolean }) {
  if (k.status === 'keine') {
    return autoRenews ? (
      <span className={`${ZEILE} text-muted-foreground`}>
        <RefreshCw className="size-3 shrink-0" aria-hidden />
        <span className="truncate">Verlängert sich automatisch</span>
      </span>
    ) : null
  }
  const frist = datumText(k.frist, dateFormat)
  const ende = datumText(endDate, dateFormat)
  const warn = k.status === 'bald' || k.status === 'verstrichen' || k.status === 'beendet'
  const text =
    k.status === 'bald' || k.status === 'spaeter' ? `Kündigen bis ${frist}${k.tage !== null && k.status === 'bald' ? ` (${relativTage(k.tage)})` : ''}`
      : k.status === 'verstrichen' ? `Kündigungsfrist seit ${frist} verstrichen`
        : k.status === 'endet' ? `Endet am ${ende}`
          : `Laufzeit seit ${ende} beendet`
  const erklaerung =
    k.status === 'verstrichen' ? 'Die Frist ist vorbei, der Vertrag verlängert sich um einen weiteren Zeitraum. Nur relevant, wenn du kündigen willst.'
      : k.status === 'beendet' ? 'Das Enddatum liegt in der Vergangenheit und der Vertrag verlängert sich nicht. Er läuft aus — zum Aufräumen kannst du ihn löschen.'
        : k.status === 'endet' ? 'Der Vertrag läuft ohne automatische Verlängerung zum Enddatum aus.'
          : 'Letzter Tag für die Kündigung: Enddatum minus Kündigungsfrist.'
  return (
    <HoverInfo
      bare className={`${ZEILE} ${warn ? 'font-medium text-warning' : 'text-muted-foreground'}`} popClassName="left-0"
      titel="Kündigung"
      zeilen={[...(k.frist ? [['Frist', frist] as [string, string]] : []), ['Enddatum', ende]]}
      text={erklaerung}
    >
      {warn ? <AlertTriangle className="size-3 shrink-0" aria-hidden /> : <Clock className="size-3 shrink-0" aria-hidden />}
      <span className="truncate">{text}</span>
    </HoverInfo>
  )
}
