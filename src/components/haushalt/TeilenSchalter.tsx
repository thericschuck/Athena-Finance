'use client'

import { useCanShare } from '@/components/providers/haushalt-context'

/**
 * Schalter „Mit Haushalt teilen“ (bzw. „Geteiltes Konto“) fuer Formulare. Nur sichtbar, wenn der Haushalt mehr als ein
 * Mitglied hat. Das versteckte Feld `shared_form` zeigt der Server Action, dass der Schalter im Formular stand: ein
 * nicht angehakter Haken wird sonst gar nicht gesendet und liesse sich nicht von „Schalter nicht vorhanden“ trennen.
 */
export function TeilenSchalter({
  defaultChecked = false,
  unbekannt = false,
  label = 'Mit Haushalt teilen',
  hinweis = 'Alle Mitglieder deines Haushalts sehen und bearbeiten den Eintrag.',
}: {
  defaultChecked?: boolean
  /** Beim Bearbeiten, wenn der aktuelle Stand nicht geladen wurde: Schalter weglassen, damit nichts versehentlich zurueckgesetzt wird. */
  unbekannt?: boolean
  label?: string
  hinweis?: string
}) {
  const canShare = useCanShare()
  if (!canShare || unbekannt) return null
  return (
    <label className="flex min-h-10 cursor-pointer items-start gap-2.5 text-sm">
      <input type="hidden" name="shared_form" value="1" />
      <input
        type="checkbox"
        name="shared"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        {label}
        {hinweis && <span className="block text-xs text-muted-foreground">{hinweis}</span>}
      </span>
    </label>
  )
}
