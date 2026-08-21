import type { NextRequest } from 'next/server'
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createClient } from '@/lib/supabase/server'
import { buildAssistantTools } from '@/lib/assistant/tools'
import { ASSISTANT_SYSTEM_PROMPT } from '@/lib/assistant/prompts'

// Node statt Edge: braucht den vollen Supabase-Server-Client (Cookies, RLS-
// gebundene Queries) wie jede andere Route in dieser App — kein bestehender
// Edge-Code, den es hier fortzuführen gälte.
export const runtime = 'nodejs'
export const maxDuration = 60

/** `max_iterations`-Leitplanke aus dem Plan — verhindert außer Kontrolle
    geratene Tool-Aufruf-Schleifen (egal ob durch einen echten Fehler oder
    eine injizierte Anweisung ausgelöst). */
const MAX_STEPS = 10
/** Einfacher Tageszähler statt Token-Bucket-Service — reicht bei dieser
    Nutzerzahl völlig aus (siehe Plan, "Kosten- und Betriebs-Leitplanken"). */
const DAILY_MESSAGE_CAP = 200

function extractText(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = (await request.json()) as { messages?: UIMessage[]; conversationId?: string }
  const uiMessages = body.messages ?? []

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', todayStart.toISOString())
  if ((todayCount ?? 0) >= DAILY_MESSAGE_CAP) {
    return new Response('Tageslimit für Assistent-Nachrichten erreicht', { status: 429 })
  }

  let conversationId = body.conversationId
  if (conversationId) {
    // Der Client (AssistantChat) generiert die ID selbst und schickt sie ab
    // der ersten Nachricht mit — `ignoreDuplicates` macht das Anlegen für
    // jede Folgenachricht derselben Konversation ein No-Op statt eines Fehlers.
    const { error } = await supabase
      .from('ai_conversations')
      .upsert({ id: conversationId, user_id: user.id }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) return new Response('Konnte Konversation nicht anlegen', { status: 500 })
  } else {
    const { data: conv, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (error || !conv) return new Response('Konnte Konversation nicht anlegen', { status: 500 })
    conversationId = conv.id
  }
  // Erneutes const-Binding: eine per `let` befüllte Variable bleibt für
  // TypeScript in später definierten Closures (onStepFinish/onFinish unten)
  // als "möglicherweise undefined" markiert, obwohl sie es zur Laufzeit nie
  // ist — dieses Re-Binding macht das auch für den Compiler eindeutig.
  const activeConversationId = conversationId

  const lastMessage = uiMessages[uiMessages.length - 1]
  if (lastMessage?.role === 'user') {
    await supabase.from('ai_messages').insert({
      user_id: user.id,
      conversation_id: activeConversationId,
      role: 'user',
      content: lastMessage.parts as never,
      content_text: extractText(lastMessage.parts),
    })
  }

  // Platzhalter-Zeile für die Antwort des Assistenten — wird gebraucht,
  // BEVOR die Antwort selbst feststeht, damit ai_tool_calls (siehe
  // onStepFinish) schon während des Streamens ein gültiges message_id hat.
  // onFinish unten befüllt dieselbe Zeile nachträglich mit dem echten Inhalt.
  const { data: assistantMessage, error: assistantInsertError } = await supabase
    .from('ai_messages')
    .insert({
      user_id: user.id,
      conversation_id: activeConversationId,
      role: 'assistant',
      content: [],
    })
    .select('id')
    .single()
  if (assistantInsertError || !assistantMessage) {
    return new Response('Konnte Antwort-Platzhalter nicht anlegen', { status: 500 })
  }
  const assistantMessageId = assistantMessage.id

  const tools = buildAssistantTools(supabase, user.id)
  const modelMessages = await convertToModelMessages(uiMessages)

  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    system: ASSISTANT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    onStepFinish: async (step) => {
      if (step.toolCalls.length === 0) return
      const rows = step.toolCalls.map((call) => {
        const matchingResult = step.toolResults.find((r) => r.toolCallId === call.toolCallId)
        const output = matchingResult?.output
        const isError = !!(output && typeof output === 'object' && 'error' in output)
        return {
          user_id: user.id,
          conversation_id: activeConversationId,
          message_id: assistantMessageId,
          tool_name: call.toolName,
          input: call.input as never,
          output_summary: output ? JSON.stringify(output).slice(0, 2000) : null,
          is_error: isError,
        }
      })
      await supabase.from('ai_tool_calls').insert(rows)
    },
    onFinish: async (final) => {
      const text = final.text
      await supabase
        .from('ai_messages')
        .update({
          content: final.response.messages as never,
          content_text: text,
        })
        .eq('id', assistantMessageId)
    },
  })

  return result.toUIMessageStreamResponse()
}
