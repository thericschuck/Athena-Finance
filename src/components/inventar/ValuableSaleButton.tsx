'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { markValuableSold } from '@/app/(dashboard)/inventar/sale-actions'
import { parseCsvAmount } from '@/lib/csv'
import { fmtCurrency } from '@/lib/format'

const heute = () => new Date().toISOString().split('T')[0]

/** „Verkauft"-Dialog: Datum und Preis, mit Vorschau des realisierten Gewinns. */
export function ValuableSaleButton({ id, name, kaufpreis }: {
  id: string
  name: string
  kaufpreis: number | null
}) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [datum, setDatum] = useState(heute)
  const [preis, setPreis] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  // Leer = Preis unbekannt (null); Unlesbares ist ein Fehler, kein stilles null.
  const roh = preis.trim()
  const betrag = roh ? parseCsvAmount(roh) : null
  const ungueltig = roh !== '' && (betrag === null || !Number.isFinite(betrag))
  const gewinn = betrag !== null && kaufpreis !== null && !ungueltig ? betrag - kaufpreis : null

  function speichern() {
    if (ungueltig) { setFehler('Preis ist ungültig'); return }
    setFehler(null)
    startTransition(async () => {
      const res = await markValuableSold(id, datum, betrag)
      if (res.error) { setFehler(res.error); return }
      setOffen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HandCoins className="size-3.5" />
          Verkauft
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>&bdquo;{name}&ldquo; als verkauft markieren</DialogTitle>
          <DialogDescription>
            Das Stück verschwindet aus Vitrine und Summe, bleibt aber samt Wertverlauf als
            Historie erhalten.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`verkauft-am-${id}`}>Verkauft am</Label>
            <Input
              id={`verkauft-am-${id}`}
              type="date"
              value={datum}
              max={heute()}
              onChange={e => setDatum(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`verkaufspreis-${id}`}>Verkaufspreis (EUR)</Label>
            <Input
              id={`verkaufspreis-${id}`}
              type="text"
              inputMode="decimal"
              placeholder="z. B. 1.250,00"
              value={preis}
              onChange={e => setPreis(e.target.value)}
            />
          </div>
        </div>

        {gewinn !== null && (
          <p className="text-sm tabular-nums">
            Realisierter {gewinn >= 0 ? 'Gewinn' : 'Verlust'}:{' '}
            <span className={gewinn >= 0 ? 'text-success' : 'text-danger'}>
              {gewinn >= 0 ? '+' : ''}{fmtCurrency(gewinn, 'EUR', 'de-DE', { fractionDigits: 2 })}
            </span>
          </p>
        )}
        {fehler && <p className="text-sm text-danger">{fehler}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOffen(false)} disabled={pending}>Abbrechen</Button>
          <Button onClick={speichern} disabled={pending || !datum}>
            {pending ? 'Speichert…' : 'Als verkauft speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
