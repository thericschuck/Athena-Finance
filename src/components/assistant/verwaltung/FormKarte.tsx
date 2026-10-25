'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Formular-Karte direkt unter der Kopfleiste. Scrollt beim Einblenden in Sicht (der Aufrufer setzt
 * `key` je Eintrag, damit das auch beim Wechsel zwischen zwei Einträgen passiert). Das erste Feld
 * bekommt `autoFocus` vom Aufrufer.
 */
export function FormKarte({
  action,
  fehler,
  pending,
  onAbbrechen,
  children,
}: {
  action: (formData: FormData) => void
  fehler: string | null
  pending: boolean
  onAbbrechen: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  return (
    <form ref={ref} action={action} className="scroll-mt-2 rounded-lg border border-border p-4">
      {children}
      {fehler && <p className="mt-2 text-sm text-destructive">{fehler}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" className="h-10" disabled={pending}>
          Speichern
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </div>
    </form>
  )
}
