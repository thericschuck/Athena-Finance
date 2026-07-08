'use client'

import { useActionState } from 'react'
import { upsertIncomeTarget } from '@/app/(dashboard)/lebenshaltungskosten/actions'
import type { IncomeTarget } from '@/app/(dashboard)/lebenshaltungskosten/page'

interface Props {
  target: IncomeTarget | null
}

export function EinstellungenTab({ target }: Props) {
  const [state, dispatch, pending] = useActionState(upsertIncomeTarget, null)

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-1">Mindestgehalt-Parameter</h2>
        <p className="text-xs text-muted-foreground mb-5">
          Diese Werte fließen in die Berechnung des erforderlichen Mindestgehalts ein.
        </p>

        <form action={dispatch} className="space-y-4">
          {target?.id && <input type="hidden" name="id" value={target.id} />}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Bezeichnung</label>
            <input
              name="label"
              defaultValue={target?.label ?? 'Standard'}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Puffer %
              </label>
              <input
                name="buffer_pct"
                type="number"
                min="0"
                max="100"
                step="0.5"
                defaultValue={target?.buffer_pct ?? 15}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Steuer %
              </label>
              <input
                name="tax_pct"
                type="number"
                min="0"
                max="100"
                step="0.5"
                defaultValue={target?.tax_pct ?? 30}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Sparrate %
              </label>
              <input
                name="savings_pct"
                type="number"
                min="0"
                max="100"
                step="0.5"
                defaultValue={target?.savings_pct ?? 10}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {'error' in (state ?? {}) && (
            <p className="text-sm text-red-500">{(state as { error: string }).error}</p>
          )}
          {'success' in (state ?? {}) && (
            <p className="text-sm text-green-600 dark:text-green-400">Gespeichert.</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-opacity"
          >
            {pending ? 'Speichern…' : 'Speichern'}
          </button>
        </form>
      </div>

      {/* Formula explanation */}
      <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Berechnungsformel</h3>
        <div className="space-y-2 text-xs text-muted-foreground font-mono">
          <p>Kosten/Monat (Item)  = (Preis × Menge) / Tage × 30</p>
          <p>Netto Minimum        = Summe × (1 + Puffer%) × (1 + Sparrate%)</p>
          <p>Brutto Minimum       = Netto / (1 – Steuer%)</p>
        </div>
      </div>
    </div>
  )
}
