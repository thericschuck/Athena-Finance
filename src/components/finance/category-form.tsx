'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil, Plus } from 'lucide-react'
import {
  createCategory,
  updateCategory,
  type CategoryActionState,
} from '@/app/(dashboard)/finance/(transaktionen)/categories/actions'
import type { CategoryRow, EuerZeileRow } from '@/lib/data/finance-transactions'
import { moeglicheEltern } from '@/lib/kategorien/berechnen'

type Category = CategoryRow
type EuerZeile = EuerZeileRow

const CATEGORY_TYPES = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'neutral', label: 'Neutral (Umbuchung, Anlage)' },
]

/**
 * Steuerliche Rolle einer Kategorie. Muss zum Check-Constraint aus
 * 20260906140000_tax_engine.sql passen.
 *
 * Standard ist bewusst "nicht zugeordnet": die Steuer-Engine rechnet nur mit
 * gesetzten Rollen und listet den Rest als unzugeordnet auf, statt zu raten.
 * Setzt man die Rolle auf einer Hauptkategorie, gilt sie fuer den ganzen
 * Teilbaum -- ein Klick auf "Business" reicht also.
 */
const TAX_ROLES = [
  { value: '__none__',        label: 'Nicht zugeordnet' },
  { value: 'betriebseinnahme', label: 'Betriebseinnahme' },
  { value: 'betriebsausgabe',  label: 'Betriebsausgabe' },
  { value: 'lohn',             label: 'Lohn / Gehalt' },
  { value: 'privat',           label: 'Privat (steuerlich irrelevant)' },
]

/** Vorschlagsfarben; frei waehlbar ist weiterhin alles ueber den Farbwaehler. */
const FARBEN = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const ICONS = ['🛒', '🏠', '🚗', '🍽️', '✈️', '💼', '🎁', '💊', '📱', '🎓', '💰', '📈']

const FELD = 'h-10 text-base sm:h-9 sm:text-sm'
const TRIGGER = 'h-10 w-full text-base sm:h-9 sm:text-sm'

function useFehlerAnzeige(state: CategoryActionState) {
  // Ein Fehler vom letzten Mal soll beim erneuten Oeffnen nicht wieder auftauchen.
  const [sichtbar, setSichtbar] = useState(true)
  useEffect(() => { setSichtbar(true) }, [state])
  return [sichtbar, setSichtbar] as const
}

