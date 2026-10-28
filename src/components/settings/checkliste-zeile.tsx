'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { zeigeChecklisteWieder } from '@/app/(dashboard)/dashboard/checkliste-actions'
import { Button } from '@/components/ui/button'
import { CHECKLISTE_KEY, checklisteFlag } from '@/lib/leer/erste-schritte'
import type { SettingsMap } from '@/lib/settings'

/** Zeile in Einstellungen -> Darstellung: nur sichtbar, wenn die Checkliste ausgeblendet oder fertig ist. */
export function ChecklisteZeile({ initialSettings }: { initialSettings: SettingsMap }) {
  const [flag, setFlag] = useState(checklisteFlag(initialSettings[CHECKLISTE_KEY]))
  const [pending, start] = useTransition()
  if (!flag) return null

  const wieder = () => start(async () => {
    const r = await zeigeChecklisteWieder()
    if ('error' in r) { toast.error(r.error); return }
    setFlag(null)
    toast.success('Die Checkliste erscheint wieder im Dashboard.')
  })

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Checkliste Erste Schritte wieder anzeigen</p>
        <p className="text-xs text-muted-foreground">
          {flag === 'fertig' ? 'Alle Schritte sind erledigt.' : 'Du hast sie im Dashboard ausgeblendet.'}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={wieder} disabled={pending}>
        {pending ? 'Einen Moment…' : 'Anzeigen'}
      </Button>
    </div>
  )
}
