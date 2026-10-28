'use client'

import { useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { korrigiereSnapshot, loescheSnapshot, type SnapshotFelder } from '@/app/(dashboard)/analyse/verlauf/snapshot-actions'
import { fmtCurrency } from '@/lib/format'
import { parseCsvAmount } from '@/lib/csv'

type Werte = Required<SnapshotFelder>

const FELDER: { key: keyof Werte; label: string }[] = [
  { key: 'total_checking', label: 'Girokonto' },
  { key: 'total_investment', label: 'Geschäftsanteile' },
  { key: 'total_savings', label: 'Sparkonto' },
  { key: 'total_cash', label: 'Cash' },
  { key: 'total_depot', label: 'Depot' },
  { key: 'total_crypto', label: 'Crypto' },
  { key: 'total_bausparer', label: 'Bausparer' },
  { key: 'total_business', label: 'Business' },
  { key: 'total_debts', label: 'Schulden (positiv)' },
]

/** Net Worth wie die DB-Spalte: alle Vermögenstöpfe minus Schulden. */
function netWorth(w: Record<keyof Werte, number>): number {
  return FELDER.reduce((s, f) => (f.key === 'total_debts' ? s - w[f.key] : s + w[f.key]), 0)
}

/**
 * Korrigieren und Löschen eines auffälligen Snapshots. Beim Korrigieren werden nur die
 * Töpfe bearbeitet; Net Worth und Assets rechnet die DB (generierte Spalten) — hier wird
 * der neue Wert nur als Vorschau angezeigt. Die Dialoge schließen bewusst nicht von selbst
 * (preventDefault), damit ein Serverfehler im Dialog sichtbar bleibt.
 */
function SnapshotAktionenInner({ id, datumLabel, werte, locale }: {
  id: string
  datumLabel: string
  werte: Werte
  locale: string
}) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [korrOffen, setKorrOffen] = useState(false)
  const [delOffen, setDelOffen] = useState(false)
  const [eingabe, setEingabe] = useState<Record<keyof Werte, string>>(
    () => Object.fromEntries(FELDER.map(f => [f.key, String(werte[f.key])])) as Record<keyof Werte, string>,
  )

  const zahlen = Object.fromEntries(
    // `parseCsvAmount` kennt beide Schreibweisen: `Number('1.234'.replace(',', '.'))` machte aus
    // 1.234 (deutsch: tausendzweihundertvierunddreissig) still 1,234.
    FELDER.map(f => [f.key, eingabe[f.key].trim() === '' ? NaN : parseCsvAmount(eingabe[f.key])]),
  ) as Record<keyof Werte, number>
  const gueltig = FELDER.every(f => eingabe[f.key].trim() !== '' && Number.isFinite(zahlen[f.key]))
  const vorschau = gueltig ? fmtCurrency(netWorth(zahlen), 'EUR', locale, { fractionDigits: 2 }) : '—'

  function oeffneKorrektur(offen: boolean) {
    if (offen) {
      // Beim Öffnen immer den gespeicherten Stand zeigen, nicht eine verworfene Eingabe.
      setEingabe(Object.fromEntries(FELDER.map(f => [f.key, String(werte[f.key])])) as Record<keyof Werte, string>)
      setFehler(null)
    }
    setKorrOffen(offen)
  }

  function speichern() {
    startTransition(async () => {
      const res = await korrigiereSnapshot(id, zahlen)
      if ('error' in res) setFehler(res.error)
      else setKorrOffen(false)
    })
  }

  function loeschen() {
    startTransition(async () => {
      const res = await loescheSnapshot(id)
      if ('error' in res) setFehler(res.error)
      else setDelOffen(false)
    })
  }

  return (
    <div className="inline-flex items-center gap-1">
      <AlertDialog open={korrOffen} onOpenChange={oeffneKorrektur}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
            <Pencil className="size-3" />
            Korrigieren
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Snapshot vom {datumLabel} korrigieren</AlertDialogTitle>
            <AlertDialogDescription>
              Net Worth und Assets werden aus diesen Werten berechnet. Die Zeile wird als
              „repair“ markiert und vom täglichen Snapshot nicht mehr überschrieben.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {FELDER.map(f => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`${id}-${f.key}`} className="text-xs">{f.label}</Label>
                <Input
                  id={`${id}-${f.key}`}
                  inputMode="decimal"
                  value={eingabe[f.key]}
                  onChange={e => setEingabe(v => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <p className="text-sm">Net Worth danach: <span className="font-semibold tabular-nums">{vorschau}</span></p>
          {fehler && <p className="text-sm text-danger">{fehler}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !gueltig}
              onClick={e => { e.preventDefault(); speichern() }}
            >
              Speichern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={delOffen} onOpenChange={o => { setDelOffen(o); if (o) setFehler(null) }}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-danger">
            <Trash2 className="size-3" />
            Löschen
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Snapshot vom {datumLabel} löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Tag fehlt danach im Verlauf. Der tägliche Snapshot legt ihn nur für die letzten
              drei Tage automatisch neu an; ältere Tage lassen sich per Backfill nachholen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {fehler && <p className="text-sm text-danger">{fehler}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={e => { e.preventDefault(); loeschen() }}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Berechnete Zeilen (Haushalt, `net_worth_series`, ID `fn:<datum>`) sind keine gespeicherten Snapshots: nichts zu
 * korrigieren oder zu loeschen. Reparieren bleibt owner-only auf net_worth_snapshots.
 */
export function SnapshotAktionen(props: { id: string; datumLabel: string; werte: Werte; locale: string }) {
  if (props.id.startsWith('fn:')) return null
  return <SnapshotAktionenInner {...props} />
}
