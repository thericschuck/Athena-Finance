'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DebtSuggestion } from '@/components/finance/debt-suggestion'
import type { TransactionActionState } from '@/app/(dashboard)/finance/(transaktionen)/transactions/actions'
import {
  betragAusEingabe,
  betragMitVorzeichen,
  pruefeBuchung,
  typUndBetrag,
  type BuchungsArt,
} from '@/lib/transaktionen/formular'
import { cn } from '@/lib/utils'
import { CategorySelectOptions, ColorDot, CURRENCIES, currencyForAccount, NO_CATEGORY } from './parts'
import type { Account, Category, Debt } from './parts'

/** Startwerte des Formulars (Anlegen: Standard, Bearbeiten: die gespeicherte Buchung). */
export type BuchungsStart = {
  art: BuchungsArt
  betragText: string
  date: string
  accountId: string
  currency: string
  transferTo: string
  categoryId: string
  merchant: string
  description: string
}

type Gespeichert = {
  id: string
  amount: number
  date: string
  description: string | null
  merchant: string | null
  direction: BuchungsArt
}

const ARTEN: { art: BuchungsArt; label: string; aktiv: string }[] = [
  { art: 'expense', label: 'Ausgabe', aktiv: 'bg-destructive/10 text-destructive border-destructive/40' },
  { art: 'income', label: 'Einnahme', aktiv: 'bg-success/10 text-success border-success/40' },
  { art: 'transfer', label: 'Umbuchung', aktiv: 'bg-primary/10 text-primary border-primary/40' },
]

/** Hohe Felder fürs Handy (>= 40 px), ab md wieder die kompakte Größe. */
const FELD = 'h-10 md:h-9'
const SELECT_FELD = 'w-full data-[size=default]:h-10 text-base md:data-[size=default]:h-9 md:text-sm'

function KontoOption({ a }: { a: Account }) {
  return (
    <SelectItem value={a.id}>
      <span className="flex items-center gap-2">
        <ColorDot color={a.color} />
        {a.name}
      </span>
    </SelectItem>
  )
}

/**
 * Gemeinsames Formular für „Neue Transaktion“ und „Transaktion bearbeiten“.
 *
 * Eingabe: Art (Umschalter) + POSITIVER Betrag; das Vorzeichen baut dieses Formular vor dem Senden in
 * das Feld `amount` ein (Ausgabe negativ), so bleibt die Action-Schnittstelle gleich. Wird das Formular
 * nur beim Öffnen eingehängt (Dialog-Inhalt), beginnen Zustand und Fehlermeldung jedes Mal frisch.
 */
