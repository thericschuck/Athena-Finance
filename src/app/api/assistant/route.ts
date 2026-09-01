import type { NextRequest } from 'next/server'
import {
  streamText,
  generateText,
  stepCountIs,
  smoothStream,
  convertToModelMessages,
  type UIMessage,
  type ToolSet,
} from 'ai'
import {
  anthropic,
  forwardAnthropicContainerIdFromLastStep,
  type AnthropicProviderOptions,
} from '@ai-sdk/anthropic'
import { createClient } from '@/lib/supabase/server'
import { buildAthenaTools } from '@/lib/assistant/tools'
import { buildAthenaSystemPrompt, TITLE_SYSTEM_PROMPT } from '@/lib/assistant/prompts'
import { loadAthenaContext } from '@/lib/assistant/context'
import { getAthenaSettings } from '@/lib/assistant/settings'
import { createLogger } from '@/lib/assistant/logger'
import type { Json } from '@/types/database'

// Node statt Edge: braucht den vollen Supabase-Server-Client (Cookies, RLS-
// gebundene Queries) wie jede andere Route in dieser App.
export const runtime = 'nodejs'
// Ein agentischer Lauf mit Web-Recherche und einem Dutzend Werkzeugschritten
// braucht spürbar länger als die frühere Ein-Schritt-Antwort. 300 s ist das
// Maximum auf Vercels Fluid-Compute; darunter wird ein legitimer langer Lauf
// mitten im Streamen abgeschnitten.
export const maxDuration = 300

/** Kleines Modell für Nebenaufgaben (Session-Titel). Bewusst hart verdrahtet:
    das ist keine Nutzerentscheidung, sondern eine Kostenoptimierung, die bei
    keiner Modellwahl anders ausfallen würde. */
const UTILITY_MODEL = 'claude-haiku-4-5'

/**
 * Adaptives Denken und die `effort`-Stufe gibt es erst ab der 4.6-Generation.
 * Bei einem älteren/kleineren Modell (z. B. Haiku 4.5) würde die API die
 * Parameter mit 400 ablehnen — deshalb hier prüfen statt blind mitschicken.
 */
function supportsThinking(model: string): boolean {
  return /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5)/.test(model)
}

/** Die Filter-Variante der Web-Werkzeuge setzt dieselbe Modellgeneration
    voraus; ältere Modelle bekommen die einfache Variante. */
function webTools(model: string): ToolSet {
  return supportsThinking(model)
    ? {
        web_search: anthropic.tools.webSearch_20260209({ maxUses: 8 }),
        web_fetch: anthropic.tools.webFetch_20260209({
          maxUses: 5,
          maxContentTokens: 40_000,
          citations: { enabled: true },
        }),
      }
    : { web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }) }
}

