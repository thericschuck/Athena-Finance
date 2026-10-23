'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from 'lucide-react'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { useUrlFilters } from '@/components/providers/url-filters'
import { kategorieMitKindern, parseBetrag } from '@/lib/bank/buchungen'
import {
  ART_LABEL,
  LEERER_FILTER,
  filterBuchungen,
  gruppiereNachTag,
  schneideGruppen,
  sortiereBuchungen,
  summiere,
  type AnalyseBuchung,
  type SortFeld,
  type Sortierung,
} from '@/lib/analyse/buchungen'
import { parteiVon } from '@/lib/analyse/gegenparteien'
import { AnalyseBuchungDetail } from './AnalyseBuchungDetail'
import { AnalyseBuchungFilter, LEERES_FORMULAR, type FilterFormular } from './AnalyseBuchungFilter'

/** Schrittweite von „Mehr laden" — und zugleich die erste Seite. */
const SCHRITT = 50

interface KategorieKurz {
  id: string
  name: string
  color: string | null
  icon: string | null
  parent_id: string | null
}

/**
 * Buchungsliste der Analyse-Seite.
 *
 * Ausgangsmenge ist `txns` (Zeitraum, Konten und Schalter `anlage` hat der Server schon
 * angewendet). Darauf kommen zuerst die URL-Filter aus den Charts (`kat`, `monat`, `tag`,
 * `partei`), dann die lokalen Filter (Suche, Typ, Art, Betrag, Konto), die ohne Serverrunde im
 * Browser laufen.
 *
 * Die URL-Filter kommen aus `useUrlFilters().get`, nicht aus `daten.filter`: so zeigt die Liste
 * einen Klick im Chart sofort, auch wenn der Server noch rechnet. Die Chips ueber der Liste
 * macht die Seite selbst.
 *
 * Nur lesend — Kategorien aendert man auf der Bankdaten- und der Transaktionen-Seite.
 */
