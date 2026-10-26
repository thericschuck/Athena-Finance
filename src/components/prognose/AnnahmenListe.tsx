'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { betragFuerFeld } from '@/lib/transaktionen/formular'
import { istEinnahmeArt, type AnnahmeStatus } from '@/lib/prognose-seite/berechnen'
import { loescheAnnahme, speichereAnnahme, type AnnahmenState } from '@/app/(dashboard)/finance/(planung)/prognose/actions'
import type { Annahme, AnnahmeArt } from '@/lib/forecast/annahmen'

/**
 * Annahmen der Prognose als kompakte Liste (gruppiert: laufend, geplant, nach dem Zeitraum, beendet).
 * Anlegen und Ändern in einem Dialog (eine Annahme je Speichern), Löschen mit Rückfrage. Die Aktionen
 * sind am Handy immer sichtbar, am Desktop erscheinen sie beim Überfahren oder Fokussieren.
 */

const ARTEN: { value: AnnahmeArt; label: string; kurz: string; hilfe: string }[] = [
  { value: 'lohn', label: 'Gehalt (ersetzt das bisherige)', kurz: 'Gehalt', hilfe: 'Setzt das monatliche Gehalt ab dem Monat. Netto für die Liquidität, Brutto für die Steuer.' },
  { value: 'betriebseinnahme', label: 'Gewerbe-Einnahme', kurz: 'Gewerbe-Einnahme', hilfe: 'Zusätzlich pro Monat; zählt für Gewinn und Kleinunternehmer-Umsatz.' },
  { value: 'betriebsausgabe', label: 'Gewerbe-Ausgabe', kurz: 'Gewerbe-Ausgabe', hilfe: 'Zusätzlich pro Monat; mindert den Gewinn.' },
  { value: 'einnahme', label: 'Sonstige Einnahme', kurz: 'Einnahme', hilfe: 'Zusätzlich pro Monat, ohne steuerliche Wirkung.' },
  { value: 'ausgabe', label: 'Sonstige Ausgabe', kurz: 'Ausgabe', hilfe: 'Zusätzlich pro Monat, ohne steuerliche Wirkung (z. B. höhere Miete).' },
]

export type AnnahmenGruppe = { status: AnnahmeStatus; titel: string; eintraege: Annahme[] }

const FELD = 'h-10 text-base sm:text-sm'

