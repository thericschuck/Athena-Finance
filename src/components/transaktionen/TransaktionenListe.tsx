'use client'

import { useMemo, useState } from 'react'
import { Landmark } from 'lucide-react'
import {
  DeleteTransactionButton,
  EditTransactionDialog,
  TransactionCategorySelect,
} from '@/components/finance/transaction-form'
import { Checkbox } from '@/components/ui/checkbox'
import { HoverInfo } from '@/components/ui/hover-info'
import { formatBuchung, formatBetrag } from '@/components/konten/detail/format'
import type { AccountOptionRow } from '@/lib/data/finance-accounts'
import type { CategoryOptionRow, TransactionListRow } from '@/lib/data/finance-transactions'
import type { DebtRow } from '@/lib/data/finance-planning'
import { fmtDateShort } from '@/lib/format'
import { ART_LABEL, type Art } from '@/lib/transaktionen/filter'
import { gruppiereNachTag, gruppierenSinnvoll, markiereTreffer, tagLabel } from '@/lib/transaktionen/berechnen'
import type { Database } from '@/types/database'
import { useAuswahl } from './AuswahlProvider'
import { BuchungsDetail, type DetailZiel } from './BuchungsDetail'
import { SammelLeiste } from './SammelLeiste'
import { betragTon, TON_KLASSE, vorzeichenText } from './auswahl'

type TxRow = Database['public']['Tables']['transactions']['Row']

/**
 * Liste der Transaktionen: bei Datumssortierung nach Tagen gruppiert (Tageskopf mit Tagessumme), bei
 * Betragssortierung flach mit Datum in der Zeile. Eine Struktur für beide Größen (Auswahl, Dialoge und
 * Detail stehen nur einmal im DOM):
 *  - ab md: Raster Empfänger | Konto | Kategorie | Betrag | Aktionen
 *  - mobil: Kartenzeile — 1 Empfänger + Betrag, 2 Konto · Datum, 3 Kategorie + Marken + Aktionen
 *    (der Wrapper der Zeilen 2/3 ist ab md `display: contents`, seine Kinder besetzen die Spalten).
 * Tippen auf den Empfängerbereich öffnet das Detail; im Auswahlmodus wählt es stattdessen.
 */

const SPALTEN = 'md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,13rem)_8.5rem_4.5rem]'
const MARKE = 'shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'

function Treffer({ text, suche }: { text: string; suche: string | undefined }) {
  return (
    <>
      {markiereTreffer(text, suche).map((s, i) =>
        s.treffer
          ? <mark key={i} className="rounded-[3px] bg-primary/20 px-0.5 text-foreground">{s.text}</mark>
          : <span key={i}>{s.text}</span>,
      )}
    </>
  )
}

function markeVon(tx: TransactionListRow): string | null {
  if (tx.flow_kind && tx.flow_kind !== 'echt') return ART_LABEL[tx.flow_kind as Art] ?? tx.flow_kind
  return tx.type === 'transfer' ? 'Umbuchung' : null
}

interface Gemeinsam {
  accounts: AccountOptionRow[]
  categories: CategoryOptionRow[]
  debts: DebtRow[]
  schuldenCategoryId: string | null
  locale: string
  dateFormat: string
  suche: string | undefined
  mitDatum: boolean
  oeffneDetail: (z: DetailZiel) => void
}

