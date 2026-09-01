'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ValuableForm } from './ValuableForm'
import { deleteValuable } from '@/app/(dashboard)/inventar/actions'
import type { ValuableWithImage } from '@/lib/valuables'

/**
 * Bearbeiten und Löschen. Alles rund um Bilder steckt in ValuableMedia — es sitzt oben am
 * Hauptbild, weil der Generierungszustand genau dort sichtbar werden muss.
 */
export function ValuableActions({ item }: { item: ValuableWithImage }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-2">
        <ValuableForm
          item={item}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="size-3.5" />
              Bearbeiten
            </Button>
          }
        />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger">
              <Trash2 className="size-3.5" />
              Löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>&bdquo;{item.name}&ldquo; löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Entfernt den Gegenstand samt Wertverlauf und allen Bildern endgültig. Wenn du
                das Stück verkauft hast, trag stattdessen im Bearbeiten-Dialog ein
                Verkaufsdatum ein — dann bleibt die Historie erhalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteValuable(item.id)
                    if (res.error) setFehler(res.error)
                    else router.refresh()
                  })
                }
                disabled={pending}
              >
                Endgültig löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {fehler && <p className="text-sm text-danger">{fehler}</p>}
    </div>
  )
}
