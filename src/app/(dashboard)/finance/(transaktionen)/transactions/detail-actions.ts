'use server'

import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { parseInput, issueMessage } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'
import { resolveScope } from '@/lib/haushalt/resolve'
import { HERAB_SPALTEN, effektiveBuchung, herabstufungsIds } from '@/lib/haushalt/umbuchung'
import { letzteAenderung, type ZuletztGeaendertInfo } from '@/lib/data/aenderungen'

/**
 * Lazy-Detail einer Buchung für das Seitenfenster der Transaktionen-Liste. Die Liste trägt nur die
 * Spalten, die sie anzeigt; Verwendungszweck im Volltext, Wertstellung, Gegenkonto und KI-Vorschlag
 * werden erst beim Öffnen geholt. Nur lesend; Haushaltsdaten: die RLS begrenzt auf den Haushalt (kein user_id-Filter).
 */

export interface BuchungsDetailDaten {
  id: string
  source: 'manual' | 'bank_sync'
  /** YYYY-MM-DD */
  date: string
  bookedDate: string | null
  valueDate: string | null
  type: string
  flowKind: string
  amount: number
  signedAmount: number
  currency: string
  merchant: string | null
  /** Voller Verwendungszweck (Rohtext der Bank, sonst die bereinigte Beschreibung). */
  beschreibung: string | null
  accountName: string | null
  categoryName: string | null
  rootCategoryName: string | null
  categoryPath: string | null
  /** auto | ai | manual (nur Bankbuchungen). */
  categorySource: string | null
  aiCategoryName: string | null
  aiAbweichend: boolean
  taxRole: string | null
  counterpartName: string | null
  counterpartIban: string | null
  bankReference: string | null
  /** Letzte Änderung; nur bei Haushalt mit Partner, sonst null. */
  zuletzt: ZuletztGeaendertInfo | null
}

const args = z.object({ id: uuid, source: z.enum(['manual', 'bank_sync']) })

interface ViewZeile {
  id: string
  date: string
  booked_date: string | null
  type: string
  flow_kind: string
  amount: number
  signed_amount: number
  currency: string
  merchant: string | null
  description: string | null
  description_raw: string | null
  account_name: string | null
  category_id: string | null
  category_name: string | null
  root_category_name: string | null
  category_path: string | null
  tax_role_effective: string | null
  category_source: string | null
  ai_category_id: string | null
  /** Nur im Haushalt geladen (Herabstufung). */
  account_id?: string | null
  counterpart_account_id?: string | null
  flow_kind_extern?: string | null
}

interface BankZeile {
  counterpart_name: string | null
  counterpart_iban: string | null
  bank_reference: string | null
  entry_date: string | null
  value_date: string | null
  category_source: string | null
}

export async function ladeBuchungsDetail(
  id: string,
  source: 'manual' | 'bank_sync',
): Promise<{ error: string } | { daten: BuchungsDetailDaten }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(args, { id, source })
  if (!p.ok) return { error: issueMessage(p) }

  const ctx = await resolveScope(supabase, user)
  // Haushalt: Art/Typ wie in der Liste (Umbuchung ohne Gegenkonto im Scope = Einnahme/Ausgabe), lib/haushalt/umbuchung.ts.
  const herab = herabstufungsIds(ctx)
  const spalten =
    'id, date, booked_date, type, flow_kind, amount, signed_amount, currency, merchant, description, description_raw, account_name, category_id, category_name, root_category_name, category_path, tax_role_effective, category_source, ai_category_id'
  const { data, error } = await supabase
    .from('unified_transactions')
    .select(herab ? `${spalten}, account_id, ${HERAB_SPALTEN}` : spalten)
    .eq('id', p.data.id)
    .eq('source', p.data.source)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Buchung nicht gefunden' }
  const roh = data as unknown as ViewZeile
  const z = herab ? effektiveBuchung(roh, herab) : roh

  let bank: BankZeile | null = null
  if (p.data.source === 'bank_sync') {
    const res = await supabase
      .from('bank_transactions')
      .select('counterpart_name, counterpart_iban, bank_reference, entry_date, value_date, category_source')
      .eq('id', p.data.id)
      .maybeSingle()
    bank = (res.data as unknown as BankZeile | null) ?? null
  }

  const zuletzt = await letzteAenderung(
    supabase,
    ctx,
    p.data.source === 'bank_sync' ? 'bank_transactions' : 'transactions',
    p.data.id,
  )

  const aiAbweichend = !!z.ai_category_id && z.ai_category_id !== z.category_id
  let aiCategoryName: string | null = null
  if (z.ai_category_id) {
    const { data: kat } = await supabase
      .from('categories')
      .select('name')
      .eq('id', z.ai_category_id)
      .maybeSingle()
    aiCategoryName = kat?.name ?? null
  }

  return {
    daten: {
      id: z.id,
      source: p.data.source,
      date: z.date,
      bookedDate: z.booked_date ?? bank?.entry_date ?? null,
      valueDate: bank?.value_date ?? null,
      type: z.type,
      flowKind: z.flow_kind,
      amount: Number(z.amount),
      signedAmount: Number(z.signed_amount),
      currency: z.currency,
      merchant: z.merchant,
      beschreibung: z.description_raw || z.description,
      accountName: z.account_name,
      categoryName: z.category_name,
      rootCategoryName: z.root_category_name,
      categoryPath: z.category_path,
      categorySource: bank?.category_source ?? z.category_source,
      aiCategoryName,
      aiAbweichend,
      taxRole: z.tax_role_effective,
      counterpartName: bank?.counterpart_name ?? null,
      counterpartIban: bank?.counterpart_iban ?? null,
      bankReference: bank?.bank_reference ?? null,
      zuletzt,
    },
  }
}
