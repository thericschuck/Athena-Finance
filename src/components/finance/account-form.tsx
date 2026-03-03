'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
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
import { Plus } from 'lucide-react'
import {
  createAccount,
  type AccountActionState,
} from '@/app/(dashboard)/finance/accounts/actions'

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Girokonto' },
  { value: 'savings', label: 'Sparkonto' },
  { value: 'investment', label: 'Depot / Investment' },
  { value: 'crypto', label: 'Krypto' },
  { value: 'cash', label: 'Bargeld' },
  { value: 'credit', label: 'Kreditkarte' },
] as const

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'BTC', 'ETH'] as const

export function AddAccountDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('')
  const [currency, setCurrency] = useState('')

  const [state, formAction, isPending] = useActionState<AccountActionState, FormData>(
    createAccount,
    null
  )

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  // Reset Select fields when dialog opens
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setType('')
      setCurrency('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Konto hinzufügen
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Konto anlegen</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          {/* Hidden inputs for Select values */}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="currency" value={currency} />

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              name="name"
              placeholder="z.B. DKB Girokonto"
              required
            />
          </div>

          {/* Typ */}
          <div className="space-y-1.5">
            <Label>Typ *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Typ wählen…" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Institution */}
          <div className="space-y-1.5">
            <Label htmlFor="institution">Institution</Label>
            <Input
              id="institution"
              name="institution"
              placeholder="z.B. DKB, ING, Coinbase"
            />
          </div>

          {/* Währung */}
          <div className="space-y-1.5">
            <Label>Währung *</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue placeholder="Währung wählen…" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color + IBAN nebeneinander */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="color">Farbe</Label>
              <div className="flex items-center gap-2">
                <input
                  id="color"
                  name="color"
                  type="color"
                  defaultValue="#6366f1"
                  className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                />
                <span className="text-xs text-muted-foreground">Konto-Farbe</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="iban">IBAN</Label>
              <Input
                id="iban"
                name="iban"
                placeholder="DE00 0000 …"
                className="text-xs"
              />
            </div>
          </div>

          {/* Error */}
          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Konto anlegen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
