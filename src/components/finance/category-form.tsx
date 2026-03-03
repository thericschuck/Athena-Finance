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
} from '@/app/(dashboard)/finance/categories/actions'
import { Database } from '@/types/database'

type Category = Database['public']['Tables']['categories']['Row']

const CATEGORY_TYPES = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'neutral', label: 'Neutral' },
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
}: {
  allCategories: Category[]
  category?: Category
  type: string
  setType: (v: string) => void
  parentId: string
  setParentId: (v: string) => void
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
            defaultValue={category?.color ?? '#6366f1'}
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
    </>
  )
}

// ─────────────────────────────────────────────
// Create dialog
// ─────────────────────────────────────────────
export function AddCategoryDialog({ allCategories }: { allCategories: Category[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('expense')
  const [parentId, setParentId] = useState('__none__')

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
      setType('expense')
      setParentId('__none__')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Kategorie anlegen
        </Button>
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
}: {
  category: Category
  allCategories: Category[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(category.type)
  const [parentId, setParentId] = useState(category.parent_id ?? '__none__')

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
