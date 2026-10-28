'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { parseInput, issueMessage } from '@/lib/api/validate'
import { idField, MAX_AMOUNT } from '@/lib/api/schemas'

/**
 * Korrigieren und Löschen einzelner Net-Worth-Snapshots (Datenqualität im Verlauf-Tab).
 *
 * `net_worth` und `total_assets` sind in der DB GENERIERTE Spalten
 * (net_worth = Summe aller total_* Vermögenstöpfe − total_debts, total_assets = Summe ohne
 * Schulden). Sie lassen sich nicht schreiben und müssen es auch nicht: es werden nur die
 * Töpfe geändert, beide Summen folgen von selbst — identisch zur Berechnung in
 * fn_take_snapshot.
 *
 * Korrigierte Zeilen bekommen `source = 'repair'`; fn_take_snapshot überschreibt solche
 * Zeilen beim nächsten Lauf nicht mehr („von Hand reparierte Altlasten nicht wieder kaputt
 * rechnen"). Ohne das würde der Cron die Korrektur wieder zurückdrehen. Die RLS-Policy
 * `own_data` (FOR ALL) erlaubt UPDATE/DELETE für eigene Zeilen; `user_id` wird trotzdem
 * explizit mitgefiltert.
 */

/**
 * OWNER-ONLY (Haushalt Phase 3): Reparieren/Loeschen betrifft nur die eigenen gespeicherten net_worth_snapshots (`user_id`-Filter
 * bleibt). Im Haushalt berechnete Zeilen (`net_worth_series`, ID `fn:<datum>`) sind keine Snapshots und werden nicht angeboten.
 */
export type SnapshotActionResult = { error: string } | { success: true }

const betrag = z.number({ error: 'Betrag ist ungültig' }).finite('Betrag ist ungültig')
  .min(-MAX_AMOUNT, 'Betrag ist ungültig').max(MAX_AMOUNT, 'Betrag ist ungültig')

const felderSchema = z.strictObject({
  total_checking: betrag,
  total_investment: betrag,
  total_savings: betrag,
  total_cash: betrag,
  total_depot: betrag,
  total_crypto: betrag,
  total_bausparer: betrag,
  total_business: betrag,
  // Schulden werden positiv gespeichert (Betrag der Schulden).
  total_debts: betrag.min(0, 'Schulden werden als positiver Betrag erfasst'),
}).partial().refine(f => Object.keys(f).length > 0, 'Keine Änderung angegeben')

export type SnapshotFelder = z.infer<typeof felderSchema>

export async function korrigiereSnapshot(id: string, felder: SnapshotFelder): Promise<SnapshotActionResult> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const idP = parseInput(idField(), id)
  if (!idP.ok) return { error: issueMessage(idP) }
  const fP = parseInput(felderSchema, felder)
  if (!fP.ok) return { error: issueMessage(fP) }

  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .update({ ...fP.data, source: 'repair' })
    .eq('id', idP.data)
    .eq('user_id', user.id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Snapshot nicht gefunden' }

  revalidatePath('/analyse/verlauf')
  return { success: true }
}

export async function loescheSnapshot(id: string): Promise<SnapshotActionResult> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const idP = parseInput(idField(), id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .delete()
    .eq('id', idP.data)
    .eq('user_id', user.id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Snapshot nicht gefunden' }

  revalidatePath('/analyse/verlauf')
  return { success: true }
}
