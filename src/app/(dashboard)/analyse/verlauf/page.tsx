import { Suspense } from 'react'
import Link from 'next/link'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { getSettings } from '@/lib/settings'
import { MAX_PAGE } from '@/lib/pagination'
import { PAGE_SIZE, type TabCtx } from '@/components/verlauf/shared'
import { NetworthTab } from '@/components/verlauf/NetworthTab'
import { AccountsTab } from '@/components/verlauf/AccountsTab'
import { PortfolioTab } from '@/components/verlauf/PortfolioTab'
import { MonthlyTab } from '@/components/verlauf/MonthlyTab'
import { VerlaufTabSkeleton } from '@/components/verlauf/VerlaufSkeletons'

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS     = ['networth', 'accounts', 'portfolio', 'monthly'] as const
type Tab       = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
  networth:  'Net Worth',
  accounts:  'Konten',
  portfolio: 'Portfolio',
  monthly:   'Monatsübersicht',
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // `?asset=a&asset=b` liefert ein Array. Alle Tabs erwarten Strings — der erste Wert gewinnt,
  // statt dass ein doppelter Parameter irgendwo im Tab einen TypeError wirft.
  const roh = await searchParams
  const params: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(roh).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  )
  const { tab: rawTab, page: rawPage } = params
  const tab  = (TABS.includes(rawTab as Tab) ? rawTab : 'networth') as Tab
  // Die Seitenzahl wird zum OFFSET der Abfrage (siehe lib/pagination.ts MAX_PAGE).
  const page = Math.min(MAX_PAGE, Math.max(0, parseInt(rawPage ?? '0', 10) || 0))
  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const { supabase, user } = await requireAuthUser()
  const uid = user.id
  // Scope und Einstellungen sind unabhaengig: eine Rundreise-Stufe statt zwei (Layout teilt dieselben Ergebnisse per cache()).
  const [scopeCtx, settings] = await Promise.all([resolveScope(supabase, user), getSettings(uid)])
  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  const ctx: TabCtx = { supabase, uid, ctx: scopeCtx, locale, dateFormat, page, from, to, params }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1400px]">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historie</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gespeicherte Snapshots und historische Daten
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => {
          const active = t === tab
          return (
            <Link
              key={t}
              href={`?tab=${t}`}
              className={[
                'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {TAB_LABELS[t]}
            </Link>
          )
        })}
      </div>

      {/* Table */}
      {/* Kopf und Tabs stehen sofort; nur der Tab-Inhalt (die schweren Abfragen) streamt nach. key: jeder Parameter-
          wechsel (Tab, Seite, Filter) zeigt wieder den Platzhalter statt die alte Ansicht einzufrieren. */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Suspense key={JSON.stringify(params)} fallback={<VerlaufTabSkeleton tab={tab} />}>
          <TabInhalt tab={tab} ctx={ctx} />
        </Suspense>
      </div>

    </div>
  )
}

/** Holt die Daten des aktiven Tabs; als eigene Komponente, damit Kopf und Tab-Leiste nicht darauf warten. */
async function TabInhalt({ tab, ctx }: { tab: Tab; ctx: TabCtx }) {
  if (tab === 'networth') return NetworthTab(ctx)
  if (tab === 'accounts') return AccountsTab(ctx)
  if (tab === 'portfolio') return PortfolioTab(ctx)
  return MonthlyTab(ctx)
}
