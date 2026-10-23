import Link from 'next/link'
import { AGGREGATIONEN, type Aggregation, type MitDelta } from '@/lib/verlauf/networth'
import type { NetWorthZeile } from '@/lib/data/verlauf-networth'
import { Th, Td, Pagination, fmtEur, fmtDate, href } from './shared'
import { Delta } from './NetworthKpis'
import { SnapshotAktionen } from './SnapshotAktionen'

type Zeile = MitDelta<NetWorthZeile>

const DELTA_TITEL: Record<Aggregation, string> = {
  tag: 'Δ Vortag',
  woche: 'Δ Vorwoche',
  monat: 'Δ Vormonat',
}

const TOEPFE_ZEILE = [
  ['Assets', 'total_assets'], ['Girokonto', 'total_checking'], ['Geschäftsant.', 'total_investment'],
  ['Sparkonto', 'total_savings'], ['Cash', 'total_cash'], ['Depot', 'total_depot'],
  ['Crypto', 'total_crypto'], ['Bausparer', 'total_bausparer'], ['Business', 'total_business'],
] as const

function werteVon(z: NetWorthZeile) {
  return {
    total_checking: z.total_checking, total_investment: z.total_investment,
    total_savings: z.total_savings, total_cash: z.total_cash, total_depot: z.total_depot,
    total_crypto: z.total_crypto, total_bausparer: z.total_bausparer,
    total_business: z.total_business, total_debts: z.total_debts,
  }
}

/**
 * Net-Worth-Tabelle. `zeilen` ist die bereits aggregierte, absteigend sortierte Liste ALLER
 * Perioden (Aggregation läuft in JS über alle Snapshots, das sind nur einige hundert Zeilen);
 * hier wird nur die aktuelle Seite herausgeschnitten. Ab `sm` die 13+1-spaltige Tabelle, darunter
 * eine Kartenliste: 14 Spalten passen auf dem Handy nicht, horizontales Scrollen ist dort
 * schlecht lesbar.
 */
export function NetworthTable({ zeilen, agg, auffaellig, page, pageSize, params, locale, dateFormat }: {
  zeilen: Zeile[]
  agg: Aggregation
  /** Datumswerte auffälliger Snapshots — nur dort erscheinen Korrigieren/Löschen. */
  auffaellig: Set<string>
  page: number
  pageSize: number
  params: Record<string, string | undefined>
  locale: string
  dateFormat: string
}) {
  const seite = zeilen.slice(page * pageSize, (page + 1) * pageSize)
  const btn = (aktiv: boolean) =>
    `px-3 py-1.5 text-xs rounded border transition-colors ${aktiv ? 'border-foreground/40 bg-muted font-medium' : 'border-border hover:bg-muted'}`

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-3" role="group" aria-label="Aggregation">
        {AGGREGATIONEN.map(a => (
          <Link
            key={a.key}
            href={href(params, { agg: a.key === 'tag' ? undefined : a.key, page: undefined })}
            className={btn(a.key === agg)}
            aria-current={a.key === agg ? 'true' : undefined}
          >
            {a.label}
          </Link>
        ))}
        {agg !== 'tag' && <span className="text-xs text-muted-foreground">letzter Stand je {agg === 'woche' ? 'Woche' : 'Monat'}</span>}
      </div>

      {/* Desktop/Tablet */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <Th>Datum</Th>
              <Th right>Net Worth</Th>
              <Th right>{DELTA_TITEL[agg]}</Th>
              {TOEPFE_ZEILE.map(([label]) => <Th key={label} right>{label}</Th>)}
              <Th right>Schulden</Th>
              <Th>Quelle</Th>
              <Th>{' '}</Th>
            </tr>
          </thead>
          <tbody>
            {seite.map((r, i) => (
              <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                <Td>{fmtDate(r.datum, dateFormat)}</Td>
                <Td right mono><span className="font-semibold">{fmtEur(r.net_worth, locale)}</span></Td>
                <Td right mono><Delta delta={r.delta} prozent={r.deltaProzent} locale={locale} /></Td>
                {TOEPFE_ZEILE.map(([label, key]) => (
                  <Td key={label} right mono dim={key !== 'total_assets'}>{fmtEur(r[key], locale)}</Td>
                ))}
                <Td right mono red>{fmtEur(r.total_debts, locale)}</Td>
                <Td dim>{r.source}</Td>
                <Td>
                  {auffaellig.has(r.datum) && (
                    <SnapshotAktionen id={r.id} datumLabel={fmtDate(r.datum, dateFormat)} werte={werteVon(r)} locale={locale} />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil */}
      <ul className="sm:hidden divide-y divide-border/60">
        {seite.map(r => (
          <li key={r.id} className="px-4 py-3">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{fmtDate(r.datum, dateFormat)} · {r.source}</p>
                  <p className="text-base font-semibold tabular-nums">{fmtEur(r.net_worth, locale)}</p>
                </div>
                <div className="text-right text-sm">
                  <Delta delta={r.delta} prozent={r.deltaProzent} locale={locale} />
                  <p className="text-xs text-muted-foreground group-open:hidden">Details</p>
                </div>
              </summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {TOEPFE_ZEILE.map(([label, key]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums">{fmtEur(r[key], locale)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Schulden</dt>
                  <dd className="tabular-nums text-danger">{fmtEur(r.total_debts, locale)}</dd>
                </div>
              </dl>
            </details>
            {auffaellig.has(r.datum) && (
              <div className="mt-2">
                <SnapshotAktionen id={r.id} datumLabel={fmtDate(r.datum, dateFormat)} werte={werteVon(r)} locale={locale} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <Pagination tab="networth" page={page} total={zeilen.length} params={params} />
    </div>
  )
}
