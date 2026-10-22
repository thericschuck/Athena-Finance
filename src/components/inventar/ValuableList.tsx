'use client'

import { ValuableIcon } from './ValuableIcon'
import { kategorieLabel, vollstaendigkeit, type ValuableWithImage } from '@/lib/valuables'

/** Tabellenansicht für größere Sammlungen — sortiert wird über die Leiste darüber. */
export function ValuableList({
  items, eur, onOpen,
}: {
  items: ValuableWithImage[]
  eur: (n: number, digits?: number) => string
  onOpen: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">Gegenstand</th>
            <th className="hidden px-3 py-2 sm:table-cell">Kategorie</th>
            <th className="hidden px-3 py-2 md:table-cell">Seriennummer</th>
            <th className="hidden px-3 py-2 md:table-cell">Register</th>
            <th className="px-3 py-2 text-right">Wert</th>
            <th className="hidden px-3 py-2 text-right sm:table-cell">Entwicklung</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(i => {
            const reg = vollstaendigkeit(i)
            const bild = i.anzeige_url ?? i.bilder.find(b => b.url)?.url
            const r = i.rendite_prozent
            return (
              <tr
                key={i.id}
                onClick={() => onOpen(i.id)}
                className="cursor-pointer transition-colors hover:bg-muted/40"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onOpen(i.id) }}
                    className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/40">
                      {bild ? (
                        // Signierte URL, daher <img> — siehe Karte in InventoryClient.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bild} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
                      ) : (
                        <ValuableIcon kategorie={i.kategorie} className="size-4 text-muted-foreground/60" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{i.marke ?? ''}</span>
                    </span>
                  </button>
                </td>
                <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">{kategorieLabel(i.kategorie)}</td>
                <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground md:table-cell">
                  {i.seriennummer ?? '—'}
                </td>
                <td
                  className="hidden px-3 py-2 text-xs tabular-nums text-muted-foreground md:table-cell"
                  title={reg.fehlt.length ? `Fehlt: ${reg.fehlt.join(', ')}` : 'Vollständig'}
                >
                  {reg.prozent} %
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {i.aktueller_wert != null ? eur(i.aktueller_wert) : '—'}
                </td>
                <td
                  className={`hidden px-3 py-2 text-right text-xs tabular-nums sm:table-cell ${
                    r == null || r === 0 ? 'text-muted-foreground' : r > 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {r == null || r === 0 ? '—' : `${r > 0 ? '+' : ''}${r} %`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
