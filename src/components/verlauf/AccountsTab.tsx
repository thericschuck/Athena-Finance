import Link from 'next/link'
import { getKontenReihen, getKontoSaldenSeite, getVerlaufKonten } from '@/lib/data/verlauf-konten'
import {
  ZEITRAEUME, parseKonto, parseZeitraum, sampleReihe, veraenderung, zeitraumStart,
} from '@/lib/verlauf/konten'
import { Th, Td, Pagination, fmtNum, fmtDate, href, type TabCtx } from './shared'
import { KontenSparkline } from './KontenSparkline'
import { KontenVerlaufChartLazy } from './KontenVerlaufChartLazy'
import { Landmark } from 'lucide-react'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'

// ─── Tab: Konten ──────────────────────────────────────────────────────────────

/** Punkte je Sparkline: bei 120 px Breite reichen 60, mehr waere nur Daten ohne Pixel. */
const SPARK_PUNKTE = 60
/** Punkte im grossen Chart: genug fuer Tagesschwankungen, weit unter den ~3000 Rohtagen. */
const CHART_PUNKTE = 200

const chipCls = (aktiv: boolean) =>
  `rounded-md border px-2.5 py-1 text-xs transition-colors ${
    aktiv
      ? 'border-border bg-muted text-foreground'
      : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'
  }`

