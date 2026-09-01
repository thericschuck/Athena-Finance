'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runWriteAction, isWriteActionName } from '@/lib/assistant/actions'
import { getAthenaSettings, type AthenaEffort } from '@/lib/assistant/settings'
import { logAi } from '@/lib/assistant/logger'
import {
  ladeSessionZustand,
  listeSessions,
  type SessionSummary,
  type SessionZustand,
} from '@/lib/assistant/sessions'
import type { Json } from '@/types/database'

/**
 * `result` trägt das Rückgabeobjekt der ausgeführten Aktion zurück ins UI. Gebraucht wird
 * das bisher nur von einer: `generateValuableArtwork` liefert die Bild-ID, mit der die
 * Karte im Chat das fertige Artwork nachlädt. Alle anderen lassen das Feld leer.
 */
export type ActionState =
  | { error: string }
  | { success: true; result?: Record<string, unknown> }
  | null

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, user }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Session-Liste für das schwebende Sheet.
 *
 * Die volle Seite liest dasselbe direkt in der Server Component — das Sheet hängt aber im
 * Dashboard-Layout und wird nicht neu gerendert, wenn sich Sessions ändern. Es holt die
 * Liste deshalb beim Aufklappen des Umschalters, und zwar jedes Mal: nach zehn Minuten auf
 * einer Seite wäre eine beim Mount geladene Liste veraltet.
 */
export async function listConversations(): Promise<SessionSummary[]> {
  const ctx = await requireUser()
  if (!ctx) return []
  return listeSessions(ctx.supabase, ctx.user.id)
}

/**
 * Nachrichten und Vorschlagszustand einer Session — für den Wechsel im Sheet, das keinen
 * Seitenwechsel auslöst und die Daten deshalb nicht als Server-Props bekommt.
 */
export async function loadConversation(id: string): Promise<SessionZustand> {
  const ctx = await requireUser()
  if (!ctx) return { messages: [], actionStatuses: {}, actionResults: {} }
  return ladeSessionZustand(ctx.supabase, ctx.user.id, id)
}

export async function renameConversation(id: string, title: string): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }
  const clean = title.trim().slice(0, 120)
  if (!clean) return { error: 'Titel darf nicht leer sein' }

  const { error } = await ctx.supabase
    .from('ai_conversations')
    .update({ title: clean })
    .eq('id', id)
    .eq('user_id', ctx.user.id)
  if (error) return { error: error.message }

  await logAi(ctx.supabase, ctx.user.id, {
    event: 'session.rename',
    conversationId: id,
    message: clean,
  })
  revalidatePath('/assistant')
  return { success: true }
}

export async function deleteConversation(id: string): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }

  // Log VOR dem Löschen: ai_logs.conversation_id ist `on delete set null`, die
  // Zeile bliebe sonst ohne jeden Bezug zurück.
  await logAi(ctx.supabase, ctx.user.id, { event: 'session.delete', conversationId: id })

  const { error } = await ctx.supabase
    .from('ai_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', ctx.user.id)
  if (error) return { error: error.message }

  revalidatePath('/assistant')
  return { success: true }
}

export async function togglePinConversation(id: string, pinned: boolean): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }
  const { error } = await ctx.supabase
    .from('ai_conversations')
    .update({ pinned })
    .eq('id', id)
    .eq('user_id', ctx.user.id)
  if (error) return { error: error.message }
  revalidatePath('/assistant')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bestätigung schreibender Aktionen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Führt eine von Athena vorgeschlagene Aktion aus — der einzige Weg, auf dem
 * eine Schreibaktion überhaupt zur Ausführung kommt.
 *
 * Der Statuswechsel `pending → executed` läuft über ein bedingtes Update
 * (`.eq('status', 'pending')`), das erst NACH erfolgreicher Ausführung greift.
 * Zwei parallele Klicks auf denselben Vorschlag können die Aktion dadurch zwar
 * theoretisch zweimal ausführen — was hier alles idempotent ist (Kategorie
 * setzen, Vertrag deaktivieren) oder als Duplikat sofort sichtbar wäre. Der
 * umgekehrte Fehler — Status auf `executed` setzen und dann beim Schreiben
 * scheitern — wäre schlimmer: die Aktion sähe erledigt aus, ohne es zu sein.
 */
