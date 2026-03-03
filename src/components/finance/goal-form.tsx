'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createGoal, updateGoal, deleteGoal, type GoalActionState,
} from '@/app/(dashboard)/finance/goals/actions'
import { Database } from '@/types/database'

type Goal = Database['public']['Tables']['savings_goals']['Row']

const PRIORITIES = [
  { value: 'high',   label: 'Hoch' },
  { value: 'medium', label: 'Mittel' },
  { value: 'low',    label: 'Niedrig' },
]

// ─── Shared form fields ───────────────────────────────────────────────────────
function GoalFields({
  goal, priority, setPriority,
}: {
  goal?: Goal
  priority: string
  setPriority: (v: string) => void
}) {
  return (
    <>
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <input type="hidden" name="priority" value={priority} />

      {/* Bezeichnung */}
      <div className="space-y-1.5">
        <Label htmlFor="g-desc">Bezeichnung *</Label>
        <Input
          id="g-desc" name="description"
          defaultValue={goal?.description}
          placeholder="z.B. Notfallfonds, Urlaub Japan"
          required
        />
      </div>

      {/* Zielbetrag + Rate */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="g-target">Zielbetrag (€) *</Label>
          <Input
            id="g-target" name="target_amount" type="number"
            step="0.01" min="0.01"
            defaultValue={goal?.target_amount}
            placeholder="0,00" required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-rate">Sparrate / Monat (€)</Label>
          <Input
            id="g-rate" name="monthly_savings_rate" type="number"
            step="0.01" min="0"
            defaultValue={goal?.monthly_savings_rate ?? ''}
            placeholder="0,00"
          />
        </div>
      </div>

      {/* Priorität + Zieldatum */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Priorität</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Keine Priorität</SelectItem>
              {PRIORITIES.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-date">Zieldatum</Label>
          <Input
            id="g-date" name="target_date" type="date"
            defaultValue={goal?.target_date ?? ''}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="g-notes">Notizen</Label>
        <textarea
          id="g-notes" name="notes" rows={2}
          defaultValue={goal?.notes ?? ''}
          placeholder="Optionale Anmerkungen…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </>
  )
}

// ─── Shared dialog wrapper ────────────────────────────────────────────────────
function GoalDialog({
  mode, goal, trigger,
}: {
  mode: 'create' | 'edit'
  goal?: Goal
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [priority, setPriority] = useState(goal?.priority ?? '__none__')

  const action = mode === 'create' ? createGoal : updateGoal
  const [state, formAction, isPending] = useActionState<GoalActionState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setPriority(goal?.priority ?? '__none__')
  }

  function handleAction(fd: FormData) {
    if (fd.get('priority') === '__none__') fd.set('priority', '')
    formAction(fd)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neues Sparziel' : 'Sparziel bearbeiten'}</DialogTitle>
        </DialogHeader>
        <form action={handleAction} className="space-y-4 pt-2">
          <GoalFields goal={goal} priority={priority} setPriority={setPriority} />
          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : mode === 'create' ? 'Anlegen' : 'Speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Public exports ───────────────────────────────────────────────────────────
export function AddGoalDialog() {
  return (
    <GoalDialog
      mode="create"
      trigger={<Button size="sm"><Plus className="size-4" />Sparziel anlegen</Button>}
    />
  )
}

export function EditGoalDialog({ goal }: { goal: Goal }) {
  return (
    <GoalDialog
      mode="edit" goal={goal}
      trigger={<Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>}
    />
  )
}

export function DeleteGoalButton({ goal }: { goal: Goal }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteGoal(goal.id)
      if (result.error) setError(result.error)
      else router.refresh()
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
          <AlertDialogTitle>Sparziel löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{goal.description}</strong> wird unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive px-1">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete} disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? 'Wird gelöscht…' : 'Löschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
