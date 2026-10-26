'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquare, Pin, PinOff, Plus, Trash2, Pencil, Check, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  deleteConversation,
  renameConversation,
  togglePinConversation,
} from '@/app/(dashboard)/assistant/actions'
import { relativeDay, type SessionSummary } from '@/lib/assistant/sessions'
import { filtereSessions, gruppiereSessions } from '@/lib/assistant/session-gruppen'

// Typ und Datumsformat liegen in `lib/assistant/sessions` — dieselbe Liste erscheint auch
// im schwebenden Sheet, und dort ohne diese Komponente.
export type { SessionSummary }

/** Filter-Link; die offene Session bleibt dabei erhalten (ein Filterklick schließt keinen Chat). */
function chipHref(wert: string | null, activeId?: string): string {
  const teile: string[] = []
  if (activeId) teile.push(`s=${activeId}`)
  if (wert) teile.push(`projekt=${wert}`)
  return teile.length > 0 ? `/assistant?${teile.join('&')}` : '/assistant'
}

/** Ab so vielen Sessions lohnt sich das Suchfeld. */
const SUCHE_AB = 6

export function SessionList({
  sessions,
  activeId,
  projekte,
  projektFilter,
}: {
  sessions: SessionSummary[]
  activeId?: string
  /** Projekte des Nutzers: Filterchips und Projektnamen in den Zeilen. */
  projekte?: { id: string; name: string }[]
  /** Wert des URL-Parameters `projekt`: eine Projekt-ID oder `'ohne'`. */
  projektFilter?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [suche, setSuche] = useState('')
  const [isPending, startTransition] = useTransition()

  const projektName = useMemo(() => new Map((projekte ?? []).map((p) => [p.id, p.name])), [projekte])
  const chips = useMemo(
    () => [
      { wert: null, label: 'Alle' },
      { wert: 'ohne', label: 'Allgemein' },
      ...(projekte ?? []).map((p) => ({ wert: p.id, label: p.name })),
    ],
    [projekte],
  )
  // „Neu“ bei aktivem Projektfilter startet den Chat gleich im Projekt.
  const neuesProjekt = projektFilter && projektName.has(projektFilter) ? projektFilter : null

  const mitSuche = sessions.length >= SUCHE_AB
  const gruppen = useMemo(
    () => gruppiereSessions(mitSuche ? filtereSessions(sessions, suche) : sessions),
    [sessions, suche, mitSuche],
  )

  function commitRename(id: string) {
    const title = draft.trim()
    setEditing(null)
    if (!title) return
    startTransition(async () => {
      await renameConversation(id, title)
      router.refresh()
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sessions
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Neue Session"
          onClick={() =>
            // Die ID wird HIER erzeugt, nicht erst client-seitig in
            // `erzeugeChat` — sonst bleibt `?s=` bei einem frischen Chat leer
            // und ein zweiter Klick auf „+" navigiert auf dieselbe URL wie
            // der erste. Next.js überspringt eine Navigation zu einer
            // identischen URL, also passierte beim zweiten Klick gar nichts.
            // Mit einer neuen UUID pro Klick ist jede „+"-Navigation ein Ziel,
            // das es vorher nicht gab — und `key={activeId}` in page.tsx
            // erzwingt zuverlässig einen frischen Chat.
            router.push(
              `/assistant?s=${crypto.randomUUID()}${neuesProjekt ? `&p=${neuesProjekt}` : ''}`,
            )
          }
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {projekte && projekte.length > 0 && (
        <nav
          aria-label="Nach Projekt filtern"
          className="flex gap-1.5 overflow-x-auto border-b border-border px-1.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map((chip) => {
            const aktiv = (projektFilter ?? null) === chip.wert
            return (
              <Link
                key={chip.wert ?? 'alle'}
                href={chipHref(chip.wert, activeId)}
                aria-current={aktiv ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-9 max-w-40 shrink-0 items-center rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                  aktiv
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="truncate">{chip.label}</span>
              </Link>
            )
          })}
        </nav>
      )}

      {mitSuche && (
        <div className="relative border-b border-border px-1.5 py-1.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suchen…"
            aria-label="Sessions durchsuchen"
            className="h-7 pl-7 text-xs"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">Noch keine Sessions.</p>
        )}
        {sessions.length > 0 && gruppen.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">Keine Treffer.</p>
        )}

        {gruppen.map((gruppe) => (
          <section key={gruppe.key} aria-label={gruppe.label}>
            <h3 className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {gruppe.label}
            </h3>
            {gruppe.sessions.map((session) => {
              const isActive = session.id === activeId
              if (editing === session.id) {
                return (
                  <div key={session.id} className="flex items-center gap-1 p-1">
                    <Input
                      autoFocus
                      value={draft}
                      aria-label="Neuer Titel"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(session.id)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      className="h-7 min-w-0 text-xs"
                    />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Titel speichern"
                      onClick={() => commitRename(session.id)}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Abbrechen"
                      onClick={() => setEditing(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )
              }

              return (
                <div
                  key={session.id}
                  className={cn(
                    'group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
                    isActive ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <Link
                    href={`/assistant?s=${session.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className="flex min-w-0 flex-1 flex-col gap-0.5"
                  >
                    <span className="flex items-center gap-1.5 truncate text-sm">
                      {session.pinned ? (
                        <Pin className="size-3 shrink-0 text-primary" />
                      ) : (
                        <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{session.title ?? 'Ohne Titel'}</span>
                    </span>
                    <span className="truncate pl-4.5 text-[11px] text-muted-foreground">
                      {relativeDay(session.updatedAt)} · {session.messageCount} Nachr.
                      {session.projectId && projektName.get(session.projectId)
                        ? ` · ${projektName.get(session.projectId)}`
                        : ''}
                    </span>
                  </Link>

                  {/* Die Leiste mit dem Wechsler deckt das Handy ab; hier zählt Kompaktheit.
                      Trotzdem Projektmuster: ohne Hover (Touch) bleiben die Aktionen sichtbar,
                      mit Tastatur-Fokus ebenfalls. */}
                  <div className="flex shrink-0 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="size-10 md:size-6"
                      aria-label={session.pinned ? 'Loslösen' : 'Anheften'}
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await togglePinConversation(session.id, !session.pinned)
                          router.refresh()
                        })
                      }
                    >
                      {session.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="size-10 md:size-6"
                      aria-label="Umbenennen"
                      onClick={() => {
                        setDraft(session.title ?? '')
                        setEditing(session.id)
                      }}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <ConfirmDialog
                      title="Session löschen?"
                      description={`„${session.title ?? 'Ohne Titel'}" wird mitsamt allen Nachrichten und Vorschlägen daraus entfernt. Das lässt sich nicht zurückholen.`}
                      onConfirm={() =>
                        startTransition(async () => {
                          await deleteConversation(session.id)
                          // Beim Löschen der offenen Session zurück auf einen leeren Chat.
                          if (isActive) router.push('/assistant')
                          else router.refresh()
                        })
                      }
                    >
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-10 md:size-6"
                        aria-label="Löschen"
                        disabled={isPending}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </ConfirmDialog>
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
