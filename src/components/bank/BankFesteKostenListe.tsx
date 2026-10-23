'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { FREQUENCIES } from '@/lib/finance/contract-constants'
import type { FesterPosten } from '@/lib/bank/feste-kosten'
import { uebernehmeVertragsVorschlag } from '@/app/(dashboard)/finance/(planung)/contracts/actions'

const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label.toLowerCase()]))

/**
 * Die Zeilen der festen Kosten. Client-Komponente nur wegen „Als Vertrag anlegen": das nutzt die
 * vorhandene Server Action der Vertragsseite (gleicher Entwurf wie dort, inklusive Pruefung auf
 * doppelte Namen), es gibt keine zweite Schreibstelle. Danach laedt die Seite neu, und der
 * Vertragsabgleich der Zeile springt auf „Vertrag angelegt".
 */
export function BankFesteKostenListe({
  posten, locale, dateFormat,
}: { posten: FesterPosten[]; locale: string; dateFormat: string }) {
  const router = useRouter()
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [, start] = useTransition()
  const eur = (n: number, stellen = 2) => fmtCurrency(n, 'EUR', locale, { fractionDigits: stellen })

  const anlegen = (p: FesterPosten) => {
    setLaeuft(p.schluessel)
    start(async () => {
      const r = await uebernehmeVertragsVorschlag(p.entwurf)
      setLaeuft(null)
      if ('error' in r) { toast.error(r.error); return }
      toast.success(`Vertrag „${p.entwurf.name}" angelegt`)
      router.refresh()
    })
  }

  return (
    <ul className="divide-y divide-border">
      {posten.map(p => {
        const spanne = p.betragVariabel ? ` (${eur(p.betragMin, 0)}–${eur(p.betragMax, 0)})` : ''
        return (
          <li key={p.schluessel} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
            <div className="min-w-0 flex-1 basis-52">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{p.name}</span>
                {p.kategorieName && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{p.kategorieName}</span>
                )}
                {p.ueberAbwickler && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">Karte / PayPal</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground" title={p.begruendung}>
                {p.betragVariabel ? 'ca. ' : ''}<span className="tabular-nums">{eur(p.betrag)}</span>{spanne} · {FREQ_LABEL[p.frequenz] ?? p.frequenz}
                {p.frequenz === 'monthly' && p.tagImMonat ? `, meist am ${p.tagImMonat}.` : ''} · {p.anzahl} Buchungen
              </p>
              {(p.preisaenderung || p.ausgeblieben) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  {p.preisaenderung && (
                    <span
                      className={`inline-flex items-center gap-1 ${p.preisaenderung.teurer ? 'text-warning' : 'text-muted-foreground'}`}
                      title={`Letzter Betrag ${eur(p.preisaenderung.letzter)}, vorher üblich ${eur(p.preisaenderung.vorher)}`}
                    >
                      {p.preisaenderung.teurer ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                      {p.preisaenderung.teurer ? 'teurer geworden' : 'günstiger geworden'}{' '}
                      ({p.preisaenderung.differenz > 0 ? '+' : '−'}{eur(Math.abs(p.preisaenderung.differenz))})
                    </span>
                  )}
                  {p.ausgeblieben && (
                    <span
                      className="inline-flex items-center gap-1 text-warning"
                      title={`Erwartet seit ${fmtDate(p.ausgeblieben.erwartetSeit, dateFormat)} (${p.ausgeblieben.tage} Tage)`}
                    >
                      <AlertTriangle className="size-3" />
                      noch nicht abgebucht? Erwartet seit {fmtDate(p.ausgeblieben.erwartetSeit, dateFormat)}
                    </span>
                  )}
                </p>
              )}
            </div>

            <p className="w-32 text-xs text-muted-foreground">
              {p.naechsteErwartet
                ? <>nächste ca. <span className="tabular-nums text-foreground">{fmtDate(p.naechsteErwartet, dateFormat)}</span></>
                : <>zuletzt <span className="tabular-nums text-foreground">{fmtDate(p.letzteBuchung, dateFormat)}</span></>}
            </p>

            <p className="w-24 text-right text-sm tabular-nums" title="Monatsäquivalent (wöchentlich ×52/12, vierteljährlich ÷3, jährlich ÷12)">
              {eur(p.monatsaequivalent)}
              <span className="block text-[10px] text-muted-foreground">pro Monat</span>
            </p>

            <div className="flex w-32 justify-end">
              {p.hatVertrag ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3.5" />
                  Vertrag angelegt
                </span>
              ) : (
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={laeuft === p.schluessel} onClick={() => anlegen(p)}>
                  {laeuft === p.schluessel ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Als Vertrag anlegen
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
