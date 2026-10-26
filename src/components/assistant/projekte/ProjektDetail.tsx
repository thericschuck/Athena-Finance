'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, MessageSquare, Pencil, Pin, PinOff, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  aktualisiereProjekt,
  loescheProjekt,
  projektAnheften,
} from '@/app/(dashboard)/assistant/projekt-actions'
import {
  PROJEKT_ANWEISUNGEN_MAX,
  PROJEKT_NAME_MAX,
  type ProjektDetail as ProjektDetailDaten,
} from '@/lib/assistant/projekte'
import { relativeDay, type SessionSummary } from '@/lib/assistant/sessions'
import { ProjektDateien } from '@/components/assistant/projekte/ProjektDateien'

type Tab = 'anweisungen' | 'dateien' | 'chats'

const ZAHL = new Intl.NumberFormat('de-DE')

export function ProjektDetail({
  projekt,
  chats,
}: {
  projekt: ProjektDetailDaten
  chats: SessionSummary[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('anweisungen')
  const [nameBearbeiten, setNameBearbeiten] = useState(false)
  const [nameEntwurf, setNameEntwurf] = useState(projekt.name)
  const [anweisungen, setAnweisungen] = useState(projekt.instructions)
  const [gespeichert, setGespeichert] = useState(projekt.instructions)
  const [meldung, setMeldung] = useState<{ art: 'fehler' | 'ok'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const tabs: { id: Tab; label: string }[] = [
    { id: 'anweisungen', label: 'Anweisungen' },
    { id: 'dateien', label: `Dateien (${projekt.dateien.length})` },
    { id: 'chats', label: `Chats (${chats.length})` },
  ]

  function speichereName() {
    const name = nameEntwurf.trim()
    setNameBearbeiten(false)
    if (!name || name === projekt.name) {
      setNameEntwurf(projekt.name)
      return
    }
    setMeldung(null)
    startTransition(async () => {
      const res = await aktualisiereProjekt(projekt.id, { name })
      if (res && 'error' in res) {
        setNameEntwurf(projekt.name)
        setMeldung({ art: 'fehler', text: res.error })
      } else router.refresh()
    })
  }

  function speichereAnweisungen() {
    setMeldung(null)
    startTransition(async () => {
      const res = await aktualisiereProjekt(projekt.id, { anweisungen })
      if (res && 'error' in res) setMeldung({ art: 'fehler', text: res.error })
      else {
        setGespeichert(anweisungen)
        setMeldung({ art: 'ok', text: 'Gespeichert' })
        router.refresh()
      }
    })
  }

  function anheften() {
    setMeldung(null)
    startTransition(async () => {
      const res = await projektAnheften(projekt.id, !projekt.pinned)
      if (res && 'error' in res) setMeldung({ art: 'fehler', text: res.error })
      else router.refresh()
    })
  }

  function loeschen() {
    setMeldung(null)
    startTransition(async () => {
      const res = await loescheProjekt(projekt.id)
      if (res && 'error' in res) setMeldung({ art: 'fehler', text: res.error })
      else router.push('/assistant/projekte')
    })
  }

  const geaendert = anweisungen !== gespeichert

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Link
          href="/assistant/projekte"
          aria-label="Zurück zu den Projekten"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>

        {nameBearbeiten ? (
          <>
            <Input
              autoFocus
              value={nameEntwurf}
              maxLength={PROJEKT_NAME_MAX}
              aria-label="Projektname"
              onChange={(e) => setNameEntwurf(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') speichereName()
                if (e.key === 'Escape') {
                  setNameBearbeiten(false)
                  setNameEntwurf(projekt.name)
                }
              }}
              className="h-10 min-w-0 flex-1 text-base sm:text-sm"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-10 shrink-0"
              aria-label="Name speichern"
              onClick={speichereName}
            >
              <Check className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-10 shrink-0"
              aria-label="Abbrechen"
              onClick={() => {
                setNameBearbeiten(false)
                setNameEntwurf(projekt.name)
              }}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{projekt.name}</h2>
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-10 shrink-0"
              aria-label="Umbenennen"
              onClick={() => {
                setNameEntwurf(projekt.name)
                setNameBearbeiten(true)
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-10 shrink-0"
              aria-label={projekt.pinned ? 'Loslösen' : 'Anheften'}
              disabled={isPending}
              onClick={anheften}
            >
              {projekt.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </Button>
            <ConfirmDialog
              title="Projekt löschen?"
              description={`„${projekt.name}“ wird gelöscht. Die Chats bleiben erhalten und werden zu allgemeinen Chats, die Dateien des Projekts werden gelöscht. Das lässt sich nicht zurückholen.`}
              onConfirm={loeschen}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-10 shrink-0"
                aria-label="Projekt löschen"
                disabled={isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            </ConfirmDialog>
          </>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Projektbereiche"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`projekt-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`projekt-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
              tab === t.id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {meldung && (
        <p
          role={meldung.art === 'fehler' ? 'alert' : 'status'}
          className={cn('text-sm', meldung.art === 'fehler' ? 'text-destructive' : 'text-muted-foreground')}
        >
          {meldung.text}
        </p>
      )}

      {tab === 'anweisungen' && (
        <div
          role="tabpanel"
          id="projekt-panel-anweisungen"
          aria-labelledby="projekt-tab-anweisungen"
          className="flex flex-col gap-2"
        >
          <p className="text-sm text-muted-foreground">
            Gelten in jedem Chat dieses Projekts, zusätzlich zu deinen allgemeinen Anweisungen. Gut für
            Rolle, Ton, Fachbegriffe und feste Regeln.
          </p>
          <Textarea
            value={anweisungen}
            onChange={(e) => {
              setAnweisungen(e.target.value)
              setMeldung(null)
            }}
            maxLength={PROJEKT_ANWEISUNGEN_MAX}
            aria-label="Projektanweisungen"
            placeholder="z. B. Du unterstützt mich bei … Antworte immer …"
            className="min-h-48 text-base sm:text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {ZAHL.format(anweisungen.length)} / {ZAHL.format(PROJEKT_ANWEISUNGEN_MAX)}
            </span>
            <Button
              className="h-10 sm:h-8"
              disabled={isPending || !geaendert}
              onClick={speichereAnweisungen}
            >
              {isPending ? 'Speichere…' : 'Speichern'}
            </Button>
          </div>
        </div>
      )}

      {tab === 'dateien' && (
        <div role="tabpanel" id="projekt-panel-dateien" aria-labelledby="projekt-tab-dateien">
          <ProjektDateien
            projectId={projekt.id}
            dateien={projekt.dateien}
            auszugGesamt={projekt.auszugGesamt}
          />
        </div>
      )}

      {tab === 'chats' && (
        <div
          role="tabpanel"
          id="projekt-panel-chats"
          aria-labelledby="projekt-tab-chats"
          className="flex flex-col gap-3"
        >
          <Button
            className="h-11 w-full sm:h-10 sm:w-fit"
            onClick={() =>
              // Frische UUID pro Klick: jede Navigation ist ein neues Ziel (siehe SessionLeiste).
              router.push(`/assistant?s=${crypto.randomUUID()}&p=${projekt.id}`)
            }
          >
            <Plus className="size-4" />
            Neuer Chat im Projekt
          </Button>

          {chats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Noch keine Chats in diesem Projekt.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/assistant?s=${c.id}`}
                    className="flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    {c.pinned ? (
                      <Pin aria-label="Angeheftet" className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <MessageSquare aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm">{c.title ?? 'Ohne Titel'}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {relativeDay(c.updatedAt)} · {c.messageCount} Nachr.
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
