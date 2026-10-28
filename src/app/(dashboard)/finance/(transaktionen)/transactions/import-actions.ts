'use server'

import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { parseInput } from '@/lib/api/validate'
import { tagVerschoben, type VorhandeneBuchung } from '@/lib/transaktionen/import'

/** Mehr liefert die Abfrage nie: der Import selbst ist ebenfalls auf 5.000 Zeilen je Anfrage begrenzt. */
const MAX_ZEILEN = 5000
const SEITE = 1000

const eingabe = z.object({
  accountId: z.uuid(),
  von: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type VorhandeneErgebnis =
  | { ok: true; buchungen: VorhandeneBuchung[]; abgeschnitten: boolean }
  | { ok: false; error: string }

/**
 * Vorhandene Buchungen eines Kontos im Zeitraum, für die Duplikatprüfung des CSV-Imports (Datum, Betrag mit
 * Vorzeichen, Text). Liest die Sicht `unified_transactions`, also auch Buchungen des Bank-Syncs. Nur Daten
 * des Haushalts (RLS, kein user_id-Filter), keine IDs und keine Salden in der Antwort.
 */
export async function ladeVorhandeneBuchungen(input: {
  accountId: string
  von: string
  bis: string
}): Promise<VorhandeneErgebnis> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt' }

  const parsed = parseInput(eingabe, input)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const { accountId, von, bis } = parsed.data

  // Fenster um 7 Tage nach beiden Seiten: Buchungstag und Wertstellung können bis zu einigen Tagen auseinanderliegen.
  const fVon = tagVerschoben(von, -7)
  const fBis = tagVerschoben(bis, 7)

  // Seitenweise (PostgREST kappt eine Antwort still bei 1.000 Zeilen — `.limit(5001)` allein hätte bei einer
  // Jahresdatei auf einem aktiven Konto die jüngeren Buchungen aus der Prüfung fallen lassen).
  const zeilen: {
    date: string | null
    booked_date: string | null
    amount: number | null
    signed_amount: number | null
    type: string | null
    description: string | null
    merchant: string | null
  }[] = []
  for (let seite = 0; seite * SEITE < MAX_ZEILEN + 1; seite++) {
    const { data, error } = await supabase
      .from('unified_transactions')
      .select('date, booked_date, amount, signed_amount, type, description, merchant')
      .eq('account_id', accountId)
      .gte('date', fVon)
      .lte('date', fBis)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(seite * SEITE, seite * SEITE + SEITE - 1)
    if (error) return { ok: false, error: error.message }
    if (!data || data.length === 0) break
    zeilen.push(...data)
    if (data.length < SEITE) break
  }

  const buchungen: VorhandeneBuchung[] = []
  for (const z of zeilen.slice(0, MAX_ZEILEN)) {
    if (!z.date || z.amount === null) continue
    const betrag = Number(z.amount)
    const signiert =
      z.signed_amount !== null && Number.isFinite(Number(z.signed_amount))
        ? Number(z.signed_amount)
        : z.type === 'expense'
          ? -Math.abs(betrag)
          : Math.abs(betrag)
    buchungen.push({
      date: z.date,
      bookedDate: z.booked_date,
      amount: signiert,
      description: z.description,
      merchant: z.merchant,
    })
  }
  return { ok: true, buchungen, abgeschnitten: zeilen.length > MAX_ZEILEN }
}
