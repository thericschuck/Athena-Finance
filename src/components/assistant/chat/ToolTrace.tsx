'use client'

import { isToolUIPart, getToolName, type UIMessage } from 'ai'
import { Globe, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Werkzeugnamen, hinter denen im UI ein sprechendes Label statt des rohen
    Bezeichners stehen soll. Alles, was hier fehlt, wird als Code angezeigt —
    besser ein unbekannter Name als ein falsch geratenes Label. */
const TOOL_LABELS: Record<string, string> = {
  getAccounts: 'Konten gelesen',
  getTransactions: 'Buchungen gelesen',
  getSpendingSummary: 'Ausgaben zusammengefasst',
  getContracts: 'Verträge gelesen',
  getDebts: 'Schulden gelesen',
  getGoals: 'Sparziele gelesen',
  getBudget: 'Fixkosten gelesen',
  getDepotHoldings: 'Depot gelesen',
  getCryptoPortfolio: 'Krypto-Portfolio gelesen',
  getNetWorthTrend: 'Vermögensverlauf gelesen',
  getCategories: 'Kategorien gelesen',
  getCategoryUsage: 'Kategorie-Nutzung geprüft',
  checkDataQuality: 'Datenqualität geprüft',
  getInsights: 'Hinweise gelesen',
  getObligationCalendar: 'Verpflichtungen geprüft',
  getSavingsPlans: 'Sparpläne gelesen',
  showChart: 'Chart erstellt',
  getUserSettings: 'Einstellungen gelesen',
  getAccountBalanceHistory: 'Konto-Verlauf gelesen',
  getTaxPosition: 'Steuerposition gerechnet',
  getEuerPosition: 'Anlage EÜR gerechnet',
  findRecurringPayments: 'Wiederkehrendes gesucht',
  getForecast: 'Prognose gerechnet',
  getValuables: 'Inventar gelesen',
  getValuableGaps: 'Inventar-Lücken geprüft',
  getValuableImages: 'Inventar-Fotos gelesen',
  remember: 'Fakt gespeichert',
  searchMemory: 'Speicher durchsucht',
  forget: 'Fakt gelöscht',
  searchKnowledge: 'Wissensbasis durchsucht',
  saveKnowledge: 'Wissenseintrag angelegt',
  web_search: 'Web durchsucht',
  web_fetch: 'Webseite gelesen',
}

const WEB_TOOLS = new Set(['web_search', 'web_fetch'])

/** Aufklappbare Werkzeug-Spur: was Athena in diesem Zug getan hat. */
export function ToolTrace({ parts }: { parts: UIMessage['parts'] }) {
  const toolParts = parts.filter(isToolUIPart)
  if (toolParts.length === 0) return null

  const usedWeb = toolParts.some((p) => WEB_TOOLS.has(getToolName(p)))

  return (
    <details className="group/trace mt-1 text-xs text-muted-foreground">
      {/* min-h-9: ein Tap-Ziel, das man am Handy trifft — das frühere
          einzeilige Summary war kaum höher als der Text. */}
      <summary className="-mx-1 flex min-h-9 cursor-pointer select-none items-center gap-1.5 rounded-md px-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <Wrench className="size-3" />
        {toolParts.length} Schritt{toolParts.length === 1 ? '' : 'e'}
        {usedWeb && (
          <span className="flex items-center gap-1 text-primary">
            <Globe className="size-3" /> Web
          </span>
        )}
      </summary>
      <ol className="mb-1 space-y-1.5 border-l border-border pl-3">
        {toolParts.map((part) => {
          const name = getToolName(part)
          return (
            <li key={part.toolCallId} className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  part.state === 'output-available' && 'bg-success',
                  part.state === 'output-error' && 'bg-destructive',
                  (part.state === 'input-streaming' || part.state === 'input-available') &&
                    'animate-pulse bg-warning',
                )}
              />
              {TOOL_LABELS[name] ? (
                <span>{TOOL_LABELS[name]}</span>
              ) : (
                <code className="min-w-0 break-all font-mono">{name}</code>
              )}
              {part.state === 'output-error' && <span className="text-destructive">Fehler</span>}
            </li>
          )
        })}
      </ol>
    </details>
  )
}
