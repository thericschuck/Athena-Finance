import type { z } from 'zod'
import type { Json } from '@/types/database'
import type { AiLogger } from '@/lib/assistant/logger'
import type { ActionContext, ActionDefinition, ActionDetail } from '@/lib/assistant/actions/types'
import { transactionActions } from '@/lib/assistant/actions/transactions'
import { categoryActions } from '@/lib/assistant/actions/categories'
import { goalActions } from '@/lib/assistant/actions/goals'
import { contractActions } from '@/lib/assistant/actions/contracts'
import { insightActions } from '@/lib/assistant/actions/insights'
import { inventoryActions } from '@/lib/assistant/actions/inventory'
import { cryptoActions } from '@/lib/assistant/actions/crypto'
import { bankActions } from '@/lib/assistant/actions/bank'

export type { ActionContext, ActionDetail } from '@/lib/assistant/actions/types'

/**
 * Registry aller Schreibaktionen, nach Domäne in `actions/<domain>.ts` aufgeteilt. Die Reihenfolge der
 * Spreads entspricht der früheren Reihenfolge im einen Objekt (bestimmt die Werkzeugreihenfolge in tools).
 */
export const WRITE_ACTIONS = {
  ...transactionActions,
  ...categoryActions,
  ...goalActions,
  ...contractActions,
  ...insightActions,
  ...inventoryActions,
  ...cryptoActions,
  ...bankActions,
} satisfies Record<string, ActionDefinition<z.ZodType>>

export type WriteActionName = keyof typeof WRITE_ACTIONS

export function isWriteActionName(name: string): name is WriteActionName {
  return Object.hasOwn(WRITE_ACTIONS, name)
}

/**
 * Prüft einen Vorschlag gegen den aktuellen Datenstand, ohne etwas zu ändern.
 * Gibt `null` zurück, wenn die Aktion ausführbar ist, sonst den Grund im
 * Klartext.
 *
 * Zwei Aufrufer, aus zwei Gründen: das Vorschlags-Werkzeug in tools.ts, damit
 * das Modell eine unmögliche Aktion sofort als Werkzeugfehler zurückbekommt und
 * korrigieren kann statt Eric eine Karte hinzulegen, die beim Klick scheitert —
 * und `runWriteAction`, weil zwischen Vorschlag und Klick beliebig viel Zeit
 * liegt und die Kategorie, auf die sich der Vorschlag bezieht, inzwischen
 * gelöscht sein kann.
 */
export async function validateWriteAction(
  name: WriteActionName,
  input: unknown,
  ctx: ActionContext,
): Promise<string | null> {
  const action = WRITE_ACTIONS[name] as ActionDefinition<z.ZodType>
  if (!action.validate) return null
  const parsed = action.schema.safeParse(input)
  if (!parsed.success) {
    return `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.message).join(', ')}`
  }
  return action.validate(parsed.data, ctx)
}

/**
 * Führt eine bestätigte Aktion aus. Validiert den in der DB gelagerten Input
 * erneut gegen das Schema — zwischen Vorschlag und Bestätigung liegt eine
 * jsonb-Runde, und `execute` soll sich auf nichts verlassen, was seit dem
 * Vorschlag nicht mehr geprüft wurde.
 */
export async function runWriteAction(
  name: WriteActionName,
  rawInput: unknown,
  ctx: ActionContext,
): Promise<Record<string, unknown>> {
  const action = WRITE_ACTIONS[name] as ActionDefinition<z.ZodType>
  const parsed = action.schema.safeParse(rawInput)
  if (!parsed.success) {
    throw new Error(`Ungültige Eingabe für ${name}: ${parsed.error.issues.map((i) => i.message).join(', ')}`)
  }
  const problem = await action.validate?.(parsed.data, ctx)
  if (problem) throw new Error(problem)
  return action.execute(parsed.data, ctx)
}

/**
 * Baut die Karte, die der Nutzer vor der Bestätigung sieht: den Klartext-Satz
 * und die Aufschlüsselung darunter.
 *
 * Beides ist bewusst fehlertolerant. Eine Zusammenfassung, die an einer
 * fehlenden Zeile scheitert, dürfte den Vorschlag nicht mit sich reißen — der
 * Vorschlag ist die Arbeit, die Beschriftung nur ihre Darstellung.
 */
export async function describeWriteAction(
  name: WriteActionName,
  input: unknown,
  ctx: ActionContext,
): Promise<{ label: string; summary: string; details: ActionDetail[] }> {
  const action = WRITE_ACTIONS[name] as ActionDefinition<z.ZodType>
  const parsed = action.schema.safeParse(input)
  if (!parsed.success) return { label: action.label, summary: `${name} ausführen`, details: [] }

  const [summary, details] = await Promise.all([
    action.summarize(parsed.data, ctx).catch(() => `${name} ausführen`),
    action.details?.(parsed.data, ctx).catch(() => [] as ActionDetail[]) ?? [],
  ])
  return { label: action.label, summary, details }
}

export type ProposeWriteActionMeta = {
  conversationId?: string | null
  messageId?:      string | null
  logger:          AiLogger
}

export type ProposeWriteActionResult =
  | { error: string }
  | {
      status:   'pending_confirmation'
      actionId: string
      label:    string
      summary:  string
      details:  ActionDetail[]
      note:     string
    }

/**
 * Reiht eine Schreibaktion in `ai_pending_actions` ein, ohne sie auszuführen — dieselbe Logik,
 * die früher nur inline in `tools.ts`s `buildProposalTools()` stand. Extrahiert, damit ein
 * zweiter Auslöser außerhalb des Chats (z. B. ein Button auf der Rebalancing-Seite) exakt
 * denselben Weg nimmt: gleiche Validierung, gleiche `ai_pending_actions`-Zeile, dieselbe
 * `PendingActionCard` zur Bestätigung. Zwei unabhängige Implementierungen dieses Schritts würden
 * über kurz oder lang auseinanderlaufen.
 */
export async function proposeWriteAction(
  name: WriteActionName,
  input: unknown,
  ctx: ActionContext,
  meta: ProposeWriteActionMeta,
): Promise<ProposeWriteActionResult> {
  const problem = await validateWriteAction(name, input, ctx)
  if (problem) return { error: `Vorschlag nicht möglich: ${problem}` }

  const { label, summary, details } = await describeWriteAction(name, input, ctx)
  const { data, error } = await ctx.supabase
    .from('ai_pending_actions')
    .insert({
      user_id: ctx.userId,
      conversation_id: meta.conversationId ?? null,
      message_id: meta.messageId ?? null,
      action: name,
      input: input as Json,
      summary,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await meta.logger({
    event: 'action.proposed',
    message: summary,
    meta: { actionId: data.id, action: name, input },
  })

  return {
    status: 'pending_confirmation',
    actionId: data.id,
    label,
    summary,
    details,
    note: 'Wartet auf die Bestätigung des Nutzers. Noch wurde NICHTS geändert.',
  }
}
