import { AlertTriangle } from 'lucide-react'
import type { Auffaelligkeit, Luecke } from '@/lib/verlauf/networth'
import type { NetWorthZeile } from '@/lib/data/verlauf-networth'
import { fmtNum, fmtDate } from './shared'
import { SnapshotAktionen } from './SnapshotAktionen'

const SICHTBARE_LUECKEN = 5

function werteVon(z: NetWorthZeile) {
  return {
    total_checking: z.total_checking, total_investment: z.total_investment,
    total_savings: z.total_savings, total_cash: z.total_cash, total_depot: z.total_depot,
    total_crypto: z.total_crypto, total_bausparer: z.total_bausparer,
    total_business: z.total_business, total_debts: z.total_debts,
  }
}

/**
 * Hinweis auf Datenlücken und auffällige Snapshots. Lücken sind nur Information (der tägliche
 * Snapshot holt die letzten drei Tage selbst nach); auffällige Snapshots (Net Worth 0 oder
 * Sprung > 30 %) lassen sich hier direkt korrigieren oder löschen. Zeigt nichts, wenn alles
 * in Ordnung ist.
 */
export function DatenqualitaetHinweis({ luecken, auffaellig, zeilen, locale, dateFormat }: {
  luecken: Luecke[]
  auffaellig: Auffaelligkeit[]
  zeilen: NetWorthZeile[]
  locale: string
  dateFormat: string
}) {
  if (!luecken.length && !auffaellig.length) return null
  const nachDatum = new Map(zeilen.map(z => [z.datum, z]))
  const d = (s: string) => fmtDate(s, dateFormat)

  const text = (l: Luecke) =>
    `${l.tage} ${l.tage === 1 ? 'Tag' : 'Tage'} ohne Snapshot: ${l.von === l.bis ? d(l.von) : `${d(l.von)} – ${d(l.bis)}`}`
  // Neueste zuerst: alte Lücken aus der Anfangszeit sind selten noch relevant.
  const lueckenDesc = [...luecken].reverse()
  const sichtbar = lueckenDesc.slice(0, SICHTBARE_LUECKEN)
  const rest = lueckenDesc.slice(SICHTBARE_LUECKEN)

  return (
    <div className="mx-4 mb-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm space-y-3" role="status">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 text-warning" aria-hidden />
        Datenqualität
      </p>

      {auffaellig.length > 0 && (
        <ul className="space-y-1.5">
          {[...auffaellig].reverse().map(a => {
            const z = nachDatum.get(a.datum)
            return (
              <li key={a.datum} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span>
                  {d(a.datum)}:{' '}
                  {a.grund === 'null'
                    ? 'Net Worth ist 0 €'
                    : `Sprung von ${a.prozent != null && a.prozent > 0 ? '+' : ''}${fmtNum(a.prozent ?? 0, 0, locale)} % zum vorherigen Snapshot`}
                </span>
                {z && <SnapshotAktionen id={z.id} datumLabel={d(a.datum)} werte={werteVon(z)} locale={locale} />}
              </li>
            )
          })}
        </ul>
      )}

      {luecken.length > 0 && (
        <div className="space-y-1 text-muted-foreground">
          <ul className="space-y-0.5">
            {sichtbar.map(l => <li key={l.von}>{text(l)}</li>)}
          </ul>
          {rest.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs">{rest.length} ältere Lücken anzeigen</summary>
              <ul className="mt-1 space-y-0.5">
                {rest.map(l => <li key={l.von}>{text(l)}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
