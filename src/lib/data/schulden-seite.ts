import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { DebtRow } from '@/lib/data/finance-planning'

type DB = SupabaseClient<Database>

export type SchuldZahlung = {
  id: string
  debt_id: string
  amount: number
  principal: number | null
  interest: number | null
  payment_date: string
  notes: string | null
  /** Zahlung stammt aus einer Buchung (manuell oder Bank). */
  verknuepft: boolean
}

export type SchuldMitZahlungen = DebtRow & {
  /** Anlagedatum YYYY-MM-DD (UTC-Teil des Zeitstempels reicht als Startpunkt des Verlaufs). */
  angelegt: string
  zahlungen: SchuldZahlung[]
}

/**
 * Alle Schulden des Nutzers (aktive und abgeschlossene) samt ihren Zahlungen, jüngste Zahlung zuerst.
 * Die Seite filtert selbst; so stehen Kennzahlen wie „bereits getilgt" immer auf der ganzen Datenbasis.
 */
export async function ladeSchuldenSeite(supabase: DB, userId: string): Promise<SchuldMitZahlungen[]> {
  const { data: debts } = await supabase
    .from('debts')
    .select('id, name, type, creditor, currency, original_amount, outstanding, interest_rate, monthly_payment, due_date, is_active, notes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!debts || debts.length === 0) return []

  const { data: payments } = await supabase
    .from('debt_payments')
    .select('id, debt_id, amount, principal, interest, payment_date, notes, transaction_id, bank_transaction_id')
    .in('debt_id', debts.map(d => d.id))
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })

  const jeSchuld = new Map<string, SchuldZahlung[]>()
  for (const p of payments ?? []) {
    const liste = jeSchuld.get(p.debt_id) ?? []
    liste.push({
      id: p.id,
      debt_id: p.debt_id,
      amount: Number(p.amount),
      principal: p.principal == null ? null : Number(p.principal),
      interest: p.interest == null ? null : Number(p.interest),
      payment_date: p.payment_date,
      notes: p.notes,
      verknuepft: p.transaction_id != null || p.bank_transaction_id != null,
    })
    jeSchuld.set(p.debt_id, liste)
  }

  return debts.map(d => ({
    id: d.id,
    name: d.name,
    type: d.type,
    creditor: d.creditor,
    currency: d.currency,
    original_amount: Number(d.original_amount),
    outstanding: Number(d.outstanding),
    interest_rate: d.interest_rate == null ? null : Number(d.interest_rate),
    monthly_payment: d.monthly_payment == null ? null : Number(d.monthly_payment),
    due_date: d.due_date,
    is_active: d.is_active,
    notes: d.notes,
    angelegt: d.created_at.slice(0, 10),
    zahlungen: jeSchuld.get(d.id) ?? [],
  }))
}