export function BuchungsFormular({
  start,
  accounts,
  categories,
  action,
  buchungId,
  debts = [],
  schuldenCategoryId = null,
  speichernLabel = 'Speichern',
  onClose,
}: {
  start: BuchungsStart
  accounts: Account[]
  categories: Category[]
  action: (prev: TransactionActionState, formData: FormData) => Promise<TransactionActionState>
  /** Nur beim Bearbeiten. */
  buchungId?: string
  debts?: Debt[]
  schuldenCategoryId?: string | null
  speichernLabel?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [art, setArt] = useState<BuchungsArt>(start.art)
  const [betragText, setBetragText] = useState(start.betragText)
  const [date, setDate] = useState(start.date)
  const [accountId, setAccountId] = useState(start.accountId)
  const [currency, setCurrency] = useState(start.currency)
  const [transferTo, setTransferTo] = useState(start.transferTo)
  const [categoryId, setCategoryId] = useState(start.categoryId)
  const [clientFehler, setClientFehler] = useState<string | null>(null)
  // Nach dem Speichern einer (neu) als „Schulden“ kategorisierten Buchung: Vorschlag statt Schließen.
  const [gespeichert, setGespeichert] = useState<Gespeichert | null>(null)

  const [state, formAction, isPending] = useActionState<TransactionActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd)
      if (result && 'success' in result) {
        router.refresh()
        const id = result.id ?? buchungId
        const katId = String(fd.get('category_id') ?? '')
        const neuSchulden = !!schuldenCategoryId && katId === schuldenCategoryId && start.categoryId !== katId
        if (id && neuSchulden) {
          const { type, amount } = typUndBetrag(
            betragAusEingabe(String(fd.get('amount') ?? '')) ?? 0,
            fd.get('is_transfer') === 'true',
          )
          setGespeichert({
            id,
            amount,
            date: String(fd.get('date') ?? ''),
            description: String(fd.get('description') ?? '') || null,
            merchant: String(fd.get('merchant') ?? '') || null,
            direction: type,
          })
        } else {
          onClose()
        }
      }
      return result
    },
    null,
  )

  const signiert = betragMitVorzeichen(betragText, art)
  const fehler = clientFehler ?? (state && 'error' in state ? state.error : null)

  function aendere<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setClientFehler(null)
    }
  }

  // Kontowechsel setzt die Währung des neuen Kontos. Bewusst im Handler statt in einem Effekt: ein
  // Effekt auf `accounts` überschrieb nach jedem Aktualisieren der Seite eine von Hand gewählte Währung.
  function waehleKonto(id: string) {
    setAccountId(id)
    setCurrency(currencyForAccount(id, accounts))
    if (transferTo === id) setTransferTo('')
    setClientFehler(null)
  }

  function absenden(e: React.FormEvent<HTMLFormElement>) {
    const meldung = pruefeBuchung({ betragText, art, date, accountId, transferTo })
    if (meldung) {
      e.preventDefault()
      setClientFehler(meldung)
    }
  }

  if (gespeichert) {
    return (
      <div className="space-y-4 pt-2">
        <p className="text-sm text-muted-foreground">Transaktion gespeichert.</p>
        <DebtSuggestion
          transactionId={gespeichert.id}
          source="manual"
          amount={gespeichert.amount}
          date={gespeichert.date}
          description={gespeichert.description}
          merchant={gespeichert.merchant}
          direction={gespeichert.direction}
          debts={debts}
          onHandled={onClose}
        />
        <div className="flex justify-end pt-2">
          <Button type="button" className="h-10 md:h-8" onClick={onClose}>Schließen</Button>
        </div>
      </div>
    )
  }

  const waehrungen = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]
  const betragFarbe = art === 'expense' ? 'text-destructive' : art === 'income' ? 'text-success' : ''

  return (
    <form action={formAction} onSubmit={absenden} className="space-y-3.5 pt-1" noValidate>
      {buchungId && <input type="hidden" name="id" value={buchungId} />}
      <input type="hidden" name="amount" value={signiert ?? ''} />
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="is_transfer" value={art === 'transfer' ? 'true' : ''} />
      {art === 'transfer' && <input type="hidden" name="transfer_to" value={transferTo} />}

      {/* Art: Ausgabe | Einnahme | Umbuchung */}
      <div role="radiogroup" aria-label="Art der Buchung" className="grid grid-cols-3 gap-1.5">
        {ARTEN.map(({ art: a, label, aktiv }) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={art === a}
            onClick={() => aendere(setArt)(a)}
            className={cn(
              'h-10 rounded-md border px-2 text-sm font-medium transition-colors md:h-9',
              art === a ? aktiv : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Betrag (immer positiv) + Währung */}
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="tx-amount">Betrag *</Label>
          <Input
            id="tx-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={betragText}
            onChange={(e) => aendere(setBetragText)(e.target.value)}
            aria-invalid={fehler?.startsWith('Betrag') || fehler?.startsWith('Der Betrag') ? true : undefined}
            className={cn(FELD, 'font-medium tabular-nums', betragFarbe)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Währung</Label>
          <Select value={currency} onValueChange={aendere(setCurrency)}>
            <SelectTrigger className={SELECT_FELD} aria-label="Währung">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {waehrungen.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Datum + Konto */}
      <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tx-date">Datum *</Label>
          <Input
            id="tx-date"
            type="date"
            value={date}
            onChange={(e) => aendere(setDate)(e.target.value)}
            className={FELD}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{art === 'transfer' ? 'Von Konto *' : 'Konto *'}</Label>
          <Select value={accountId} onValueChange={waehleKonto}>
            <SelectTrigger className={SELECT_FELD} aria-label="Konto">
              <SelectValue placeholder="Konto wählen…" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <KontoOption key={a.id} a={a} />)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {art === 'transfer' && (
        <div className="space-y-1.5">
          <Label>Auf Konto *</Label>
          <Select value={transferTo} onValueChange={aendere(setTransferTo)}>
            <SelectTrigger className={SELECT_FELD} aria-label="Zielkonto">
              <SelectValue placeholder="Zielkonto wählen…" />
            </SelectTrigger>
            <SelectContent>
              {accounts.filter((a) => a.id !== accountId).map((a) => <KontoOption key={a.id} a={a} />)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empfänger + Beschreibung */}
      <div className="space-y-1.5">
        <Label htmlFor="tx-merchant">Empfänger</Label>
        <Input
          id="tx-merchant"
          name="merchant"
          defaultValue={start.merchant}
          placeholder="z. B. Rewe, Amazon"
          maxLength={200}
          className={FELD}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tx-description">Beschreibung</Label>
        <Input
          id="tx-description"
          name="description"
          defaultValue={start.description}
          placeholder="z. B. Monatsbeitrag"
          maxLength={500}
          className={FELD}
        />
      </div>

      {/* Kategorie */}
      <div className="space-y-1.5">
        <Label>Kategorie</Label>
        <Select
          value={categoryId || NO_CATEGORY}
          onValueChange={(v) => aendere(setCategoryId)(v === NO_CATEGORY ? '' : v)}
        >
          <SelectTrigger className={SELECT_FELD} aria-label="Kategorie">
            <SelectValue placeholder="Kategorie wählen…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>Ohne Kategorie</SelectItem>
            <CategorySelectOptions categories={categories} />
          </SelectContent>
        </Select>
      </div>

      {fehler && <p className="text-sm text-destructive" role="alert">{fehler}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" className="h-10 md:h-8" onClick={onClose} disabled={isPending}>
          Abbrechen
        </Button>
        <Button type="submit" className="h-10 min-w-28 md:h-8" disabled={isPending}>
          {isPending ? <><Loader2 className="size-4 animate-spin" />Speichert…</> : speichernLabel}
        </Button>
      </div>
    </form>
  )
}
