'use client'

import { useState } from 'react'
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
import { cn } from '@/lib/utils'

/**
 * Bestätigung für eine nicht umkehrbare Aktion — als Ersatz für `confirm()`.
 *
 * Warum überhaupt: das native Fenster steht außerhalb der App, trägt das
 * Betriebssystem-Design mitten in ein durchgestaltetes Interface, lässt sich
 * nicht beschriften („OK" statt „Löschen") und blockiert den Haupt-Thread. In
 * Chrome kommt bei wiederholten Aufrufen zusätzlich ein „Dialoge dieser Seite
 * unterdrücken"-Häkchen dazu, mit dem eine Bestätigung stillschweigend
 * verschwinden kann.
 *
 * Die Kinder sind der Auslöser: die Komponente umschließt den eigenen Button
 * und ruft `onConfirm` erst nach der Bestätigung. Damit bleibt der Aufruf so
 * knapp wie vorher — kein zweiter State pro Löschknopf im aufrufenden Bauteil.
 *
 * `asChild` am Trigger gibt es hier absichtlich NICHT: Radix' Trigger würde
 * dann den eigenen Button klonen und dessen `onClick` überschreiben. Stattdessen
 * ein eigener Wrapper, der den Klick abfängt.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Löschen',
  cancelLabel = 'Abbrechen',
  destructive = true,
  onConfirm,
  children,
  className,
}: {
  title: string
  /** Was genau passiert — und ob es rückholbar ist. */
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** Färbt die Bestätigung rot. Aus für harmlose Rückfragen. */
  destructive?: boolean
  onConfirm: () => void
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* `contents` statt eines echten Kastens: der Wrapper darf das Layout des
          umgebenden Button-Reihe nicht verändern. */}
      <span
        className={cn('contents', className)}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {children}
      </span>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              className={cn(
                destructive &&
                  'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40',
              )}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
