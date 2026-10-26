'use client'

import { useState } from 'react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { Database } from '@/types/database'
import { AktiveFilter } from '@/components/transaktionen/filter/AktiveFilter'
import { FilterSheet } from '@/components/transaktionen/filter/FilterSheet'
import { SuchFeld } from '@/components/transaktionen/filter/SuchFeld'
import { ZeitraumChips } from '@/components/transaktionen/filter/ZeitraumChips'
import {
  AUSWAHL_FILTER_KEYS, AuswahlFelder, STANDARD_SORT, istArt, istSort, istTyp,
  type AuswahlKey, type AuswahlWerte,
} from '@/components/transaktionen/filter/felder'

type Account = Pick<Database['public']['Tables']['accounts']['Row'], 'id' | 'name' | 'color'>
type Category = Pick<Database['public']['Tables']['categories']['Row'], 'id' | 'name' | 'parent_id'>

interface TransactionFiltersProps {
  accounts: Account[]
  categories: Category[]
  /** Berliner Datum (YYYY-MM-DD), Bezug der Zeitraum-Voreinstellungen. */
  heute: string
}

/**
 * Filterleiste der Transaktionen. Muss in einem `<UrlFiltersProvider replace resetKeys="page">` stehen.
 *
 * Desktop: Zeile 1 Suche + Zeitraum-Chips, Zeile 2 die Auswahlfelder (wirken sofort).
 * Handy: Suche + „Filter (n)“, darunter die scrollbare Chip-Reihe; die Auswahlfelder liegen im Sheet.
 * Darunter die aktiven Filter als Chips. Jede Änderung ist genau eine Server-Navigation.
 */
export function TransactionFilters({ accounts, categories, heute }: TransactionFiltersProps) {
  const filters = useUrlFilters()
  // Beim Zurücksetzen das Suchfeld neu aufbauen: ein noch wartender Tippentwurf soll nicht danach
  // doch noch die Suche setzen.
  const [suchNr, setSuchNr] = useState(0)

  const typ = filters.get('type')
  const art = filters.get('art')
  const sort = filters.get('sort')
  const werte: AuswahlWerte = {
    type: istTyp(typ) ? typ : '',
    art: istArt(art) ? art : '',
    account: filters.get('account') ?? '',
    category: filters.get('category') ?? '',
    min: filters.get('min') ?? '',
    max: filters.get('max') ?? '',
    sort: istSort(sort) ? sort : STANDARD_SORT,
  }
  const anzahl = AUSWAHL_FILTER_KEYS.filter(k => Boolean(filters.get(k))).length

  function aendern(key: AuswahlKey, wert: string) {
    if (key === 'sort') filters.set('sort', wert === STANDARD_SORT ? null : wert)
    else filters.set(key, wert || null)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="flex items-center gap-2 md:contents">
          <SuchFeld key={suchNr} className="flex-1 md:w-64 md:flex-none" />
          <div className="md:hidden">
            <FilterSheet accounts={accounts} categories={categories} anzahl={anzahl} />
          </div>
        </div>
        <ZeitraumChips heute={heute} className="md:min-w-0 md:flex-1" />
      </div>

      <AuswahlFelder
        className="hidden flex-wrap items-center gap-2 md:flex"
        werte={werte}
        onAendern={aendern}
        accounts={accounts}
        categories={categories}
        betragVerzoegert
      />

      <AktiveFilter accounts={accounts} categories={categories} heute={heute} onAlleZuruecksetzen={() => setSuchNr(n => n + 1)} />
    </div>
  )
}
