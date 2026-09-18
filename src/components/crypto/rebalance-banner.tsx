'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PendingActionCard } from '@/components/assistant/PendingActionCard'
import { proposeRebalanceExecution } from '@/app/(dashboard)/crypto/actions'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

type Proposal = Extract<Awaited<ReturnType<typeof proposeRebalanceExecution>>, { status: 'pending_confirmation' }>

/**
 * Kompakter Hinweis auf der Portfolio-Übersicht (`/crypto`), wenn ein Ziel-Portfolio existiert
 * und der Bestand davon abweicht — derselbe Vorschlags-/Bestätigungsweg wie der Button auf der
 * Rebalancing-Seite selbst (`rebalancing-calculator.tsx`) und wie Athena im Chat, über
 * `proposeRebalanceExecution()`. Nur die dritte Tür zu demselben Raum, keine eigene Logik.
 */
export function RebalanceBanner({ volumeEur }: { volumeEur: number }) {
  const { locale } = useSettings()
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [isProposing, setIsProposing] = useState(false)

  async function handleClick() {
    setIsProposing(true)
    setError(null)
    try {
      const res = await proposeRebalanceExecution()
      if ('error' in res) setError(res.error)
      else setProposal(res)
    } finally {
      setIsProposing(false)
    }
  }

  if (proposal) {
    return (
      <PendingActionCard
        actionId={proposal.actionId}
        action="executeRebalancing"
        label={proposal.label}
        summary={proposal.summary}
        details={proposal.details}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
      <p className="text-sm text-foreground">
        Portfolio {fmtCurrency(volumeEur, 'EUR', locale)} vom Ziel entfernt.
      </p>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleClick} disabled={isProposing}>
          <Zap className="size-3.5" />
          {isProposing ? 'Prüft Kraken-Preise & Pairs…' : 'Automatisch rebalancen'}
        </Button>
        <Link href="/crypto/rebalancing" className="text-xs text-muted-foreground underline underline-offset-2">
          Details
        </Link>
      </div>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  )
}
