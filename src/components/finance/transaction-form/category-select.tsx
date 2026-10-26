'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateTransactionCategory } from '@/app/(dashboard)/finance/(transaktionen)/transactions/actions'
import { DebtSuggestion } from '@/components/finance/debt-suggestion'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import { cn } from '@/lib/utils'
import { categoryLabel, CategorySelectOptions, NO_CATEGORY } from './parts'
import type { Category, Debt } from './parts'

/** Marke mit Hover-Karte (Portal, wird von scrollenden Tabellen nicht abgeschnitten) statt Browser-`title`. */
function Marke({
  titel, text, className, children,
}: { titel: string; text: string; className: string; children: React.ReactNode }) {
  return (
    <AnalyseKennzahlInfo titel={titel} text={text} className="inline-flex shrink-0">
      <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', className)}>
        {children}
      </span>
    </AnalyseKennzahlInfo>
  )
}

// Inline, optimistic category picker for the transactions table — changing a category used to
// mean opening the full Edit dialog, resubmitting every field, and waiting for a full page
// refresh just to update one value. This updates instantly and only talks to the server in the
// background (matching the Banking tab's inline category Select), with a rollback + visible error if
// the background save fails. `source` picks manual `transactions` vs. bank-synced
// `bank_transactions` — see `updateTransactionCategory`.
//
// `compact`: Variante für Kartenzeilen am Handy -- nutzt die volle Breite der Karte, Tap-Ziel 40 px,
// lange Namen werden abgeschnitten. Ohne `compact` bleibt die schmale Tabellen-Darstellung.
export function TransactionCategorySelect({
  tx,
  categories,
  debts = [],
  schuldenCategoryId = null,
  compact = false,
}: {
  tx: {
    id: string
    category_id: string | null
    source: 'manual' | 'bank_sync'
    amount?: number
    date?: string
    description?: string | null
    merchant?: string | null
    type?: string
    /** Herkunft der Kategorie (auto / ai / manual) und Vorschlag der KI, nur bei Bankbuchungen. */
    category_source?: string | null
    ai_category_id?: string | null
  }
  categories: Category[]
  debts?: Debt[]
  schuldenCategoryId?: string | null
  compact?: boolean
}) {
  const [categoryId, setCategoryId] = useState(tx.category_id ?? NO_CATEGORY)
  // Ändert sich die Kategorie von aussen (Sammelaktion, Aktualisierung der Seite), zählt der neue Wert --
  // sonst bliebe die Zeile bei der alten Anzeige stehen (State wird nur beim ersten Rendern gesetzt).
  const [propKategorie, setPropKategorie] = useState(tx.category_id)
  if (propKategorie !== tx.category_id) {
    setPropKategorie(tx.category_id)
    setCategoryId(tx.category_id ?? NO_CATEGORY)
  }
  const [, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  // Nur die jüngste Änderung darf zurückrollen: schlägt eine ältere erst nach einer neueren fehl,
  // würde sie sonst deren (gespeicherten) Wert überschreiben.
  const zaehler = useRef(0)
  // Nur nach einer aktiven Auswahl in DIESER Sitzung zeigen -- sonst wuerde jede bereits vor
  // dem Laden "Schulden"-kategorisierte Buchung dauerhaft einen Vorschlag anzeigen, und genau
  // dieses Nachtraeglich-durchforsten der Bank-Buchungen war bewusst nicht der Umfang.
  const [justChanged, setJustChanged] = useState(false)

  const current = categories.find((c) => c.id === categoryId)

  function handleChange(next: string) {
    const previous = categoryId
    const nr = ++zaehler.current
    setCategoryId(next)
    setFehler(null)
    setJustChanged(next !== previous && next === schuldenCategoryId)
    startTransition(async () => {
      let meldung: string | null = null
      try {
        const result = await updateTransactionCategory(tx.id, next === NO_CATEGORY ? null : next, tx.source)
        meldung = result.error ?? null
      } catch {
        meldung = 'Netzwerkfehler -- bitte erneut versuchen'
      }
      if (meldung && nr === zaehler.current) {
        setCategoryId(previous)
        setJustChanged(false)
        setFehler(meldung)
        toast.error(meldung)
      }
    })
  }

  // Herkunft nur zeigen, solange sie stimmt: nach deiner Änderung in dieser Sitzung ist es deine Entscheidung.
  const unveraendert = categoryId === (tx.category_id ?? NO_CATEGORY)
  const herkunft = unveraendert && tx.category_id
    ? (tx.category_source === 'ai' ? 'ai' : tx.category_source === 'auto' ? 'auto' : null)
    : null
  // Offene Buchung mit Vorschlag der KI: ein Klick übernimmt ihn (zählt dann als deine Entscheidung).
  const kiVorschlag = categoryId === NO_CATEGORY && tx.ai_category_id
    ? categories.find((c) => c.id === tx.ai_category_id) ?? null
    : null

  // Die gewählte Farbe darf als Stil bleiben (Nutzerdaten); ohne Farbe gilt der Theme-Ton.
  const farbe = current?.color
  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-1.5', compact && 'w-full min-w-0')}>
        <Select value={categoryId} onValueChange={handleChange}>
          <SelectTrigger
            size={compact ? 'default' : 'sm'}
            aria-label="Kategorie ändern"
            aria-invalid={fehler ? true : undefined}
            className={cn(
              'rounded-full border-none px-2.5 shadow-none',
              compact
                ? 'min-w-0 flex-[1_1_9rem] data-[size=default]:h-10 text-sm'
                : 'h-7 max-w-[160px] text-xs',
            )}
            style={farbe ? { backgroundColor: `${farbe}1a`, color: farbe } : undefined}
          >
            <SelectValue placeholder="Kategorisieren…">
              <span className="truncate">{current ? categoryLabel(current) : 'Ohne Kategorie'}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>Ohne Kategorie</SelectItem>
            <CategorySelectOptions categories={categories} />
          </SelectContent>
        </Select>
        {herkunft === 'ai' && (
          <Marke
            titel="Von der KI zugeordnet"
            text="Stimmt es nicht, ändere die Kategorie: daraus lernt das System."
            className="bg-primary/10 text-primary"
          >
            KI
          </Marke>
        )}
        {herkunft === 'auto' && (
          <Marke
            titel="Automatisch zugeordnet"
            text="Per Regel oder gelernt aus deinen früheren Entscheidungen."
            className="bg-muted text-muted-foreground"
          >
            Regel
          </Marke>
        )}
        {kiVorschlag && (
          <button
            type="button"
            onClick={() => handleChange(kiVorschlag.id)}
            aria-label={`Vorschlag der KI übernehmen: ${categoryLabel(kiVorschlag)}`}
            className={cn(
              'max-w-full truncate rounded-full border border-dashed border-primary/50 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10',
              compact && 'min-h-10 px-3 text-xs',
            )}
          >
            KI: {categoryLabel(kiVorschlag)} ✓
          </button>
        )}
      </div>
      {fehler && <p className="mt-1 text-xs text-destructive" role="alert">Nicht gespeichert: {fehler}</p>}
      {justChanged && schuldenCategoryId && categoryId === schuldenCategoryId && (
        <div className="mt-1.5 max-w-xs">
          <DebtSuggestion
            transactionId={tx.id}
            source={tx.source}
            amount={Math.abs(tx.amount ?? 0)}
            date={tx.date ?? ''}
            description={tx.description ?? null}
            merchant={tx.merchant ?? null}
            direction={tx.type === 'income' ? 'income' : 'expense'}
            debts={debts}
            onHandled={() => setJustChanged(false)}
          />
        </div>
      )}
    </>
  )
}
