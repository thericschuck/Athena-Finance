'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Kopiert die IBAN (ohne Leerzeichen) in die Zwischenablage; das Häkchen verschwindet nach 1,5 s. */
export function IbanKopieren({ iban }: { iban: string }) {
  const [kopiert, setKopiert] = useState(false)

  useEffect(() => {
    if (!kopiert) return
    const id = setTimeout(() => setKopiert(false), 1500)
    return () => clearTimeout(id)
  }, [kopiert])

  return (
    <button
      type="button"
      aria-label={kopiert ? 'IBAN kopiert' : 'IBAN kopieren'}
      onClick={() => {
        // Ohne Berechtigung oder in unsicherem Kontext wirft die API — dann bleibt es still.
        navigator.clipboard?.writeText(iban.replace(/\s+/g, '')).then(() => setKopiert(true), () => {})
      }}
      // Trefferfläche 40 px, ohne die Zeile höher zu machen (negative Ränder).
      className="-my-2.5 -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground sm:-my-1.5 sm:size-8"
    >
      {kopiert ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  )
}
