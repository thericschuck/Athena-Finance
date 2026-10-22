'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reopenValuable } from '@/app/(dashboard)/inventar/sale-actions'
import { fmtCurrency } from '@/lib/format'

export type SoldItem = {
  id: string
  name: string
  marke: string | null
  kaufpreis: number | null
  verkaufspreis: number | null
  gekauft_am: string | null
  verkauft_am: string | null
}

/** Haltedauer zwischen Kauf und Verkauf, oder null ohne beide Daten. */
function haltedauer(von: string | null, bis: string | null): string | null {
  if (!von || !bis) return null
  const a = new Date(`${von}T12:00:00`)
  const b = new Date(`${bis}T12:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  const m = Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()))
  if (m < 12) return `${m} Mon.`
  const j = Math.floor(m / 12)
  return m % 12 === 0 ? `${j} J.` : `${j} J. ${m % 12} Mon.`
}

/** Einklappbare Tabelle der verkauften Stücke mit realisiertem Gewinn/Verlust. */
export function SoldList({ items, locale }: { items: SoldItem[]; locale: string }) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  if (items.length === 0) return null

  const eur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })
  const datum = (d: string | null) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  const gewinnVon = (i: SoldItem) =>
    i.kaufpreis !== null && i.verkaufspreis !== null ? i.verkaufspreis - i.kaufpreis : null

  // Summe nur über Stücke mit beiden Preisen — ein fehlender Preis ist „unbekannt", nicht 0.
  const summe = items.reduce((s, i) => s + (gewinnVon(i) ?? 0), 0)
  const bewertet = items.filter(i => gewinnVon(i) !== null).length

  const farbe = (n: number) => (n >= 0 ? 'text-success' : 'text-danger')
  const vorz = (n: number) => (n >= 0 ? '+' : '')

  function reaktivieren(id: string) {
    setFehler(null)
    startTransition(async () => {
      const res = await reopenValuable(id)
      if (res.error) setFehler(res.error)
      else router.refresh()
    })
  }

  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">
          Verkauft <span className="text-muted-foreground">({items.length})</span>
        </span>
        <span className="flex items-center gap-3 text-sm tabular-nums">
          {bewertet > 0 && (
            <span className={farbe(summe)}>
              {vorz(summe)}{eur(summe)} realisiert
            </span>
          )}
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${offen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {offen && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Gegenstand</th>
                <th className="px-4 py-2 font-medium hidden sm:table-cell">Verkauft am</th>
                <th className="px-4 py-2 text-right font-medium hidden sm:table-cell">Kauf</th>
                <th className="px-4 py-2 text-right font-medium">Verkauf</th>
                <th className="px-4 py-2 text-right font-medium">Gewinn/Verlust</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Haltedauer</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map(i => {
                const g = gewinnVon(i)
                return (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="font-medium">{i.name}</div>
                      {i.marke && <div className="text-xs text-muted-foreground">{i.marke}</div>}
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell tabular-nums">{datum(i.verkauft_am)}</td>
                    <td className="px-4 py-2 text-right hidden sm:table-cell tabular-nums">
                      {i.kaufpreis !== null ? eur(i.kaufpreis) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {i.verkaufspreis !== null ? eur(i.verkaufspreis) : '—'}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${g !== null ? farbe(g) : 'text-muted-foreground'}`}>
                      {g !== null ? `${vorz(g)}${eur(g)}` : '—'}
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">
                      {haltedauer(i.gekauft_am, i.verkauft_am) ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => reaktivieren(i.id)}>
                        <Undo2 className="size-3.5" />
                        Wieder aktivieren
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {fehler && <p className="px-4 py-2 text-sm text-danger">{fehler}</p>}
        </div>
      )}
    </section>
  )
}
