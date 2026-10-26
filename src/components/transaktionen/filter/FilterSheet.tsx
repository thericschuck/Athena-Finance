'use client'

import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useUrlFilters } from '@/components/providers/url-filters'
import { parseBetragFilter } from '@/lib/transaktionen/import'
import {
  AuswahlFelder, STANDARD_SORT, betragAnzeige, istArt, istSort, istTyp,
  type AuswahlKey, type AuswahlWerte, type KategorieOption, type KontoOption,
} from './felder'

const LEER: AuswahlWerte = { type: '', art: '', account: '', category: '', min: '', max: '', sort: STANDARD_SORT }

/**
 * „Filter (n)“ am Handy: alle Auswahlfelder in einem Sheet von unten. Änderungen sind ein lokaler Entwurf;
 * „Anwenden“ schreibt alles in EINER Navigation. „Zurücksetzen“ leert die Felder im Entwurf (angewendet wird
 * erst mit „Anwenden“). Die Sortierung steht im Sheet, zählt aber nicht in n.
 */
export function FilterSheet({
  accounts, categories, anzahl,
}: {
  accounts: KontoOption[]
  categories: KategorieOption[]
  anzahl: number
}) {
  const filters = useUrlFilters()
  const [offen, setOffen] = useState(false)
  const [entwurf, setEntwurf] = useState<AuswahlWerte>(LEER)
  const [fehler, setFehler] = useState(false)

  function oeffnen(v: boolean) {
    if (v) {
      const typ = filters.get('type')
      const art = filters.get('art')
      const sort = filters.get('sort')
      setEntwurf({
        type: istTyp(typ) ? typ : '',
        art: istArt(art) ? art : '',
        account: filters.get('account') ?? '',
        category: filters.get('category') ?? '',
        min: betragAnzeige(filters.get('min') ?? ''),
        max: betragAnzeige(filters.get('max') ?? ''),
        sort: istSort(sort) ? sort : STANDARD_SORT,
      })
      setFehler(false)
    }
    setOffen(v)
  }

  function anwenden() {
    const min = parseBetragFilter(entwurf.min)
    const max = parseBetragFilter(entwurf.max)
    if (min === null || max === null) {
      setFehler(true)
      return
    }
    filters.setMany({
      type: entwurf.type || null,
      art: entwurf.art || null,
      account: entwurf.account || null,
      category: entwurf.category || null,
      min: min || null,
      max: max || null,
      sort: entwurf.sort === STANDARD_SORT ? null : entwurf.sort,
    })
    setOffen(false)
  }

  return (
    <Sheet open={offen} onOpenChange={oeffnen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`h-10 shrink-0 gap-1.5 px-3 text-sm ${anzahl > 0 ? 'border-primary text-primary' : ''}`}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filter{anzahl > 0 ? ` (${anzahl})` : ''}
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" showCloseButton={false} className="max-h-[88dvh] gap-0 rounded-t-xl">
        <SheetHeader className="flex-row items-start justify-between gap-2 border-b border-border pb-3">
          <div className="min-w-0">
            <SheetTitle>Filter</SheetTitle>
            <SheetDescription>Typ, Art, Konto, Kategorie, Betrag und Sortierung.</SheetDescription>
          </div>
          <SheetClose
            aria-label="Schließen"
            className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </SheetClose>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <AuswahlFelder
            className="flex flex-col gap-4"
            werte={entwurf}
            onAendern={(key: AuswahlKey, wert) => {
              setFehler(false)
              setEntwurf(prev => ({ ...prev, [key]: wert }))
            }}
            accounts={accounts}
            categories={categories}
            mitLabels
          />
          {fehler && <p className="mt-3 text-sm text-danger">Betrag bitte als Zahl eingeben, z. B. 12,50.</p>}
        </div>

        <SheetFooter className="flex-row gap-2 border-t border-border bg-background pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="outline" className="h-10 flex-1" onClick={() => { setEntwurf({ ...LEER, sort: entwurf.sort }); setFehler(false) }}>
            Zurücksetzen
          </Button>
          <Button type="button" className="h-10 flex-1" onClick={anwenden}>
            Anwenden
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
