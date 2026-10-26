'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDate } from '@/lib/format'
import { ART_LABEL, TYP_LABEL, type Art, type Typ } from '@/lib/transaktionen/filter'
import { STEUERROLLE_LABEL } from '@/lib/analyse/buchungen'
import { ladeBuchungsDetail, type BuchungsDetailDaten } from '@/app/(dashboard)/finance/(transaktionen)/transactions/detail-actions'
import { formatBetrag } from '@/components/konten/detail/format'
import { betragTon, herkunftText, TON_KLASSE, vorzeichenText } from './auswahl'

/**
 * Detailansicht einer Buchung der Transaktionen-Liste (Seitenfenster). Die Liste trägt nur das Nötigste;
 * Volltext, Wertstellung, Gegenkonto und KI-Vorschlag werden erst beim Öffnen per Server Action geholt.
 * Nur lesend: die Kategorie ändert man in der Liste, manuelle Buchungen über das Stift-Symbol dort.
 */

export interface DetailZiel {
  id: string
  source: 'manual' | 'bank_sync'
  /** Anzeigename für die Kopfzeile, solange die Daten laden. */
  titel: string
}

type Ergebnis = { schluessel: string; daten: BuchungsDetailDaten | null; fehler: string | null }

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 border-b border-border py-2 text-sm last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const leer = <span className="text-muted-foreground">—</span>

export function BuchungsDetail({
  ziel, onClose, locale, dateFormat,
}: {
  ziel: DetailZiel | null
  onClose: () => void
  locale: string
  dateFormat: string
}) {
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const schluessel = ziel ? `${ziel.source}:${ziel.id}` : null

  useEffect(() => {
    if (!ziel || !schluessel) return
    let abgebrochen = false
    ladeBuchungsDetail(ziel.id, ziel.source)
      .then(res => {
        if (abgebrochen) return
        setErgebnis('error' in res
          ? { schluessel, daten: null, fehler: res.error }
          : { schluessel, daten: res.daten, fehler: null })
      })
      .catch(() => {
        if (!abgebrochen) setErgebnis({ schluessel, daten: null, fehler: 'Die Details konnten nicht geladen werden.' })
      })
    return () => { abgebrochen = true }
  }, [ziel, schluessel])

  // Ergebnis einer früheren Buchung zählt nicht: dann wird noch geladen.
  const aktuell = ergebnis && ergebnis.schluessel === schluessel ? ergebnis : null
  const d = aktuell?.daten ?? null

  return (
    <Sheet open={ziel !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {ziel && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8 break-words">{d?.merchant || d?.beschreibung?.slice(0, 60) || ziel.titel}</SheetTitle>
              <SheetDescription asChild>
                <div>
                  {d ? (
                    <span className={`text-lg font-semibold tabular-nums ${TON_KLASSE[betragTon(d.type, d.signedAmount)]}`}>
                      {vorzeichenText(d.signedAmount)}{formatBetrag(Math.abs(d.amount), d.currency, locale)}
                    </span>
                  ) : aktuell ? null : (
                    <Skeleton className="h-6 w-28" />
                  )}
                  {d && d.flowKind !== 'echt' && (
                    <span className="ml-2 text-xs text-muted-foreground">{ART_LABEL[d.flowKind as Art] ?? d.flowKind}</span>
                  )}
                </div>
              </SheetDescription>
            </SheetHeader>

            {aktuell === null && (
              <div className="space-y-3 px-4 pb-6" role="status" aria-label="Details werden geladen">
                {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            )}

            {aktuell?.fehler && (
              <p className="mx-4 rounded-md border border-border bg-card p-3 text-sm text-danger" role="alert">
                {aktuell.fehler}
              </p>
            )}

            {d && (
              <dl className="px-4 pb-6">
                <Feld label="Buchungsdatum">{fmtDate(d.bookedDate ?? d.date, dateFormat)}</Feld>
                {d.valueDate && d.valueDate !== (d.bookedDate ?? d.date) && (
                  <Feld label="Wertstellung">{fmtDate(d.valueDate, dateFormat)}</Feld>
                )}
                <Feld label="Empfänger">{d.merchant ?? d.counterpartName ?? leer}</Feld>
                <Feld label="Verwendungszweck">
                  {d.beschreibung ? <span className="whitespace-pre-wrap">{d.beschreibung}</span> : leer}
                </Feld>
                <Feld label="Konto">{d.accountName ?? leer}</Feld>
                <Feld label="Quelle">{d.source === 'bank_sync' ? 'Bank-Sync' : 'Manuell'}</Feld>
                <Feld label="Buchungsart">
                  {ART_LABEL[d.flowKind as Art] ?? d.flowKind}
                  <span className="text-muted-foreground"> · {TYP_LABEL[d.type as Typ] ?? d.type}</span>
                </Feld>
                <Feld label="Kategorie">
                  {d.categoryName ?? <span className="text-muted-foreground">Ohne Kategorie</span>}
                  {d.categoryPath && d.categoryPath !== d.categoryName && (
                    <span className="block text-xs text-muted-foreground">{d.categoryPath}</span>
                  )}
                  {d.categoryName && herkunftText(d.categorySource) && (
                    <span className="block text-xs text-muted-foreground">Herkunft: {herkunftText(d.categorySource)}</span>
                  )}
                  {d.aiAbweichend && d.aiCategoryName && (
                    <span className="block text-xs text-muted-foreground">KI schlug vor: {d.aiCategoryName}</span>
                  )}
                </Feld>
                {d.taxRole && <Feld label="Steuerrolle">{STEUERROLLE_LABEL[d.taxRole] ?? d.taxRole}</Feld>}
                {d.counterpartIban && <Feld label="Gegenkonto"><span className="break-all tabular-nums">{d.counterpartIban}</span></Feld>}
                {d.bankReference && <Feld label="Bank-Referenz"><span className="break-all">{d.bankReference}</span></Feld>}
              </dl>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
