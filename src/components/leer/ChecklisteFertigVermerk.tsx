'use client'

import { useEffect } from 'react'
import { vermerkeChecklisteFertig } from '@/app/(dashboard)/dashboard/checkliste-actions'

/**
 * Rendert nichts. Stoesst nach dem Anzeigen einmal die Server Action an, die 'fertig' vermerkt (der Server prueft
 * selbst nach). `after()` geht hier nicht: in Server Components darf es keine cookies()/Session nutzen.
 * Fehler werden verschluckt: die Seite darf daran nie brechen, beim naechsten Besuch klappt es eben dann.
 */
export function ChecklisteFertigVermerk() {
  useEffect(() => { void vermerkeChecklisteFertig().catch(() => {}) }, [])
  return null
}
