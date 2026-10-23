'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUrlFilters } from '@/components/providers/url-filters'
import { cn } from '@/lib/utils'
import { alterText, pruefeDatenzustand, scaBefunde, type Befund, type ScaBank } from '@/lib/bank/datenzustand'
import { fmtDate } from '@/lib/format'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Zustandsanzeige der Bankdaten. Bei Gesundheit EINE schmale Zeile („Daten aktuell · letzter
 * Sync vor 3 Std."), mit Aufklappen fuer die Details je Konto. Bei Problemen faellt sie auf:
 * farbige Karte, standardmaessig offen, jedes Problem mit Zeile und Link „Buchungen ansehen"
 * (setzt Konto und Monat in der URL). Die Regeln stehen in lib/bank/datenzustand.ts; ein
 * Saldo-Abgleich fehlt dort bewusst (siehe Kopfkommentar — er waere eine Tautologie).
 *
 * Client-Komponente, weil „vor 3 Std." die aktuelle Uhrzeit braucht und die Freigabe-Frist nur
 * ueber die Route /api/bank/sca-status erreichbar ist (fints_client_state ist nur per
 * Service-Role lesbar). Schlaegt die Abfrage fehl, bleibt die Freigabe-Pruefung einfach weg.
 */
export function BankDatenzustand({ daten }: BankAbschnittProps) {
  const { setMany } = useUrlFilters()
  const [jetzt] = useState(() => Date.now())
  const [sca, setSca] = useState<ScaBank[]>([])
  const [offen, setOffen] = useState<boolean | null>(null)

  useEffect(() => {
    let abgebrochen = false
    fetch('/api/bank/sca-status')
      .then(r => (r.ok ? r.json() : null))
      .then((j: { banks?: ScaBank[] } | null) => { if (!abgebrochen && j?.banks) setSca(j.banks) })
      .catch(() => { /* Freigabe-Pruefung ist optional */ })
    return () => { abgebrochen = true }
  }, [])

  const zustand = useMemo(() => {
    const z = pruefeDatenzustand({
      balances: daten.balances, transactions: daten.transactions, heute: daten.heute, jetzt,
    })
    return { ...z, befunde: [...scaBefunde(sca, jetzt), ...z.befunde] }
  }, [daten.balances, daten.transactions, daten.heute, jetzt, sca])

  if (daten.balances.length === 0) return null

  const { befunde, konten, juengsterSyncStunden } = zustand
  const schlimm = befunde.some(b => b.stufe === 'fehler')
  const hatProbleme = befunde.length > 0
  // Bei Problemen standardmaessig offen, bei Gesundheit zu — solange der Nutzer nicht selbst klickt.
  const istOffen = offen ?? hatProbleme

  const sync = juengsterSyncStunden !== null ? `letzter Sync ${alterText(juengsterSyncStunden)}` : 'noch nie synchronisiert'
  const titel = hatProbleme
    ? `${befunde.length} ${befunde.length === 1 ? 'Hinweis' : 'Hinweise'} zur Datenqualität`
    : 'Daten aktuell'

  const Icon = !hatProbleme ? CheckCircle2 : schlimm ? XCircle : AlertTriangle

  const zeigeBuchungen = (b: Befund) =>
    setMany({ konto: b.iban, month: b.monat })

  return (
    <section
      aria-label="Datenzustand"
      className={cn(
        'rounded-lg border',
        !hatProbleme && 'border-border bg-card',
        hatProbleme && !schlimm && 'border-amber-500/40 bg-amber-500/5',
        schlimm && 'border-red-500/40 bg-red-500/5',
      )}
    >
      <button
        type="button"
        onClick={() => setOffen(!istOffen)}
        aria-expanded={istOffen}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Icon
          className={cn(
            'size-4 shrink-0',
            !hatProbleme && 'text-emerald-500',
            hatProbleme && !schlimm && 'text-amber-500',
            schlimm && 'text-red-500',
          )}
        />
        <span className="font-medium">{titel}</span>
        {/* Uhrzeit-abhaengig: darf zwischen Server und Browser um eine Stunde abweichen. */}
        <span className="text-muted-foreground" suppressHydrationWarning>· {sync}</span>
        <ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', istOffen && 'rotate-180')} />
      </button>

      {istOffen && (
        <div className="space-y-3 border-t border-border/60 px-3 py-3">
          {hatProbleme && (
            <ul className="space-y-2">
              {befunde.map((b, i) => (
                <li key={`${b.art}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  {b.stufe === 'fehler'
                    ? <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                    : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.titel}</p>
                    <p className="text-xs text-muted-foreground">{b.detail}</p>
                  </div>
                  {b.iban && (
                    <Button variant="outline" size="sm" className="h-7 shrink-0 px-2" onClick={() => zeigeBuchungen(b)}>
                      Buchungen ansehen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Konto</th>
                  <th className="py-1 pr-3 font-medium">Letzter Sync</th>
                  <th className="hidden py-1 pr-3 font-medium sm:table-cell">Letzte Buchung</th>
                  <th className="hidden py-1 text-right font-medium sm:table-cell">Buchungen</th>
                </tr>
              </thead>
              <tbody>
                {konten.map(k => (
                  <tr key={k.iban} className="border-t border-border/40">
                    <td className="py-1 pr-3">{k.name}</td>
                    <td
                      suppressHydrationWarning
                      className={cn(
                        'py-1 pr-3',
                        k.syncStufe === 'warn' && 'text-amber-600 dark:text-amber-400',
                        k.syncStufe === 'fehler' && 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {k.syncStunden !== null ? alterText(k.syncStunden) : '—'}
                    </td>
                    <td className="hidden py-1 pr-3 sm:table-cell">{fmtDate(k.letzteBuchung, daten.dateFormat)}</td>
                    <td className="hidden py-1 text-right tabular-nums sm:table-cell">{k.buchungen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            Geprüft: Alter des letzten Syncs (gelb ab 36 Std., rot ab 5 Tagen), Zeiträume ohne Buchung bei
            aktiven Konten, doppelte Buchungen und die Freigabe-Frist der Bank.
          </p>
        </div>
      )}
    </section>
  )
}