function Zeile({ tx, g }: { tx: TransactionListRow; g: Gemeinsam }) {
  const { modus, auswahl, umschalten } = useAuswahl()
  const { sign, display } = formatBuchung(tx.signed_amount, tx.amount, tx.currency, g.locale)
  const ton = TON_KLASSE[betragTon(tx.type, tx.signed_amount)]
  const gewaehlt = auswahl.has(tx.id)
  const primaer = tx.merchant || tx.description
  const zweit = tx.merchant && tx.description ? tx.description : null
  const marke = markeVon(tx)
  const zeile = { id: tx.id, source: tx.source }
  const datum = fmtDateShort(tx.date, g.dateFormat)

  const oeffnen = () => {
    if (modus) umschalten(zeile)
    else g.oeffneDetail({ id: tx.id, source: tx.source, titel: primaer ?? 'Buchung' })
  }

  return (
    <div
      role="row"
      aria-selected={modus ? gewaehlt : undefined}
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 transition-colors last:rounded-b-lg hover:bg-muted/30 md:gap-x-4 md:py-1.5 ${SPALTEN} ${gewaehlt ? 'bg-primary/5' : ''}`}
    >
      {/* Empfänger: Tippfläche für Detail bzw. Auswahl */}
      <div role="cell" className="flex min-w-0 items-center md:col-start-1 md:row-start-1">
        {modus && (
          <label className="-ml-2 flex size-10 shrink-0 cursor-pointer items-center justify-center">
            <Checkbox
              checked={gewaehlt}
              onCheckedChange={() => umschalten(zeile)}
              aria-label={`${primaer ?? 'Buchung'} auswählen`}
            />
          </label>
        )}
        <button
          type="button"
          onClick={oeffnen}
          className="flex min-h-10 min-w-0 flex-1 flex-col justify-center text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:min-h-9"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm text-foreground">
              {primaer ? <Treffer text={primaer} suche={g.suche} /> : <span className="text-muted-foreground">—</span>}
            </span>
            {marke && <span className={`${MARKE} hidden md:inline`}>{marke}</span>}
            {tx.source === 'bank_sync' && (
              <HoverInfo
                bare
                className="hidden md:inline-flex"
                titel="Bank-Sync"
                text="Automatisch aus dem Banking synchronisiert. Die Bank ist die Quelle; die Buchung lässt sich nicht bearbeiten oder löschen, die Kategorie schon."
              >
                <Landmark className="size-3.5 text-muted-foreground" aria-label="Aus Banking synchronisiert" />
              </HoverInfo>
            )}
          </span>
          {zweit && (
            <span className="hidden truncate text-xs text-muted-foreground md:block">
              <Treffer text={zweit} suche={g.suche} />
            </span>
          )}
        </button>
      </div>

      {/* Betrag */}
      <div
        role="cell"
        className={`whitespace-nowrap text-right text-sm font-medium tabular-nums md:col-start-4 md:row-start-1 ${ton}`}
      >
        {sign}{display}
      </div>

      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:contents">
        {/* Konto (· Datum, wenn nicht nach Tagen gruppiert) */}
        <div role="cell" className="min-w-0 text-xs text-muted-foreground max-md:basis-full md:col-start-2 md:row-start-1 md:text-sm">
          {tx.account_name ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tx.account_color ?? 'var(--muted-foreground)' }}
                aria-hidden
              />
              <span className="truncate">{tx.account_name}</span>
              {g.mitDatum && <span className="shrink-0 tabular-nums md:hidden">· {datum}</span>}
            </span>
          ) : (
            <span>—</span>
          )}
          {g.mitDatum && <span className="hidden text-xs tabular-nums md:block">{datum}</span>}
        </div>

        {/* Kategorie */}
        <div role="cell" className="min-w-0 md:col-start-3 md:row-start-1">
          <TransactionCategorySelect
            key={`${tx.id}:${tx.category_id ?? ''}:${tx.category_source ?? ''}`}
            compact
            tx={{
              id: tx.id,
              category_id: tx.category_id,
              source: tx.source,
              amount: tx.amount,
              date: tx.date,
              description: tx.description,
              merchant: tx.merchant,
              type: tx.type,
              category_source: tx.category_source,
              ai_category_id: tx.ai_category_id,
            }}
            categories={g.categories}
            debts={g.debts}
            schuldenCategoryId={g.schuldenCategoryId}
          />
        </div>

        {marke && <span className={`${MARKE} md:hidden`}>{marke}</span>}

        {/* Aktionen: nur manuelle Zeilen; mobil immer sichtbar, am Desktop bei Hover/Fokus */}
        <div role="cell" className="ml-auto flex items-center justify-end md:col-start-5 md:row-start-1">
          {tx.source === 'manual' && !modus && (
            <span className="flex items-center gap-0.5 opacity-100 transition-opacity max-md:[&_button]:size-10 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
              <EditTransactionDialog
                tx={tx as unknown as TxRow}
                accounts={g.accounts}
                categories={g.categories}
                debts={g.debts}
                schuldenCategoryId={g.schuldenCategoryId}
              />
              <DeleteTransactionButton tx={tx as unknown as TxRow} />
            </span>
          )}
          {tx.source === 'bank_sync' && (
            <Landmark className="mx-2 size-3.5 text-muted-foreground md:hidden" aria-label="Aus Banking synchronisiert" />
          )}
        </div>
      </div>
    </div>
  )
}

export function TransaktionenListe({
  rows, accounts, categories, debts, schuldenCategoryId, locale, dateFormat, heute, sort, suche, geteilteTage,
}: {
  rows: TransactionListRow[]
  accounts: AccountOptionRow[]
  categories: CategoryOptionRow[]
  debts: DebtRow[]
  schuldenCategoryId: string | null
  locale: string
  dateFormat: string
  heute: string
  sort: string
  suche: string | undefined
  /**
   * Läuft der erste/letzte Tag der Seite über die Seitengrenze? Dann steht dort nur die Summe DIESER Seite —
   * das sagt die Tageszeile ausdrücklich („Teilsumme“), statt eine unvollständige Zahl als Tagessumme auszugeben.
   */
  geteilteTage?: { anfang: boolean; ende: boolean }
}) {
  const { modus, auswahl, seiteUmschalten } = useAuswahl()
  const [detail, setDetail] = useState<DetailZiel | null>(null)
  const nachTag = gruppierenSinnvoll(sort)

  const gruppen = useMemo(() => {
    if (!nachTag) return null
    // Tagessumme nur über EUR-Zeilen: Beträge in BTC/ETH wären sonst „Euro“.
    const mitEur = rows.map(tx => ({
      tx, date: tx.date, type: tx.type, flow_kind: tx.flow_kind, amount: tx.amount,
      signed_amount: tx.currency === 'EUR' ? tx.signed_amount : 0,
    }))
    return gruppiereNachTag(mitEur)
  }, [rows, nachTag])

  const g: Gemeinsam = {
    accounts, categories, debts, schuldenCategoryId, locale, dateFormat, suche,
    mitDatum: !nachTag,
    oeffneDetail: setDetail,
  }
  const seitenZeilen = rows.map(r => ({ id: r.id, source: r.source }))
  const alleDa = rows.length > 0 && rows.every(r => auswahl.has(r.id))

  return (
    <>
      <div role="table" aria-label="Transaktionen" className="rounded-lg border border-border bg-card">
        <div
          role="row"
          className={`hidden gap-x-4 rounded-t-lg border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid ${SPALTEN}`}
        >
          <div role="columnheader" className="flex items-center gap-2">
            {modus && (
              <label className="-ml-1 flex size-6 cursor-pointer items-center justify-center">
                <Checkbox checked={alleDa} onCheckedChange={() => seiteUmschalten(seitenZeilen)} aria-label="Alle auf dieser Seite auswählen" />
              </label>
            )}
            Empfänger
          </div>
          <div role="columnheader">{nachTag ? 'Konto' : 'Konto · Datum'}</div>
          <div role="columnheader">Kategorie</div>
          <div role="columnheader" className="text-right">Betrag</div>
          <div role="columnheader" className="sr-only">Aktionen</div>
        </div>

        {gruppen ? (
          gruppen.map((gr, gi) => (
            <div key={gr.date} role="rowgroup" aria-label={tagLabel(gr.date, heute)} className="border-t border-border first:border-t-0">
              <div
                role="row"
                className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-1.5 text-xs"
              >
                <span role="rowheader" className="font-medium text-foreground">{tagLabel(gr.date, heute)}</span>
                <span
                  role="cell"
                  className={`tabular-nums ${gr.summe > 0 ? 'text-success' : gr.summe < 0 ? 'text-danger' : 'text-muted-foreground'}`}
                >
                  {((gi === 0 && geteilteTage?.anfang) || (gi === gruppen.length - 1 && geteilteTage?.ende)) && (
                    <span className="mr-1.5 font-sans text-[10px] font-normal uppercase tracking-wider text-muted-foreground">Teilsumme dieser Seite</span>
                  )}
                  {gr.summe === 0 ? '±0' : `${vorzeichenText(gr.summe)}${formatBetrag(Math.abs(gr.summe), 'EUR', locale)}`}
                </span>
              </div>
              <div className="divide-y divide-border">
                {gr.zeilen.map(z => <Zeile key={z.tx.id} tx={z.tx} g={g} />)}
              </div>
            </div>
          ))
        ) : (
          <div role="rowgroup" className="divide-y divide-border">
            {rows.map(tx => <Zeile key={tx.id} tx={tx} g={g} />)}
          </div>
        )}
      </div>

      <SammelLeiste zeilen={seitenZeilen} categories={categories} />

      <BuchungsDetail ziel={detail} onClose={() => setDetail(null)} locale={locale} dateFormat={dateFormat} />
    </>
  )
}
