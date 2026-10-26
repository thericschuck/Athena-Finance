'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { erstelleProjekt } from '@/app/(dashboard)/assistant/projekt-actions'
import { PROJEKT_ANWEISUNGEN_MAX, PROJEKT_NAME_MAX } from '@/lib/assistant/projekte'

/** Eine Zeile mit „Neues Projekt“; ein Klick klappt das Formular direkt darunter auf. */
export function NeuesProjekt() {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [name, setName] = useState('')
  const [anweisungen, setAnweisungen] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function anlegen(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)
    startTransition(async () => {
      const res = await erstelleProjekt(name, anweisungen)
      if (res && 'error' in res) {
        setFehler(res.error)
        return
      }
      const id = res && 'success' in res ? res.result?.id : undefined
      if (typeof id === 'string') router.push(`/assistant/projekte/${id}`)
    })
  }

  if (!offen) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <p className="min-w-0 truncate text-sm text-muted-foreground">Chats mit gemeinsamem Kontext</p>
        <Button size="sm" className="h-10 shrink-0 sm:h-8" onClick={() => setOffen(true)}>
          <Plus className="size-4" />
          Neues Projekt
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={anlegen} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={PROJEKT_NAME_MAX}
        placeholder="Name des Projekts"
        aria-label="Name des Projekts"
        className="h-10 text-base sm:text-sm"
      />
      <Textarea
        value={anweisungen}
        onChange={(e) => setAnweisungen(e.target.value)}
        maxLength={PROJEKT_ANWEISUNGEN_MAX}
        placeholder="Anweisungen (optional) — z. B. Rolle, Ton, Regeln für alle Chats im Projekt"
        aria-label="Anweisungen"
        className="min-h-24 text-base sm:text-sm"
      />
      {fehler && (
        <p role="alert" className="text-sm text-destructive">
          {fehler}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-10 sm:h-8"
          disabled={isPending}
          onClick={() => {
            setOffen(false)
            setFehler(null)
          }}
        >
          Abbrechen
        </Button>
        <Button type="submit" className="h-10 sm:h-8" disabled={isPending || !name.trim()}>
          {isPending ? 'Lege an…' : 'Anlegen'}
        </Button>
      </div>
    </form>
  )
}
