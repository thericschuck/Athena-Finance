'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, MessageSquare, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { deleteConversation, togglePinConversation } from '@/app/(dashboard)/assistant/actions'
import { formatUsd } from '@/lib/assistant/cost'
import { filtereSessions, gruppiereSessions } from '@/lib/assistant/session-gruppen'
import { relativeDay, type SessionSummary } from '@/lib/assistant/sessions'

/** Ab so vielen Sessions lohnt sich das Suchfeld. */
const SUCHE_AB = 6

/**
 * Schmale Leiste über dem Chat: Name der offenen Session, Wechsler (am Handy die einzige Stelle,
 * an der Sessions erreichbar sind), „Neu" und die geschätzten Kosten des Gesprächs.
 * Ab `lg` gibt es die Seitenleiste (`SessionList`), dort entfällt der Wechsler.
 */
export function SessionLeiste({
  sessions,
  activeId,
  kosten,
}: {
  sessions: SessionSummary[]
  /** `undefined` = frischer Chat ohne `?s=`. */
  activeId?: string
  /** `null`, solange die Session noch keinen abgeschlossenen Lauf hat (oder neu ist). */
  kosten: { usd: number; laeufe: number } | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [suche, setSuche] = useState('')
  // `loeschen` bleibt beim Schließen stehen (nur `dialogOffen` kippt), damit der Titel im
  // Dialog während der Ausblend-Animation nicht auf „Ohne Titel“ springt.
  const [loeschen, setLoeschen] = useState<SessionSummary | null>(null)
  const [dialogOffen, setDialogOffen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const aktiv = sessions.find((s) => s.id === activeId)
  const mitSuche = sessions.length >= SUCHE_AB
  const gruppen = useMemo(
    () => gruppiereSessions(mitSuche ? filtereSessions(sessions, suche) : sessions),
    [sessions, suche, mitSuche],
  )

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSuche('')
  }

  function bestaetigeLoeschen() {
    const ziel = loeschen
    setDialogOffen(false)
    if (!ziel) return
    startTransition(async () => {
      await deleteConversation(ziel.id)
      // Beim Löschen der offenen Session zurück auf einen leeren Chat.
      if (ziel.id === activeId) router.push('/assistant')
      else router.refresh()
    })
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 border-b border-border px-3 py-1 sm:gap-2">
      <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
        {aktiv?.title ?? 'Neuer Chat'}
      </h2>

      {kosten ? (
        <span
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
          aria-label={`Geschätzte Kosten ${formatUsd(kosten.usd)}, ${kosten.laeufe} ${
            kosten.laeufe === 1 ? 'Lauf' : 'Läufe'
          }`}
        >
          ≈ {formatUsd(kosten.usd)}
          <span className="hidden sm:inline">
            {' '}
            · {kosten.laeufe} {kosten.laeufe === 1 ? 'Lauf' : 'Läufe'}
          </span>
        </span>
      ) : null}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-10 sm:size-8 lg:hidden"
            aria-label="Chat wechseln"
          >
            <ChevronsUpDown className="size-4" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] p-1.5">
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Chats
          </p>

          {mitSuche && (
            <div className="relative pb-1.5">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-[calc(50%-0.375rem)] size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Suchen…"
                aria-label="Chats durchsuchen"
                className="h-9 pl-8 text-sm"
              />
            </div>
          )}

          {sessions.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">Noch keine Sessions.</p>
          )}
          {sessions.length > 0 && gruppen.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">Keine Treffer.</p>
          )}

          <div className="max-h-[60dvh] overflow-y-auto overscroll-contain">
            {gruppen.map((gruppe) => (
              <section key={gruppe.key} aria-label={gruppe.label}>
                <h3 className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {gruppe.label}
                </h3>
                {gruppe.sessions.map((session) => {
                  const isActive = session.id === activeId
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        'flex min-w-0 items-center rounded-md transition-colors',
                        isActive ? 'bg-accent' : 'hover:bg-accent/50',
                      )}
                    >
                      <Link
                        href={`/assistant?s=${session.id}`}
                        onClick={() => handleOpenChange(false)}
                        aria-current={isActive ? 'page' : undefined}
                        className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 py-1"
                      >
                        <span className="flex items-center gap-1.5 text-sm">
                          {session.pinned ? (
                            <Pin className="size-3 shrink-0 text-primary" />
                          ) : (
                            <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{session.title ?? 'Ohne Titel'}</span>
                        </span>
                        <span className="truncate pl-4.5 text-[11px] text-muted-foreground">
                          {relativeDay(session.updatedAt)} · {session.messageCount} Nachr.
                        </span>
                      </Link>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-10 shrink-0"
                        aria-label={session.pinned ? 'Loslösen' : 'Anheften'}
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await togglePinConversation(session.id, !session.pinned)
                            router.refresh()
                          })
                        }
                      >
                        {session.pinned ? (
                          <PinOff className="size-4" />
                        ) : (
                          <Pin className="size-4" />
                        )}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-10 shrink-0"
                        aria-label="Löschen"
                        disabled={isPending}
                        onClick={() => {
                          // Popover zuerst schließen: sein Fokus-Aus würde sonst einen
                          // Dialog, der darin hängt, gleich wieder mitnehmen.
                          handleOpenChange(false)
                          setLoeschen(session)
                          setDialogOffen(true)
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        variant="outline"
        className="h-10 shrink-0 sm:h-8"
        onClick={() =>
          // Die ID wird HIER erzeugt, nicht erst client-seitig in
          // `erzeugeChat` — sonst bleibt `?s=` bei einem frischen Chat leer
          // und ein zweiter Klick auf „Neu" navigiert auf dieselbe URL wie
          // der erste. Next.js überspringt eine Navigation zu einer
          // identischen URL, also passierte beim zweiten Klick gar nichts.
          // Mit einer neuen UUID pro Klick ist jede „Neu"-Navigation ein Ziel,
          // das es vorher nicht gab — und `key={activeId}` in page.tsx
          // erzwingt zuverlässig einen frischen Chat.
          router.push(`/assistant?s=${crypto.randomUUID()}`)
        }
      >
        <Plus className="size-4" />
        Neu
      </Button>

      {/* Außerhalb des Popovers, damit der Dialog dessen Schließen überlebt. */}
      <AlertDialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {`„${loeschen?.title ?? 'Ohne Titel'}" wird mitsamt allen Nachrichten und Vorschlägen daraus entfernt. Das lässt sich nicht zurückholen.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={bestaetigeLoeschen}
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