export async function AccountsTab({ supabase, ctx, locale, dateFormat, page, from, to, params }: TabCtx) {
  const konten  = await getVerlaufKonten(supabase, ctx)
  if (konten.length === 0) {
    return (
      <div className="space-y-4 p-4">
        <ScopeHinweisFuer ctx={ctx} thema="Konten" />
        <LeerZustand
          variante="eingebettet"
          icon={Landmark}
          titel="Noch keine Konten"
          text="Hier siehst du den Saldoverlauf jedes Kontos. Sobald ein Konto angelegt ist, wird sein Stand täglich festgehalten."
          aktion={{ label: 'Konto anlegen', href: '/finance/accounts' }}
          sekundaer={{ label: 'Bank verbinden', href: '/settings' }}
        />
      </div>
    )
  }
  const kontoId = parseKonto(params.konto, konten.map(k => k.id))
  const zeitraum = parseZeitraum(params.zeitraum)
  const start   = zeitraumStart(zeitraum, new Date())

  const auswahl   = kontoId === 'alle' ? null : konten.find(k => k.id === kontoId) ?? null
  const sichtbar  = auswahl ? [auswahl] : konten
  const kontoMap  = new Map(konten.map(k => [k.id, k]))

  // Die Karten brauchen immer alle Konten (sie sind zugleich die Auswahl); der grosse Chart
  // und die Tabelle folgen dem Filter. Sampling passiert serverseitig in getKontenReihen.
  const [reihen, { rows: data, count }] = await Promise.all([
    getKontenReihen(supabase, konten.map(k => k.id), start, auswahl ? CHART_PUNKTE : SPARK_PUNKTE),
    getKontoSaldenSeite(supabase, sichtbar.map(k => k.id), start, { from, to }),
  ])

  // Filter-Links setzen die Seite zurueck: Seite 3 eines anderen Filters gibt es evtl. nicht.
  const link = (o: Record<string, string | undefined>) => href(params, { page: undefined, ...o })

  return (
    <div>
      {/* Filter: Konto und Zeitraum */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Konto">
          <Link href={link({ konto: undefined })} className={chipCls(!auswahl)} aria-current={!auswahl ? 'true' : undefined}>
            Alle
          </Link>
          {konten.map(k => (
            <Link
              key={k.id}
              href={link({ konto: k.id })}
              className={`${chipCls(auswahl?.id === k.id)} flex items-center gap-1.5 ${k.is_active ? '' : 'opacity-70'}`}
              aria-current={auswahl?.id === k.id ? 'true' : undefined}
            >
              {k.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: k.color }} />}
              {k.name}
              {!k.is_active && <span className="text-[10px] text-muted-foreground">(inaktiv)</span>}
            </Link>
          ))}
        </div>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Zeitraum">
          {ZEITRAEUME.map(z => (
            <Link
              key={z.key}
              href={link({ zeitraum: z.key })}
              aria-current={zeitraum === z.key ? 'true' : undefined}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                zeitraum === z.key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {z.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Uebersichtskarten (Small Multiples) — Klick waehlt das Konto, nochmal Klick hebt auf */}
      {konten.length > 0 && (
        <div className="grid grid-cols-1 gap-3 border-b border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
          {konten.map(k => {
            const reihe  = reihen[k.id] ?? []
            const letzter = reihe[reihe.length - 1]
            const delta  = veraenderung(reihe)
            const aktiv  = auswahl?.id === k.id
            const farbe  = k.color ?? 'var(--chart-accent)'
            return (
              <Link
                key={k.id}
                href={link({ konto: aktiv ? undefined : k.id })}
                className={`rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/30 ${
                  aktiv ? 'border-foreground/40' : 'border-border'
                } ${k.is_active ? '' : 'opacity-70'}`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: farbe }} />
                  <span className="truncate">{k.name}</span>
                  {!k.is_active && <span className="text-[10px]">(inaktiv)</span>}
                </div>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-semibold tabular-nums tracking-tight">
                    {letzter ? fmtNum(letzter.saldo, 2, locale) : '—'}
                  </span>
                  {delta && (
                    <span className={`text-xs font-medium tabular-nums ${delta.abs >= 0 ? 'text-success' : 'text-danger'}`}>
                      {delta.abs >= 0 ? '+' : '−'}{fmtNum(Math.abs(delta.abs), 2, locale)}
                      {delta.prozent !== null && ` (${delta.abs >= 0 ? '+' : '−'}${Math.abs(delta.prozent).toFixed(1)} %)`}
                    </span>
                  )}
                </p>
                <div className="mt-2">
                  <KontenSparkline werte={sampleReihe(reihe, SPARK_PUNKTE).map(p => p.saldo)} farbe={farbe} />
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Grosser Verlauf des gewaehlten Kontos (lazy: Recharts nur bei Bedarf) */}
      {auswahl && (reihen[auswahl.id]?.length ?? 0) >= 2 && (
        <div className="border-b border-border px-3 py-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Saldoverlauf · {auswahl.name}
          </p>
          <KontenVerlaufChartLazy punkte={reihen[auswahl.id]} farbe={auswahl.color} locale={locale} />
        </div>
      )}

      {/* Tabelle ab sm, darunter Karten: sechs Spalten passen nicht auf ein Handy */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <Th>Datum</Th>
              <Th>Konto</Th>
              <Th>Typ</Th>
              <Th right>Saldo</Th>
              <Th>Währung</Th>
              <Th>Quelle</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const acct = kontoMap.get(r.account_id)
              const neg  = r.balance < 0
              return (
                <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                  <Td>{fmtDate(r.snapshot_date, dateFormat)}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      {acct?.color && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
                      )}
                      {acct?.name ?? r.account_id}
                    </span>
                  </Td>
                  <Td dim>{acct?.type ?? '—'}</Td>
                  <Td right mono red={neg}>
                    <span className={neg ? '' : 'font-medium'}>{fmtNum(r.balance, 2, locale)}</span>
                  </Td>
                  <Td dim>{r.currency}</Td>
                  <Td dim>{r.source}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border/50 sm:hidden">
        {data.map(r => {
          const acct = kontoMap.get(r.account_id)
          const neg  = r.balance < 0
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm">
                  {acct?.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: acct.color }} />}
                  <span className="truncate">{acct?.name ?? r.account_id}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(r.snapshot_date, dateFormat)} · {r.source}
                </p>
              </div>
              <span className={`shrink-0 text-sm tabular-nums ${neg ? 'text-danger' : 'font-medium'}`}>
                {fmtNum(r.balance, 2, locale)} {r.currency}
              </span>
            </li>
          )
        })}
      </ul>

      {data.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">Keine Salden im gewählten Zeitraum.</p>
      )}

      <Pagination tab="accounts" page={page} total={count} params={params} />
    </div>
  )
}