function monatText(m: string, locale: string): string {
  return new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function AnnahmeFormular({ annahme, ersterMonat, onClose }: { annahme: Annahme | null; ersterMonat: string; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<AnnahmenState, FormData>(speichereAnnahme, null)
  const [art, setArt] = useState<AnnahmeArt>(annahme?.art ?? 'lohn')
  useEffect(() => { if (state?.success) onClose() }, [state, onClose])
  const hilfe = ARTEN.find(a => a.value === art)?.hilfe

  return (
    <form action={formAction} className="space-y-3">
      {annahme && <input type="hidden" name="id" value={annahme.id} />}
      <div className="space-y-1.5">
        <Label htmlFor="an-label">Bezeichnung</Label>
        <Input id="an-label" name="label" required maxLength={80} defaultValue={annahme?.label ?? ''} placeholder="z. B. Gehalt Schera" className={FELD} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="an-art">Art</Label>
        <select
          id="an-art" name="art" value={art} onChange={e => setArt(e.target.value as AnnahmeArt)}
          className={`${FELD} w-full rounded-md border border-input bg-transparent px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {hilfe && <p className="text-xs text-muted-foreground">{hilfe}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="an-von">Ab Monat</Label>
          <Input id="an-von" name="von" type="month" required defaultValue={annahme?.von ?? ersterMonat} placeholder="JJJJ-MM" className={FELD} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="an-bis">Bis (optional)</Label>
          <Input id="an-bis" name="bis" type="month" defaultValue={annahme?.bis ?? ''} placeholder="JJJJ-MM" className={FELD} />
        </div>
      </div>
      <div className={`grid gap-3 ${art === 'lohn' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="an-betrag">{art === 'lohn' ? 'Netto pro Monat (€)' : 'Betrag pro Monat (€)'}</Label>
          <Input id="an-betrag" name="betrag" inputMode="decimal" required defaultValue={annahme ? betragFuerFeld(annahme.betrag) : ''} placeholder="0,00" className={FELD} />
        </div>
        {art === 'lohn' && (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="an-brutto">Brutto (€, für die Steuer)</Label>
            <Input id="an-brutto" name="brutto" inputMode="decimal" defaultValue={annahme?.brutto != null ? betragFuerFeld(annahme.brutto) : ''} placeholder="0,00" className={FELD} />
          </div>
        )}
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-10" onClick={onClose}>Abbrechen</Button>
        <Button type="submit" className="h-10" disabled={pending}>{pending ? 'Speichere …' : 'Speichern'}</Button>
      </div>
    </form>
  )
}

export function AnnahmenListe({ gruppen, ersterMonat }: { gruppen: AnnahmenGruppe[]; ersterMonat: string }) {
  const { locale } = useSettings()
  const eur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  // `null` = geschlossen, `{ annahme: null }` = neue Annahme
  const [dialog, setDialog] = useState<{ annahme: Annahme | null } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [, starte] = useTransition()
  const schliessen = useCallback(() => setDialog(null), [])
  const gesamt = gruppen.reduce((s, g) => s + g.eintraege.length, 0)

  const entferne = (id: string) => {
    setFehler(null)
    starte(async () => {
      const r = await loescheAnnahme(id)
      if (r.error) setFehler(r.error)
    })
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Was sich ändern wird und in der Vergangenheit noch nicht steht. Ein Gehalt <em>ersetzt</em> das bisherige ab dem Monat,
          alles andere kommt pro Monat obendrauf. Die gepunktete Linie im Diagramm zeigt die Prognose ohne Annahmen.
        </p>
        <Button size="sm" className="h-10 shrink-0 sm:h-8" onClick={() => setDialog({ annahme: null })}>
          <Plus className="size-4" /> Annahme
        </Button>
      </div>

      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}

      {gesamt === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">Noch keine Annahmen</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Trag ein, was sich ändern wird, zum Beispiel „Gehalt Schera ab Januar 2027“ oder „Miete +150 € ab Juli“. Die Prognose
            rechnet es sofort mit und zeigt die Wirkung auf Liquidität und Steuer.
          </p>
          <Button variant="outline" size="sm" className="mt-3 h-10 sm:h-8" onClick={() => setDialog({ annahme: null })}>
            <Plus className="size-4" /> Erste Annahme eintragen
          </Button>
        </div>
      ) : (
        gruppen.map(g => (
          <section key={g.status} aria-label={g.titel} className="min-w-0">
            <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.titel}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {g.eintraege.map(a => {
                const einnahme = istEinnahmeArt(a.art)
                const art = ARTEN.find(x => x.value === a.art)
                return (
                  <li key={a.id} className={`group flex min-w-0 items-center gap-2 py-1 pl-3 pr-1 ${g.status === 'beendet' ? 'opacity-60' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {art?.kurz} · ab {monatText(a.von, locale)}{a.bis ? ` bis ${monatText(a.bis, locale)}` : ''}
                        {a.art === 'lohn' && a.brutto !== null ? ` · brutto ${eur(a.brutto)}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-medium tabular-nums ${einnahme ? 'text-success' : 'text-danger'}`}>
                      {einnahme ? '+' : '−'}{eur(a.betrag)}<span className="text-xs font-normal text-muted-foreground"> /Mon.</span>
                    </span>
                    <div className="flex shrink-0 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <Button type="button" variant="ghost" size="icon" className="size-10 md:size-8" aria-label={`${a.label} bearbeiten`}
                        onClick={() => setDialog({ annahme: a })}>
                        <Pencil className="size-4" />
                      </Button>
                      <ConfirmDialog
                        title="Annahme entfernen?"
                        description={`„${a.label}“ wird aus der Prognose genommen. Das lässt sich nicht rückgängig machen.`}
                        confirmLabel="Entfernen"
                        onConfirm={() => entferne(a.id)}
                      >
                        <Button type="button" variant="ghost" size="icon" className="size-10 text-muted-foreground md:size-8" aria-label={`${a.label} entfernen`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </ConfirmDialog>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      <Dialog open={dialog !== null} onOpenChange={o => { if (!o) setDialog(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.annahme ? 'Annahme ändern' : 'Neue Annahme'}</DialogTitle>
            <DialogDescription>Gilt pro Monat im gewählten Zeitraum und wirkt sofort auf Kurve und Steuer.</DialogDescription>
          </DialogHeader>
          {dialog && <AnnahmeFormular annahme={dialog.annahme} ersterMonat={ersterMonat} onClose={schliessen} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
