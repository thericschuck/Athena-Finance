'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, Trash2, Pencil, Pin, PinOff, ExternalLink, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  saveKnowledgeEntry,
  deleteKnowledgeEntry,
  toggleKnowledgePin,
} from '@/app/(dashboard)/assistant/actions'

export type KnowledgeRow = {
  id: string
  title: string
  content: string
  tags: string[]
  source_url: string | null
  source: string
  pinned: boolean
  updated_at: string
}

export function KnowledgeManager({ entries }: { entries: KnowledgeRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<KnowledgeRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await saveKnowledgeEntry(formData)
      if (result && 'error' in result) {
        setError(result.error)
        return
      }
      setEditing(null)
      setCreating(false)
      router.refresh()
    })
  }

  const showForm = creating || editing !== null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Kuratierte Notizen, die Athena durchsuchen kann — eigene Anlageregeln, Strategien,
          Zusammenfassungen. Die Titel kennt sie immer; den Volltext holt sie sich, wenn eine Frage
          dazu passt. Was sie selbst recherchiert und für dauerhaft nützlich hält, landet hier
          ebenfalls (mit Quelle).
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setCreating(true)
          }}
        >
          <Plus className="size-3.5" />
          Neu
        </Button>
      </div>

      {showForm && (
        <form action={submit} className="rounded-lg border border-border p-4">
          <input type="hidden" name="id" value={editing?.id ?? ''} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Titel</Label>
            <Input id="title" name="title" defaultValue={editing?.title} required />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Tags (kommagetrennt)</Label>
              <Input
                id="tags"
                name="tags"
                defaultValue={editing?.tags.join(', ')}
                placeholder="etf, steuern, strategie"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="source_url">Quelle (optional)</Label>
              <Input
                id="source_url"
                name="source_url"
                type="url"
                defaultValue={editing?.source_url ?? ''}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="content">Inhalt</Label>
            <Textarea id="content" name="content" defaultValue={editing?.content} rows={10} required />
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              Speichern
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(null)
                setCreating(false)
                setError(null)
              }}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {entries.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <BookOpen className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Die Wissensbasis ist leer.</p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="group rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 shrink-0 text-muted-foreground"
                title={entry.source === 'agent' ? 'Von Athena recherchiert' : 'Von dir angelegt'}
              >
                {entry.source === 'agent' ? <Bot className="size-4" /> : <User className="size-4" />}
              </span>
              <button
                type="button"
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{entry.title}</span>
                  {entry.pinned && <Pin className="size-3 text-primary" />}
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
                {expanded !== entry.id && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.content}</p>
                )}
              </button>
              <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={entry.pinned ? 'Loslösen' : 'Anheften'}
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await toggleKnowledgePin(entry.id, !entry.pinned)
                      router.refresh()
                    })
                  }
                >
                  {entry.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Bearbeiten"
                  onClick={() => {
                    setCreating(false)
                    setEditing(entry)
                  }}
                >
                  <Pencil className="size-3" />
                </Button>
                <ConfirmDialog
                  title="Eintrag löschen?"
                  description={`„${entry.title}" wird aus der Wissensbasis entfernt. Athena kann ihn danach nicht mehr lesen.`}
                  onConfirm={() =>
                    startTransition(async () => {
                      await deleteKnowledgeEntry(entry.id)
                      router.refresh()
                    })
                  }
                >
                  <Button size="icon-xs" variant="ghost" aria-label="Löschen" disabled={isPending}>
                    <Trash2 className="size-3" />
                  </Button>
                </ConfirmDialog>
              </div>
            </div>

            {expanded === entry.id && (
              <div className="mt-2 pl-7">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.content}</p>
                {entry.source_url && (
                  <a
                    href={entry.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    Quelle
                  </a>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
