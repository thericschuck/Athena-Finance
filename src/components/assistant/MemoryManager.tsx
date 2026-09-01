'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, Plus, Trash2, Pencil, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { upsertMemory, deleteMemory } from '@/app/(dashboard)/assistant/actions'

export type MemoryRow = {
  id: string
  key: string
  content: string
  category: string
  source: string
  updated_at: string
}

/** Siehe AthenaSettingsForm: `bg-background` statt `bg-transparent`, sonst
    rendert das native Options-Popup hellen Text auf weißem Grund. */
const selectCls =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Allgemein',
  preference: 'Vorliebe',
  goal: 'Ziel',
  fact: 'Fakt',
  constraint: 'Randbedingung',
}

export function MemoryManager({ memories }: { memories: MemoryRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<MemoryRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await upsertMemory(formData)
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
          Was Athena dauerhaft über dich weiß. Diese Einträge stehen bei jeder Session im Kontext —
          Athena legt sie selbst an, du kannst sie jederzeit korrigieren oder löschen. Bearbeitete
          Einträge gelten danach als deine Vorgabe und wiegen für Athena schwerer als ihre eigenen
          Notizen.
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
          <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,10rem)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                name="key"
                defaultValue={editing?.key}
                // Ein bestehender Key ist der Schlüssel des Eintrags — ihn zu
                // ändern würde einen zweiten anlegen statt diesen umzubenennen.
                readOnly={!!editing}
                placeholder="sparziel-umzug"
                pattern="[a-z0-9\-]+"
                required
                className={cn(editing && 'opacity-60')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Kategorie</Label>
              <select
                id="category"
                name="category"
                defaultValue={editing?.category ?? 'general'}
                className={selectCls}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="content">Inhalt</Label>
            <Textarea
              id="content"
              name="content"
              defaultValue={editing?.content}
              placeholder="Ein Fakt pro Eintrag, in einem Satz."
              rows={3}
              required
            />
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

      {memories.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Brain className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Noch nichts gemerkt. Athena füllt das im Gespräch von selbst.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {memories.map((memory) => (
          <li
            key={memory.id}
            className="group flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
          >
            <span
              className="mt-0.5 shrink-0 text-muted-foreground"
              title={memory.source === 'user' ? 'Von dir vorgegeben' : 'Von Athena gemerkt'}
            >
              {memory.source === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="font-mono text-xs text-muted-foreground">{memory.key}</code>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {CATEGORY_LABELS[memory.category] ?? memory.category}
                </span>
              </div>
              <p className="mt-0.5 text-sm">{memory.content}</p>
            </div>
            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Bearbeiten"
                onClick={() => {
                  setCreating(false)
                  setEditing(memory)
                }}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Löschen"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteMemory(memory.id)
                    router.refresh()
                  })
                }
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
