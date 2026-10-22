'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, Check, Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { FREQUENCIES } from '@/lib/finance/contract-constants'
import { proMonat } from '@/lib/finance/vertragsvorschlag'
import type { Vorschlag } from '@/lib/data/vertragsvorschlaege'
import {
  blendeVertragsVorschlagAus, uebernehmeVertragsVorschlag, zeigeAusgeblendeteVorschlaegeWieder,
} from '@/app/(dashboard)/finance/(planung)/contracts/actions'

const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label.toLowerCase()]))

function tageBis(iso: string): number {
  const heute = new Date(); heute.setHours(0, 0, 0, 0)
  return Math.round((Date.parse(`${iso}T00:00:00`) - heute.getTime()) / 86_400_000)
}

/**
 * Aus den Buchungen erkannte wiederkehrende Kosten, für die es noch keinen Vertrag gibt (Abos, Raten, Gebühren). Jede Zeile nennt, was
 * wann wieder abgebucht wird; „Anlegen" macht daraus mit einem Klick einen Vertrag (danach wie jeder andere bearbeitbar), „Ausblenden"
 * merkt sich, dass es kein Vertrag ist (z. B. eine Rückzahlung an Freunde).
 */
export function VertragsVorschlaege({ vorschlaege, ausgeblendet }: { vorschlaege: Vorschlag[]; ausgeblendet: number }) {
  const router = useRouter()
  const { locale, dateFormat } = useSettings()
  const eur = (n: number, stellen = 2) => fmtCurrency(n, 'EUR', locale, { fractionDigits: stellen })
  const [weg, setWeg] = useState<Set<string>>(new Set())
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [, start] = useTransition()

  const sichtbar = vorschlaege.filter(v => !weg.has(v.schluessel))
  if (sichtbar.length === 0 && ausgeblendet === 0) return null

  const monatlich = sichtbar.reduce((s, v) => s + proMonat(v.betrag, v.frequenz), 0)

  const entfernen = (schluessel: string) => setWeg(prev => new Set(prev).add(schluessel))

  const anlegen = (v: Vorschlag) => {
    setLaeuft(v.schluessel)
    start(async () => {
      const r = await uebernehmeVertragsVorschlag(v.entwurf)
      setLaeuft(null)
      if ('error' in r) { toast.error(r.error); return }
      entfernen(v.schluessel)
      toast.success(`Vertrag „${v.entwurf.name}" angelegt`)
      router.refresh()
    })
  }

  const ausblenden = (v: Vorschlag) => {
    entfernen(v.schluessel)
    start(async () => {
      const r = await blendeVertragsVorschlagAus(v.schluessel)
      if ('error' in r) toast.error(r.error)
    })
  }

  const wiederZeigen = () => start(async () => {
    const r = await zeigeAusgeblendeteVorschlaegeWieder()
    if ('error' in r) toast.error(r.error)
    else { setWeg(new Set()); router.refresh() }
  })

  return (
    <section className="rounded-lg border border-border bg-card" aria-labelledby="vorschlaege-titel">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 id="vorschlaege-titel" className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-3.5 text-primary" />
            Erkannte wiederkehrende Kosten
            {sichtbar.length > 0 && <span className="text-xs font-normal text-muted-foreground">{sichtbar.length}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Aus deinen Buchungen erkannt (auch Karte und PayPal), noch ohne Vertrag
            {sichtbar.length > 0 && <> · zusammen ca. <span className="tabular-nums">{eur(monatlich, 0)}</span> pro Monat</>}
          </p>
        </div>
        {ausgeblendet > 0 && (
          <button type="button" onClick={wiederZeigen} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            {ausgeblendet} ausgeblendet · wieder anzeigen
          </button>
        )}
      </div>

      {sichtbar.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Keine offenen Vorschläge.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sichtbar.map(v => {
            const tage = v.naechste_erwartet ? tageBis(v.naechste_erwartet) : null
            const spanne = v.betrag_variabel ? ` (${eur(v.betrag_min, 0)}–${eur(v.betrag_max, 0)})` : ''
            return (
              <li key={v.schluessel} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{v.entwurf.name}</span>
                    {v.kategorie_name && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{v.kategorie_name}</span>
                    )}
                    {v.ueber_abwickler && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">Karte / PayPal</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground" title={v.begruendung}>
                    {v.betrag_variabel ? 'ca. ' : ''}<span className="tabular-nums">{eur(v.betrag)}</span>{spanne} · {FREQ_LABEL[v.frequenz] ?? v.frequenz}
                    {v.frequenz === 'monthly' && v.tag_im_monat ? `, meist am ${v.tag_im_monat}.` : ''} · {v.anzahl} Buchungen
                  </p>
                </div>

                <div className="flex min-w-36 items-center gap-1.5 text-xs">
                  <CalendarClock className={`size-3.5 shrink-0 ${v.ueberfaellig ? 'text-warning' : 'text-muted-foreground'}`} />
                  {v.naechste_erwartet ? (
                    <span className={v.ueberfaellig ? 'text-warning' : 'text-muted-foreground'}>
                      {v.ueberfaellig ? 'erwartet seit ' : 'nächste ca. '}
                      <span className="tabular-nums text-foreground">{fmtDate(v.naechste_erwartet, dateFormat)}</span>
                      {tage !== null && !v.ueberfaellig && tage >= 0 && ` (${tage === 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`})`}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>

                <p className="w-24 text-right text-xs tabular-nums text-muted-foreground" title="Hochgerechnet auf ein Jahr">
                  {eur(v.jahreskosten, 0)} / Jahr
                </p>

                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 px-2" disabled={laeuft === v.schluessel} onClick={() => anlegen(v)}>
                    {laeuft === v.schluessel ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Vertrag anlegen
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    aria-label={`${v.entwurf.name} ausblenden`} title="Kein Vertrag: nicht mehr vorschlagen" onClick={() => ausblenden(v)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
