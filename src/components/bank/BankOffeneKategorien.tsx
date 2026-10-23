'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategorySuggestions } from '@/components/bank/category-suggestions'
import { useUrlFilters } from '@/components/providers/url-filters'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { normIban } from '@/lib/bank/scope'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Hinweiskarte „N Buchungen warten auf eine Kategorie" — nur sichtbar, wenn es welche gibt.
 *
 * Gezaehlt wird ueber ALLE Buchungen (nicht nur Zeitraum/Konto): eine unkategorisierte Buchung
 * bleibt offen, egal welcher Filter gerade gesetzt ist. Umbuchungen zwischen eigenen Konten
 * (Gegen-IBAN gehoert dem Nutzer) zaehlen nicht — sie brauchen keine Kategorie, die
 * Auswertung rechnet sie ohnehin heraus (gleiche Regel wie fints/categorize.ts).
 *
 * Vorschlaege: bestehendes Panel (Regeln, Gelerntes, KI) im Seitenfenster; es laedt erst beim
 * Oeffnen ueber /api/bank/transactions/suggest-categories. Uebernommene Vorschlaege werden per
 * PATCH gespeichert; danach laedt die Seite einmal neu (gebuendelt, ein Sammelklick schickt
 * viele Antworten), damit die Karte schrumpft.
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
  const neueste = offene.slice(0, 3)

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

  return (
    <section
      aria-label="Buchungen ohne Kategorie"
      className="rounded-lg border border-primary/40 bg-primary/5 p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Tags className="size-5 shrink-0 text-primary" />
        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          {offene.length} {offene.length === 1 ? 'Buchung wartet' : 'Buchungen warten'} auf eine Kategorie
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <CategorySuggestions categories={daten.categories} onAccept={uebernehmen} />
          <Button
            size="sm"
            variant={filterAktiv ? 'outline' : 'default'}
            onClick={() => set('kat', filterAktiv ? null : 'offen')}
          >
            {filterAktiv ? 'Filter aufheben' : 'Alle anzeigen'}
          </Button>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-border/50 text-sm">
        {neueste.map(t => (
          <li key={t.id} className="flex items-baseline gap-3 py-1.5">
            <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
              {fmtDate(t.value_date, daten.dateFormat)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {t.counterpart_name || t.description || 'Buchung'}
            </span>
            <span className={`shrink-0 tabular-nums ${t.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {fmtCurrency(t.amount, t.currency || 'EUR', daten.locale, { fractionDigits: 2 })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
