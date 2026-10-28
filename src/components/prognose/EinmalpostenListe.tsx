'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { speichereEinmalposten, type AnnahmenState } from '@/app/(dashboard)/finance/(planung)/prognose/actions'
import type { EinmalKandidat } from '@/lib/forecast/einmalig'

/**
 * Große Posten, die das Prognosemodell verzerren könnten, als kompakte Liste mit Häkchen
 * „vom Lernen ausnehmen“. Standardmäßig ausgeschlossen sind nur extreme Ausreißer; alles andere bleibt
 * drin, solange du es nicht abwählst. Gespeichert werden nur die Abweichungen vom Standard, und nur für
 * die hier gezeigten Posten (die Action führt sie mit früheren Entscheidungen zusammen).
 */
export function EinmalpostenListe({ kandidaten }: { kandidaten: EinmalKandidat[] }) {
  const { locale, dateFormat } = useSettings()
  const eur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  // T12:00 = lokaler Mittag: das Datum verschiebt sich in keiner Zeitzone auf den Nachbartag.
  const datum = (iso: string) => fmtDate(`${iso.slice(0, 10)}T12:00:00`, dateFormat)

  const start = kandidaten.filter(k => k.ausgeschlossen).map(k => k.id).sort().join(',')
  const [aus, setAus] = useState<Set<string>>(() => new Set(kandidaten.filter(k => k.ausgeschlossen).map(k => k.id)))
  const [state, formAction, pending] = useActionState<AnnahmenState, FormData>(speichereEinmalposten, null)

  if (kandidaten.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm font-medium">Keine auffällig großen Einzelposten</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          In deiner Historie gibt es nichts, das die Prognose verzerren würde. Sobald ein sehr großer, einmaliger Posten
          auftaucht, kannst du ihn hier vom Lernen ausnehmen.
        </p>
      </div>
    )
  }

  // Nur die Abweichungen vom Standard speichern (Standard: ausgeschlossen = extrem).
  const ueberschreibung = {
    aus: kandidaten.filter(k => aus.has(k.id) && !k.extrem).map(k => k.id),
    ein: kandidaten.filter(k => !aus.has(k.id) && k.extrem).map(k => k.id),
  }
  const geaendert = [...aus].sort().join(',') !== start
  const umschalten = (id: string) =>
    setAus(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <form action={formAction} className="min-w-0 space-y-3">
      <input type="hidden" name="ueberschreibung" value={JSON.stringify(ueberschreibung)} />
      <input type="hidden" name="sichtbar" value={JSON.stringify(kandidaten.map(k => k.id))} />
      <p className="text-xs text-muted-foreground">
        Einzelne große Posten können die Prognose verzerren. Extreme Ausreißer (etwa eine einmalige Auszahlung) sind
        standardmäßig ausgeschlossen. Alles andere bleibt drin, denn im Rückblick-Test wurde die Prognose durch pauschales
        Ausschließen nicht genauer: Solche Posten kommen bei dir immer wieder vor. Häkchen setzen heißt: nicht mehr erwartet.
        Gehalt, Geschäftseinnahmen und wiederkehrende Raten stehen hier nie.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {kandidaten.map(k => {
          const einnahme = k.type === 'income'
          const gewaehlt = aus.has(k.id)
          return (
            <li key={k.id}>
              <label htmlFor={`e-${k.id}`} className="flex min-h-11 min-w-0 cursor-pointer items-start gap-3 px-3 py-2">
                <Checkbox id={`e-${k.id}`} className="mt-0.5 size-5 sm:size-4" checked={gewaehlt} onCheckedChange={() => umschalten(k.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className={`shrink-0 font-medium tabular-nums ${einnahme ? 'text-success' : 'text-danger'}`}>
                      {einnahme ? '+' : '−'}{eur(k.betrag)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{k.gegenpartei ?? '(ohne Gegenpartei)'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{datum(k.datum)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {k.grund}{k.kategorie ? ` · ${k.kategorie}` : ''}
                    {' · '}{gewaehlt ? 'ausgenommen, zählte sonst mit' : 'zählt mit'} {k.effektProMonat >= 0 ? '+' : '−'}{eur(Math.abs(k.effektProMonat))} pro Monat im erwarteten Saldo
                    {k.extrem && !k.einlage && ' · extremer Ausreißer'}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10 sm:h-8" size="sm" disabled={pending || !geaendert}>
          {pending ? 'Speichere …' : 'Speichern und neu rechnen'}
        </Button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.success && <p role="status" className="text-sm text-success">Gespeichert.</p>}
      </div>
    </form>
  )
}
