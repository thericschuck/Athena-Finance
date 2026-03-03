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
  createAsset, updateAsset, deleteAsset, type AssetActionState,
} from '@/app/(dashboard)/crypto/actions'
import { Database } from '@/types/database'

type Asset = Database['public']['Tables']['assets']['Row']

// ─── Shared form fields ───────────────────────────────────────────────────────
function AssetFields({ asset }: { asset?: Asset }) {
  return (
    <>
      {asset && <input type="hidden" name="id" value={asset.id} />}

      {/* Name + CoinGecko-ID */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="a-name">Name *</Label>
          <Input
            id="a-name" name="name"
            defaultValue={asset?.name}
            placeholder="Bitcoin"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-symbol">CoinGecko-ID *</Label>
          <Input
            id="a-symbol" name="symbol"
            defaultValue={asset?.symbol ?? ''}
            placeholder="bitcoin"
            required
          />
          <p className="text-xs text-muted-foreground">z.B. bitcoin, ethereum, solana</p>
        </div>
      </div>

      {/* Menge + Ø Kaufpreis */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="a-qty">Menge *</Label>
          <Input
            id="a-qty" name="quantity" type="number"
            step="any" min="0"
            defaultValue={asset?.quantity ?? ''}
            placeholder="0.00"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-price">Ø Kaufpreis (€)</Label>
          <Input
            id="a-price" name="avg_buy_price" type="number"
            step="0.01" min="0"
            defaultValue={asset?.avg_buy_price ?? ''}
            placeholder="0,00"
          />
        </div>
      </div>

      {/* Portfolio + Exchange */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="a-portfolio">Portfolio</Label>
          <Input
            id="a-portfolio" name="portfolio_name"
            defaultValue={asset?.portfolio_name ?? ''}
            placeholder="Main, Eltern…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-exchange">Börse / Wallet</Label>
          <Input
            id="a-exchange" name="exchange"
            defaultValue={asset?.exchange ?? ''}
            placeholder="Binance, Ledger…"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="a-notes">Notizen</Label>
        <Input
          id="a-notes" name="notes"
          defaultValue={asset?.notes ?? ''}
          placeholder="Optionale Anmerkungen"
        />
      </div>
    </>
  )
}

// ─── Shared dialog wrapper ────────────────────────────────────────────────────
function AssetDialog({
  mode, asset, trigger,
}: {
  mode: 'create' | 'edit'
  asset?: Asset
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const action = mode === 'create' ? createAsset : updateAsset
  const [state, formAction, isPending] = useActionState<AssetActionState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neues Asset' : 'Asset bearbeiten'}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 pt-2">
          <AssetFields asset={asset} />
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
export function AddAssetDialog() {
  return (
    <AssetDialog
      mode="create"
      trigger={<Button size="sm"><Plus className="size-4" />Asset anlegen</Button>}
    />
  )
}

export function EditAssetDialog({ asset }: { asset: Asset }) {
  return (
    <AssetDialog
      mode="edit" asset={asset}
      trigger={<Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>}
    />
  )
}

export function DeleteAssetButton({ asset }: { asset: Asset }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAsset(asset.id)
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
          <AlertDialogTitle>Asset löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{asset.name}</strong> und alle zugehörigen Bewertungen werden unwiderruflich gelöscht.
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
