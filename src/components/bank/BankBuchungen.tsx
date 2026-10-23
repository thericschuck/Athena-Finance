'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeftRight, ArrowUp, TrendingDown, TrendingUp, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { useUrlFilters } from '@/components/providers/url-filters'
import {
  LEERER_FILTER,
  filterBuchungen,
  gruppiereNachTag,
  ibanMenge,
  istUmbuchung,
  kategorieMitKindern,
  parseBetrag,
  schneideGruppen,
  sortiereBuchungen,
  summeOhneUmbuchung,
  type SortFeld,
  type Sortierung,
} from '@/lib/bank/buchungen'
import type { BankAbschnittProps } from '@/lib/bank/typen'
import type { BankTransaction } from '@/types/bank'
import { BankBuchungDetail } from './BankBuchungDetail'
import { BankBuchungFilter, LEERES_FORMULAR, type FilterFormular } from './BankBuchungFilter'
import {
  KategorieAuswahl,
  KategorieZelle,
  kategorieOptionen,
} from './BankBuchungKategorie'

/** Schrittweite von „Mehr laden" — und zugleich die erste Seite. */
const SCHRITT = 50
/** Obergrenze der Sammelaktion; muss zur Route /api/bank/transactions/bulk passen. */
const MAX_AUSWAHL = 200

