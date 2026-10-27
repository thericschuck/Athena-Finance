import { CheckCircle2, RotateCcw } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EditGoalDialog, DeleteGoalButton, GoalPaymentDialog } from '@/components/finance/goal-form'
import { setGoalStatus } from '@/app/(dashboard)/finance/(planung)/goals/actions'
import { SparzielAmpel } from '@/components/sparziele/SparzielAmpel'
import { ampelVon, anteil, phaseVon, prozent, restbetrag, ueberschuss } from '@/lib/sparziele/berechnen'
import type { Ziel } from '@/lib/data/sparziele-seite'
import { cn } from '@/lib/utils'
import { ZuletztGeaendert } from '@/components/aenderungen/ZuletztGeaendert'
import type { ZuletztGeaendertInfo } from '@/lib/data/aenderungen'

/**
 * Eine Zeile je Sparziel: Name + Chips, Fortschrittsbalken, Beträge, Ampel mit Hover-Erklärung und
 * Aktionen. Mobil gestapelt (Aktionen darunter, immer sichtbar), ab md Aktionen rechts daneben
 * (Symbole erst beim Überfahren/Fokussieren). Server-Komponente.
 */

const PRIO: Record<string, { label: string; klasse: string }> = {
  hoch:    { label: 'Hoch', klasse: 'bg-warning/10 text-warning' },
  mittel:  { label: 'Mittel', klasse: 'bg-primary/10 text-primary' },
  niedrig: { label: 'Niedrig', klasse: 'bg-muted text-muted-foreground' },
}

export function SparzielZeile({
  ziel, heute, locale, dateFormat, zuletzt,
}: { ziel: Ziel; heute: string; locale: string; dateFormat: string; zuletzt?: ZuletztGeaendertInfo | null }) {
  const phase = phaseVon(ziel)
  const offen = phase === 'offen'
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0, maxFractionDigits: 2 })
  const pct = prozent(ziel.current_amount, ziel.target_amount)
  const rest = restbetrag(ziel.current_amount, ziel.target_amount)
  const mehr = ueberschuss(ziel.current_amount, ziel.target_amount)
  const voll = rest === 0
  const prio = ziel.priority ? PRIO[ziel.priority] : undefined
  const ampel = offen ? ampelVon(ziel, heute) : null
  const toggle = setGoalStatus.bind(null, ziel.id, offen ? 'geschlossen' : 'offen')

  const balken = voll ? 'bg-success' : offen ? 'bg-primary' : 'bg-muted-foreground/50'

  return (
    <li className="group flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:p-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 max-w-full flex-1 basis-40 truncate text-sm font-medium text-foreground">{ziel.description}</h3>
          {phase === 'erreicht' && <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Erreicht</span>}
          {phase === 'beendet' && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Beendet</span>}
          {prio && offen && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', prio.klasse)}>{prio.label}</span>}
        </div>

        <div
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          aria-label={`${ziel.description}: ${pct} Prozent`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className={cn('h-full rounded-full', balken)} style={{ width: `${anteil(ziel.current_amount, ziel.target_amount) * 100}%` }} />
        </div>

        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            <span className="font-medium text-foreground">{euro(ziel.current_amount)}</span> von {euro(ziel.target_amount)} · {pct} %
          </span>
          <span className="tabular-nums">
            {mehr > 0 ? `${euro(mehr)} über dem Ziel` : voll ? 'Betrag erreicht' : `Rest ${euro(rest)}`}
          </span>
        </div>

        {ampel && <SparzielAmpel ziel={ziel} ampel={ampel} heute={heute} locale={locale} dateFormat={dateFormat} />}
        <ZuletztGeaendert info={zuletzt} />
        {phase === 'beendet' && (
          <p className="text-xs text-muted-foreground">
            Abgeschlossen mit {euro(ziel.current_amount)} von {euro(ziel.target_amount)}. Wieder öffnen, wenn du weiter sparen willst.
          </p>
        )}
        {ziel.notes && <p className="line-clamp-2 break-words text-xs text-muted-foreground">{ziel.notes}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2 md:shrink-0 md:justify-end md:border-0 md:pt-0">
        {offen && <GoalPaymentDialog goal={ziel} locale={locale} />}
        <form action={toggle}>
          <Button type="submit" variant="ghost" className="h-10 px-3 text-xs text-muted-foreground">
            {offen ? <CheckCircle2 className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
            {offen ? (rest <= 0.005 ? 'Erreicht' : 'Abschließen') : 'Wieder öffnen'}
            <span className="sr-only">{offen ? ' markieren: ' : ': '}{ziel.description}</span>
          </Button>
        </form>
        <EditGoalDialog goal={ziel} />
        <DeleteGoalButton goal={ziel} />
      </div>
    </li>
  )
}
