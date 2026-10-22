'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  createValuable, updateValuable, type ValuableActionState,
} from '@/app/(dashboard)/inventar/actions'
import { KATEGORIEN, ZUSTAENDE, type Valuable } from '@/lib/valuables'
import { NUTZUNGEN, WERTMODI } from '@/lib/inventar/wertmodell'

interface Props {
  trigger: React.ReactNode
  /** Gesetzt = Bearbeiten, sonst Anlegen. */
  item?: Valuable
}

export function ValuableForm({ trigger, item }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kategorie, setKategorie] = useState(item?.kategorie ?? 'uhr')
  const [zustand, setZustand] = useState(item?.zustand ?? 'gut')
  const [nutzung, setNutzung] = useState(item?.nutzung ?? 'regelmaessig')
  const [wertmodus, setWertmodus] = useState(item?.wertmodus ?? 'nutzung')

  // Ein Kaufdatum in der Zukunft ist fast immer ein vertipptes Jahr (2026 statt 2025). Es
  // bleibt erlaubt — man kann etwas vorbestellt haben —, aber es wird angezeigt: unbemerkt
  // führte es dazu, dass der eingetragene Wert erst ab jenem Datum galt und die Karte
  // solange „—" zeigte.
  const heute = new Date().toISOString().split('T')[0]
  const [kaufdatum, setKaufdatum] = useState(item?.gekauft_am ?? '')
  const inZukunft = kaufdatum !== '' && kaufdatum > heute

  const [state, formAction, pending] = useActionState<ValuableActionState, FormData>(
    item ? updateValuable : createValuable,
    null,
  )

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Gegenstand bearbeiten' : 'Gegenstand anlegen'}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {item && <input type="hidden" name="id" value={item.id} />}
          {/* Radix-Select schreibt nichts ins Formular — die Auswahl reist als Hidden mit. */}
          <input type="hidden" name="kategorie" value={kategorie} />
          <input type="hidden" name="zustand" value={zustand} />
          <input type="hidden" name="nutzung" value={nutzung} />
          <input type="hidden" name="wertmodus" value={wertmodus} />

          {/* ── Was ist es ─────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="v-name">Bezeichnung *</Label>
            <Input
              id="v-name" name="name" required
              defaultValue={item?.name}
              placeholder="z.B. Omega Speedmaster Professional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kategorie</Label>
              <Select value={kategorie} onValueChange={setKategorie}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KATEGORIEN.map(k => (
                    <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Zustand</Label>
              <Select value={zustand} onValueChange={setZustand}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ZUSTAENDE.map(z => (
                    <SelectItem key={z.key} value={z.key}>{z.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Nutzung und Wertmodus steuern die Wertverlauf-Schaetzung. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nutzung</Label>
              <Select value={nutzung} onValueChange={setNutzung}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NUTZUNGEN.map(n => (
                    <SelectItem key={n.key} value={n.key}>{n.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Wertverlauf</Label>
              <Select value={wertmodus} onValueChange={setWertmodus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WERTMODI.map(m => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Feld id="v-marke" name="marke" label="Marke" defaultValue={item?.marke} placeholder="Omega" />
            <Feld id="v-modell" name="modell" label="Modell" defaultValue={item?.modell} placeholder="Speedmaster" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Feld id="v-ref" name="referenz" label="Referenz" defaultValue={item?.referenz} placeholder="310.30.42.50" />
            <Feld
              id="v-serie" name="seriennummer" label="Seriennummer"
              defaultValue={item?.seriennummer} placeholder="87xxxxxx"
            />
          </div>

          {/* ── Geld ───────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <Feld
              id="v-kaufpreis" name="kaufpreis" label="Kaufpreis (€)" type="number" step="0.01" min="0"
              defaultValue={item?.kaufpreis ?? undefined} placeholder="0,00"
            />
            <div className="space-y-1.5">
              <Label htmlFor="v-wert">Aktueller Wert (€)</Label>
              <Input
                id="v-wert" name="aktueller_wert" type="number" step="0.01" min="0"
                defaultValue={item?.aktueller_wert ?? undefined}
                placeholder={item ? undefined : 'wie Kaufpreis'}
              />
              <p className="text-[11px] text-muted-foreground">
                {item
                  ? 'Wird als neue Bewertung von heute gespeichert, die alte bleibt im Verlauf.'
                  : 'Leer lassen übernimmt den Kaufpreis als Startwert.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="v-gekauft">Gekauft am</Label>
              <Input
                id="v-gekauft" name="gekauft_am" type="date"
                value={kaufdatum}
                onChange={e => setKaufdatum(e.target.value)}
              />
              {inZukunft && (
                <p className="text-[11px] text-danger">
                  Liegt in der Zukunft — Jahr vertippt?
                </p>
              )}
            </div>
            <Feld
              id="v-quelle" name="kaufquelle" label="Gekauft bei"
              defaultValue={item?.kaufquelle} placeholder="Chrono24, Juwelier …"
            />
          </div>

          {/* ── Register ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <Feld
              id="v-ort" name="lagerort" label="Lagerort"
              defaultValue={item?.lagerort} placeholder="Safe, Schlafzimmer"
            />
            <Feld
              id="v-police" name="versicherungsnummer" label="Versicherungsnummer"
              defaultValue={item?.versicherungsnummer} placeholder="optional"
            />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <Haken name="box_vorhanden" label="Box vorhanden" defaultChecked={item?.box_vorhanden} />
            <Haken name="papiere_vorhanden" label="Papiere vorhanden" defaultChecked={item?.papiere_vorhanden} />
            <Haken name="versichert" label="Versichert" defaultChecked={item?.versichert} />
            <Haken
              name="im_vermoegen"
              label="Zählt in den Sammlungswert"
              defaultChecked={item ? item.im_vermoegen : true}
            />
          </div>

          {/* Verkauf — nur beim Bearbeiten. Beim Anlegen wäre das Feld sinnlos und würde
              nur suggerieren, man müsse es ausfüllen. Ein gesetztes Datum nimmt das Stück
              aus der Vitrine, ohne die Zeile oder den Wertverlauf zu löschen. */}
          {item && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border p-3">
              <Feld
                id="v-verkauft" name="verkauft_am" label="Verkauft am" type="date"
                defaultValue={item.verkauft_am ?? undefined}
              />
              <Feld
                id="v-vpreis" name="verkaufspreis" label="Verkaufspreis (€)"
                type="number" step="0.01" min="0"
                defaultValue={item.verkaufspreis ?? undefined} placeholder="0,00"
              />
              <p className="col-span-2 -mt-1 text-[11px] text-muted-foreground">
                Mit Datum verschwindet das Stück aus der Vitrine. Es bleibt gespeichert und
                zählt für Stichtage vor dem Verkauf weiterhin mit.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="v-notizen">Notizen</Label>
            <Textarea
              id="v-notizen" name="notizen" rows={3}
              defaultValue={item?.notizen ?? ''}
              placeholder="Service-Historie, Besonderheiten, Herkunft …"
            />
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-danger">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Speichert…' : item ? 'Speichern' : 'Anlegen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Bausteine ─────────────────────────────────────────────────────────────────

function Feld({
  id, name, label, defaultValue, placeholder, type = 'text', step, min,
}: {
  id: string
  name: string
  label: string
  defaultValue?: string | number | null
  placeholder?: string
  type?: string
  step?: string
  min?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} name={name} type={type} step={step} min={min}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
      />
    </div>
  )
}

function Haken({
  name, label, defaultChecked,
}: {
  name: string
  label: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  )
}
