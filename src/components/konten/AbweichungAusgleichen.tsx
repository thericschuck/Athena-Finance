'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Scale } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fmtCurrency } from '@/lib/format'
import { gleicheAbweichungAus } from '@/app/(dashboard)/finance/accounts/actions'

/**
 * Gleicht die Abweichung eines Bankkontos aus (siehe `gleicheAbweichungAus`): bucht den fehlenden
 * Betrag als Anfangsbestand vor die erste Buchung. Rendert seinen Auslöser-Knopf selbst; wird von der
 * Konten-Liste und der Detailseite genutzt.
 */
export function AbweichungAusgleichen({
  kontoId, name, abweichung, waehrung, locale,
}: {
  kontoId: string
  name: string
  /** Bank-Saldo minus Summe der Buchungen (so wie `KontoZeile.abweichung`). */
  abweichung: number
  waehrung: string
  locale: string
}) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, start] = useTransition()

  const euro = (n: number) => fmtCurrency(n, waehrung, locale, { fractionDigits: 2 })
  const vorzeichen = abweichung > 0 ? '+' : '−'

  function ausgleichen() {
    setFehler(null)
    start(async () => {
      const r = await gleicheAbweichungAus(kontoId)
      if (r.error) setFehler(r.error)
      else {
        setOffen(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={offen} onOpenChange={(next) => { setOffen(next); if (next) setFehler(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-1.5 px-2.5 text-xs md:h-7">
          <Scale className="size-3.5" aria-hidden />
          Ausgleichen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abweichung ausgleichen</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Die Bank meldet einen anderen Saldo, als die Buchungen ergeben:{' '}
            <span className="font-medium tabular-nums text-foreground">{vorzeichen}{euro(Math.abs(abweichung))}</span>.
            Der Grund ist fast immer ein fehlender Anfangsbestand — die Bank liefert nur ein Zeitfenster, der Saldo
            davor steht nirgends.
          </p>
          <p>
            Gebucht wird dieser Betrag als „Alter Kontostand – Anfangsbestand ergänzt“, einen Tag vor deiner ersten
            Buchung. Er zählt <strong>nicht</strong> als Einnahme oder Ausgabe und ändert den Verlauf nicht (der ist am
            Bank-Saldo verankert). Danach stimmt die Summe aller Buchungen mit dem Konto überein.
          </p>
          <p>
            Holst du später mit „voller Verlauf“ ältere Buchungen von der Bank, kann die Abweichung mit umgekehrtem
            Vorzeichen zurückkommen — dann einfach noch einmal ausgleichen.
          </p>
          {fehler && <p className="text-destructive" role="alert">{fehler}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10 md:h-8" onClick={() => setOffen(false)}>
            Abbrechen
          </Button>
          <Button type="button" className="h-10 md:h-8" disabled={laeuft} onClick={ausgleichen}>
            {laeuft ? 'Wird gebucht…' : 'Ausgleichen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