export async function confirmPendingAction(actionId: string): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }
  const { supabase, user } = ctx

  const { data: pending, error: loadError } = await supabase
    .from('ai_pending_actions')
    .select('id, action, input, summary, status, conversation_id')
    .eq('id', actionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (loadError) return { error: loadError.message }
  if (!pending) return { error: 'Vorschlag nicht gefunden' }
  if (pending.status !== 'pending') return { error: `Vorschlag ist bereits ${pending.status}` }
  if (!isWriteActionName(pending.action)) return { error: `Unbekannte Aktion ${pending.action}` }

  let result: Record<string, unknown>
  try {
    result = await runWriteAction(pending.action, pending.input, { supabase, userId: user.id })
    await supabase
      .from('ai_pending_actions')
      .update({ status: 'executed', result: result as Json, resolved_at: new Date().toISOString() })
      .eq('id', actionId)
      .eq('user_id', user.id)
      .eq('status', 'pending')

    await logAi(supabase, user.id, {
      event: 'action.executed',
      conversationId: pending.conversation_id,
      message: pending.summary,
      meta: { actionId, action: pending.action, result },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('ai_pending_actions')
      .update({ status: 'failed', error: message, resolved_at: new Date().toISOString() })
      .eq('id', actionId)
      .eq('user_id', user.id)
    await logAi(supabase, user.id, {
      level: 'error',
      event: 'action.failed',
      conversationId: pending.conversation_id,
      message,
      meta: { actionId, action: pending.action },
    })
    return { error: message }
  }

  // Die geänderten Daten stehen auf mehreren Seiten — pauschal alles unter dem
  // Dashboard-Layout neu holen ist hier billiger als eine Liste zu pflegen, die
  // bei jeder neuen Aktion in actions.ts mitwachsen müsste.
  revalidatePath('/', 'layout')
  return { success: true, result }
}

/**
 * Signierte URL für ein Inventarbild — der Bucket ist privat, ohne Signatur liefert
 * Storage 400.
 *
 * Warum die Karte im Chat die URL nachlädt, statt sie im Ergebnis der Aktion zu speichern:
 * eine signierte URL läuft ab. Im gespeicherten `result` stünde nach einer Stunde ein toter
 * Link, und beim Wiederöffnen einer alten Session wäre jedes Artwork ein kaputtes Bild.
 * Die ID hält ewig, die Signatur holt man sich, wenn man sie braucht.
 */
export async function signValuableImage(
  bildId: string,
): Promise<{ url: string } | { error: string }> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }

  const { data: bild } = await ctx.supabase
    .from('valuable_images')
    .select('pfad')
    .eq('id', bildId)
    .eq('user_id', ctx.user.id)
    .maybeSingle()
  if (!bild) return { error: 'Bild nicht gefunden' }

  const { data, error } = await ctx.supabase.storage
    .from('valuables')
    .createSignedUrl((bild as { pfad: string }).pfad, 60 * 60)
  if (error || !data) return { error: error?.message ?? 'Signatur fehlgeschlagen' }
  return { url: data.signedUrl }
}

export async function rejectPendingAction(actionId: string): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }

  const { data, error } = await ctx.supabase
    .from('ai_pending_actions')
    .update({ status: 'rejected', resolved_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('user_id', ctx.user.id)
    .eq('status', 'pending')
    .select('summary, conversation_id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Vorschlag nicht gefunden oder bereits entschieden' }

  await logAi(ctx.supabase, ctx.user.id, {
    event: 'action.rejected',
    conversationId: data.conversation_id,
    message: data.summary,
    meta: { actionId },
  })
  revalidatePath('/assistant')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kontext-Speicher
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = /^[a-z0-9-]+$/

export async function upsertMemory(formData: FormData): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }

  const key = (formData.get('key') as string)?.trim().toLowerCase()
  const content = (formData.get('content') as string)?.trim()
  const category = (formData.get('category') as string) || 'general'

  if (!key || !SLUG.test(key)) return { error: 'Key: nur Kleinbuchstaben, Ziffern, Bindestriche' }
  if (!content) return { error: 'Inhalt darf nicht leer sein' }

  const { error } = await ctx.supabase.from('ai_memories').upsert(
    {
      user_id: ctx.user.id,
      key,
      content,
      category,
      // Von Hand angelegt oder bearbeitet ⇒ ab jetzt eine Vorgabe des Nutzers,
      // auch wenn Athena den Eintrag ursprünglich geschrieben hat. Der
      // System-Prompt gewichtet `user`-Einträge höher.
      source: 'user',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' },
  )
  if (error) return { error: error.message }

  await logAi(ctx.supabase, ctx.user.id, {
    event: 'memory.write',
    message: `${key} (manuell)`,
    meta: { key, category },
  })
  revalidatePath('/assistant/memory')
  return { success: true }
}

export async function deleteMemory(id: string): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }
  const { data, error } = await ctx.supabase
    .from('ai_memories')
    .delete()
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .select('key')
    .maybeSingle()
  if (error) return { error: error.message }
  await logAi(ctx.supabase, ctx.user.id, {
    event: 'memory.delete',
    message: `${data?.key ?? id} (manuell)`,
  })
  revalidatePath('/assistant/memory')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wissensbasis
// ─────────────────────────────────────────────────────────────────────────────

