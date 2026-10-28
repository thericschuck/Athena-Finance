'use client'

import { LeerZustand } from '@/components/leer/LeerZustand'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { upsertMemory, deleteMemory } from '@/app/(dashboard)/assistant/actions'
import { VerwaltungKopf } from '@/components/assistant/verwaltung/VerwaltungKopf'
import { FormKarte } from '@/components/assistant/verwaltung/FormKarte'
import { EintragAktionen, AKTION_KLASSE } from '@/components/assistant/verwaltung/EintragAktionen'
import { Herkunft } from '@/components/assistant/verwaltung/Herkunft'
import { chipKlasse, LABEL_KLASSE } from '@/components/assistant/verwaltung/chip'

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
  'h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Allgemein',
  preference: 'Vorliebe',
  goal: 'Ziel',
  fact: 'Fakt',
  constraint: 'Randbedingung',
}

const INFO =
  'Was Athena dauerhaft über dich weiß. Diese Einträge stehen bei jeder Session im Kontext — Athena legt sie selbst an, du kannst sie jederzeit korrigieren oder löschen. Bearbeitete Einträge gelten danach als deine Vorgabe und wiegen für Athena schwerer als ihre eigenen Notizen.'

export function MemoryManager({ memories }: { memories: MemoryRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<MemoryRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [kategorie, setKategorie] = useState<string>('all')
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

  function schliessen() {
    setEditing(null)
    setCreating(false)
    setError(null)
  }

  const showForm = creating || editing !== null

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return memories.filter((m) => {
      if (kategorie !== 'all' && m.category !== kategorie) return false
      if (!q) return true
      return m.key.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)
    })
  }, [memories, suche, kategorie])

  return (
    <div className="flex flex-col gap-3">
      <VerwaltungKopf
        suche={suche}
        onSuche={setSuche}
        platzhalter="Im Speicher suchen"
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
                autoFocus={!editing}
                placeholder="sparziel-umzug"
                pattern="[a-z0-9\-]+"
                required
                className={cn('h-10', editing && 'opacity-60')}
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
              autoFocus={!!editing}
              placeholder="Ein Fakt pro Eintrag, in einem Satz."
              rows={3}
              required
            />
          </div>
        </FormKarte>
      )}

      {memories.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kategorie filtern">
          {[['all', 'Alle'], ...Object.entries(CATEGORY_LABELS)].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kategorie === value}
              onClick={() => setKategorie(value)}
              className={chipKlasse(kategorie === value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {memories.length === 0 && !showForm && (
        <LeerZustand
          icon={Brain}
          titel="Noch nichts gemerkt"
          text="Athena merkt sich Dinge, die im Gespräch wichtig werden, und füllt diese Liste von selbst. Du kannst Einträge auch von Hand anlegen."
          aktion={{ label: 'Mit Athena sprechen', href: '/assistant' }}
        />
      )}

      {memories.length > 0 && sichtbar.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Keine Treffer.</p>
      )}

      <ul className="flex flex-col gap-2">
        {sichtbar.map((memory) => (
          <li
            key={memory.id}
            className="group flex items-start gap-3 rounded-lg border border-border py-2 pl-3 pr-1 md:pr-2"
          >
            <span className="mt-2 flex">
              <Herkunft
                vonMensch={memory.source === 'user'}
                titel={memory.source === 'user' ? 'Von dir vorgegeben' : 'Von Athena gemerkt'}
                text={
                  memory.source === 'user'
                    ? 'Gilt als deine Vorgabe und wiegt für Athena schwerer.'
                    : 'Athena hat sich das im Gespräch selbst notiert.'
                }
              />
            </span>
            <div className="min-w-0 flex-1 py-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="break-all font-mono text-xs text-muted-foreground">{memory.key}</code>
                <span className={LABEL_KLASSE}>
                  {CATEGORY_LABELS[memory.category] ?? memory.category}
                </span>
              </div>
              <p className="mt-0.5 break-words text-sm">{memory.content}</p>
            </div>
            <EintragAktionen>
              <Button
                size="icon"
                variant="ghost"
                className={AKTION_KLASSE}
                aria-label="Bearbeiten"
                onClick={() => {
                  setCreating(false)
                  setError(null)
                  setEditing(memory)
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <ConfirmDialog
                title="Eintrag löschen?"
                description={`„${memory.key}" wird aus dem Speicher entfernt. Athena weiß das danach nicht mehr.`}
                onConfirm={() =>
                  startTransition(async () => {
                    await deleteMemory(memory.id)
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
          </li>
        ))}
      </ul>
    </div>
  )
}
