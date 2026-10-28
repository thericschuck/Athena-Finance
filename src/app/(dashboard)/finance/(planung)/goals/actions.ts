'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, optText, optDate, optEnum, optMoneyField, moneyField, MAX_AMOUNT } from '@/lib/api/schemas'
import { heuteBerlin } from '@/lib/transaktionen/formular'
import { requireRows } from '@/lib/data/mutation'
import { setzeGeteilt } from '@/lib/haushalt/teilen'

export type GoalActionState = { error: string } | { success: true } | null

const goalFields = {
  description: reqText('Bezeichnung ist erforderlich', 200),
  target_amount: moneyField('Zielbetrag ist ungültig').refine(n => n > 0, 'Zielbetrag muss größer als 0 sein'),
  // Leer = nicht ändern (Update) bzw. 0 (Anlegen); sonst Stand des Sparziels
  current_amount: optMoneyField('„Bereits gespart“ ist ungültig').refine(n => n === null || n >= 0, '„Bereits gespart“ darf nicht negativ sein'),
  monthly_savings_rate: optMoneyField('Sparrate ist ungültig').refine(n => n === null || n >= 0, 'Sparrate darf nicht negativ sein'),
  savings_rate_start_date: optDate,
  priority: optEnum(['hoch', 'mittel', 'niedrig'] as const, 'Priorität ist ungültig'),
  target_date: optDate,
  notes: optText(2000),
}
const createGoalSchema = z.object(goalFields)
const updateGoalSchema = z.object({ id: idField(), ...goalFields })

/** Sparrate nur, wenn > 0; Startdatum dann Formularwert oder heute (Berliner Tag, nie UTC). */
function rateFields(d: { monthly_savings_rate: number | null; savings_rate_start_date: string | null }) {
  const hasRate = d.monthly_savings_rate !== null && d.monthly_savings_rate > 0
  return {
    monthly_savings_rate: hasRate ? d.monthly_savings_rate : null,
    savings_rate_start_date: hasRate ? d.savings_rate_start_date || heuteBerlin() : null,
  }
}

const cent = (n: number) => Math.round(n * 100) / 100

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createGoal(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createGoalSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const d = parsed.data

  const { data: neu, error } = await supabase.from('savings_goals').insert({
    description: d.description,
    target_amount: cent(d.target_amount),
    current_amount: cent(d.current_amount ?? 0),
    status: 'offen',
    user_id: user.id,
    priority: d.priority,
    ...rateFields(d),
    target_date: d.target_date,
    notes: d.notes,
  }).select('id').single()

  if (error) return { error: error.message }
  const teilFehler = await setzeGeteilt(supabase, 'savings_goals', neu.id, user.id, formData)
  if (teilFehler) return { error: teilFehler }
  revalidatePath('/finance/goals')
  return { success: true }
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateGoal(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateGoalSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...d } = parsed.data

  const { data, error } = await supabase
    .from('savings_goals')
    .update({
      description: d.description,
      target_amount: cent(d.target_amount),
      // leer lassen = Stand unverändert; Zahl = Stand bewusst setzen
      ...(d.current_amount === null ? {} : { current_amount: cent(d.current_amount) }),
      priority: d.priority,
      ...rateFields(d),
      target_date: d.target_date,
      notes: d.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Sparziel nicht gefunden' }
  const teilFehler = await setzeGeteilt(supabase, 'savings_goals', id, user.id, formData)
  if (teilFehler) return { error: teilFehler }
  revalidatePath('/finance/goals')
  return { success: true }
}

// ─── Toggle status (bound action — called via form action bind) ───────────────
export async function setGoalStatus(id: string, newStatus: string): Promise<void> {
  const { supabase, user } = await getAuthUser()
  if (!user) return
  if (!parseInput(z.object({ id: uuid, status: z.enum(['offen', 'geschlossen']) }), { id, status: newStatus }).ok) return

  await supabase
    .from('savings_goals')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)

  revalidatePath('/finance/goals')
}

// ─── Add payment (increment current_amount) ───────────────────────────────────
/**
 * Zahlt `amount` auf ein Sparziel ein. Anders als früher wird NICHT still auf das Ziel gekappt
 * (das hätte Geld verschluckt, der Überschuss steht jetzt sichtbar am Ziel). Konkurrierende
 * Einzahlungen: der Update gilt nur, wenn der Stand noch der gelesene ist.
 */
export async function addGoalPayment(
  goalId: string,
  amount: number
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({ goalId: uuid, amount: z.number().positive('Betrag muss größer als 0 sein').max(MAX_AMOUNT) }),
    { goalId, amount },
  )
  if (!args.ok) return { error: issueMessage(args) }

  const { data: goal, error: fetchErr } = await supabase
    .from('savings_goals')
    .select('current_amount, status')
    .eq('id', goalId)
    .maybeSingle()

  if (fetchErr || !goal) return { error: 'Sparziel nicht gefunden' }
  if (goal.status === 'geschlossen') return { error: 'Dieses Sparziel ist abgeschlossen. Öffne es zuerst wieder.' }

  const alt = Number(goal.current_amount ?? 0)
  const neu = cent(alt + amount)

  const { data, error } = await supabase
    .from('savings_goals')
    .update({ current_amount: neu, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .eq('current_amount', goal.current_amount)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Der Stand hat sich gerade geändert. Bitte erneut versuchen.' }
  revalidatePath('/finance/goals')
  return {}
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteGoal(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await requireRows(supabase
    .from('savings_goals')
    .delete()
    .eq('id', id))

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return {}
}