export function AnalyseBuchungenListe({
  txns, categories, konten, locale, dateFormat, exportBasis,
}: {
  txns: AnalyseBuchung[]
  categories: KategorieKurz[]
  konten: { id: string; name: string }[]
  locale: string
  dateFormat: string
  exportBasis: string
}) {
  const urlFilter = useUrlFilters()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })
  const fmtEur0 = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  const urlKat = urlFilter.get('kat') ?? ''
  // Wie der Server (analyse-seite.ts): ein ungueltiger Monat/Tag in der URL zaehlt als nicht gesetzt.
  // Sonst bliebe die Liste leer, ohne Chip und ohne Weg zurueck.
  const urlMonatRoh = urlFilter.get('monat') ?? ''
  const urlTagRoh = urlFilter.get('tag') ?? ''
  const urlMonat = /^\d{4}-(0[1-9]|1[0-2])$/.test(urlMonatRoh) ? urlMonatRoh : ''
  const urlTag = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(urlTagRoh) ? urlTagRoh : ''
  const urlPartei = urlFilter.get('partei') ?? ''
  const urlAktiv = !!(urlKat || urlMonat || urlTag || urlPartei)

  const [form, setForm] = useState<FilterFormular>(LEERES_FORMULAR)
  const [sortierung, setSortierung] = useState<Sortierung>({ feld: 'datum', richtung: 'ab' })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [seite, setSeite] = useState({ schluessel: '', n: SCHRITT })

  const kategorien = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const kontoNamen = useMemo(() => new Map(konten.map(k => [k.id, k.name])), [konten])
  const qSpaet = useDeferredValue(form.q)

  // Art-Schalter nur, wenn es ueberhaupt etwas anderes als reguläre Buchungen gibt.
  const zeigeArt = useMemo(() => txns.some(t => t.flow_kind !== 'echt'), [txns])

  const filter = useMemo(() => ({
    ...LEERER_FILTER,
    kat: urlKat,
    katMenge: urlKat && urlKat !== 'offen' ? kategorieMitKindern(urlKat, categories) : undefined,
    monat: urlMonat,
    tag: urlTag,
    partei: urlPartei,
    q: qSpaet,
    typ: form.typ,
    art: form.art,
    konto: form.konto,
    min: parseBetrag(form.minText),
    max: parseBetrag(form.maxText),
  }), [urlKat, urlMonat, urlTag, urlPartei, qSpaet, form.typ, form.art, form.konto, form.minText, form.maxText, categories])

  const gefiltert = useMemo(
    () => sortiereBuchungen(filterBuchungen(txns, filter), sortierung),
    [txns, filter, sortierung],
  )
  const summen = useMemo(() => summiere(gefiltert), [gefiltert])
  const gruppen = useMemo(() => gruppiereNachTag(gefiltert, sortierung.feld), [gefiltert, sortierung.feld])

  // „Mehr laden" faengt bei jeder Filteraenderung wieder bei einer Seite an. Ueber einen Schluessel
  // statt eines Effekts, damit es keinen Zwischenrender mit der alten Seitenlaenge gibt.
  const schluessel = JSON.stringify([filter.kat, filter.monat, filter.tag, filter.partei, qSpaet, form, sortierung])
  const sichtbar = seite.schluessel === schluessel ? seite.n : SCHRITT
  const angezeigt = useMemo(() => schneideGruppen(gruppen, sichtbar), [gruppen, sichtbar])
  const rest = Math.max(0, gefiltert.length - sichtbar)

  const detailTx = detailId ? txns.find(t => t.id === detailId) ?? null : null

  const lokalAktiv = form.q !== '' || form.typ !== 'alle' || form.art !== 'alle' ||
    form.minText !== '' || form.maxText !== '' || form.konto !== ''

  const exportHref = useMemo(() => {
    const p = new URLSearchParams(exportBasis)
    if (urlKat) p.set('kat', urlKat)
    if (urlMonat) p.set('monat', urlMonat)
    if (urlTag) p.set('tag', urlTag)
    if (urlPartei) p.set('partei', urlPartei)
    if (form.q.trim()) p.set('q', form.q.trim())
    if (form.typ !== 'alle') p.set('typ', form.typ)
    if (form.art !== 'alle') p.set('art', form.art)
    if (form.minText.trim()) p.set('min', form.minText.trim())
    if (form.maxText.trim()) p.set('max', form.maxText.trim())
    if (form.konto) p.set('konto', form.konto)
    return `/api/export/analyse?${p.toString()}`
  }, [exportBasis, urlKat, urlMonat, urlTag, urlPartei, form])

  function sortiereNach(feld: SortFeld) {
    setSortierung(s => (s.feld === feld
      ? { feld, richtung: s.richtung === 'ab' ? 'auf' : 'ab' }
      : { feld, richtung: feld === 'partei' ? 'auf' : 'ab' }))
  }

  // ── Darstellung ────────────────────────────────────────────────────────────
  const tagLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${d}T00:00:00Z`))

  const saldoText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtEur(Math.abs(n))}`

  const betrag = (tx: AnalyseBuchung) => {
    const gut = tx.type === 'income'
    return (
      <span className={`inline-flex items-center justify-end gap-1 font-medium ${gut ? 'text-success' : 'text-danger'}`}>
        {gut ? <TrendingUp className="size-3.5 shrink-0" aria-hidden /> : <TrendingDown className="size-3.5 shrink-0" aria-hidden />}
        <span className="tabular-nums">{gut ? '+' : '−'}{fmtEur(tx.amount)}</span>
      </span>
    )
  }

  const artBadge = (tx: AnalyseBuchung) =>
    tx.flow_kind === 'echt' ? null : (
      <span className="inline-flex shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        {ART_LABEL[tx.flow_kind] ?? tx.flow_kind}
      </span>
    )

  /** Kategorie als feste Pille in der Farbe der Kategorie (Unterkategorie, sonst Hauptkategorie). */
  const kategorieChip = (tx: AnalyseBuchung) => {
    const k = (tx.category_id && kategorien.get(tx.category_id)) || (tx.root_category_id ? kategorien.get(tx.root_category_id) : undefined)
    const name = tx.category_name ?? tx.root_category_name
    if (!name) {
      return <span className="inline-flex h-7 items-center rounded-full px-2.5 text-xs text-muted-foreground">Ohne Kategorie</span>
    }
    return (
      <span
        className="inline-flex h-7 max-w-[170px] items-center rounded-full bg-muted px-2.5 text-xs"
        style={k?.color ? { backgroundColor: `${k.color}1a`, color: k.color } : undefined}
      >
        <span className="truncate">{k?.icon ? `${k.icon} ${name}` : name}</span>
      </span>
    )
  }

  const kopf = (feld: SortFeld, label: string, rechts = false) => {
    const aktiv = sortierung.feld === feld
    return (
      <th
        scope="col"
        aria-sort={aktiv ? (sortierung.richtung === 'ab' ? 'descending' : 'ascending') : 'none'}
        className={`sticky top-0 z-10 whitespace-nowrap bg-muted px-4 py-2.5 font-medium ${rechts ? 'text-right' : 'text-left'}`}
      >
        <button type="button" onClick={() => sortiereNach(feld)} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          {aktiv && (sortierung.richtung === 'ab' ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
        </button>
      </th>
    )
  }

  const kachel = (label: string, wert: string, klasse = '') => (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2">
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`truncate text-sm font-semibold tabular-nums ${klasse}`}>{wert}</p>
    </div>
  )

  return (
    <div aria-labelledby="analyse-buchungen-titel" role="region" className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="analyse-buchungen-titel" className="text-sm font-semibold">Buchungen</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {gefiltert.length} {gefiltert.length === 1 ? 'Buchung' : 'Buchungen'}
          </p>
        </div>
        {!urlAktiv && !lokalAktiv && (
          <p className="text-xs text-muted-foreground">
            Die letzten {Math.min(SCHRITT, txns.length)} Buchungen. Klicke oben auf eine Kategorie, einen Monat oder Tag, um die Liste einzugrenzen.
          </p>
        )}
      </div>

      {gefiltert.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {kachel('Einnahmen', fmtEur0(summen.einnahmen), 'text-success')}
          {kachel('Ausgaben', fmtEur0(summen.ausgaben), 'text-danger')}
          {kachel('Saldo', `${summen.saldo > 0 ? '+' : summen.saldo < 0 ? '−' : ''}${fmtEur0(Math.abs(summen.saldo))}`)}
        </div>
      )}

      <AnalyseBuchungFilter
        form={form}
        onChange={p => setForm(f => ({ ...f, ...p }))}
        sortierung={sortierung}
        onSort={setSortierung}
        konten={konten}
        zeigeArt={zeigeArt}
        aktiv={lokalAktiv}
        onReset={() => setForm(LEERES_FORMULAR)}
        exportHref={exportHref}
      />

      {gefiltert.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm font-medium">{txns.length === 0 ? 'Keine Buchungen' : 'Keine Treffer'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {txns.length === 0
              ? 'Im gewählten Zeitraum gibt es keine Einnahmen oder Ausgaben.'
              : 'Passe die Filter an oder setze sie zurück.'}
          </p>
          {lokalAktiv && (
            <button
              type="button"
              onClick={() => setForm(LEERES_FORMULAR)}
              className="mt-3 h-10 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted sm:h-8"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: Tabelle mit festem Kopf */}
          <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
            <div className="max-h-[75vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    {kopf('datum', 'Datum')}
                    {kopf('partei', 'Gegenpartei / Zweck')}
                    <th scope="col" className="sticky top-0 z-10 bg-muted px-4 py-2.5 text-left font-medium">Kategorie</th>
                    {kopf('betrag', 'Betrag', true)}
                  </tr>
                </thead>
                <tbody>
                  {angezeigt.map(g => (
                    <GruppeZeilen key={g.datum ?? 'alle'}>
                      {g.datum && (
                        <tr className="bg-muted/30">
                          <th scope="rowgroup" colSpan={3} className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">
                            {tagLabel(g.datum)}
                          </th>
                          <td className="px-4 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                            {saldoText(g.summe)}
                          </td>
                        </tr>
                      )}
                      {g.buchungen.map(tx => (
                        <tr
                          key={tx.id}
                          onClick={() => setDetailId(tx.id)}
                          className="cursor-pointer border-b border-border transition-colors hover:bg-muted/30"
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                            {fmtDate(tx.date, dateFormat)}
                          </td>
                          <td className="max-w-[360px] px-4 py-2.5">
                            <span className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setDetailId(tx.id) }}
                                className="truncate text-left text-xs font-medium hover:underline"
                              >
                                {parteiVon(tx)}
                              </button>
                              {artBadge(tx)}
                            </span>
                            <span className="line-clamp-1 block text-xs text-muted-foreground">
                              {tx.description ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">{kategorieChip(tx)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">{betrag(tx)}</td>
                        </tr>
                      ))}
                    </GruppeZeilen>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobil: Karten statt Tabelle, ganze Karte ist das Tap-Ziel */}
          <div className="space-y-2 sm:hidden">
            {angezeigt.map(g => (
              <div key={g.datum ?? 'alle'} className="space-y-2">
                {g.datum && (
                  <div className="flex items-baseline justify-between gap-2 px-1 pt-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate font-medium">{tagLabel(g.datum)}</span>
                    <span className="shrink-0 tabular-nums">{saldoText(g.summe)}</span>
                  </div>
                )}
                {g.buchungen.map(tx => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setDetailId(tx.id)}
                    className="block min-h-12 w-full space-y-1.5 rounded-lg border border-border bg-card p-3 text-left transition-colors active:bg-muted/50"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{parteiVon(tx)}</span>
                        {artBadge(tx)}
                      </span>
                      <span className="shrink-0 text-sm">{betrag(tx)}</span>
                    </span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{tx.description ?? '—'}</span>
                    <span className="flex items-center justify-between gap-2">
                      {kategorieChip(tx)}
                      {!g.datum && (
                        <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(tx.date, dateFormat)}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {rest > 0 ? (
              <button
                type="button"
                onClick={() => setSeite({ schluessel, n: sichtbar + SCHRITT })}
                className="h-10 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted sm:h-8"
              >
                Weitere {Math.min(rest, SCHRITT)} laden
              </button>
            ) : <span />}
            <p className="text-xs text-muted-foreground">
              {rest > 0 ? `${gefiltert.length - rest} von ${gefiltert.length} Buchungen` : `${gefiltert.length} Buchungen`}
            </p>
          </div>
        </>
      )}

      <AnalyseBuchungDetail
        tx={detailTx}
        onClose={() => setDetailId(null)}
        locale={locale}
        dateFormat={dateFormat}
        kontoName={detailTx?.account_id ? kontoNamen.get(detailTx.account_id) ?? null : null}
      />
    </div>
  )
}

/** Fragment mit Key-Stuetze: mehrere <tr> je Gruppe, ohne ein Wrapper-Element in <tbody>. */
function GruppeZeilen({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
