'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryActionState,
} from '@/app/(dashboard)/finance/(transaktionen)/categories/actions'
import type { CategoryRow, EuerZeileRow } from '@/lib/data/finance-transactions'

type Category = CategoryRow
type EuerZeile = EuerZeileRow

const CATEGORY_TYPES = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'neutral', label: 'Neutral' },
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
   * über das "+" einer Hauptkategorie-Gruppe). Zeigt dann nur den Namen statt der Auswahl --
   * verhindert, dass die Auswahl versehentlich auf "Keine" steht bleibt, obwohl man aus einer
   * bestimmten Gruppe heraus angelegt hat.
   */
  lockedParentName?: string
}) {
  // Exclude self from parent options (prevent circular ref)
  const parentOptions = allCategories.filter(
    (c) => !c.parent_id && c.id !== category?.id
  )

  return (
    <>
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="parent_id" value={parentId} />
      <input type="hidden" name="tax_role" value={taxRole === '__none__' ? '' : taxRole} />
      <input type="hidden" name="euer_zeile" value={euerZeile === '__none__' ? '' : euerZeile} />

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="cat-name">Name *</Label>
        <Input
          id="cat-name"
          name="name"
          defaultValue={category?.name}
          placeholder="z.B. Lebensmittel"
          required
        />
      </div>

      {/* Typ + Übergeordnete Kategorie */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Typ *</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
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
        </div>

        <div className="space-y-1.5">
          <Label>Übergeordnet</Label>
          {lockedParentName ? (
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
              {lockedParentName}
            </div>
          ) : (
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue placeholder="Keine (Hauptkategorie)" />
              </SelectTrigger>
              <SelectContent>
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

      {/* Farbe + Icon + Budget */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cat-color">Farbe</Label>
          <input
            id="cat-color"
            name="color"
            type="color"
            defaultValue={category?.color ?? '#64748b'}
            className="h-9 w-full cursor-pointer rounded-md border border-input bg-background p-1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-icon">Icon</Label>
          <Input
            id="cat-icon"
            name="icon"
            defaultValue={category?.icon ?? ''}
            placeholder="🛒"
            className="text-center"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-budget">Budget/Monat</Label>
          <Input
            id="cat-budget"
            name="budget_monthly"
            type="number"
            step="0.01"
            min="0"
            defaultValue={category?.budget_monthly ?? ''}
            placeholder="0,00"
          />
        </div>
      </div>

      {/* Steuerliche Rolle -- bei neutralen Kategorien (Umbuchungen, Depot,
          Bausparen) gibt es steuerlich nichts zu entscheiden, deshalb dort
          ausgeblendet statt mit einer sinnlosen Auswahl belegt. */}
      {type !== 'neutral' && (
        <div className="space-y-1.5">
          <Label>Steuerlich</Label>
          <Select value={taxRole} onValueChange={setTaxRole}>
            <SelectTrigger>
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
            Gilt auch für Unterkategorien, solange die keine eigene Rolle haben.
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
          <Label>Zeile der Anlage EÜR</Label>
          <Select value={euerZeile} onValueChange={setEuerZeile}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
            Zeilennummern des Jahrgangs {euerZeilen[0]?.jahr}. Sie verschieben sich jährlich —
            vor dem Abtippen gegen das amtliche Formular prüfen.
          </p>
        </div>
      )}
    </>
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
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" />
            Kategorie anlegen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Kategorie</DialogTitle>
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
          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Anlegen'}
            </Button>
          </div>
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
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kategorie bearbeiten</DialogTitle>
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
          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Delete button with AlertDialog confirmation
// ─────────────────────────────────────────────
export function DeleteCategoryButton({ category }: { category: Category }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCategory(category.id)
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <AlertDialog onOpenChange={() => setError(null)}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kategorie löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{category.name}</strong> wird unwiderruflich gelöscht. Transaktionen
            dieser Kategorie werden nicht gelöscht, verlieren aber ihre Kategorie-Zuweisung.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive px-1">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? 'Wird gelöscht…' : 'Löschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