function extractText(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = (await request.json()) as { messages?: UIMessage[]; conversationId?: string }
  const uiMessages = body.messages ?? []

  const settings = await getAthenaSettings(supabase, user.id)

  // ── Tageslimit ──────────────────────────────────────────────────────────────
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', todayStart.toISOString())
  if ((todayCount ?? 0) >= settings.dailyMessageCap) {
    await createLogger(supabase, user.id, body.conversationId ?? null)({
      level: 'warn',
      event: 'run.limit',
      message: `Tageslimit von ${settings.dailyMessageCap} Nachrichten erreicht`,
      meta: { todayCount },
    })
    return new Response('Tageslimit für Athena-Nachrichten erreicht', { status: 429 })
  }

  // ── Konversation ────────────────────────────────────────────────────────────
  let conversationId = body.conversationId
  let isNewConversation = false
  if (conversationId) {
    // Der Client erzeugt die ID selbst (neue Session) oder schickt die einer
    // geladenen Session mit. `ignoreDuplicates` macht den Insert im zweiten
    // Fall zum No-Op statt zum Fehler.
    const { data: existing } = await supabase
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!existing) {
      const { error } = await supabase
        .from('ai_conversations')
        .insert({ id: conversationId, user_id: user.id })
      if (error) return new Response('Konnte Konversation nicht anlegen', { status: 500 })
      isNewConversation = true
    }
  } else {
    const { data: conv, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (error || !conv) return new Response('Konnte Konversation nicht anlegen', { status: 500 })
    conversationId = conv.id
    isNewConversation = true
  }
  // Erneutes const-Binding, damit TypeScript die Variable in den unten
  // definierten Closures (onStepFinish/onFinish) nicht als möglicherweise
  // undefined behandelt.
  const activeConversationId = conversationId
  const log = createLogger(supabase, user.id, activeConversationId)

  if (isNewConversation) await log({ event: 'session.create' })

  // ── Nutzer-Nachricht persistieren ───────────────────────────────────────────
  const lastMessage = uiMessages[uiMessages.length - 1]
  const lastUserText = lastMessage?.role === 'user' ? extractText(lastMessage.parts) : ''
  if (lastMessage?.role === 'user') {
    await supabase.from('ai_messages').insert({
      user_id: user.id,
      conversation_id: activeConversationId,
      role: 'user',
      content: lastMessage.parts as never,
      content_text: lastUserText,
    })
  }

  // Platzhalter-Zeile für die Antwort — wird gebraucht, BEVOR die Antwort
  // feststeht, damit ai_tool_calls und ai_pending_actions schon während des
  // Streamens eine gültige message_id referenzieren können. onFinish befüllt
  // dieselbe Zeile nachträglich mit dem echten Inhalt.
  const { data: assistantMessage, error: assistantInsertError } = await supabase
    .from('ai_messages')
    .insert({
      user_id: user.id,
      conversation_id: activeConversationId,
      role: 'assistant',
      content: [],
      model: settings.model,
    })
    .select('id')
    .single()
  if (assistantInsertError || !assistantMessage) {
    return new Response('Konnte Antwort-Platzhalter nicht anlegen', { status: 500 })
  }
  const assistantMessageId = assistantMessage.id

  // ── Kontext & Werkzeuge ─────────────────────────────────────────────────────
  const context = await loadAthenaContext(supabase, user.id, {
    memoryEnabled: settings.memoryEnabled,
  })
  const system = buildAthenaSystemPrompt(context, settings)

  const tools: ToolSet = {
    ...buildAthenaTools(supabase, user.id, {
      conversationId: activeConversationId,
      messageId: assistantMessageId,
      logger: log,
      autoMemory: settings.autoMemory,
      memoryEnabled: settings.memoryEnabled,
    }),
    ...(settings.webResearch ? webTools(settings.model) : {}),
  }

  const modelMessages = await convertToModelMessages(uiMessages)

  await log({
    event: 'run.start',
    message: lastUserText.slice(0, 200),
    meta: {
      model: settings.model,
      effort: settings.effort,
      maxSteps: settings.maxSteps,
      webResearch: settings.webResearch,
      toolCount: Object.keys(tools).length,
      memoryCount: context.memories.length,
    },
  })

  const result = streamText({
    model: anthropic(settings.model),
    system,
    messages: modelMessages,
    tools,
    // Die Leitplanke gegen außer Kontrolle geratene Werkzeugschleifen. Höher
    // als die früheren 10, weil ein echter mehrstufiger Auftrag (recherchieren,
    // gegen eigene Daten prüfen, Vorschlag bauen) sonst mitten drin abbricht.
    stopWhen: stepCountIs(settings.maxSteps),
    maxOutputTokens: 32_000,

    // Die Filter-Variante der Web-Werkzeuge (webSearch_20260209 /
    // webFetch_20260209) führt serverseitig Code aus, um Treffer zu filtern.
    // Anthropic legt dafür einen Container an, dessen ID ab dem zweiten Schritt
    // mitgeschickt werden MUSS — fehlt sie, bricht der Lauf mit
    // "container_id is required when there are pending tool uses generated by
    // code execution with tools" ab, sobald eine Websuche stattgefunden hat.
    prepareStep: forwardAnthropicContainerIdFromLastStep,

    // Zeichenweise ankommende Chunks zu Wörtern zusammenfassen: der Text
    // erscheint gleichmäßig statt in Schüben, was im Chat spürbar ruhiger wirkt.
    experimental_transform: smoothStream({ chunking: 'word' }),
    providerOptions: supportsThinking(settings.model)
      ? {
          anthropic: {
            // `summarized` statt der Voreinstellung: ohne das kommen die
            // Reasoning-Blöcke leer an und der Chat zeigt beim Nachdenken
            // minutenlang nichts an.
            thinking: { type: 'adaptive', display: 'summarized' },
            effort: settings.effort,
          } satisfies AnthropicProviderOptions,
        }
      : undefined,

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

      const failed = rows.filter((r) => r.is_error).map((r) => r.tool_name)
      await log({
        level: failed.length > 0 ? 'warn' : 'debug',
        event: failed.length > 0 ? 'tool.error' : 'step.finish',
        message: step.toolCalls.map((c) => c.toolName).join(', '),
        meta: { tools: step.toolCalls.map((c) => c.toolName), failed },
      })
    },

    onError: async ({ error }) => {
      await log({
        level: 'error',
        event: 'run.error',
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      })
    },

    onFinish: async (final) => {
      const durationMs = Date.now() - startedAt
      // `content` (die UI-Parts zum Wiederherstellen der Session) schreibt
      // `onEnd` weiter unten — hier stehen nur die Betriebsdaten des Laufs.
      await supabase
        .from('ai_messages')
        .update({
          content_text: final.text,
          usage: final.totalUsage as unknown as Json,
          finish_reason: final.finishReason,
          duration_ms: durationMs,
        })
        .eq('id', assistantMessageId)

      await log({
        event: 'run.finish',
        message: final.text.slice(0, 200),
        durationMs,
        meta: {
          steps: final.steps.length,
          finishReason: final.finishReason,
          usage: final.totalUsage,
          model: settings.model,
        },
      })

      // Titel erst am Ende: hier steht fest, dass der Lauf überhaupt zu einer
      // Antwort geführt hat, und der Titel blockiert den Stream nicht.
      if (isNewConversation && lastUserText) {
        await titleConversation(supabase, activeConversationId, user.id, lastUserText)
      }
    },
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    sendSources: true,
    // Voreingestellt maskiert die AI-SDK Serverfehler zu "An error occurred." —
    // sinnvoll für eine Anwendung mit fremden Nutzern, hier aber nur hinderlich:
    // Athena Finance hat genau einen Nutzer, und dieselbe Meldung steht ohnehin
    // im System-Log unter /assistant/logs. Sie direkt im Chat zu zeigen erspart
    // den Umweg dorthin.
    onError: (error) => (error instanceof Error ? error.message : String(error)),
    // `originalMessages` schaltet den Persistenz-Modus ein: nur damit liefert
    // `onEnd` die vollständige, bereits ins UI-Format übersetzte Nachricht.
    // Genau die wird gespeichert — würde man stattdessen die ModelMessages aus
    // streamText ablegen, ließe sich eine Session später nicht mehr im Chat
    // rekonstruieren (Tool-Parts und Reasoning haben dort ein anderes Format).
    originalMessages: uiMessages,
    onEnd: async ({ messages }) => {
      const responseMessage = messages.at(-1)
      if (!responseMessage || responseMessage.role !== 'assistant') return
      await supabase
        .from('ai_messages')
        .update({ content: responseMessage.parts as never })
        .eq('id', assistantMessageId)
    },
  })
}

/**
 * Vergibt einen Titel für die Session-Liste. Fehler werden bewusst geschluckt:
 * eine Session ohne Titel ist eine Schönheitsfrage, ein deswegen abgebrochener
 * Request wäre keine.
 */
async function titleConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string,
  firstUserMessage: string,
) {
  try {
    const { text } = await generateText({
      model: anthropic(UTILITY_MODEL),
      system: TITLE_SYSTEM_PROMPT,
      prompt: firstUserMessage.slice(0, 1000),
      maxOutputTokens: 64,
    })
    const title = text.trim().replace(/^["„»]|["“«.]$/g, '').slice(0, 80)
    if (!title) return
    await supabase
      .from('ai_conversations')
      .update({ title })
      .eq('id', conversationId)
      .eq('user_id', userId)
  } catch (err) {
    console.error('[athena] Titelvergabe fehlgeschlagen', err)
  }
}
