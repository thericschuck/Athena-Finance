'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface ContractEntry {
  id:        string
  name:      string
  monthly:   number
  accountId: string | null
}

interface Props {
  totalMonthly:      number
  contracts:         ContractEntry[]
  accounts:          { id: string; name: string }[]
}

const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

export function FixedCostsWidget({ totalMonthly, contracts, accounts }: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string>('__all__')

  const filtered = selectedAccount === '__all__'
    ? contracts
    : contracts.filter(c => c.accountId === selectedAccount)

  const filteredTotal = filtered.reduce((s, c) => s + c.monthly, 0)

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Fixkosten / Monat</p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5">
            {fmtEur(selectedAccount === '__all__' ? totalMonthly : filteredTotal)}
          </p>
        </div>

        {accounts.length > 0 && (
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Konten</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Contract list */}
      {filtered.length > 0 ? (
        <ul className="space-y-1.5">
          {filtered.slice(0, 6).map(c => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <Link
                href={`/finance/contracts/${c.id}`}
                className="text-foreground hover:underline underline-offset-2 truncate"
              >
                {c.name}
              </Link>
              <span className="tabular-nums text-muted-foreground shrink-0">{fmtEur(c.monthly)}/Mo.</span>
            </li>
          ))}
          {filtered.length > 6 && (
            <li className="text-xs text-muted-foreground pt-1">
              + {filtered.length - 6} weitere ·{' '}
              <Link href="/finance/contracts" className="hover:underline">Alle anzeigen</Link>
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {selectedAccount === '__all__'
            ? 'Keine aktiven Verträge'
            : 'Keine Verträge für dieses Konto'}
        </p>
      )}
    </div>
  )
}
