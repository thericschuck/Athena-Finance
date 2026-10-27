'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PiggyBank, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createGoal, updateGoal, deleteGoal, addGoalPayment, type GoalActionState,
} from '@/app/(dashboard)/finance/(planung)/goals/actions'
import { betragAusNutzereingabe, betragFuerFeld, heuteBerlin, kanonisch, MAX_BETRAG } from '@/lib/transaktionen/formular'
import { fmtCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Ziel } from '@/lib/data/sparziele-seite'
import { TeilenSchalter } from '@/components/haushalt/TeilenSchalter'

const PRIORITIES = [
  { value: '', label: 'Keine' },
  { value: 'hoch', label: 'Hoch' },
  { value: 'mittel', label: 'Mittel' },
  { value: 'niedrig', label: 'Niedrig' },
]

const FELD = 'h-10 text-base sm:text-sm'

/** Aktionsknopf in der Zeile: mobil immer sichtbar, am Desktop erst beim Überfahren/Fokussieren. */
const AKTION_KLASSE =
  'size-10 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:group-focus-within:opacity-100'

// ─── Formular (frisch bei jedem Öffnen, damit Fehler und Eingaben nicht hängen bleiben) ────────
function GoalFormular({ mode, goal, onClose }: { mode: 'create' | 'edit'; goal?: Ziel; onClose: () => void }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<GoalActionState, FormData>(
    mode === 'create' ? createGoal : updateGoal, null,
  )
  const [lokalFehler, setLokalFehler] = useState<string | null>(null)
  const [priority, setPriority] = useState(goal?.priority ?? '')
  const [rate, setRate] = useState(() => (goal?.monthly_savings_rate ? betragFuerFeld(goal.monthly_savings_rate) : ''))
  const hatRate = (betragAusNutzereingabe(rate) ?? 0) > 0

  useEffect(() => {
    if (state && 'success' in state) {
      onClose()
      router.refresh()
    }
  }, [state, router, onClose])

  function handleAction(fd: FormData) {
    // EINE Betragsregel: was der Mensch tippt (deutsch) -> kanonisch, erst dann zum Server
    for (const name of ['target_amount', 'current_amount', 'monthly_savings_rate']) {
      const roh = String(fd.get(name) ?? '').trim()
      if (roh === '') { fd.set(name, ''); continue }
      const n = betragAusNutzereingabe(roh)
      if (n === null || Math.abs(n) > MAX_BETRAG) {
        setLokalFehler('Bitte Beträge als Zahl eingeben, z. B. 1.250,50.')
        return
      }
      fd.set(name, kanonisch(n))
    }
    setLokalFehler(null)
    fd.set('priority', priority)
    formAction(fd)
  }

  const fehler = lokalFehler ?? (state && 'error' in state ? state.error : null)

  return (
    <form action={handleAction} className="min-w-0 space-y-4 pt-2">
      {goal && <input type="hidden" name="id" value={goal.id} />}

      <div className="space-y-1.5">
        <Label htmlFor="g-desc">Bezeichnung *</Label>
        <Input
          id="g-desc" name="description" defaultValue={goal?.description}
          placeholder="z. B. Notfallfonds, Urlaub Japan" required maxLength={200} className={FELD}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="g-target">Zielbetrag (€) *</Label>
          <Input
            id="g-target" name="target_amount" inputMode="decimal" autoComplete="off"
            defaultValue={goal ? betragFuerFeld(goal.target_amount) : ''} placeholder="0,00" required className={FELD}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="g-current">Bereits gespart (€)</Label>
          <Input
            id="g-current" name="current_amount" inputMode="decimal" autoComplete="off"
            defaultValue={goal ? betragFuerFeld(goal.current_amount) : ''} placeholder="0,00" className={FELD}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="g-rate">Sparrate / Monat (€)</Label>
          <Input
            id="g-rate" name="monthly_savings_rate" inputMode="decimal" autoComplete="off"
            value={rate} onChange={e => setRate(e.target.value)} placeholder="0,00" className={FELD}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="g-date">Zieldatum</Label>
          <Input id="g-date" name="target_date" type="date" defaultValue={goal?.target_date ?? ''} className={FELD} />
        </div>
      </div>

      {hatRate && (
        <div className="space-y-1.5">
          <Label htmlFor="g-rate-start">Sparrate gilt ab</Label>
          <Input
            id="g-rate-start" name="savings_rate_start_date" type="date"
            defaultValue={goal?.savings_rate_start_date ?? heuteBerlin()} className={FELD}
          />
          <p className="text-xs text-muted-foreground">
            Ab diesem Tag wird der Plan-Stand gerechnet (volle Monate x Rate). Das setzt voraus, dass du ab dann bei 0 € angefangen hast.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label id="g-prio-label">Priorität</Label>
        <div role="radiogroup" aria-labelledby="g-prio-label" className="flex flex-wrap gap-2">
          {PRIORITIES.map(p => (
            <button
              key={p.value} type="button" role="radio" aria-checked={priority === p.value}
              onClick={() => setPriority(p.value)}
              className={cn(
                'h-10 rounded-full border px-4 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                priority === p.value
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent/40',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="g-notes">Notizen</Label>
        <textarea
          id="g-notes" name="notes" rows={2} defaultValue={goal?.notes ?? ''} maxLength={2000}
          placeholder="Optionale Anmerkungen…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
        />
      </div>

      <TeilenSchalter defaultChecked={goal?.shared ?? false} unbekannt={!!goal && goal.shared === undefined} />

      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="h-10" onClick={onClose}>Abbrechen</Button>
        <Button type="submit" className="h-10" disabled={isPending}>
          {isPending ? 'Wird gespeichert…' : mode === 'create' ? 'Anlegen' : 'Speichern'}
        </Button>
      </div>
    </form>
  )
}

function GoalDialog({ mode, goal, trigger }: { mode: 'create' | 'edit'; goal?: Ziel; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const schliessen = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neues Sparziel' : 'Sparziel bearbeiten'}</DialogTitle>
          <DialogDescription className="sr-only">
            {mode === 'create' ? 'Lege ein neues Sparziel an.' : 'Ändere Zielbetrag, Stand, Rate oder Zieldatum.'}
          </DialogDescription>
        </DialogHeader>
        <GoalFormular mode={mode} goal={goal} onClose={schliessen} />
      </DialogContent>
    </Dialog>
  )
}

// ─── Public exports ───────────────────────────────────────────────────────────
export function AddGoalDialog() {
  return (
    <GoalDialog
      mode="create"
      trigger={<Button className="h-10"><Plus className="size-4" />Sparziel anlegen</Button>}
    />
  )
}

export function EditGoalDialog({ goal }: { goal: Ziel }) {
  return (
    <GoalDialog
      mode="edit" goal={goal}
      trigger={
        <Button variant="ghost" className={AKTION_KLASSE} aria-label={`${goal.description} bearbeiten`}>
          <Pencil className="size-4" />
        </Button>
      }
    />
  )
}

export function GoalPaymentDialog({ goal, locale }: { goal: Ziel; locale: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })
  const rest = Math.max(0, Math.round((goal.target_amount - goal.current_amount) * 100) / 100)
  const rate = goal.monthly_savings_rate && goal.monthly_savings_rate > 0 ? goal.monthly_savings_rate : null

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) { setAmount(''); setError(null) }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = betragAusNutzereingabe(amount)
    if (n === null || n <= 0) { setError('Bitte einen gültigen Betrag größer als 0 eingeben.'); return }
    if (n > MAX_BETRAG) { setError('Betrag ist zu groß.'); return }
    setError(null)
    startTransition(async () => {
      const result = await addGoalPayment(goal.id, n)
      if (result.error) setError(result.error)
      else { setOpen(false); router.refresh() }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 shrink-0 gap-1.5 px-3">
          <PiggyBank className="size-4" aria-hidden />Einzahlen
          <span className="sr-only"> auf {goal.description}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Einzahlung erfassen</DialogTitle>
          <DialogDescription className="min-w-0 break-words">
            {goal.description}: gespart {euro(goal.current_amount)} von {euro(goal.target_amount)}
            {rest > 0 ? `, noch ${euro(rest)}` : ''}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="pay-goal-amount">Betrag (€) *</Label>
            <Input
              id="pay-goal-amount" inputMode="decimal" autoComplete="off" placeholder="0,00"
              value={amount} onChange={e => setAmount(e.target.value)} autoFocus required className={FELD}
            />
            {(rate !== null || rest > 0) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {rate !== null && (
                  <button type="button" onClick={() => setAmount(betragFuerFeld(rate))}
                    className="h-10 rounded-full border border-border px-3 text-xs text-muted-foreground hover:bg-accent/40">
                    Sparrate {euro(rate)}
                  </button>
                )}
                {rest > 0 && (
                  <button type="button" onClick={() => setAmount(betragFuerFeld(rest))}
                    className="h-10 rounded-full border border-border px-3 text-xs text-muted-foreground hover:bg-accent/40">
                    Rest {euro(rest)}
                  </button>
                )}
              </div>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button type="submit" className="h-10" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Einzahlung buchen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteGoalButton({ goal }: { goal: Ziel }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete(e: React.MouseEvent) {
    // Dialog erst nach Erfolg schliessen: bei einem Fehler soll die Meldung sichtbar bleiben
    e.preventDefault()
    startTransition(async () => {
      const result = await deleteGoal(goal.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <AlertDialog onOpenChange={() => setError(null)}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className={cn(AKTION_KLASSE, 'hover:text-destructive')} aria-label={`${goal.description} löschen`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sparziel löschen?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            <strong>{goal.description}</strong> wird unwiderruflich gelöscht. Der gesparte Betrag steht nur hier und geht damit verloren; Konten und Buchungen bleiben unberührt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="px-1 text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10">Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete} disabled={isPending}
            className="h-10 bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? 'Wird gelöscht…' : 'Löschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
