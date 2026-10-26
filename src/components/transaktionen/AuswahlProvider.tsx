'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { seiteUmschalten, type AuswahlMap, type AuswahlZeile, type Quelle } from './auswahl'

/**
 * Auswahlmodus der Transaktionen-Liste (Sammelaktionen). Liegt als Kontext um Kopf UND Liste, weil
 * der Knopf „Auswählen“ im Kopf sitzt und die Kästchen in den Zeilen. Die Auswahl hält Zeilen-ID und
 * Quelle (Bank/manuell) und wird verworfen, sobald sich die Adresse ändert (Seite, Filter, Sortierung);
 * `router.refresh()` ändert sie nicht, deshalb leert die Sammelleiste nach einer Aktion selbst.
 */

interface AuswahlKontext {
  modus: boolean
  auswahl: AuswahlMap
  umschaltenModus: () => void
  beenden: () => void
  leeren: () => void
  umschalten: (z: AuswahlZeile) => void
  seiteUmschalten: (zeilen: readonly AuswahlZeile[]) => void
}

const Kontext = createContext<AuswahlKontext | null>(null)

export function AuswahlProvider({ children }: { children: React.ReactNode }) {
  const query = useSearchParams().toString()
  const [stand, setStand] = useState(query)
  const [modus, setModus] = useState(false)
  const [auswahl, setAuswahl] = useState<Map<string, Quelle>>(new Map())

  // Adresse geändert -> Auswahl verwerfen (Zeilen der neuen Seite sind andere). Während des Renderns
  // angepasst statt im Effekt, damit nie ein Frame mit veralteter Auswahl entsteht.
  if (stand !== query) {
    setStand(query)
    setAuswahl(new Map())
  }

  const leeren = useCallback(() => setAuswahl(new Map()), [])
  const beenden = useCallback(() => {
    setModus(false)
    setAuswahl(new Map())
  }, [])
  const umschaltenModus = useCallback(() => {
    setModus(m => !m)
    setAuswahl(new Map())
  }, [])
  const umschalten = useCallback((z: AuswahlZeile) => {
    setAuswahl(alt => {
      const neu = new Map(alt)
      if (neu.has(z.id)) neu.delete(z.id)
      else neu.set(z.id, z.source)
      return neu
    })
  }, [])
  const seite = useCallback((zeilen: readonly AuswahlZeile[]) => {
    setAuswahl(alt => seiteUmschalten(alt, zeilen))
  }, [])

  const wert = useMemo<AuswahlKontext>(
    () => ({ modus, auswahl, umschaltenModus, beenden, leeren, umschalten, seiteUmschalten: seite }),
    [modus, auswahl, umschaltenModus, beenden, leeren, umschalten, seite],
  )
  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>
}

export function useAuswahl(): AuswahlKontext {
  const k = useContext(Kontext)
  if (!k) throw new Error('useAuswahl braucht einen <AuswahlProvider>')
  return k
}

/** Knopf im Kopf: schaltet den Auswahlmodus ein und aus. */
export function AuswahlKnopf({ className }: { className?: string }) {
  const { modus, umschaltenModus } = useAuswahl()
  return (
    <Button
      type="button"
      variant={modus ? 'secondary' : 'outline'}
      size="sm"
      className={className}
      aria-pressed={modus}
      onClick={umschaltenModus}
    >
      {modus ? <X className="size-3.5" aria-hidden /> : <CheckSquare className="size-3.5" aria-hidden />}
      {modus ? 'Fertig' : 'Auswählen'}
    </Button>
  )
}
