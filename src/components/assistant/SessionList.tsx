'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquare, Pin, PinOff, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  deleteConversation,
  renameConversation,
  togglePinConversation,
} from '@/app/(dashboard)/assistant/actions'
import { relativeDay, type SessionSummary } from '@/lib/assistant/sessions'

// Typ und Datumsformat liegen in `lib/assistant/sessions` — dieselbe Liste erscheint auch
// im schwebenden Sheet, und dort ohne diese Komponente.
export type { SessionSummary }

export function SessionList({
  sessions,
  activeId,
}: {
  sessions: SessionSummary[]
  activeId?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isPending, startTransition] = useTransition()

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
        <Button asChild size="icon-xs" variant="ghost" aria-label="Neue Session">
          {/* Ohne `?s=` mountet die Seite einen frischen Chat mit neuer ID. */}
          <Link href="/assistant">
            <Plus className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">Noch keine Sessions.</p>
        )}

        {sessions.map((session) => {
          const isActive = session.id === activeId
          if (editing === session.id) {
            return (
              <div key={session.id} className="flex items-center gap-1 p-1">
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(session.id)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="h-7 text-xs"
                />
                <Button size="icon-xs" variant="ghost" onClick={() => commitRename(session.id)}>
                  <Check className="size-3.5" />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => setEditing(null)}>
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
                <span className="pl-4.5 text-[11px] text-muted-foreground">
                  {relativeDay(session.updatedAt)} · {session.messageCount} Nachr.
                </span>
              </Link>

              <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button
                  size="icon-xs"
                  variant="ghost"
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
                  aria-label="Umbenennen"
                  onClick={() => {
                    setDraft(session.title ?? '')
                    setEditing(session.id)
                  }}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Löschen"
                  disabled={isPending}
                  onClick={() => {
                    if (!confirm('Diese Session mitsamt Nachrichten löschen?')) return
                    startTransition(async () => {
                      await deleteConversation(session.id)
                      // Beim Löschen der offenen Session zurück auf einen leeren Chat.
                      if (isActive) router.push('/assistant')
                      else router.refresh()
                    })
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
