'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, X, Loader2, AlertTriangle, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  confirmPendingAction,
  rejectPendingAction,
  signValuableImage,
} from '@/app/(dashboard)/assistant/actions'
import type { ActionDetail } from '@/lib/assistant/actions'

export type PendingActionStatus = 'pending' | 'executed' | 'rejected' | 'failed' | 'expired'

/** Name des Werkzeugs aus WRITE_ACTIONS (siehe lib/assistant/actions/) — der einzige
    Vorschlag, bei dem das Bestätigen einen 15–60 Sekunden langen Bildlauf anstößt und
    damit den eigenen Ladezustand unten verdient, statt nur den Knopf-Spinner. */
const ARTWORK_ACTION = 'generateValuableArtwork'

/**
 * Die Bestätigungskarte für eine von Athena vorgeschlagene Schreibaktion.
 *
 * Sie ist der einzige Ort im UI, an dem eine solche Aktion ausgelöst werden
 * kann — deshalb steht hier alles, was zur Entscheidung gehört: der
 * Klartext-Satz aus `summary` und darunter die Aufschlüsselung aus `details`.
 * „2 Buchungen zuordnen" allein ist keine Grundlage für ein Ja; welche zwei
 * Buchungen es sind, schon.
 */
export function PendingActionCard({
  actionId,
  action,
  label,
  summary,
  details = [],
  initialStatus = 'pending',
  initialResult,
  className,
}: {
  actionId: string
  /** Roher Aktionsname — Rückfallebene, wenn `label` fehlt. */
  action: string
  /** Klartext-Name der Aktion. Fehlt bei Vorschlägen aus älteren Sessions. */
  label?: string
  summary: string
  details?: ActionDetail[]
  initialStatus?: PendingActionStatus
  /** Rückgabe der bereits ausgeführten Aktion — beim Wiederöffnen einer Session aus
      `ai_pending_actions.result`, sonst aus der Antwort des Bestätigungsklicks. */
  initialResult?: unknown
  className?: string
}) {
  const [status, setStatus] = useState<PendingActionStatus>(initialStatus)
  const [result, setResult] = useState<unknown>(initialResult)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Getrennt von `isPending`: der Ladezustand für das Artwork darf nur beim Bestätigen
  // aufleuchten, nicht auch kurz beim Verwerfen — beide laufen über dieselbe Transition.
  const [runningKind, setRunningKind] = useState<'confirm' | 'reject' | null>(null)

  function run(kind: 'confirm' | 'reject') {
    setError(null)
    setRunningKind(kind)
    startTransition(async () => {
      const antwort =
        kind === 'confirm' ? await confirmPendingAction(actionId) : await rejectPendingAction(actionId)
      setRunningKind(null)
      if (antwort && 'error' in antwort) {
        setError(antwort.error)
        if (kind === 'confirm') setStatus('failed')
        return
      }
      if (antwort && 'result' in antwort) setResult(antwort.result)
      setStatus(kind === 'confirm' ? 'executed' : 'rejected')
    })
  }

  const decided = status !== 'pending'

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 text-sm',
        status === 'pending' && 'border-warning/40 bg-warning/5',
        status === 'executed' && 'border-success/40 bg-success/5',
        status === 'rejected' && 'border-border bg-muted/40',
        (status === 'failed' || status === 'expired') && 'border-destructive/40 bg-destructive/5',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {status === 'executed' ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        ) : status === 'failed' ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{summary}</p>

          {details.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
              {details.map((detail, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-foreground">{detail.label}</span>
                    {detail.hint && (
                      <span className="block break-words text-[11px] text-muted-foreground">
                        {detail.hint}
                      </span>
                    )}
                  </span>
                  {detail.value && (
                    <span className="max-w-[55%] shrink-0 break-words text-right font-medium tabular-nums text-foreground">
                      {detail.value}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {action === ARTWORK_ACTION && runningKind === 'confirm' && <ArtworkGenerating />}

          {status === 'executed' && bildIdAus(result) && (
            <ArtworkPreview bildId={bildIdAus(result)!} />
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            {status === 'pending' && 'Athena schlägt das vor — noch wurde nichts geändert.'}
            {status === 'executed' && 'Ausgeführt.'}
            {status === 'rejected' && 'Verworfen.'}
            {status === 'failed' && (error ?? 'Ausführung fehlgeschlagen.')}
            {status === 'expired' && 'Abgelaufen.'}
            <span className={cn('ml-1.5 opacity-60', !label && 'font-mono')}>{label ?? action}</span>
          </p>
        </div>
      </div>

      {!decided && (
        <div className="mt-2 flex gap-2 pl-6">
          <Button size="sm" onClick={() => run('confirm')} disabled={isPending}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Bestätigen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run('reject')} disabled={isPending}>
            <X className="size-3.5" />
            Verwerfen
          </Button>
        </div>
      )}

      {error && decided && <p className="mt-1.5 pl-6 text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * Ladezustand während des Bildlaufs — derselbe durchlaufende Schimmer wie im Inventar
 * (ValuableMedia.tsx, Keyframe `inventar-sheen` in globals.css), nur in Kartengröße statt
 * übers ganze Hauptbild. Vorher stand hier nur der Spinner auf dem Bestätigen-Knopf, der bei
 * einem 15–60 Sekunden langen Lauf schnell wie ein Hänger statt wie Arbeit aussieht.
 */
function ArtworkGenerating() {
  return (
    <div className="relative mt-2.5 flex aspect-square w-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      <span className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-foreground/15 to-transparent motion-safe:animate-[inventar-sheen_1.6s_ease-in-out_infinite]" />
      <div className="flex flex-col items-center gap-1.5 px-2 text-center">
        <Sparkles className="size-5 animate-pulse" style={{ color: 'var(--chart-accent)' }} />
        <p className="text-[11px] font-medium text-foreground">Artwork wird erzeugt…</p>
        <p className="text-[10px] text-muted-foreground">meist 15–60 Sekunden</p>
      </div>
    </div>
  )
}

/**
 * Das fertige Artwork direkt in der Karte.
 *
 * Ohne das endet ein Bildauftrag im Chat mit dem Wort „Ausgeführt." und man muss ins
 * Inventar wechseln, um zu sehen, was entstanden ist — bei einer Sache, deren einziger
 * Zweck das Aussehen ist, ist das die falsche Reihenfolge. Und es ist genau der Moment, in
 * dem man „nochmal, aber dunkler" sagen will.
 *
 * Die URL wird beim Rendern geholt statt im Ergebnis der Aktion mitzureisen: signierte
 * URLs laufen ab (siehe signValuableImage).
 */
function ArtworkPreview({ bildId }: { bildId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let aktiv = true
    signValuableImage(bildId).then((res) => {
      if (!aktiv) return
      if ('url' in res) setUrl(res.url)
      else setFailed(true)
    })
    return () => {
      aktiv = false
    }
  }, [bildId])

  if (failed) return null

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'mt-2.5 block aspect-square w-40 overflow-hidden rounded-lg border border-border bg-muted',
        !url && 'animate-pulse',
      )}
      title={url ? 'In voller Größe öffnen' : undefined}
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Erzeugtes Artwork" className="size-full object-cover" />
      )}
    </a>
  )
}

/** Zieht die Bild-ID aus dem Ergebnis einer ausgeführten Aktion, falls eine drinsteht. */
function bildIdAus(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const id = (result as { bildId?: unknown }).bildId
  return typeof id === 'string' ? id : null
}
