'use client'

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ArrowUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sortiereKonten } from '@/app/(dashboard)/finance/accounts/actions'

/**
 * Sortiermodus der Konten-Liste. Der Knopf „Reihenfolge“ steht in der Kopfzeile, die Liste weiter
 * unten, deshalb teilen sie sich diesen Context (die Kinder bleiben Server-Komponenten).
 *
 * `gruppen` ist die aktuelle Server-Reihenfolge je Gruppe (Konto-IDs). Im Sortiermodus wird sie
 * lokal getauscht; „Fertig“ schreibt sort_order = Index über alle Gruppen (Reihenfolge der Gruppen
 * selbst bleibt fix, innerhalb einer Gruppe zählt die neue Reihenfolge).
 */
interface Sortierung {
  aktiv: boolean
  /** Reihenfolge einer Gruppe (lokal, im Sortiermodus; sonst die vom Server). */
  idsVon: (gruppe: string) => string[]
  verschiebe: (gruppe: string, id: string, richtung: -1 | 1) => void
  starten: () => void
  abbrechen: () => void
  fertig: () => void
  laeuft: boolean
  fehler: string | null
}

const Ctx = createContext<Sortierung | null>(null)

export function useKontenSortierung(): Sortierung {
  const c = useContext(Ctx)
  if (!c) throw new Error('useKontenSortierung braucht <KontenSortierungProvider>')
  return c
}

export function KontenSortierungProvider({
  gruppen, children,
}: {
  gruppen: Record<string, string[]>
  children: React.ReactNode
}) {
  const router = useRouter()
  const [lokal, setLokal] = useState<Record<string, string[]> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, start] = useTransition()

  const idsVon = useCallback((g: string) => (lokal ?? gruppen)[g] ?? [], [lokal, gruppen])

  const verschiebe = useCallback((g: string, id: string, richtung: -1 | 1) => {
    setLokal((alt) => {
      if (!alt) return alt
      const ids = [...(alt[g] ?? [])]
      const i = ids.indexOf(id)
      const j = i + richtung
      if (i < 0 || j < 0 || j >= ids.length) return alt
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      return { ...alt, [g]: ids }
    })
  }, [])

  const wert = useMemo<Sortierung>(() => ({
    aktiv: lokal !== null,
    idsVon,
    verschiebe,
    laeuft,
    fehler,
    starten: () => { setFehler(null); setLokal(Object.fromEntries(Object.entries(gruppen).map(([k, v]) => [k, [...v]]))) },
    abbrechen: () => { setLokal(null); setFehler(null) },
    fertig: () => {
      if (!lokal) return
      const ids = Object.keys(gruppen).flatMap((k) => lokal[k] ?? [])
      start(async () => {
        const r = await sortiereKonten(ids)
        if (r.error) setFehler(r.error)
        else {
          setLokal(null)
          router.refresh()
        }
      })
    },
  }), [lokal, gruppen, idsVon, verschiebe, laeuft, fehler, router])

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>
}

/** Knopf der Kopfzeile: „Reihenfolge“ → im Sortiermodus „Fertig“ plus Abbrechen. */
export function ReihenfolgeKnopf() {
  const s = useKontenSortierung()
  if (!s.aktiv) {
    return (
      <Button variant="outline" size="sm" className="h-10 gap-1.5 sm:h-8" onClick={s.starten}>
        <ArrowUpDown className="size-3.5" aria-hidden />
        Reihenfolge
      </Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" className="h-10 gap-1.5 sm:h-8" onClick={s.fertig} disabled={s.laeuft}>
        <Check className="size-3.5" aria-hidden />
        {s.laeuft ? 'Speichert…' : 'Fertig'}
      </Button>
      <Button variant="outline" size="icon" className="size-10 sm:size-8" onClick={s.abbrechen} disabled={s.laeuft} aria-label="Abbrechen">
        <X className="size-4" aria-hidden />
      </Button>
    </span>
  )
}

/** Fehlermeldung des Speicherns (unter der Kopfzeile). */
export function SortierFehler() {
  const s = useKontenSortierung()
  return s.fehler ? <p className="text-sm text-destructive" role="alert">{s.fehler}</p> : null
}
