'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
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
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createAsset, updateAsset, deleteAsset, type AssetActionState,
} from '@/app/(dashboard)/crypto/actions'
import { getCoinInfo, type CoinInfoResult } from '@/lib/crypto/coingecko'
import { CoinCombobox } from '@/components/crypto/coin-combobox'
import type { CoinEntry } from '@/lib/crypto/coin-registry'
import { Database } from '@/types/database'

type Asset = Database['public']['Tables']['assets']['Row']

// ─── Shared form fields ───────────────────────────────────────────────────────
function AssetFields({ asset }: { asset?: Asset }) {
  const [name, setName]             = useState(asset?.name ?? '')
  // coingecko_id stored in assets.symbol column (null for fiat)
  const [coinId, setCoinId]         = useState<string>(asset?.symbol ?? '')
  const [ticker, setTicker]         = useState<string>('')
  const [coinType, setCoinType]     = useState<string>('crypto')
  const [coinWarn, setCoinWarn]     = useState<string | null>(null)
  const [lookingUp, setLookingUp]   = useState(false)

  function handleCoinSelect(coin: CoinEntry) {
    setCoinId(coin.coingecko_id ?? coin.symbol.toLowerCase())
    setTicker(coin.symbol)
    setCoinType(coin.type)
    if (!name || name === '') setName(coin.name)
    setCoinWarn(null)
  }

  // For coins not in registry: manual CoinGecko ID input + lookup
  async function handleCustomIdBlur(e: React.FocusEvent<HTMLInputElement>) {
    const id = e.target.value.trim().toLowerCase()
    if (!id) return
    setLookingUp(true)
    setCoinWarn(null)
    const result = await getCoinInfo(id)
    setLookingUp(false)
    if (!result) {
      setCoinWarn('ID nicht gefunden – auf coingecko.com prüfen')
    } else if ('error' in result) {
      setCoinWarn(result.error)
    } else {
      if (!name) setName(result.name)
      setTicker(result.symbol)
    }
  }

  const isCustom = coinId && !ticker  // manually typed, not from registry

  return (
    <>
      {asset && <input type="hidden" name="id" value={asset.id} />}
      <input type="hidden" name="coingecko_id" value={coinId} />
      <input type="hidden" name="coin_type" value={coinType} />

      {/* Coin selector */}
      <div className="space-y-1.5">
        <Label>Coin / Währung *</Label>
        <CoinCombobox
          defaultValue={asset?.symbol ?? null}
          onChange={handleCoinSelect}
        />
        <p className="text-xs text-muted-foreground">
          Nicht gefunden?{' '}
          <button
            type="button"
            className="underline text-foreground"
            onClick={() => { setCoinId(''); setTicker('') }}
          >
            CoinGecko-ID manuell eingeben
          </button>
        </p>
      </div>

      {/* Manual CoinGecko ID fallback (shown when nothing selected from registry) */}
      {!ticker && (
        <div className="space-y-1.5">
          <Label htmlFor="a-custom-id">CoinGecko-ID</Label>
          <div className="relative">
            <Input
              id="a-custom-id"
              defaultValue={coinId}
              placeholder="convex-finance"
              onBlur={handleCustomIdBlur}
              onChange={e => setCoinId(e.target.value.trim().toLowerCase())}
            />
            {lookingUp && (
              <Loader2 className="absolute right-2 top-2.5 size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {coinWarn && <p className="text-xs text-destructive">{coinWarn}</p>}
        </div>
      )}

      {/* Name + Symbol (Symbol auto-filled; Name editable) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="a-name">Name *</Label>
          <Input
            id="a-name" name="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Bitcoin"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-symbol">Symbol *</Label>
          <Input
            id="a-symbol" name="symbol"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="BTC"
            required
          />
        </div>
      </div>

      {/* Menge + Ø Kaufpreis */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="a-qty">Menge *</Label>
          <Input
            id="a-qty" name="quantity" type="number"
            step="0.00000001" min="0"
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
            placeholder="Main, Eltern, ..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-exchange">Börse / Wallet</Label>
          <Input
            id="a-exchange" name="exchange"
            defaultValue={asset?.exchange ?? ''}
            placeholder="Bybit, Kraken, Ledger, ..."
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="a-notes">Notizen</Label>
        <textarea
          id="a-notes" name="notes"
          defaultValue={asset?.notes ?? ''}
          placeholder="Optionale Anmerkungen"
          rows={2}
          className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </>
  )
}

// ─── Shared dialog wrapper ────────────────────────────────────────────────────
function AssetDialog({
  mode, asset, trigger, open: controlledOpen, onOpenChange, onSuccess,
}: {
  mode: 'create' | 'edit'
  asset?: Asset
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  function handleOpenChange(v: boolean) {
    if (!isControlled) setInternalOpen(v)
    onOpenChange?.(v)
  }

  const action = mode === 'create' ? createAsset : updateAsset
  const [state, formAction, isPending] = useActionState<AssetActionState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) {
      handleOpenChange(false)
      onSuccess?.()
      router.refresh()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const content = (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'Neues Asset' : 'Asset bearbeiten'}</DialogTitle>
      </DialogHeader>
      <form action={formAction} className="space-y-4 pt-2">
        <AssetFields asset={asset} />
        {state && 'error' in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending
              ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Wird gespeichert…</>
              : mode === 'create' ? 'Anlegen' : 'Speichern'}
          </Button>
        </div>
      </form>
    </DialogContent>
  )

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {content}
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {content}
    </Dialog>
  )
}

// ─── Public exports ───────────────────────────────────────────────────────────

/** Controlled dialog: pass open/onOpenChange/onSuccess from parent */
export function AssetFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  return (
    <AssetDialog
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  )
}

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
