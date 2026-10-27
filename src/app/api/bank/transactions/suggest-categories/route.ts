import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { suggestCategory, buildLearnedCategoryMap } from '@/lib/fints/categorize'
import type { FinanceCategory } from '@/types/bank'
import { ibanSet, istUmbuchungIban } from '@/lib/haushalt/umbuchung'

/**
 * GET /api/bank/transactions/suggest-categories
 *
 * Read-only: runs the same keyword-based suggestCategory() used at sync time against every
 * stored transaction and returns only the ones where the suggestion differs from what's
 * currently stored (covers both uncategorized and possibly-mis-categorized rows). Nothing
 * is written here — the caller applies accepted suggestions via the existing per-row
 * PATCH /api/bank/transactions/:id.
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const ctx = await resolveScope(supabase, user)
  // Kategorienbaum pro Haushalt (RLS), Buchungen der Konten im Scope.
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, type, color, icon, parent_id')

  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 })

  const categoriesById = new Map((categories ?? []).map(c => [c.id, c as FinanceCategory]))

  const { data, error } = await supabase
    .from('bank_transactions')
    .select('id, description, counterpart_name, counterpart_iban, category_id, category_source, ai_category_id, amount, value_date')
    .in('account_iban', ctx.ibans)
    .order('value_date', { ascending: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Umbuchungen zwischen Erics eigenen Konten (Gegen-IBAN = eigene bank_iban) brauchen keinen
  // Vorschlag — sie sind über die IBAN eindeutig als Umbuchung erkannt (siehe
  // unified_transactions.flow_kind) und würden hier sonst z.B. als "Freizeit" vorgeschlagen,
  // nur weil der Empfängername zufällig auf eine Schlüsselwort-Regel passt.
  const ownIbans = ibanSet(ctx.ibans)

  // Learn "this counterparty is always category X" from what's already categorized, so a
  // transaction the user manually fixed (or an earlier suggestion they accepted) improves
  // every future suggestion for the same counterparty — not just the keyword rules.
  const learnedMap = buildLearnedCategoryMap(
    // Nur Entscheidungen des Nutzers lernen, keine automatisch gesetzten Kategorien.
    (data ?? []).filter((tx: { category_id: string | null; category_source: string | null }) => tx.category_id && tx.category_source !== 'auto' && tx.category_source !== 'ai'),
  )

  type Zeile = { id: string; description: string | null; counterpart_name: string | null; category_id: string | null; ai_category_id: string | null; amount: number; value_date: string }
  const suggestions = (data ?? [] as Zeile[])
    .filter((tx: { counterpart_iban: string | null }) => !istUmbuchungIban(tx.counterpart_iban, ownIbans))
    .map((tx: Zeile) => {
      const suggested = suggestCategory(tx.counterpart_name, tx.description, categories ?? [], learnedMap, tx.amount)
      // Regeln und Gelerntes zuerst; wo sie schweigen, gilt bei offenen Buchungen der (unsichere) Vorschlag der KI.
      const ki = !suggested && !tx.category_id && tx.ai_category_id ? categoriesById.get(tx.ai_category_id) ?? null : null
      const vorschlag = suggested ?? ki
      return vorschlag && vorschlag.id !== tx.category_id
        ? {
            id: tx.id,
            description: tx.description,
            counterpart_name: tx.counterpart_name,
            amount: tx.amount,
            value_date: tx.value_date,
            current_category: tx.category_id ? categoriesById.get(tx.category_id) ?? null : null,
            suggested_category: vorschlag,
            ...(ki ? { ki: true } : {}),
          }
        : null
    })
    .filter(Boolean)

  return NextResponse.json({ suggestions })
}
