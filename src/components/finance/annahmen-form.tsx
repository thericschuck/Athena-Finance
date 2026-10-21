'use client'

import { useActionState, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { speichereAnnahmen, type AnnahmenState } from '@/app/(dashboard)/finance/(planung)/prognose/actions'
import type { Annahme, AnnahmeArt } from '@/lib/forecast/annahmen'

/**
 * Editor für die Annahmen der Prognose. Hält die Liste im State und schickt sie beim Speichern als
 * ein JSON-Feld an die Server-Action, die sie wie beim Laden validiert.
 */

const ARTEN: { value: AnnahmeArt; label: string; hilfe: string }[] = [
  { value: 'lohn', label: 'Gehalt (ersetzt)', hilfe: 'Setzt das monatliche Gehalt ab dem Monat. Netto für die Liquidität, Brutto für die Steuer.' },
  { value: 'betriebseinnahme', label: 'Gewerbe-Einnahme', hilfe: 'Zusätzlich pro Monat, zählt für Gewinn und Kleinunternehmer-Umsatz.' },
  { value: 'betriebsausgabe', label: 'Gewerbe-Ausgabe', hilfe: 'Zusätzlich pro Monat, mindert den Gewinn.' },
  { value: 'einnahme', label: 'Sonstige Einnahme', hilfe: 'Zusätzlich pro Monat, ohne steuerliche Wirkung.' },
  { value: 'ausgabe', label: 'Sonstige Ausgabe', hilfe: 'Zusätzlich pro Monat, ohne steuerliche Wirkung.' },
]

type Zeile = {
  id: string
  label: string
  art: AnnahmeArt
  von: string
  bis: string
  betrag: string
  brutto: string
}

const neueId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function aus(a: Annahme): Zeile {
  return { id: a.id, label: a.label, art: a.art, von: a.von, bis: a.bis ?? '', betrag: String(a.betrag), brutto: a.brutto === null ? '' : String(a.brutto) }
}

function nachJson(z: Zeile) {
  return {
    id: z.id,
    label: z.label,
    art: z.art,
    von: z.von,
    bis: z.bis || null,
    betrag: z.betrag.replace(',', '.'),
    brutto: z.art === 'lohn' && z.brutto ? z.brutto.replace(',', '.') : null,
  }
}

export function AnnahmenForm({ initial, ersterMonat }: { initial: Annahme[]; ersterMonat: string }) {
  const [zeilen, setZeilen] = useState<Zeile[]>(() => initial.map(aus))
  const [state, formAction, pending] = useActionState<AnnahmenState, FormData>(speichereAnnahmen, null)

  const aendere = (id: string, patch: Partial<Zeile>) =>
    setZeilen(z => z.map(x => (x.id === id ? { ...x, ...patch } : x)))

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="annahmen" value={JSON.stringify(zeilen.map(nachJson))} />

      {zeilen.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Noch keine Annahmen. Trag ein, was sich ändern wird — zum Beispiel „Gehalt Schera ab Januar 2027“ —
          und sieh darüber, was es für Liquidität und Steuer bedeutet.
        </p>
      )}

      <ul className="space-y-3">
        {zeilen.map(z => {
          const art = ARTEN.find(a => a.value === z.art)!
          return (
            <li key={z.id} className="rounded-lg border border-border p-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`l-${z.id}`}>Bezeichnung</Label>
                  <Input id={`l-${z.id}`} value={z.label} maxLength={80} placeholder="z. B. Gehalt Schera"
                    onChange={e => aendere(z.id, { label: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`a-${z.id}`}>Art</Label>
                  <select id={`a-${z.id}`} value={z.art}
                    onChange={e => aendere(z.id, { art: e.target.value as AnnahmeArt })}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`v-${z.id}`}>Ab Monat</Label>
                  <Input id={`v-${z.id}`} type="month" value={z.von} min={ersterMonat}
                    onChange={e => aendere(z.id, { von: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`b-${z.id}`}>Bis (optional)</Label>
                  <Input id={`b-${z.id}`} type="month" value={z.bis} min={z.von || ersterMonat}
                    onChange={e => aendere(z.id, { bis: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`n-${z.id}`}>{z.art === 'lohn' ? 'Netto pro Monat (€)' : 'Betrag pro Monat (€)'}</Label>
                  <Input id={`n-${z.id}`} inputMode="decimal" className="w-36" value={z.betrag} placeholder="0"
                    onChange={e => aendere(z.id, { betrag: e.target.value })} />
                </div>
                {z.art === 'lohn' && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`br-${z.id}`}>Brutto pro Monat (€)</Label>
                    <Input id={`br-${z.id}`} inputMode="decimal" className="w-36" value={z.brutto} placeholder="für die Steuer"
                      onChange={e => aendere(z.id, { brutto: e.target.value })} />
                  </div>
                )}
                <Button type="button" variant="ghost" size="sm" className="ml-auto text-muted-foreground"
                  onClick={() => setZeilen(x => x.filter(y => y.id !== z.id))} aria-label="Annahme entfernen">
                  <Trash2 className="size-4" /> Entfernen
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{art.hilfe}</p>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm"
          onClick={() => setZeilen(z => [...z, { id: neueId(), label: '', art: 'lohn', von: ersterMonat, bis: '', betrag: '', brutto: '' }])}>
          <Plus className="size-4" /> Annahme hinzufügen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Speichere …' : 'Speichern und neu rechnen'}</Button>
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state?.success && <p role="status" className="text-sm text-success">Gespeichert.</p>}
      </div>
    </form>
  )
}
