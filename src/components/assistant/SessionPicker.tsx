'use client'

import { useState } from 'react'
import { History, Loader2, MessageSquare, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { listConversations } from '@/app/(dashboard)/assistant/actions'
import { relativeDay, type SessionSummary } from '@/lib/assistant/sessions'

/**
 * Session-Umschalter für das schwebende Sheet.
 *
 * Bewusst nicht `SessionList`: die arbeitet mit Links auf `/assistant?s=…` und mit Umbenennen,
 * Anheften und Löschen. Im Sheet wäre ein Link falsch — ein Wechsel dort soll die Seite nicht
 * verlassen, sonst ist die Zwischenfrage genau das, was sie nicht sein sollte: ein
 * Seitenwechsel. Verwalten bleibt Aufgabe der vollen Seite, hier zählt nur „welcher Chat".
 *
 * Geladen wird bei jedem Aufklappen. Das Sheet hängt im Dashboard-Layout und bleibt über
 * Seitenwechsel hinweg gemountet; eine beim Mount geholte Liste wäre nach der dritten Seite
 * veraltet und würde neue Sessions gar nicht zeigen.
 */
export function SessionPicker({
  activeId,
  onPick,
  wechselt = false,
}: {
  activeId: string
  onPick: (id: string) => void
  /** Ein Wechsel läuft noch — der Auslöser zeigt es, weil das Popover dann schon zu ist. */
  wechselt?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [laden, setLaden] = useState(false)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    setLaden(true)
    try {
      setSessions(await listConversations())
    } finally {
      setLaden(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="Chat wechseln">
          {wechselt ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <History className="size-3.5" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Chats
        </p>

        {/* Erst beim ersten Öffnen ist `sessions` noch null — danach bleibt die alte Liste
            während des Nachladens stehen, statt für einen Moment durch einen Spinner
            ersetzt zu werden. */}
        {laden && sessions === null && (
          <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Lädt…
          </p>
        )}

        {sessions !== null && sessions.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">Noch keine gespeicherten Chats.</p>
        )}

        <div className="max-h-72 overflow-y-auto overscroll-contain">
          {(sessions ?? []).map((session) => {
            const isActive = session.id === activeId
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (!isActive) onPick(session.id)
                }}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
                  isActive ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <span className="flex items-center gap-1.5 truncate text-sm">
                  {session.pinned ? (
                    <Pin className="size-3 shrink-0 text-primary" />
                  ) : (
                    <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{session.title ?? 'Ohne Titel'}</span>
                </span>
                <span className="pl-4.5 text-[11px] text-muted-foreground">
                  {relativeDay(session.updatedAt)} · {session.messageCount} Nachr.
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
