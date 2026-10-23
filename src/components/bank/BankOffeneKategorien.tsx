'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategorySuggestions } from '@/components/bank/category-suggestions'
import { useUrlFilters } from '@/components/providers/url-filters'
import { normIban } from '@/lib/bank/scope'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Schmale Hinweiszeile „N Buchungen ohne Kategorie" — nur sichtbar, wenn es welche gibt.
 * Eine Zeile statt Karte mit Beispielen: die Seite ist lang genug, und die Beispiele stehen
 * nach „Anzeigen" ohnehin in der Buchungsliste.
 *
 * Gezaehlt wird ueber ALLE Buchungen (nicht nur Zeitraum/Konto): eine unkategorisierte Buchung
 * bleibt offen, egal welcher Filter gerade gesetzt ist. Umbuchungen zwischen eigenen Konten
 * (Gegen-IBAN gehoert dem Nutzer) zaehlen nicht — sie brauchen keine Kategorie, die
 * Auswertung rechnet sie ohnehin heraus (gleiche Regel wie fints/categorize.ts).
 *
 * Vorschlaege: bestehendes Panel (Regeln, Gelerntes, KI) als Seitenfenster UEBER dem Inhalt;
 * es laedt erst beim Oeffnen ueber /api/bank/transactions/suggest-categories. Uebernommene
 * Vorschlaege werden per PATCH gespeichert; danach laedt die Seite einmal neu (gebuendelt,
 * ein Sammelklick schickt viele Antworten), damit die Zahl schrumpft.
 *
 * Hoehe, Radius und Schrift passen zu BankDatenzustand (beide stehen direkt untereinander).
 */
export function BankOffeneKategorien({ daten }: BankAbschnittProps) {
  const { get, set } = useUrlFilters()
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const offene = useMemo(() => {
    const eigene = new Set(daten.eigeneIbans)
    return daten.transactions
      .filter(t => !t.category_id && !(t.counterpart_iban && eigene.has(normIban(t.counterpart_iban))))
      .sort((a, b) => b.value_date.localeCompare(a.value_date))
  }, [daten.transactions, daten.eigeneIbans])

  if (offene.length === 0) return null

  const filterAktiv = get('kat') === 'offen'

  const uebernehmen = async (id: string, categoryId: string) => {
    const res = await fetch(`/api/bank/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId }),
    })
    if (!res.ok) throw new Error('Kategorie konnte nicht gespeichert werden')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => router.refresh(), 600)
  }

  const anzeigen = () => {
    if (filterAktiv) { set('kat', null); return }
    set('kat', 'offen')
    // Die Liste steht weiter unten; der Filter rendert serverseitig neu, der Anker bleibt stehen.
    setTimeout(() => document.getElementById('bank-buchungen-titel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250)
  }

  return (
    <section
      aria-label="Buchungen ohne Kategorie"
      className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1 text-xs sm:text-[13px]"
    >
      <Tags className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate font-medium">
        {offene.length} {offene.length === 1 ? 'Buchung' : 'Buchungen'} ohne Kategorie
      </span>
      <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={anzeigen}>
        {filterAktiv ? 'Filter aufheben' : 'Anzeigen'}
      </Button>
      <CategorySuggestions categories={daten.categories} onAccept={uebernehmen} label="Vorschläge" className="h-7 shrink-0 px-2 text-xs" />
    </section>
  )
}
