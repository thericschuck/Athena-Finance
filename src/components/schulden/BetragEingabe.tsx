'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { betragAusNutzereingabe, betragFuerFeld, kanonisch } from '@/lib/transaktionen/formular'

/**
 * Betragsfeld der Schulden-Formulare: der Mensch tippt deutsch („1.500“, „12,5“), die Action
 * bekommt den kanonischen Wert (eine Regel: betragAusNutzereingabe). Ungültiger Text wird
 * unverändert weitergegeben, damit die Action ihre Fehlermeldung zeigt.
 */
export function BetragEingabe({
  id, name, label, startwert, pflicht = false, platzhalter = '0,00', hinweis, onWert,
}: {
  id: string
  name: string
  label: string
  /** Startwert als Zahl (wird deutsch formatiert). */
  startwert?: number | null
  pflicht?: boolean
  platzhalter?: string
  hinweis?: string
  /** Gelesener Wert bei jeder Änderung (null = leer/ungültig). */
  onWert?: (wert: number | null) => void
}) {
  const [text, setText] = useState(startwert == null ? '' : betragFuerFeld(startwert))
  const n = betragAusNutzereingabe(text)
  const wert = text.trim() === '' ? '' : n === null ? text.trim() : kanonisch(n)

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}{pflicht ? ' *' : ''}</Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="h-10 text-base sm:text-sm"
        placeholder={platzhalter}
        value={text}
        onChange={e => { setText(e.target.value); onWert?.(betragAusNutzereingabe(e.target.value)) }}
        aria-invalid={text.trim() !== '' && n === null}
        required={pflicht}
      />
      <input type="hidden" name={name} value={wert} />
      {hinweis && <p className="text-xs text-muted-foreground">{hinweis}</p>}
    </div>
  )
}
