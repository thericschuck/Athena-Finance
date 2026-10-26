'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Scale } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtCurrency } from '@/lib/format'
import { nachkommastellen, parseDezimal, saldoAnpassung } from '@/lib/konten/berechnen'
import { setzeManuellenSaldo } from '@/app/(dashboard)/finance/accounts/actions'

/**
 * Setzt den Saldo eines MANUELLEN Kontos auf einen Zielwert (bucht die Differenz als
 * „Alter Kontostand – Anpassung“, siehe lib/konten/berechnen.ts, saldoAnpassung). Wird von der
 * Konten-Liste UND der Detailseite genutzt; rendert seinen Auslöser-Knopf selbst.
 */

export function SaldoSetzenDialog({
  kontoId, name, aktuell, waehrung, locale,
}: {
  kontoId: string
  name: string
  /** Aktueller Saldo des Kontos. */
  aktuell: number
  waehrung: string
  locale: string
}) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [text, setText] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, start] = useTransition()

  const stellen = nachkommastellen(waehrung)
  // Krypto-Konten (BTC/ETH) sind keine ISO-Währungen für fmtCurrency: dort Zahl + Kürzel.
  const euro = (n: number) =>
    stellen > 2 ? `${n.toFixed(stellen)} ${waehrung}` : fmtCurrency(n, waehrung, locale, { fractionDigits: 2 })
  const ziel = parseDezimal(text)
  const anpassung = ziel === null ? null : saldoAnpassung(aktuell, ziel, stellen)
  const diff = anpassung ? (anpassung.type === 'income' ? anpassung.amount : -anpassung.amount) : 0

  function aendern(next: boolean) {
    setOffen(next)
    if (next) {
      setText(aktuell.toFixed(stellen).replace('.', ','))
      setFehler(null)
    }
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault()
    if (ziel === null) return setFehler('Bitte einen Betrag eingeben, z. B. 1.250,00.')
    if (!anpassung) return setOffen(false)
    setFehler(null)
    start(async () => {
      const r = await setzeManuellenSaldo(kontoId, ziel)
      if (r.error) setFehler(r.error)
      else {
        setOffen(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={offen} onOpenChange={aendern}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-10 gap-1.5 px-2.5 text-xs text-muted-foreground md:h-8">
          <Scale className="size-3.5" aria-hidden />
          Saldo setzen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Saldo setzen</DialogTitle>
          <DialogDescription>
            {name}: aktuell {euro(aktuell)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={speichern} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`saldo-${kontoId}`}>Neuer Saldo ({waehrung})</Label>
            <Input
              id={`saldo-${kontoId}`}
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-10 text-base sm:text-sm"
              aria-invalid={text !== '' && ziel === null}
            />
          </div>
          <p className="min-h-10 text-xs leading-snug text-muted-foreground" aria-live="polite">
            {ziel === null ? (
              'Zahl mit Dezimalkomma eingeben, z. B. 1.250,00.'
            ) : !anpassung ? (
              'Der Saldo stimmt bereits, es wird nichts gebucht.'
            ) : (
              <>
                Differenz{' '}
                <span className={`font-semibold tabular-nums ${diff < 0 ? 'text-danger' : 'text-success'}`}>
                  {diff > 0 ? '+' : '−'}{euro(Math.abs(diff))}
                </span>
                , wird als „Alter Kontostand – Anpassung“ gebucht (zählt nicht als Einnahme/Ausgabe).
              </>
            )}
          </p>
          {fehler && <p className="text-sm text-destructive" role="alert">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-10 md:h-8" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" className="h-10 md:h-8" disabled={laeuft || ziel === null}>
              {laeuft ? 'Wird gebucht…' : 'Saldo setzen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
