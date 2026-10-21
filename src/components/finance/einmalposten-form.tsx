'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { speichereEinmalposten, type AnnahmenState } from '@/app/(dashboard)/finance/(planung)/prognose/actions'
import type { EinmalKandidat } from '@/lib/forecast/einmalig'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { useSettings } from '@/components/providers/settings-context'

/**
 * Große Posten, die das Prognosemodell verzerren könnten. Standardmäßig ausgeschlossen sind nur die
 * extremen Ausreißer; alles andere bleibt drin, solange du es nicht abwählst. Gespeichert werden nur
 * die Abweichungen vom Standard.
 */
export function EinmalpostenForm({ kandidaten }: { kandidaten: EinmalKandidat[] }) {
  const { locale, dateFormat } = useSettings()
  const eur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const [aus, setAus] = useState<Set<string>>(() => new Set(kandidaten.filter(k => k.ausgeschlossen).map(k => k.id)))
  const [state, formAction, pending] = useActionState<AnnahmenState, FormData>(speichereEinmalposten, null)

  if (kandidaten.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine auffällig großen Einzelposten in deiner Historie.</p>
  }

  // Nur die Abweichungen vom Standard speichern (Standard: ausgeschlossen = extrem).
  const ueberschreibung = {
    aus: kandidaten.filter(k => aus.has(k.id) && !k.extrem).map(k => k.id),
    ein: kandidaten.filter(k => !aus.has(k.id) && k.extrem).map(k => k.id),
  }
  const umschalten = (id: string) =>
    setAus(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="ueberschreibung" value={JSON.stringify(ueberschreibung)} />
      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {kandidaten.map(k => (
          <li key={k.id} className="flex items-start gap-3 px-3 py-2.5">
            <input
              id={`e-${k.id}`} type="checkbox" className="mt-1 size-4 shrink-0"
              checked={aus.has(k.id)} onChange={() => umschalten(k.id)}
            />
            <label htmlFor={`e-${k.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-medium tabular-nums ${k.type === 'income' ? 'text-success' : 'text-danger'}`}>
                  {k.type === 'income' ? '+' : '−'}{eur(k.betrag)}
                </span>
                <span className="truncate">{k.gegenpartei ?? '(ohne Gegenpartei)'}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(k.datum, dateFormat)}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {k.grund}{k.kategorie ? ` · ${k.kategorie}` : ''}
                {' · '}bliebe er drin, ginge er mit {k.effektProMonat >= 0 ? '+' : '−'}{eur(Math.abs(k.effektProMonat))} pro Monat in den erwarteten Saldo ein
                {k.extrem && ' · extremer Ausreißer (standardmäßig ausgeschlossen)'}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Speichere …' : 'Speichern und neu rechnen'}</Button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.success && <p role="status" className="text-sm text-success">Gespeichert.</p>}
      </div>
    </form>
  )
}
