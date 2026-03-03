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
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createIndicator, updateIndicator, deleteIndicator,
  type IndicatorActionState,
} from '@/app/(dashboard)/strategy/indicators/actions'
import { Database } from '@/types/database'

type Indicator = Database['public']['Tables']['indicators']['Row']

const TYPE_SUGGESTIONS = [
  'Trend', 'Momentum', 'Volatility', 'Volume', 'Oscillator',
  'Support/Resistance', 'Pattern', 'Multi', 'Other',
]

// ─── Shared form fields ───────────────────────────────────────────────────────
function IndicatorFields({
  ind,
  repaints,    setRepaints,
  isForbidden, setIsForbidden,
}: {
  ind?:          Indicator
  repaints:      boolean
  setRepaints:   (v: boolean) => void
  isForbidden:   boolean
  setIsForbidden:(v: boolean) => void
}) {
  return (
    <>
      {ind && <input type="hidden" name="id" value={ind.id} />}
      <input type="hidden" name="repaints"    value={repaints.toString()} />
      <input type="hidden" name="is_forbidden" value={isForbidden.toString()} />

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="i-name">Name *</Label>
        <Input id="i-name" name="name" defaultValue={ind?.name} placeholder="EMA Crossover" required />
      </div>

      {/* Author + Typ */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="i-author">Author *</Label>
          <Input id="i-author" name="author" defaultValue={ind?.author} placeholder="Cobra, DonkeyIdeas…" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="i-type">Typ *</Label>
          <Input
            id="i-type" name="type" list="type-suggestions"
            defaultValue={ind?.type} placeholder="Trend, Momentum…" required
          />
          <datalist id="type-suggestions">
            {TYPE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
      </div>

      {/* Subtype + TV URL */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="i-sub">Subtyp</Label>
          <Input id="i-sub" name="subtype" defaultValue={ind?.subtype ?? ''} placeholder="EMA, RSI…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="i-url">TradingView URL</Label>
          <Input id="i-url" name="tv_url" defaultValue={ind?.tv_url ?? ''} placeholder="https://…" />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setRepaints(!repaints)}
            className={`relative w-9 h-5 rounded-full transition-colors ${repaints ? 'bg-amber-500' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${repaints ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-sm">Repaints</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setIsForbidden(!isForbidden)}
            className={`relative w-9 h-5 rounded-full transition-colors ${isForbidden ? 'bg-destructive' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${isForbidden ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-sm">Verboten</span>
        </label>
      </div>

      {/* Forbidden reason */}
      {isForbidden && (
        <div className="space-y-1.5">
          <Label htmlFor="i-reason">Grund</Label>
          <Input id="i-reason" name="forbidden_reason" defaultValue={ind?.forbidden_reason ?? ''} placeholder="Repaints, lookahead bias…" />
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="i-notes">Notizen</Label>
        <textarea
          id="i-notes" name="notes" rows={2}
          defaultValue={ind?.notes ?? ''}
          placeholder="Optionale Anmerkungen…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </>
  )
}

// ─── Shared dialog wrapper ────────────────────────────────────────────────────
function IndicatorDialog({ mode, ind, trigger }: {
  mode:    'create' | 'edit'
  ind?:    Indicator
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [repaints, setRepaints]       = useState(ind?.repaints ?? false)
  const [isForbidden, setIsForbidden] = useState(ind?.is_forbidden ?? false)

  const action = mode === 'create' ? createIndicator : updateIndicator
  const [state, formAction, isPending] = useActionState<IndicatorActionState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) { setOpen(false); router.refresh() }
  }, [state, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) { setRepaints(ind?.repaints ?? false); setIsForbidden(ind?.is_forbidden ?? false) }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neuer Indikator' : 'Indikator bearbeiten'}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 pt-2">
          <IndicatorFields
            ind={ind}
            repaints={repaints}     setRepaints={setRepaints}
            isForbidden={isForbidden} setIsForbidden={setIsForbidden}
          />
          {state && 'error' in state && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
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
export function AddIndicatorDialog() {
  return (
    <IndicatorDialog
      mode="create"
      trigger={<Button size="sm"><Plus className="size-4" />Indikator anlegen</Button>}
    />
  )
}

export function EditIndicatorDialog({ ind }: { ind: Indicator }) {
  return (
    <IndicatorDialog
      mode="edit" ind={ind}
      trigger={<Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>}
    />
  )
}

export function DeleteIndicatorButton({ ind }: { ind: Indicator }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteIndicator(ind.id)
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
          <AlertDialogTitle>Indikator löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{ind.name}</strong> und alle zugehörigen Backtest-Einträge werden unwiderruflich gelöscht.
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