// ─────────────────────────────────────────────
// Shared form fields
// ─────────────────────────────────────────────
function CategoryFormFields({
  allCategories,
  category,
  type,
  setType,
  parentId,
  setParentId,
  taxRole,
  setTaxRole,
  euerZeile,
  setEuerZeile,
  euerZeilen,
  lockedParentName,
}: {
  allCategories: Category[]
  category?: Category
  type: string
  setType: (v: string) => void
  parentId: string
  setParentId: (v: string) => void
  taxRole: string
  setTaxRole: (v: string) => void
  euerZeile: string
  setEuerZeile: (v: string) => void
  euerZeilen: EuerZeile[]
  /**
   * Name der Oberkategorie, wenn der Parent von aussen fest vorgegeben ist (z.B. beim Anlegen
   * über das "+" einer Hauptkategorie). Zeigt dann nur den Namen statt der Auswahl.
   */
  lockedParentName?: string
}) {
  const [farbe, setFarbe] = useState<string>(category?.color ?? '')
  const [icon, setIcon] = useState<string>(category?.icon ?? '')

  // Zwei Ebenen: nur Hauptkategorien sind moegliche Eltern, nicht die Kategorie selbst (damit auch keine
  // Nachkommen), und eine Kategorie mit Unterkategorien kann nicht selbst Unterkategorie werden.
  const parentOptions = moeglicheEltern(allCategories, category?.id ?? null)
  const hatKinder = category ? allCategories.some((c) => c.parent_id === category.id) : false
  const eltern = parentId !== '__none__' ? allCategories.find((c) => c.id === parentId) : undefined

  function waehleEltern(v: string) {
    setParentId(v)
    // Unterkategorien erben den Typ der Hauptkategorie.
    const p = allCategories.find((c) => c.id === v)
    if (p) setType(p.type)
  }

  return (
    <>
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="type" value={eltern?.type ?? type} />
      <input type="hidden" name="parent_id" value={parentId} />
      <input type="hidden" name="tax_role" value={taxRole === '__none__' ? '' : taxRole} />
      <input type="hidden" name="euer_zeile" value={euerZeile === '__none__' ? '' : euerZeile} />
      <input type="hidden" name="color" value={farbe} />

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="cat-name">Name *</Label>
        <Input
          id="cat-name"
          name="name"
          defaultValue={category?.name}
          placeholder="z.B. Lebensmittel"
          maxLength={100}
          required
          className={FELD}
        />
      </div>

      {/* Typ + Übergeordnete Kategorie */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="cat-typ">Typ *</Label>
          {eltern ? (
            <div id="cat-typ" className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-base text-muted-foreground sm:h-9 sm:text-sm">
              {CATEGORY_TYPES.find((t) => t.value === eltern.type)?.label ?? eltern.type} (von der Oberkategorie)
            </div>
          ) : (
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="cat-typ" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="cat-parent">Übergeordnet</Label>
          {lockedParentName ? (
            <div id="cat-parent" className="flex h-10 items-center truncate rounded-md border border-input bg-muted/40 px-3 text-base text-muted-foreground sm:h-9 sm:text-sm">
              {lockedParentName}
            </div>
          ) : hatKinder ? (
            <div id="cat-parent" className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground sm:min-h-9">
              Hauptkategorie (hat Unterkategorien)
            </div>
          ) : (
            <Select value={parentId} onValueChange={waehleEltern}>
              <SelectTrigger id="cat-parent" className={TRIGGER}>
                <SelectValue placeholder="Keine (Hauptkategorie)" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__none__">Keine (Hauptkategorie)</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Farbe */}
      <div className="space-y-1.5">
        <Label htmlFor="cat-color">Farbe</Label>
        <div className="flex flex-wrap items-center gap-2">
          {FARBEN.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFarbe(f)}
              aria-label={`Farbe ${f}`}
              aria-pressed={farbe === f}
              className="grid size-10 place-items-center rounded-full sm:size-8"
            >
              <span
                className={`size-6 rounded-full border border-border sm:size-5 ${farbe === f ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
                style={{ backgroundColor: f }}
              />
            </button>
          ))}
          <input
            id="cat-color"
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(farbe) ? farbe : '#64748b'}
            onChange={(e) => setFarbe(e.target.value)}
            aria-label="Eigene Farbe wählen"
            className="size-10 cursor-pointer rounded-md border border-input bg-background p-1 sm:size-8"
          />
          {farbe && (
            <Button type="button" variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setFarbe('')}>
              Keine
            </Button>
          )}
        </div>
      </div>

      {/* Icon + Budget */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="cat-icon">Icon (Emoji)</Label>
          <Input
            id="cat-icon"
            name="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🛒"
            maxLength={16}
            className={`${FELD} text-center`}
          />
          <div className="flex flex-wrap gap-1">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                aria-label={`Icon ${i}`}
                className={`grid size-10 place-items-center rounded-md text-base hover:bg-muted sm:size-8 ${icon === i ? 'bg-muted' : ''}`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="cat-budget">Budget pro Monat (optional)</Label>
          <Input
            id="cat-budget"
            name="budget_monthly"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue={category?.budget_monthly ?? ''}
            placeholder="0,00"
            className={FELD}
          />
        </div>
      </div>

      {/* Steuerliche Rolle -- bei neutralen Kategorien (Umbuchungen, Depot,
          Bausparen) gibt es steuerlich nichts zu entscheiden, deshalb dort
          ausgeblendet statt mit einer sinnlosen Auswahl belegt. */}
      {(eltern?.type ?? type) !== 'neutral' && (
        <div className="space-y-1.5">
          <Label htmlFor="cat-tax">Steuerlich</Label>
          <Select value={taxRole} onValueChange={setTaxRole}>
            <SelectTrigger id="cat-tax" className={TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {eltern
              ? 'Leer = gilt die Rolle der Oberkategorie. Eine eigene Rolle überschreibt sie.'
              : 'Gilt auch für Unterkategorien, solange die keine eigene Rolle haben.'}
          </p>
        </div>
      )}

      {/* Betrieblicher Anteil — für gemischt genutzte Ausgaben (Internet, Handy, Software).
          Steuerlich zählt nur dieser Teil; Dashboard und Analyse rechnen mit dem vollen Betrag.
          Leer = 100 %. */}
      {taxRole === 'betriebsausgabe' && (
        <div className="space-y-1.5">
          <Label htmlFor="cat-business-share">Betrieblicher Anteil (%)</Label>
          <Input
            id="cat-business-share"
            name="business_share"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.01"
            defaultValue={category?.business_share ?? ''}
            placeholder="100"
            className={FELD}
          />
          <p className="text-xs text-muted-foreground">
            Nur dieser Anteil wird steuerlich als Betriebsausgabe gezählt. Leer = 100 %.
          </p>
        </div>
      )}

      {/* Formularzeile — nur sinnvoll, wenn die Kategorie überhaupt in die EÜR
          fließt. Ohne Auswahl landet der Betrag in der Sammelzeile: rechnerisch
          richtig, im Formular grob. */}
      {(taxRole === 'betriebseinnahme' || taxRole === 'betriebsausgabe') && euerZeilen.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="cat-euer">Zeile der Anlage EÜR</Label>
          <Select value={euerZeile} onValueChange={setEuerZeile}>
            <SelectTrigger id="cat-euer" className={TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">Sammelzeile (nicht zugeordnet)</SelectItem>
              {euerZeilen
                .filter((z) =>
                  taxRole === 'betriebseinnahme' ? z.art === 'einnahme' : z.art === 'ausgabe',
                )
                .map((z) => (
                  <SelectItem key={z.zeile} value={String(z.zeile)}>
                    {z.zeile} · {z.bezeichnung}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            In dieser Zeile der Steuererklärung (Anlage EÜR, Jahrgang {euerZeilen[0]?.jahr}) landen die Beträge der Kategorie.
            Ohne Auswahl kommen sie in die Sammelzeile. Die Nummern verschieben sich jährlich, im Zweifel gegen das amtliche Formular prüfen.
          </p>
        </div>
      )}
    </>
  )
}

function FormFuss({ isPending, label, pendingLabel, onCancel }: { isPending: boolean; label: string; pendingLabel: string; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button type="submit" className="h-10 sm:h-9" disabled={isPending}>
        {isPending ? pendingLabel : label}
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Create dialog
// ─────────────────────────────────────────────
export function AddCategoryDialog({
  allCategories,
  euerZeilen,
  defaultParentId,
  trigger,
}: {
  allCategories: Category[]
  euerZeilen: EuerZeile[]
  /** Vorbelegt die "Übergeordnet"-Auswahl -- fürs Anlegen direkt aus einer Hauptkategorie-Gruppe heraus. */
  defaultParentId?: string
  /** Ersetzt den Standard-"Kategorie anlegen"-Button, z.B. durch ein kleines "+"-Icon pro Gruppe. */
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const defaultParent = defaultParentId
    ? allCategories.find((c) => c.id === defaultParentId)
    : undefined
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(defaultParent?.type ?? 'expense')
  const [parentId, setParentId] = useState(defaultParentId ?? '__none__')
  const [taxRole, setTaxRole] = useState('__none__')
  const [euerZeile, setEuerZeile] = useState('__none__')

  const [state, formAction, isPending] = useActionState<CategoryActionState, FormData>(
    createCategory,
    null
  )
  const [fehlerSichtbar, setFehlerSichtbar] = useFehlerAnzeige(state)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setType(defaultParent?.type ?? 'expense')
      setParentId(defaultParentId ?? '__none__')
      setTaxRole('__none__')
      setEuerZeile('__none__')
      setFehlerSichtbar(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-10 sm:h-8">
            <Plus className="size-4" />
            Kategorie anlegen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{defaultParent ? 'Neue Unterkategorie' : 'Neue Kategorie'}</DialogTitle>
          <DialogDescription className="sr-only">Name, Typ und Einstellungen der neuen Kategorie</DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            // Replace __none__ sentinel with empty string before submit
            if (fd.get('parent_id') === '__none__') fd.set('parent_id', '')
            formAction(fd)
          }}
          className="space-y-4 pt-2"
        >
          <CategoryFormFields
            allCategories={allCategories}
            type={type}
            setType={setType}
            parentId={parentId}
            setParentId={setParentId}
            taxRole={taxRole}
            setTaxRole={setTaxRole}
            euerZeile={euerZeile}
            setEuerZeile={setEuerZeile}
            euerZeilen={euerZeilen}
            lockedParentName={defaultParent?.name}
          />
          {fehlerSichtbar && state && 'error' in state && (
            <p className="text-sm text-destructive" role="alert">{state.error}</p>
          )}
          <FormFuss isPending={isPending} label="Anlegen" pendingLabel="Wird gespeichert…" onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Edit dialog
// ─────────────────────────────────────────────
export function EditCategoryDialog({
  category,
  allCategories,
  euerZeilen,
}: {
  category: Category
  allCategories: Category[]
  euerZeilen: EuerZeile[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(category.type)
  const [parentId, setParentId] = useState(category.parent_id ?? '__none__')
  const [taxRole, setTaxRole] = useState(category.tax_role ?? '__none__')
  const [euerZeile, setEuerZeile] = useState(
    category.euer_zeile === null ? '__none__' : String(category.euer_zeile),
  )

  const [state, formAction, isPending] = useActionState<CategoryActionState, FormData>(
    updateCategory,
    null
  )
  const [fehlerSichtbar, setFehlerSichtbar] = useFehlerAnzeige(state)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setType(category.type)
      setParentId(category.parent_id ?? '__none__')
      setTaxRole(category.tax_role ?? '__none__')
      setEuerZeile(category.euer_zeile === null ? '__none__' : String(category.euer_zeile))
      setFehlerSichtbar(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10 text-muted-foreground md:size-8"
          aria-label={`${category.name} bearbeiten`}
        >
          <Pencil className="size-4 md:size-3.5" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kategorie bearbeiten</DialogTitle>
          <DialogDescription className="sr-only">Name, Typ und Einstellungen der Kategorie ändern</DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            if (fd.get('parent_id') === '__none__') fd.set('parent_id', '')
            formAction(fd)
          }}
          className="space-y-4 pt-2"
        >
          <CategoryFormFields
            allCategories={allCategories}
            category={category}
            type={type}
            setType={setType}
            parentId={parentId}
            setParentId={setParentId}
            taxRole={taxRole}
            setTaxRole={setTaxRole}
            euerZeile={euerZeile}
            setEuerZeile={setEuerZeile}
            euerZeilen={euerZeilen}
          />
          {fehlerSichtbar && state && 'error' in state && (
            <p className="text-sm text-destructive" role="alert">{state.error}</p>
          )}
          <FormFuss isPending={isPending} label="Speichern" pendingLabel="Wird gespeichert…" onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