export async function saveKnowledgeEntry(formData: FormData): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }

  const id = (formData.get('id') as string) || null
  const title = (formData.get('title') as string)?.trim()
  const content = (formData.get('content') as string)?.trim()
  const sourceUrl = (formData.get('source_url') as string)?.trim() || null
  const tags = ((formData.get('tags') as string) ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10)

  if (!title) return { error: 'Titel darf nicht leer sein' }
  if (!content) return { error: 'Inhalt darf nicht leer sein' }

  const payload = {
    user_id: ctx.user.id,
    title,
    content,
    tags,
    source_url: sourceUrl,
    updated_at: new Date().toISOString(),
  }

  const { error } = id
    ? await ctx.supabase
        .from('ai_knowledge')
        .update(payload)
        .eq('id', id)
        .eq('user_id', ctx.user.id)
    : await ctx.supabase.from('ai_knowledge').insert({ ...payload, source: 'user' })
  if (error) return { error: error.message }

  await logAi(ctx.supabase, ctx.user.id, {
    event: 'knowledge.write',
    message: `${title} (manuell)`,
    meta: { id, tags },
  })
  revalidatePath('/assistant/knowledge')
  return { success: true }
}

export async function deleteKnowledgeEntry(id: string): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }
  const { data, error } = await ctx.supabase
    .from('ai_knowledge')
    .delete()
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .select('title')
    .maybeSingle()
  if (error) return { error: error.message }
  await logAi(ctx.supabase, ctx.user.id, {
    event: 'knowledge.delete',
    message: data?.title ?? id,
  })
  revalidatePath('/assistant/knowledge')
  return { success: true }
}

export async function toggleKnowledgePin(id: string, pinned: boolean): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }
  const { error } = await ctx.supabase
    .from('ai_knowledge')
    .update({ pinned })
    .eq('id', id)
    .eq('user_id', ctx.user.id)
  if (error) return { error: error.message }
  revalidatePath('/assistant/knowledge')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Einstellungen
// ─────────────────────────────────────────────────────────────────────────────

export async function saveAthenaSettings(formData: FormData): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }

  const maxSteps = Number(formData.get('max_steps'))
  const dailyCap = Number(formData.get('daily_message_cap'))
  if (!Number.isFinite(maxSteps) || maxSteps < 1 || maxSteps > 60)
    return { error: 'Schrittlimit muss zwischen 1 und 60 liegen' }
  if (!Number.isFinite(dailyCap) || dailyCap < 1) return { error: 'Tageslimit muss größer als 0 sein' }

  const { error } = await ctx.supabase.from('ai_settings').upsert(
    {
      user_id: ctx.user.id,
      model: formData.get('model') as string,
      effort: formData.get('effort') as string,
      web_research: formData.get('web_research') === 'on',
      memory_enabled: formData.get('memory_enabled') === 'on',
      auto_memory: formData.get('auto_memory') === 'on',
      max_steps: maxSteps,
      daily_message_cap: dailyCap,
      custom_instructions: ((formData.get('custom_instructions') as string) ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return { error: error.message }

  revalidatePath('/assistant/settings')
  return { success: true }
}

/**
 * Schnellumschalter im Chat selbst (Modell + Denktiefe) — bewusst getrennt von
 * `saveAthenaSettings`, das ein volles Formular voraussetzt: ein blindes
 * Upsert mit nur `model`/`effort` gesetzt hätte hier Web-Recherche, Speicher
 * und alle übrigen Felder stillschweigend auf ihre Formular-Leerwerte
 * zurückgesetzt. Erst die bestehende Zeile lesen, dann nur die geänderten
 * Felder überschreiben.
 */
export async function updateAthenaModelEffort(
  patch: { model?: string; effort?: AthenaEffort },
): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }

  const current = await getAthenaSettings(ctx.supabase, ctx.user.id)

  const { error } = await ctx.supabase.from('ai_settings').upsert(
    {
      user_id: ctx.user.id,
      model: patch.model ?? current.model,
      effort: patch.effort ?? current.effort,
      web_research: current.webResearch,
      memory_enabled: current.memoryEnabled,
      auto_memory: current.autoMemory,
      max_steps: current.maxSteps,
      daily_message_cap: current.dailyMessageCap,
      custom_instructions: current.customInstructions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return { error: error.message }

  revalidatePath('/assistant/settings')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// System-Log
// ─────────────────────────────────────────────────────────────────────────────

export async function clearLogs(olderThanDays: number): Promise<ActionState> {
  const ctx = await requireUser()
  if (!ctx) return { error: 'Nicht eingeloggt' }
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - Math.max(0, olderThanDays))

  const { error } = await ctx.supabase
    .from('ai_logs')
    .delete()
    .eq('user_id', ctx.user.id)
    .lt('created_at', cutoff.toISOString())
  if (error) return { error: error.message }
  revalidatePath('/assistant/logs')
  return { success: true }
}
