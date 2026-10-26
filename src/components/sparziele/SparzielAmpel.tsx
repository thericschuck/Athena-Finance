import { fmtCurrency, fmtDate } from '@/lib/format'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import { dauerText, planAbweichung, type Ampel, type AmpelStufe, type ZielDaten } from '@/lib/sparziele/berechnen'

/**
 * Ampel eines offenen Ziels: im Plan / knapp / Rate reicht nicht ... mit Hover-Erklärung
 * (Rate, Fertig-Datum bei dieser Rate, Zieldatum, nötige Rate, Plan-Stand). Server-Komponente.
 */

const STUFEN: Record<AmpelStufe, { label: string; klasse: string }> = {
  erreicht:     { label: 'Betrag erreicht', klasse: 'bg-success/10 text-success' },
  imPlan:       { label: 'Im Plan', klasse: 'bg-success/10 text-success' },
  knapp:        { label: 'Knapp', klasse: 'bg-warning/10 text-warning' },
  reichtNicht:  { label: 'Rate reicht nicht', klasse: 'bg-danger/10 text-danger' },
  ueberfaellig: { label: 'Zieldatum vorbei', klasse: 'bg-danger/10 text-danger' },
  ohneRate:     { label: 'Ohne Rate', klasse: 'bg-warning/10 text-warning' },
  laeuft:       { label: 'Läuft', klasse: 'bg-muted text-muted-foreground' },
  ohnePlan:     { label: 'Kein Plan', klasse: 'bg-muted text-muted-foreground' },
}

export function SparzielAmpel({
  ziel, ampel, heute, locale, dateFormat,
}: { ziel: ZielDaten; ampel: Ampel; heute: string; locale: string; dateFormat: string }) {
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })
  const datum = (d: string) => fmtDate(new Date(`${d}T12:00:00`), dateFormat)
  const s = STUFEN[ampel.stufe]
  const rate = ziel.monthly_savings_rate && ziel.monthly_savings_rate > 0 ? ziel.monthly_savings_rate : null
  const plan = planAbweichung(ziel, heute)

  const zeilen: [string, string][] = []
  if (rate !== null) zeilen.push(['Sparrate', `${euro(rate)}/Mon.`])
  if (ampel.erreichtAm && ampel.monateNoetig) zeilen.push(['Fertig bei dieser Rate', `${datum(ampel.erreichtAm)} (${dauerText(ampel.monateNoetig)})`])
  if (ziel.target_date) zeilen.push(['Zieldatum', datum(ziel.target_date)])
  if (ampel.noetigeRate !== null) zeilen.push(['Nötige Rate bis dahin', `${euro(ampel.noetigeRate)}/Mon.`])
  if (plan !== null) zeilen.push(['Plan-Stand', `${plan >= 0 ? '+' : '−'}${euro(Math.abs(plan))}`])

  const TEXTE: Record<AmpelStufe, string> = {
    erreicht: 'Der Zielbetrag ist gespart. Markiere das Ziel als erreicht, wenn es abgeschlossen ist.',
    imPlan: 'Bei der aktuellen Rate ist der Betrag bis zum Zieldatum zusammen.',
    knapp: `Bei der aktuellen Rate wird es höchstens einen Monat nach dem Zieldatum.${ampel.noetigeRate !== null ? ` Mit ${euro(ampel.noetigeRate)} im Monat klappt es rechtzeitig.` : ''}`,
    reichtNicht: `Bei der aktuellen Rate wird das Zieldatum um mehr als einen Monat verfehlt.${ampel.noetigeRate !== null ? ` Nötig wären ${euro(ampel.noetigeRate)} im Monat.` : ''}`,
    ueberfaellig: 'Das Zieldatum ist vorbei, der Betrag aber noch nicht erreicht. Passe das Datum an oder schließe das Ziel ab.',
    ohneRate: `Es gibt ein Zieldatum, aber keine Sparrate.${ampel.noetigeRate !== null ? ` Bis dahin wären ${euro(ampel.noetigeRate)} im Monat nötig.` : ''}`,
    laeuft: 'Es gibt eine Sparrate, aber kein Zieldatum. Das Fertig-Datum ist eine Hochrechnung.',
    ohnePlan: 'Ohne Sparrate und Zieldatum kann nichts hochgerechnet werden. Trage eines von beiden ein.',
  }
  const plantext = plan !== null
    ? ' Plan-Stand: gespart minus (volle Monate seit Rate-Start x Rate); gilt nur, wenn du ab dem Startdatum bei 0 € begonnen hast.'
    : ''

  return (
    <AnalyseKennzahlInfo
      className="inline-flex max-w-full min-w-0 cursor-help flex-wrap items-center gap-x-2 gap-y-1 rounded-md text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      titel={s.label}
      zeilen={zeilen}
      text={TEXTE[ampel.stufe] + plantext}
    >
      <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${s.klasse}`}>{s.label}</span>
      {ampel.erreichtAm && ampel.monateNoetig ? (
        <span className="min-w-0 text-muted-foreground">
          bei {fmtCurrency(rate ?? 0, 'EUR', locale, { fractionDigits: 0, maxFractionDigits: 2 })}/Mon. fertig ca. {datum(ampel.erreichtAm)}
        </span>
      ) : null}
      {ziel.target_date && (
        <span className="min-w-0 text-muted-foreground">Ziel {datum(ziel.target_date)}</span>
      )}
    </AnalyseKennzahlInfo>
  )
}
