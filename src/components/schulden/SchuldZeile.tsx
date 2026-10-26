import { CalendarDays, ChevronRight } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { HoverInfo } from '@/components/ui/hover-info'
import { DebtPaymentDialog, DeleteDebtButton, EditDebtDialog, SettleDebtButton } from '@/components/finance/debt-payment-form'
import { RestschuldVerlauf } from '@/components/schulden/RestschuldVerlauf'
import { ZahlungLoeschen } from '@/components/schulden/ZahlungLoeschen'
import type { SchuldMitZahlungen } from '@/lib/data/schulden-seite'
import {
  addMonate,
  formatDatum,
  formatMonatJahr,
  fortschritt,
  istUeberfaellig,
  restlaufzeitMonate,
  restschuldVerlauf,
  restzinsen,
  tageBis,
  zahlungsAnteile,
} from '@/lib/schulden/berechnen'

/**
 * Eine Schuld als Zeile: Name/Gegenpartei links, Restschuld rechts, darunter Fortschrittsbalken mit
 * Hover-Karte, optional Restschuld-Verlauf, Aktionen und zuklappbare Zahlungen (natives details,
 * ohne Client-Code). Aktionen sind am Handy immer sichtbar, am Desktop erscheinen Bearbeiten/Löschen
 * bei Hover oder Fokus. Server-Komponente.
 */
export function SchuldZeile({
  schuld: s, locale, dateFormat, heute,
}: {
  schuld: SchuldMitZahlungen
  locale: string
  dateFormat: string
  heute: string
}) {
  const geliehen = s.type === 'borrowed'
  const euro = (n: number, d = 2) => fmtCurrency(n, s.currency, locale, { fractionDigits: d })
  const f = fortschritt(s.original_amount, s.outstanding)
  const ueberfaellig = istUeberfaellig(s.due_date, heute, s.is_active)
  const tage = s.due_date && s.is_active ? tageBis(s.due_date, heute) : null
  const bald = tage !== null && tage >= 0 && tage <= 14
  const monate = s.is_active ? restlaufzeitMonate(s.outstanding, s.interest_rate, s.monthly_payment) : null
  const ende = monate !== null && monate > 0 ? addMonate(heute, monate) : null
  const zinsRest = s.is_active ? restzinsen(s.outstanding, s.interest_rate, s.monthly_payment) : null
  const verlauf = restschuldVerlauf(s.outstanding, s.zahlungen, s.angelegt)
  const summeZinsen = s.zahlungen.reduce((a, z) => a + zahlungsAnteile(z).zinsen, 0)

  const ton = !s.is_active ? 'text-muted-foreground' : geliehen ? 'text-danger' : 'text-success'
  const balken = !s.is_active ? 'bg-muted-foreground/40' : geliehen ? 'bg-danger' : 'bg-success'

  const meta: string[] = []
  if (s.creditor) meta.push(s.creditor)
  if (s.interest_rate != null && s.interest_rate > 0) meta.push(`${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(s.interest_rate)} % p.a.`)
  if (s.monthly_payment) meta.push(`Rate ${euro(s.monthly_payment, 0)}/Monat`)

  const hoverZeilen: [string, string][] = [
    ['Gesamtbetrag', euro(s.original_amount)],
    ['Getilgt', euro(f.getilgt)],
    ['Offen', euro(s.outstanding)],
  ]
  if (summeZinsen > 0) hoverZeilen.push(['Davon gezahlte Zinsen', euro(summeZinsen)])
  if (monate !== null && monate > 0) hoverZeilen.push(['Noch ca.', `${monate} ${monate === 1 ? 'Monat' : 'Monate'}`])
  if (zinsRest !== null && zinsRest > 0) hoverZeilen.push(['Zinsen bis Ende', euro(zinsRest)])

  return (
    <li className="group min-w-0 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 max-w-full truncate font-medium">{s.name}</p>
            {!s.is_active && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Abgeschlossen</span>}
            {ueberfaellig && <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Überfällig</span>}
            {bald && <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">{tage === 0 ? 'Heute fällig' : `Fällig in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`}</span>}
          </div>
          {meta.length > 0 && <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta.join(' · ')}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-semibold tabular-nums leading-tight ${ton}`}>{euro(s.outstanding)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">von {euro(s.original_amount, 0)}</p>
        </div>
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={f.prozent} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name}: ${f.prozent} % getilgt`}>
            <div className={`h-full rounded-full ${balken}`} style={{ width: `${f.prozent}%` }} />
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <HoverInfo
              titel={s.name}
              zeilen={hoverZeilen}
              text={geliehen ? 'Getilgt ist, was von der Schuld bereits bezahlt wurde.' : 'Zurückerhalten ist, was vom verliehenen Betrag schon zurück ist.'}
            >
              {f.prozent} % {geliehen ? 'getilgt' : 'zurück'}
            </HoverInfo>
            {s.due_date && (
              <span className={`inline-flex items-center gap-1 ${ueberfaellig ? 'font-medium text-danger' : ''}`}>
                <CalendarDays className="size-3 shrink-0" aria-hidden />
                fällig {formatDatum(s.due_date, dateFormat)}
              </span>
            )}
            {ende && <span>frei ca. {formatMonatJahr(ende)}</span>}
          </div>
        </div>
        {verlauf.length >= 2 && (
          <RestschuldVerlauf punkte={verlauf} className={`hidden h-7 w-24 shrink-0 sm:block ${ton}`} />
        )}
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        {s.is_active && <DebtPaymentDialog debt={s} />}
        {s.is_active && <SettleDebtButton debt={s} />}
        <div className="ml-auto flex items-center opacity-100 md:opacity-0 md:transition-opacity md:focus-within:opacity-100 md:group-hover:opacity-100">
          <EditDebtDialog debt={s} />
          <DeleteDebtButton debt={s} />
        </div>
      </div>

      {s.zahlungen.length > 0 && (
        <details className="group/z mt-1">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:min-h-8 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/z:rotate-90" aria-hidden />
            Zahlungen ({s.zahlungen.length})
          </summary>
          {verlauf.length >= 2 && <RestschuldVerlauf punkte={verlauf} className={`mb-2 h-10 w-full sm:hidden ${ton}`} />}
          <ul className="divide-y divide-border rounded-md border border-border">
            {s.zahlungen.map(z => {
              const a = zahlungsAnteile(z)
              const beschr = `${formatDatum(z.payment_date, dateFormat)} · ${euro(z.amount)}`
              return (
                <li key={z.id} className="flex min-w-0 items-center gap-2 py-1 pl-3 pr-1 text-sm">
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatDatum(z.payment_date, dateFormat)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {z.interest != null && a.zinsen > 0 && <>davon {euro(a.zinsen)} Zinsen · </>}
                    {z.verknuepft && <>aus Buchung · </>}
                    {z.notes}
                  </span>
                  <span className={`shrink-0 font-medium tabular-nums ${geliehen ? 'text-danger' : 'text-success'}`}>{euro(z.amount)}</span>
                  <ZahlungLoeschen paymentId={z.id} beschreibung={beschr} />
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </li>
  )
}
