'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { CategorySuggestions } from '@/components/bank/category-suggestions'

/** Sammelfenster für Übernahmen, bevor die Seite neu gerendert wird (ms). */
const REFRESH_DEBOUNCE_MS = 600

/**
 * Kategorie-Vorschläge für frisch importierte Bankbuchungen — im Kopf von
 * Finance/Transaktionen.
 *
 * Hierher verschoben, weil es um Buchungen geht und nicht um Konten: die Vorschläge
 * schreiben `bank_transactions.category_id`, und die Liste, in der man das Ergebnis sieht,
 * ist genau diese Seite (sie liest `unified_transactions`).
 *
 * Der Refresh ist gesammelt: `onAccept` läuft pro Empfängergruppe, bei „Alle übernehmen"
 * also mehrfach in kurzer Folge. Ein `router.refresh()` je Aufruf würde die Serverabfrage
 * für die ganze Buchungsliste ein Dutzend Mal auslösen. Der Timer wartet, bis die Klicks
 * durch sind, und rendert dann einmal neu.
 */
export function CategorySuggestionsPanel() {
  const router = useRouter()
  const { categories, loadCategories, updateCategory } = useBankData()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Beim Verlassen der Seite einen noch offenen Timer wegräumen — sonst läuft ein Refresh
  // auf eine Route, die es nicht mehr gibt.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const accept = useCallback(
    async (id: string, categoryId: string) => {
      await updateCategory(id, categoryId)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS)
    },
    [updateCategory, router],
  )

  return <CategorySuggestions categories={categories} onAccept={accept} />
}
