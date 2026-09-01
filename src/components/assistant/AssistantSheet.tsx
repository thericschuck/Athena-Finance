'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Chat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { Maximize2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { AthenaAvatar } from '@/components/assistant/AthenaAvatar'
import { AVOID_SELECTOR, useAvoidOverlap } from '@/lib/hooks/use-avoid-overlap'
import { AthenaChat, erzeugeChat } from '@/components/assistant/AthenaChat'
import { SessionPicker } from '@/components/assistant/SessionPicker'
import type { PendingActionStatus } from '@/components/assistant/PendingActionCard'
import { loadConversation } from '@/app/(dashboard)/assistant/actions'

/** Was im Sheet gerade offen ist: eine Chat-Instanz plus der Vorschlagszustand dazu. */
type Sitzung = {
  chat: Chat<UIMessage>
  actionStatuses?: Record<string, PendingActionStatus>
  actionResults?: Record<string, unknown>
}

/**
 * Athena als Schnellzugriff von jeder Seite aus.
 *
 * Der Chat lebt HIER und nicht im Sheet-Inhalt. Radix hängt den Dialog-Inhalt beim Schließen
 * aus, und solange der Zustand darin lag, war jedes Öffnen ein leerer Chat — man hat eine
 * Frage gestellt, das Sheet zugeklappt, um etwas nachzusehen, und die Unterhaltung war weg.
 * Die Instanz eine Ebene höher überlebt Schließen und Öffnen und stirbt erst beim Neuladen
 * der Seite. Ein laufender Stream läuft dabei weiter, auch wenn nichts davon zu sehen ist.
 *
 * Bis zum Neuladen gilt auch: das Sheet hängt im Dashboard-Layout, also bleibt der Chat über
 * Seitenwechsel innerhalb des Dashboards hinweg derselbe. Nur `/assistant` hängt es aus
 * (siehe app-shell) — dort übernimmt die volle Seite, und die liest den Verlauf aus der DB.
 *
 * Session-Liste ist bewusst kein Seitenbaum wie auf der vollen Seite, sondern ein Umschalter
 * im Kopf: das Sheet ist schmal, und Umbenennen, Anheften und Löschen haben dort ohnehin
 * mehr Platz.
 */
export function AssistantSheet() {
  const [open, setOpen] = useState(false)
  const [sitzung, setSitzung] = useState<Sitzung>(() => ({ chat: erzeugeChat() }))
  const [wechselt, setWechselt] = useState(false)

  // Der Knopf weicht nach oben aus, wenn unter ihm etwas liegt, das anklickbar bleiben muss
  // (Blätterleisten markieren sich dafür selbst). Vorher deckte er auf der Transaktions-
  // seite „Weiter" und „Letzte Seite" ab — der Klick landete auf Athena statt auf dem Knopf
  // darunter, und das sah aus, als würde das Blättern nicht funktionieren.
  const { ref: schwebeRef, lift } = useAvoidOverlap<HTMLDivElement>(AVOID_SELECTOR)

  async function wechsle(id: string) {
    if (id === sitzung.chat.id) return
    setWechselt(true)
    try {
      const zustand = await loadConversation(id)
      setSitzung({
        chat: erzeugeChat(id, zustand.messages),
        actionStatuses: zustand.actionStatuses,
        actionResults: zustand.actionResults,
      })
    } finally {
      setWechselt(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Die Positionierung liegt auf dem Rahmen, nicht auf dem Knopf: die Anhebung ist
          ein `translateY`, und der Knopf braucht seine eigene transform-Klasse für den
          Hover-Effekt. Beide auf demselben Element würden sich gegenseitig überschreiben —
          ein Inline-Style schlägt jede Utility-Klasse. */}
      <div
        ref={schwebeRef}
        style={{ transform: lift ? `translateY(-${lift}px)` : undefined }}
        className="fixed bottom-5 right-5 z-40 transition-transform duration-300 ease-out"
      >
        <SheetTrigger asChild>
          {/* Der Auslöser zeigt Athena selbst statt eines generischen
              Funkel-Icons — dasselbe Gesicht wie an jeder ihrer Antworten, damit
              der Knopf nicht nach „irgendeine KI" aussieht. `p-0`, weil das
              Medaillon die Fläche ganz ausfüllen soll. */}
          <Button
            size="icon-lg"
            variant="outline"
            className="overflow-hidden rounded-full p-0 shadow-lg transition-transform hover:scale-105"
            aria-label="Athena öffnen"
          >
            <AthenaAvatar size={40} />
          </Button>
        </SheetTrigger>
      </div>

      {/* `showCloseButton={false}`: das eingebaute X sitzt absolut auf `top-4 right-4` und lag
          damit genau auf dem Vergrößern-Knopf. Statt beide gegeneinander zu verschieben, wird
          das X hier als normales Element in die Knopfreihe eingehängt — dann kann keiner der
          Knöpfe je über einem anderen liegen. */}
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3">
          <SheetTitle className="flex min-w-0 items-center gap-2">
            <AthenaAvatar size={22} />
            <span className="truncate">Athena</span>
          </SheetTitle>

          <div className="flex shrink-0 items-center gap-0.5">
            <SessionPicker activeId={sitzung.chat.id} onPick={wechsle} wechselt={wechselt} />

            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Neuer Chat"
              onClick={() => setSitzung({ chat: erzeugeChat() })}
            >
              <Plus className="size-3.5" />
            </Button>

            {/* Die offene Session wandert mit auf die volle Seite. Existiert die Zeile noch
                nicht — frischer Chat, nichts gesendet —, ist das kein Problem: die Seite
                zeigt dann einen leeren Chat unter derselben ID, und die Route legt die Zeile
                beim ersten Senden an. Nur ein Stream, der beim Klick noch läuft, geht
                verloren; gespeichert wird er erst am Ende des Zugs. */}
            <Button asChild size="icon-xs" variant="ghost" aria-label="Als volle Seite öffnen">
              <Link href={`/assistant?s=${sitzung.chat.id}`} onClick={() => setOpen(false)}>
                <Maximize2 className="size-3.5" />
              </Link>
            </Button>

            <SheetClose asChild>
              <Button size="icon-xs" variant="ghost" aria-label="Schließen">
                <X className="size-3.5" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        {/* Der Key auf der Chat-ID: beim Wechsel der Session soll der Chat mit der neuen
            Instanz frisch mounten. Der Verlauf liegt in der Instanz, ein Mount kostet also
            nichts. */}
        <AthenaChat
          key={sitzung.chat.id}
          chat={sitzung.chat}
          actionStatuses={sitzung.actionStatuses}
          actionResults={sitzung.actionResults}
          className="flex-1"
        />
      </SheetContent>
    </Sheet>
  )
}