function letzterTag(monat: string): string {
  const [j, m] = monat.split('-').map(Number)
  return `${monat}-${String(new Date(Date.UTC(j, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/**
 * Buchungsliste der Bankdaten-Seite.
 *
 * Ausgangsmenge ist `scope.liste` (Konto und Monat aus der URL, aber NICHT der Zeitraum —
 * dort ist die komplette Historie samt Suche der Zweck). Darauf kommen die URL-Filter
 * `partei` und `kat` (die Chips dafuer zeigt die Seite selbst) und die lokalen Filter, die
 * ohne Serverrunde im Browser laufen.
 *
 * Kategorie-Aenderungen sind optimistisch: sie landen sofort in `ueberschreibungen` und
 * werden bei einem Fehler zurueckgenommen. Nach Erfolg holt `router.refresh()` die Seite neu,
 * damit auch Kennzahlen und Kategorien-Abschnitt den neuen Stand zeigen.
 */
export function BankBuchungen({ daten, scope }: BankAbschnittProps) {
  const router = useRouter()
  const urlFilter = useUrlFilters()
  const { locale, dateFormat } = daten
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  const urlPartei = urlFilter.get('partei') ?? ''
  const urlKat = urlFilter.get('kat') ?? ''

  const [form, setForm] = useState<FilterFormular>(LEERES_FORMULAR)
  const [sortierung, setSortierung] = useState<Sortierung>({ feld: 'datum', richtung: 'ab' })
  const [ueberschreibungen, setUeberschreibungen] = useState<Record<string, string | null>>({})
  const [auswahl, setAuswahl] = useState<ReadonlySet<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laufend, setLaufend] = useState(false)
  const [sammelKat, setSammelKat] = useState('')
  const [seite, setSeite] = useState({ schluessel: '', n: SCHRITT })

  // Nach dem Neuladen der Seite spiegeln die Props den Server-Stand wieder.
  useEffect(() => { setUeberschreibungen({}) }, [scope.liste])

  const eigene = useMemo(() => ibanMenge(daten.eigeneIbans), [daten.eigeneIbans])
  const kategorien = useMemo(() => new Map(daten.categories.map(c => [c.id, c])), [daten.categories])
  const optionen = useMemo(() => kategorieOptionen(daten.categories), [daten.categories])

  const qSpaet = useDeferredValue(form.q)

  const effektiv = useMemo(
    () => scope.liste.map(t => (t.id in ueberschreibungen ? { ...t, category_id: ueberschreibungen[t.id] } : t)),
    [scope.liste, ueberschreibungen],
  )

  const lokalerFilter = useMemo(() => ({
    ...LEERER_FILTER,
    q: qSpaet,
    kategorie: form.kategorie,
    min: parseBetrag(form.minText),
    max: parseBetrag(form.maxText),
    von: form.von,
    bis: form.bis,
    typ: form.typ,
  }), [qSpaet, form.kategorie, form.minText, form.maxText, form.von, form.bis, form.typ])

  const gefiltert = useMemo(() => {
    const ausUrl = filterBuchungen(effektiv, {
      ...LEERER_FILTER, partei: urlPartei, kategorie: urlKat,
      kategorieMenge: urlKat && urlKat !== 'offen' ? kategorieMitKindern(urlKat, daten.categories) : undefined,
    }, eigene)
    return sortiereBuchungen(filterBuchungen(ausUrl, lokalerFilter, eigene), sortierung)
  }, [effektiv, urlPartei, urlKat, lokalerFilter, sortierung, eigene, daten.categories])

  const gruppen = useMemo(
    () => gruppiereNachTag(gefiltert, sortierung.feld, eigene),
    [gefiltert, sortierung.feld, eigene],
  )

  // „Mehr laden" faengt bei jeder Filteraenderung wieder bei einer Seite an — sonst zeigte eine
  // Suche mit drei Treffern den Stand der vorherigen Liste. Ueber einen Schluessel statt eines
  // Effekts, damit es keinen Zwischenrender mit alter Seitenlaenge gibt.
  const schluessel = JSON.stringify([lokalerFilter, urlPartei, urlKat, sortierung, daten.konto, daten.monat])
  const sichtbar = seite.schluessel === schluessel ? seite.n : SCHRITT
  const angezeigt = useMemo(() => schneideGruppen(gruppen, sichtbar), [gruppen, sichtbar])
  const rest = gefiltert.length - Math.min(sichtbar, gefiltert.length)
  const angezeigteAnzahl = gefiltert.length - rest

  const sichtbareIds = useMemo(
    () => angezeigt.flatMap(g => g.buchungen.map(t => t.id)),
    [angezeigt],
  )
  // Auswahl, die durch einen Filter aus der Liste fiel, zaehlt nicht mehr mit — sonst
  // wuerde die Sammelaktion Buchungen aendern, die man gar nicht sieht.
  const ausgewaehlt = useMemo(() => {
    const sichtbarSet = new Set(gefiltert.map(t => t.id))
    return [...auswahl].filter(id => sichtbarSet.has(id))
  }, [auswahl, gefiltert])

  const detailTx = detailId ? effektiv.find(t => t.id === detailId) ?? null : null

  const lokalAktiv =
    form.q !== '' || form.kategorie !== '' || form.minText !== '' || form.maxText !== '' ||
    form.von !== '' || form.bis !== '' || form.typ !== 'alle'

  const exportHref = useMemo(() => {
    const p = new URLSearchParams()
    if (daten.konto) p.set('konto', daten.konto)
    let von = form.von
    let bis = form.bis
    if (daten.monat) {
      // Die Liste ist auf den Monat eingeschraenkt; der Export kennt nur von/bis.
      const mVon = `${daten.monat}-01`
      const mBis = letzterTag(daten.monat)
      if (!von || von < mVon) von = mVon
      if (!bis || bis > mBis) bis = mBis
    }
    if (von) p.set('von', von)
    if (bis) p.set('bis', bis)
    if (form.q.trim()) p.set('q', form.q.trim())
    const kat = form.kategorie || urlKat
    if (kat) p.set('kat', kat)
    if (urlPartei) p.set('partei', urlPartei)
    if (form.typ !== 'alle') p.set('typ', form.typ)
    if (form.minText) p.set('min', form.minText)
    if (form.maxText) p.set('max', form.maxText)
    const s = p.toString()
    return s ? `/api/export/bank?${s}` : '/api/export/bank'
  }, [daten.konto, daten.monat, form, urlKat, urlPartei])

  // ── Aktionen ───────────────────────────────────────────────────────────────
  async function setzeKategorie(ids: string[], categoryId: string | null) {
    if (ids.length === 0) return
    const vorher: Record<string, string | null> = {}
    for (const id of ids) vorher[id] = effektiv.find(t => t.id === id)?.category_id ?? null

    setFehler(null)
    setLaufend(true)
    setUeberschreibungen(u => ({ ...u, ...Object.fromEntries(ids.map(id => [id, categoryId])) }))

    try {
      const res = ids.length === 1
        ? await fetch(`/api/bank/transactions/${ids[0]}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: categoryId }),
          })
        : await fetch('/api/bank/transactions/bulk', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, category_id: categoryId }),
          })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Fehler ${res.status}`)
      }
      if (ids.length > 1) setAuswahl(new Set())
      router.refresh()
    } catch (e) {
      // Rollback: den Zustand von vorher wiederherstellen.
      setUeberschreibungen(u => ({ ...u, ...vorher }))
      setFehler(`Kategorie konnte nicht gespeichert werden: ${e instanceof Error ? e.message : 'unbekannter Fehler'}`)
    } finally {
      setLaufend(false)
    }
  }

  function umschalten(id: string, an: boolean) {
    setAuswahl(a => {
      const n = new Set(a)
      if (an) n.add(id)
      else n.delete(id)
      return n
    })
  }

  const alleSichtbarGewaehlt = sichtbareIds.length > 0 && sichtbareIds.every(id => auswahl.has(id))
  function alleSichtbare(an: boolean) {
    setAuswahl(a => {
      const n = new Set(a)
      for (const id of sichtbareIds.slice(0, MAX_AUSWAHL)) {
        if (an) n.add(id)
        else n.delete(id)
      }
      return n
    })
  }

  function sortiereNach(feld: SortFeld) {
    setSortierung(s => (s.feld === feld
      ? { feld, richtung: s.richtung === 'ab' ? 'auf' : 'ab' }
      : { feld, richtung: feld === 'partei' ? 'auf' : 'ab' }))
  }

  function reset() {
    setForm(LEERES_FORMULAR)
  }

  // ── Darstellung ────────────────────────────────────────────────────────────
  const tagLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${d}T00:00:00Z`))

  const betrag = (tx: BankTransaction, umb: boolean) => {
    const gut = tx.amount >= 0
    return (
      <span className={`inline-flex items-center justify-end gap-1 font-medium ${
        umb ? 'text-muted-foreground' : gut ? 'text-success' : 'text-danger'
      }`}>
        {umb
          ? <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
          : gut ? <TrendingUp className="size-3.5 shrink-0" aria-hidden /> : <TrendingDown className="size-3.5 shrink-0" aria-hidden />}
        <span className="tabular-nums">{gut ? '+' : ''}{fmtEur(tx.amount)}</span>
      </span>
    )
  }

  const umbBadge = (
    <span className="inline-flex shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      Umbuchung
    </span>
  )

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

  const summe = summeOhneUmbuchung(gefiltert, eigene)

  return (
    <section aria-labelledby="bank-buchungen-titel" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bank-buchungen-titel" className="text-sm font-semibold">Buchungen</h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {gefiltert.length} {gefiltert.length === 1 ? 'Buchung' : 'Buchungen'}
          {gefiltert.length > 0 && <> · Saldo ohne Umbuchungen <span className="tabular-nums">{summe >= 0 ? '+' : ''}{fmtEur(summe)}</span></>}
        </p>
      </div>

      <BankBuchungFilter
        form={form}
        onChange={p => setForm(f => ({ ...f, ...p }))}
        sortierung={sortierung}
        onSort={setSortierung}
        optionen={optionen}
        aktiv={lokalAktiv}
        onReset={reset}
        exportHref={exportHref}
      />

      {fehler && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{fehler}</span>
          <button type="button" onClick={() => setFehler(null)} aria-label="Meldung schliessen">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {ausgewaehlt.length > 0 && (
        <div
          role="region"
          aria-label="Sammelaktion"
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs"
        >
          <span className="font-medium">{ausgewaehlt.length} ausgewählt</span>
          <KategorieAuswahl
            wert={sammelKat}
            onChange={setSammelKat}
            optionen={optionen}
            platzhalter="Kategorie wählen"
            ariaLabel="Kategorie für die Auswahl"
            extra={[{ value: '__none__', label: 'Ohne Kategorie' }]}
          />
          <button
            type="button"
            disabled={!sammelKat || laufend || ausgewaehlt.length > MAX_AUSWAHL}
            onClick={() => setzeKategorie(ausgewaehlt, sammelKat === '__none__' ? null : sammelKat)}
            className="h-8 rounded-md bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            Kategorie setzen für {ausgewaehlt.length} {ausgewaehlt.length === 1 ? 'Buchung' : 'Buchungen'}
          </button>
          <button
            type="button"
            onClick={() => setAuswahl(new Set())}
            className="h-8 rounded-md px-2 text-muted-foreground hover:text-foreground"
          >
            Auswahl aufheben
          </button>
          {ausgewaehlt.length > MAX_AUSWAHL && (
            <span className="text-danger">Höchstens {MAX_AUSWAHL} Buchungen auf einmal.</span>
          )}
        </div>
      )}

      {gefiltert.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm font-medium">
            {scope.liste.length === 0 ? 'Keine Buchungen' : 'Keine Treffer'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scope.liste.length === 0
              ? 'Synchronisiere dein Konto, um Buchungen zu laden.'
              : 'Passe die Filter an oder setze sie zurück.'}
          </p>
          {lokalAktiv && (
            <button type="button" onClick={reset} className="mt-3 h-8 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted">
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
                    <th scope="col" className="sticky top-0 z-10 w-10 bg-muted px-4 py-2.5">
                      <Checkbox
                        checked={alleSichtbarGewaehlt}
                        onCheckedChange={v => alleSichtbare(v === true)}
                        aria-label="Alle sichtbaren Buchungen auswählen"
                      />
                    </th>
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
                          <th scope="rowgroup" colSpan={4} className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">
                            {tagLabel(g.datum)}
                          </th>
                          <td className="px-4 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                            {g.summe >= 0 ? '+' : ''}{fmtEur(g.summe)}
                          </td>
                        </tr>
                      )}
                      {g.buchungen.map(tx => {
                        const umb = istUmbuchung(tx, eigene)
                        const gewaehlt = auswahl.has(tx.id)
                        return (
                          <tr
                            key={tx.id}
                            onClick={() => setDetailId(tx.id)}
                            className={`cursor-pointer border-b border-border transition-colors hover:bg-muted/30 ${
                              umb ? 'opacity-60' : ''
                            } ${gewaehlt ? 'bg-muted/40' : ''}`}
                          >
                            <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={gewaehlt}
                                onCheckedChange={v => umschalten(tx.id, v === true)}
                                aria-label={`Buchung vom ${fmtDate(tx.value_date, dateFormat)} auswählen`}
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                              {fmtDate(tx.value_date, dateFormat)}
                            </td>
                            <td className="max-w-[320px] px-4 py-2.5">
                              <span className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDetailId(tx.id)}
                                  className="truncate text-left text-xs font-medium hover:underline"
                                >
                                  {tx.counterpart_name ?? '—'}
                                </button>
                                {umb && umbBadge}
                              </span>
                              <span className="line-clamp-1 block text-xs text-muted-foreground">
                                {tx.description ?? tx.raw_description ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <KategorieZelle
                                wert={tx.category_id}
                                kategorien={kategorien}
                                optionen={optionen}
                                onChange={c => setzeKategorie([tx.id], c)}
                                disabled={laufend}
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right">{betrag(tx, umb)}</td>
                          </tr>
                        )
                      })}
                    </GruppeZeilen>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobil: Karten */}
          <div className="space-y-2 sm:hidden">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={alleSichtbarGewaehlt}
                onCheckedChange={v => alleSichtbare(v === true)}
                aria-label="Alle sichtbaren Buchungen auswählen"
              />
              Alle sichtbaren auswählen
            </label>
            {angezeigt.map(g => (
              <div key={g.datum ?? 'alle'} className="space-y-2">
                {g.datum && (
                  <div className="flex items-baseline justify-between px-1 pt-2 text-xs text-muted-foreground">
                    <span className="font-medium">{tagLabel(g.datum)}</span>
                    <span className="tabular-nums">{g.summe >= 0 ? '+' : ''}{fmtEur(g.summe)}</span>
                  </div>
                )}
                {g.buchungen.map(tx => {
                  const umb = istUmbuchung(tx, eigene)
                  return (
                    <div
                      key={tx.id}
                      className={`flex items-start gap-3 rounded-lg border border-border bg-card p-3 ${umb ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        className="mt-1"
                        checked={auswahl.has(tx.id)}
                        onCheckedChange={v => umschalten(tx.id, v === true)}
                        aria-label={`Buchung vom ${fmtDate(tx.value_date, dateFormat)} auswählen`}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailId(tx.id)}
                          className="block w-full text-left"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{tx.counterpart_name ?? '—'}</span>
                              {umb && umbBadge}
                            </span>
                            <span className="shrink-0 text-sm">{betrag(tx, umb)}</span>
                          </span>
                          <span className="line-clamp-2 block text-xs text-muted-foreground">
                            {tx.description ?? tx.raw_description ?? '—'}
                          </span>
                          {!g.datum && (
                            <span className="block text-xs text-muted-foreground">{fmtDate(tx.value_date, dateFormat)}</span>
                          )}
                        </button>
                        <KategorieZelle
                          wert={tx.category_id}
                          kategorien={kategorien}
                          optionen={optionen}
                          onChange={c => setzeKategorie([tx.id], c)}
                          disabled={laufend}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {rest > 0 ? (
              <button
                type="button"
                onClick={() => setSeite({ schluessel, n: sichtbar + SCHRITT })}
                className="h-8 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted"
              >
                Weitere {Math.min(rest, SCHRITT)} laden
              </button>
            ) : <span />}
            <p className="text-xs text-muted-foreground">
              {rest > 0 ? `${angezeigteAnzahl} von ${gefiltert.length} Buchungen` : `${gefiltert.length} Buchungen`}
            </p>
          </div>
        </>
      )}

      <BankBuchungDetail
        tx={detailTx}
        onClose={() => setDetailId(null)}
        umbuchung={detailTx ? istUmbuchung(detailTx, eigene) : false}
        locale={locale}
        dateFormat={dateFormat}
        kategorien={kategorien}
        optionen={optionen}
        onKategorie={(id, c) => setzeKategorie([id], c)}
        speichert={laufend}
      />
    </section>
  )
}

/** Fragment mit Key-Stuetze: mehrere <tr> je Gruppe, ohne ein Wrapper-Element in <tbody>. */
function GruppeZeilen({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
