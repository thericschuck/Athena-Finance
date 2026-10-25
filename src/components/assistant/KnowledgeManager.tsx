'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Trash2, Pencil, Pin, PinOff, ExternalLink, X } from 'lucide-react'
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
import { VerwaltungKopf } from '@/components/assistant/verwaltung/VerwaltungKopf'
import { FormKarte } from '@/components/assistant/verwaltung/FormKarte'
import { EintragAktionen, AKTION_KLASSE } from '@/components/assistant/verwaltung/EintragAktionen'
import { Herkunft } from '@/components/assistant/verwaltung/Herkunft'
import { chipKlasse, LABEL_KLASSE } from '@/components/assistant/verwaltung/chip'

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

const INFO =
  'Kuratierte Notizen, die Athena durchsuchen kann — eigene Anlageregeln, Strategien, Zusammenfassungen. Die Titel kennt sie immer; den Volltext holt sie sich, wenn eine Frage dazu passt. Was sie selbst recherchiert und für dauerhaft nützlich hält, landet hier ebenfalls (mit Quelle).'

export function KnowledgeManager({ entries }: { entries: KnowledgeRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<KnowledgeRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
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

  function schliessen() {
    setEditing(null)
    setCreating(false)
    setError(null)
  }

  const showForm = creating || editing !== null

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return entries.filter((e) => {
      if (tagFilter && !e.tags.includes(tagFilter)) return false
      if (!q) return true
      return (
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [entries, suche, tagFilter])

  return (
    <div className="flex flex-col gap-3">
      <VerwaltungKopf
        suche={suche}
        onSuche={setSuche}
        platzhalter="Im Wissen suchen"
        info={INFO}
        onNeu={() => {
          setEditing(null)
          setCreating(true)
        }}
      />

      {showForm && (
        <FormKarte
          key={editing?.id ?? 'neu'}
          action={submit}
          fehler={error}
          pending={isPending}
          onAbbrechen={schliessen}
        >
          <input type="hidden" name="id" value={editing?.id ?? ''} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Titel</Label>
            <Input id="title" name="title" defaultValue={editing?.title} autoFocus required className="h-10" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Tags (kommagetrennt)</Label>
              <Input
                id="tags"
                name="tags"
                defaultValue={editing?.tags.join(', ')}
                placeholder="etf, steuern, strategie"
                className="h-10"
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
                className="h-10"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="content">Inhalt</Label>
            <Textarea id="content" name="content" defaultValue={editing?.content} rows={10} required />
          </div>
        </FormKarte>
      )}

      {tagFilter && (
        <div className="flex">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={chipKlasse(true, 'gap-1.5')}
            aria-label={`Tag-Filter ${tagFilter} entfernen`}
          >
            {tagFilter}
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {entries.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <BookOpen className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Die Wissensbasis ist leer.</p>
        </div>
      )}

      {entries.length > 0 && sichtbar.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Keine Treffer.</p>
      )}

      <ul className="flex flex-col gap-2">
        {sichtbar.map((entry) => {
          const offen = expanded === entry.id
          return (
            <li key={entry.id} className="group rounded-lg border border-border py-1 pl-3 pr-1 md:pr-2">
              <div className="flex items-start gap-3">
                <span className="mt-3.5 flex">
                  <Herkunft
                    vonMensch={entry.source !== 'agent'}
                    titel={entry.source === 'agent' ? 'Von Athena recherchiert' : 'Von dir angelegt'}
                    text={
                      entry.source === 'agent'
                        ? 'Athena hat das recherchiert und für dauerhaft nützlich gehalten.'
                        : 'Du hast den Eintrag selbst angelegt.'
                    }
                  />
                </span>
                <button
                  type="button"
                  aria-expanded={offen}
                  onClick={() => setExpanded(offen ? null : entry.id)}
                  className="min-h-11 min-w-0 flex-1 py-2 text-left"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words text-sm font-medium">{entry.title}</span>
                    {entry.pinned && <Pin className="size-3 shrink-0 text-primary" aria-label="Angeheftet" />}
                  </span>
                  {!offen && (
                    <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">
                      {entry.content}
                    </p>
                  )}
                </button>
                <EintragAktionen>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={AKTION_KLASSE}
                    aria-label={entry.pinned ? 'Loslösen' : 'Anheften'}
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleKnowledgePin(entry.id, !entry.pinned)
                        router.refresh()
                      })
                    }
                  >
                    {entry.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={AKTION_KLASSE}
                    aria-label="Bearbeiten"
                    onClick={() => {
                      setCreating(false)
                      setError(null)
                      setEditing(entry)
                    }}
                  >
                    <Pencil className="size-4" />
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className={AKTION_KLASSE}
                      aria-label="Löschen"
                      disabled={isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </ConfirmDialog>
                </EintragAktionen>
              </div>

              {(entry.tags.length > 0 || offen) && (
                <div className="pb-2 pl-7 pr-2">
                  {entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                          className={`${LABEL_KLASSE} min-h-8 px-2.5 hover:bg-accent`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                  {offen && (
                    <>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {entry.content}
                      </p>
                      {entry.source_url && (
                        <a
                          href={entry.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          <ExternalLink className="size-3" />
                          Quelle
                        </a>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
