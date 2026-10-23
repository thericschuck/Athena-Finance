import Link from 'next/link'
import { getHistoryAssets } from '@/lib/data/overview'
import { getPortfolioSnapshotsAlle, getPortfolioTabelle } from '@/lib/data/verlauf-portfolio'
import {
  PORTFOLIO_ZEITRAEUME, aggregiereTage, assetKennzahlen, assetsAusParam, bildeReihen, filtereZeilen,
  gruppiere, toggleAsset, zeitraumAusParam, zeitraumStart,
} from '@/lib/verlauf/portfolio'
import { Th, Td, Pagination, fmtEur, fmtNum, fmtDate, href, type TabCtx } from './shared'
import { PortfolioAllokationChartLazy } from './PortfolioAllokationChartLazy'
import { PortfolioKarten } from './PortfolioKarten'

const ZEITRAUM_LABEL: Record<(typeof PORTFOLIO_ZEITRAEUME)[number], string> = {
  '3m': '3 Mon.', '6m': '6 Mon.', '1y': '1 Jahr', max: 'Alles',
}

const chipCls = (aktiv: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs transition-colors ${
    aktiv ? 'border-transparent bg-muted text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
  }`

// ─── Tab: Portfolio ───────────────────────────────────────────────────────────
// Filter laufen ueber die URL (`asset`, `portfolio`, `zeitraum`), nicht ueber Client-State:
// Server Component, teilbare Links, und die Tabellen-Pagination behaelt sie ueber `params`.
export async function PortfolioTab({ supabase, uid, locale, dateFormat, page, from, to, params }: TabCtx) {
  const assetsAll = await getHistoryAssets(supabase, uid)
  const assetMap = new Map(assetsAll.map(a => [a.id, a]))
  const alleIds = assetsAll.map(a => a.id)

  const zeitraum = zeitraumAusParam(params.zeitraum)
  const ab = zeitraumStart(zeitraum)
  const gewaehlt = assetsAusParam(params.asset)
  // Nur Assets, die es gibt: ein veralteter Link mit geloeschter Asset-ID soll nicht zu
  // einer leeren Seite fuehren.
  const aktiv = new Set([...gewaehlt].filter(id => assetMap.has(id)))
  const aktiveIds = aktiv.size > 0 ? [...aktiv] : alleIds

  // Gesamtlauf einmal lesen (Zeitraum), Portfolio- und Asset-Filter dann im Speicher.
  const imZeitraum = await getPortfolioSnapshotsAlle(supabase, uid, ab)
  const portfolios = [...new Set(imZeitraum.map(z => z.portfolio_name).filter((n): n is string => !!n))].sort()
  const portfolio = params.portfolio && portfolios.includes(params.portfolio) ? params.portfolio : undefined

  const zeilen = filtereZeilen(imZeitraum, { assets: aktiv, portfolio })
  const tage = aggregiereTage(zeilen)
  const nameVon = (id: string) => assetMap.get(id)?.name ?? '—'
  const { reihen, rest } = bildeReihen(tage, nameVon)
  const punkte = tage.map(t => ({ datum: t.datum, werte: gruppiere(t.werte, rest) }))
  const kennzahlen = assetKennzahlen(zeilen)

  const { rows: data, count } = await getPortfolioTabelle(
    supabase, uid, { assetIds: aktiveIds, portfolio, ab }, { from, to },
  )

  // Filterwechsel springt immer auf Seite 1 (page: undefined), sonst landet man hinter dem Ende.
  const link = (o: Record<string, string | undefined>) => href(params, { page: undefined, ...o })

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Zeitraum">
          {PORTFOLIO_ZEITRAEUME.map(z => (
            <Link key={z} href={link({ zeitraum: z === 'max' ? undefined : z })} className={chipCls(zeitraum === z)}>
              {ZEITRAUM_LABEL[z]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Assets">
          <Link href={link({ asset: undefined })} className={chipCls(aktiv.size === 0)}>Alle</Link>
          {assetsAll.map(a => (
            <Link
              key={a.id}
              href={link({ asset: toggleAsset(aktiv, a.id, alleIds) })}
              className={chipCls(aktiv.has(a.id))}
              aria-pressed={aktiv.has(a.id)}
            >
              {a.symbol ?? a.name}
            </Link>
          ))}
        </div>
        {portfolios.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Portfolio">
            <Link href={link({ portfolio: undefined })} className={chipCls(!portfolio)}>Alle Portfolios</Link>
            {portfolios.map(p => (
              <Link key={p} href={link({ portfolio: p })} className={chipCls(portfolio === p)}>{p}</Link>
            ))}
          </div>
        )}
      </div>

      <PortfolioAllokationChartLazy punkte={punkte} reihen={reihen} locale={locale} />

      <PortfolioKarten kennzahlen={kennzahlen} namen={assetMap} locale={locale} />

      <div className="rounded-lg border border-border">
        {/* Desktop: Tabelle */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <Th>Datum</Th>
                <Th>Asset</Th>
                <Th>Symbol</Th>
                <Th>Typ</Th>
                <Th>Portfolio</Th>
                <Th right>Menge</Th>
                <Th right>Preis (€)</Th>
                <Th right>Wert (€)</Th>
                <Th>Quelle</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const asset = assetMap.get(r.asset_id)
                return (
                  <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <Td>{fmtDate(r.snapshot_date, dateFormat)}</Td>
                    <Td>{asset?.name ?? '—'}</Td>
                    <Td dim>{asset?.symbol ?? '—'}</Td>
                    <Td dim>{asset?.type ?? '—'}</Td>
                    <Td dim>{r.portfolio_name ?? '—'}</Td>
                    <Td right mono>{fmtNum(r.quantity, 6, locale)}</Td>
                    <Td right mono dim>{fmtEur(r.price_eur, locale)}</Td>
                    <Td right mono>
                      <span className="font-medium">{fmtEur(r.value_eur, locale)}</span>
                    </Td>
                    <Td dim>{r.source}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobil: Karten statt breiter Tabelle */}
        <ul className="divide-y divide-border/50 sm:hidden">
          {data.map(r => {
            const asset = assetMap.get(r.asset_id)
            return (
              <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {asset?.name ?? '—'}
                    {asset?.symbol && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{asset.symbol}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(r.snapshot_date, dateFormat)}{r.portfolio_name ? ` · ${r.portfolio_name}` : ''}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {fmtNum(r.quantity, 6, locale)} × {fmtEur(r.price_eur, locale)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">{fmtEur(r.value_eur, locale)}</span>
              </li>
            )
          })}
        </ul>

        <Pagination tab="portfolio" page={page} total={count} params={params} />
      </div>
    </div>
  )
}
