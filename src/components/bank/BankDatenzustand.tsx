'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUrlFilters } from '@/components/providers/url-filters'
import { cn } from '@/lib/utils'
import { alterText, pruefeDatenzustand, scaBefunde, type ScaBank } from '@/lib/bank/datenzustand'
import { fmtDate } from '@/lib/format'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Zustandsanzeige der Bankdaten. Gesund: EINE einzeilige Zeile (mind. 40 px, gekuerzt) „Daten
 * aktuell · letzter Sync vor 3 Std."; die Tabelle je Konto liegt als Popover UEBER dem Inhalt,
 * damit sie die lange Seite nicht noch verlaengert. Bei Problemen wird die Zeile gelb/rot und
 * darunter stehen die Befunde kompakt (hoechstens 3, der Rest hinter „Weitere"), jeder mit
 * „Buchungen ansehen" (setzt Konto und Monat in der URL). Die Regeln stehen in lib/bank/datenzustand.ts; ein
 * Saldo-Abgleich fehlt dort bewusst (siehe Kopfkommentar — er waere eine Tautologie).
 *
 * Client-Komponente, weil „vor 3 Std." die aktuelle Uhrzeit braucht und die Freigabe-Frist nur
 * ueber die Route /api/bank/sca-status erreichbar ist (fints_client_state ist nur per
 * Service-Role lesbar). Schlaegt die Abfrage fehl, bleibt die Freigabe-Pruefung einfach weg.
 */
const MAX_SICHTBAR = 3

export function BankDatenzustand({ daten }: BankAbschnittProps) {
  const { setMany } = useUrlFilters()
  const [jetzt] = useState(() => Date.now())
  const [sca, setSca] = useState<ScaBank[]>([])
  const [alle, setAlle] = useState(false)

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

  const sync = juengsterSyncStunden !== null ? `letzter Sync ${alterText(juengsterSyncStunden)}` : 'noch nie synchronisiert'
  const titel = hatProbleme
    ? `${befunde.length} ${befunde.length === 1 ? 'Hinweis' : 'Hinweise'} zur Datenqualität`
    : 'Daten aktuell'
  const Icon = !hatProbleme ? CheckCircle2 : schlimm ? XCircle : AlertTriangle
  const sichtbar = alle ? befunde : befunde.slice(0, MAX_SICHTBAR)

  return (
    <section
      aria-label="Datenzustand"
      className={cn(
        // Gleiche Hoehe, Radius und Schrift wie BankOffeneKategorien (stehen untereinander).
        'min-w-0 rounded-lg border text-xs sm:text-[13px]',
        !hatProbleme && 'border-border bg-card',
        hatProbleme && !schlimm && 'border-amber-500/40 bg-amber-500/5',
        schlimm && 'border-red-500/40 bg-red-500/5',
      )}
    >
      <div className="flex min-h-10 min-w-0 items-center gap-2 px-3 py-1">
        <Icon
          className={cn(
            'size-4 shrink-0',
            !hatProbleme && 'text-emerald-500',
            hatProbleme && !schlimm && 'text-amber-500',
            schlimm && 'text-red-500',
          )}
        />
        {/* Einzeilig mit Kuerzung. Die Uhrzeit-Angabe darf zwischen Server und Browser um eine Stunde abweichen. */}
        <span className="min-w-0 flex-1 truncate" suppressHydrationWarning>
          <span className="font-medium">{titel}</span>
          <span className="text-muted-foreground"> · {sync}</span>
        </span>
        {/* Details als Popover ueber dem Inhalt, damit das Aufklappen die Seite nicht verlaengert. */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground">
              Details
              <ChevronDown className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(30rem,calc(100vw-2rem))] space-y-2 text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Konto</th>
                  <th className="py-1 pr-3 font-medium">Letzter Sync</th>
                  <th className="py-1 pr-3 font-medium">Letzte Buchung</th>
                  <th className="py-1 text-right font-medium">Anzahl</th>
                </tr>
              </thead>
              <tbody>
                {konten.map(k => (
                  <tr key={k.iban} className="border-t border-border/40">
                    <td className="max-w-32 truncate py-1 pr-3">{k.name}</td>
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
                    <td className="py-1 pr-3">{fmtDate(k.letzteBuchung, daten.dateFormat)}</td>
                    <td className="py-1 text-right tabular-nums">{k.buchungen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground/80">
              Geprüft: Alter des letzten Syncs (gelb ab 36 Std., rot ab 5 Tagen), Zeiträume ohne Buchung bei
              aktiven Konten, doppelte Buchungen und die Freigabe-Frist der Bank.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      {hatProbleme && (
        <ul className="space-y-1 border-t border-border/60 px-3 py-2">
          {sichtbar.map((b, i) => (
            <li key={`${b.art}-${i}`} className="flex min-w-0 items-center gap-2">
              {b.stufe === 'fehler'
                ? <XCircle className="size-3.5 shrink-0 text-red-500" />
                : <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />}
              <span className="min-w-0 flex-1 truncate" title={`${b.titel} — ${b.detail}`}>
                <span className="font-medium">{b.titel}</span>
                <span className="hidden text-muted-foreground sm:inline"> — {b.detail}</span>
              </span>
              {b.iban && (
                <Button variant="outline" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={() => setMany({ konto: b.iban, month: b.monat })}>
                  Buchungen ansehen
                </Button>
              )}
            </li>
          ))}
          {befunde.length > MAX_SICHTBAR && (
            <li>
              <button type="button" onClick={() => setAlle(!alle)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                {alle ? 'Weniger' : `Weitere (${befunde.length - MAX_SICHTBAR})`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
