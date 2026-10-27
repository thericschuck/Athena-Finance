import type { NextRequest } from 'next/server'
import {
  streamText,
  generateText,
  stepCountIs,
  smoothStream,
  convertToModelMessages,
  type SystemModelMessage,
  type UIMessage,
  type ToolSet,
} from 'ai'
import {
  anthropic,
  forwardAnthropicContainerIdFromLastStep,
  type AnthropicProviderOptions,
} from '@ai-sdk/anthropic'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { buildAthenaTools } from '@/lib/assistant/tools'
import { buildAthenaSystemPrompt, TITLE_SYSTEM_PROMPT } from '@/lib/assistant/prompts'
import { loadAthenaContext } from '@/lib/assistant/context'
import { getAthenaSettings, supportsThinking } from '@/lib/assistant/settings'
import { cacheLetzteNachricht } from '@/lib/assistant/review-regeln'
import { createLogger } from '@/lib/assistant/logger'
import { bereinigeMentions } from '@/lib/assistant/mentions'
import { mentionBlock } from '@/lib/assistant/mention-daten'
import { projektKontext } from '@/lib/assistant/projekte'
import {
  bereinigeNachrichten,
  dateiTeile,
  loeseDateienAuf,
  mentionsAusNachricht,
} from '@/lib/assistant/datei-aufloesen'
import type { Json } from '@/types/database'
import { resolveScope } from '@/lib/haushalt/resolve'

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
  const { supabase, user } = await getAuthUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = (await request.json()) as {
    messages?: UIMessage[]
    conversationId?: string
    /** Route, auf der Eric stand, als er die Nachricht abschickte. Kommt vom
        Client mit JEDER Nachricht, nicht einmal pro Session — im schwebenden
        Sheet navigiert er weiter, waehrend der Chat offen bleibt. Nur ein
        Hinweis fuer den Prompt (siehe atlas.ts), nie ein Zugriffsrecht: welche
        Daten Athena lesen darf, entscheiden allein RLS und der Werkzeuggürtel. */
    route?: string
    /** @-Bezüge der letzten Nachricht (Typ, ID, Label) — wird gegen die Datenbank geprüft. */
    mentions?: unknown
    /** Nur beim Anlegen eines neuen Chats: das Projekt, in dem er entsteht. */
    projectId?: string
    /** „Neu generieren“: die letzte Antwort wird ersetzt, die Nutzernachricht nicht erneut gespeichert. */
    regenerate?: boolean
  }
  // Vom Client Kommendes wird zuerst zurechtgestutzt: nur `storage:`-Dateien, nur Bezüge als Metadaten.
  const uiMessages = bereinigeNachrichten(body.messages ?? [])
  // Auf einen Pfad eingegrenzt, bevor er in den Prompt geht: der Client ist
  // vertrauenswuerdig, aber ein Freitextfeld aus dem Request im System-Prompt
  // waere eine offene Tuer fuer Prompt-Injection. Alles, was nicht wie eine
  // interne Route aussieht, fliegt raus — describeCurrentRoute laesst
  // unbekannte Pfade ohnehin fallen.
  const currentRoute = typeof body.route === 'string' && /^\/[A-Za-z0-9\-_/[\]]{0,120}$/.test(body.route)
    ? body.route
    : null

  const settings = await getAthenaSettings(supabase, user.id)
  // Haushalts-Scope des Nutzers (nur Cookie): kommt vom Server, nie aus dem Request-Body oder vom Modell.
  const scopeCtx = await resolveScope(supabase, user)

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
  // Das Projekt eines Chats steht in der Zeile (nicht im Request): `body.projectId` zählt nur beim
  // Anlegen und nur, wenn das Projekt dem Nutzer gehört.
  let projectId: string | null = null
  let neuesProjekt: string | null = null
  if (typeof body.projectId === 'string') {
    const { data: projekt } = await supabase
      .from('ai_projects')
      .select('id')
      .eq('id', body.projectId)
      .eq('user_id', user.id)
      .maybeSingle()
    neuesProjekt = projekt?.id ?? null
  }
  if (conversationId) {
    // Der Client erzeugt die ID selbst (neue Session) oder schickt die einer
    // geladenen Session mit. `ignoreDuplicates` macht den Insert im zweiten
    // Fall zum No-Op statt zum Fehler.
    const { data: existing } = await supabase
      .from('ai_conversations')
      .select('id, project_id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!existing) {
      const { error } = await supabase
        .from('ai_conversations')
        .insert({ id: conversationId, user_id: user.id, project_id: neuesProjekt })
      if (error) return new Response('Konnte Konversation nicht anlegen', { status: 500 })
      isNewConversation = true
      projectId = neuesProjekt
    } else {
      projectId = existing.project_id
    }
  } else {
    const { data: conv, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, project_id: neuesProjekt })
      .select('id')
      .single()
    if (error || !conv) return new Response('Konnte Konversation nicht anlegen', { status: 500 })
    conversationId = conv.id
    isNewConversation = true
    projectId = neuesProjekt
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
  // Nur Dateien, kein Text: der Titel entsteht dann aus den Dateinamen statt gar nicht.
  const titelQuelle = lastUserText || dateiTeile(lastMessage, user.id).map((d) => d.name).join(', ')
  const regenerate = body.regenerate === true && lastMessage?.role === 'user'
  // Bei „Neu generieren“ wird die Nutzernachricht nicht erneut gespeichert; die ersetzte Antwort wird
  // erst GELÖSCHT, wenn der neue Lauf sicher startet (siehe unten, ersetzeLetzteAntwort).
  if (regenerate) {
  } else if (lastMessage?.role === 'user') {
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

  // ── Kontext, Bezüge, Projekt, Dateien ───────────────────────────────────────
  // Alles, was fehlschlagen kann (Datei laden, Bezüge, Projekt): scheitert es, räumt der Catch die
  // Platzhalter-Zeile ab, damit keine leere Antwort im Verlauf zurückbleibt — und bei „Neu
  // generieren“ ist die alte Antwort dann noch da.
  const bezuegeListe = bereinigeMentions(body.mentions)
  const mentions =
    bezuegeListe.length > 0
      ? bezuegeListe
      : regenerate
        ? bereinigeMentions(mentionsAusNachricht(lastMessage))
        : []

  let context!: Awaited<ReturnType<typeof loadAthenaContext>>
  let systemBlocks!: ReturnType<typeof buildAthenaSystemPrompt>
  let modelMessages!: Awaited<ReturnType<typeof convertToModelMessages>>
  try {
    context = await loadAthenaContext(supabase, scopeCtx, { memoryEnabled: settings.memoryEnabled })
    const [projektAbschnitt, bezuege] = await Promise.all([
      projectId ? projektKontext(supabase, user.id, projectId) : Promise.resolve(null),
      mentionBlock(supabase, user.id, mentions),
    ])
    systemBlocks = buildAthenaSystemPrompt(context, settings, new Date(), currentRoute, {
      projekt: projektAbschnitt,
      bezuege,
    })

    // Storage-Verweise -> Bytes bzw. Text (siehe datei-aufloesen.ts). Persistiert wird weiter die
    // schlanke Fassung `uiMessages`; nur das Modell bekommt die aufgelöste.
    const aufgeloest = await loeseDateienAuf(supabase, user.id, uiMessages)
    modelMessages = await convertToModelMessages(aufgeloest.messages)

    // Dateien der neuen Nachricht in `ai_files` verbuchen (Aufräumen beim Löschen der Session).
    // Hier und nicht beim Hochladen: bei einem frischen Chat gibt es die Konversation erst jetzt.
    const neueDateien = dateiTeile(lastMessage, user.id).filter((d) => aufgeloest.groessen.has(d.pfad))
    if (neueDateien.length > 0) {
      const { data: vorhanden } = await supabase
        .from('ai_files')
        .select('pfad')
        .eq('user_id', user.id)
        .in('pfad', neueDateien.map((d) => d.pfad))
      const bekannt = new Set((vorhanden ?? []).map((v) => v.pfad))
      const zeilen = neueDateien
        .filter((d) => !bekannt.has(d.pfad))
        .map((d) => ({
          user_id: user.id,
          conversation_id: activeConversationId,
          pfad: d.pfad,
          name: d.name,
          media_type: d.mediaType,
          groesse: aufgeloest.groessen.get(d.pfad) ?? 0,
        }))
      if (zeilen.length > 0) await supabase.from('ai_files').insert(zeilen)
    }
  } catch (err) {
    await supabase.from('ai_messages').delete().eq('id', assistantMessageId).eq('user_id', user.id)
    const meldung = err instanceof Error ? err.message : String(err)
    await log({ level: 'error', event: 'run.error', message: meldung, durationMs: Date.now() - startedAt })
    return new Response(`Anfrage konnte nicht vorbereitet werden: ${meldung}`, { status: 500 })
  }

  // Der neue Lauf startet: erst jetzt verschwindet die ersetzte Antwort.
  if (regenerate) await ersetzeLetzteAntwort(supabase, user.id, activeConversationId, assistantMessageId)

  const tools: ToolSet = {
    ...buildAthenaTools(supabase, scopeCtx, {
      conversationId: activeConversationId,
      messageId: assistantMessageId,
      logger: log,
      autoMemory: settings.autoMemory,
      memoryEnabled: settings.memoryEnabled,
    }),
    ...(settings.webResearch ? webTools(settings.model) : {}),
  }

  /**
   * Der System-Prompt als DREI Bloecke mit zwei Cache-Breakpoints.
   *
   * Anthropic cacht praefixweise: alles VOR einem Breakpoint wird beim ersten
   * Aufruf einmal geschrieben (1,25x Eingabepreis) und danach nur noch gelesen
   * (0,1x). Der grosse Gewinn liegt nicht zwischen zwei Nachrichten, sondern
   * INNERHALB eines Laufs: ein agentischer Auftrag macht bis zu `maxSteps`
   * API-Aufrufe, und jeder schickt den kompletten System-Prompt erneut mit.
   *
   * Warum drei statt zwei:
   *  1. `core` — Regeln und Karte der App, fuer jeden Nutzer identisch, aendert
   *     sich nur mit einem Deployment. Eigener Breakpoint, damit eine
   *     Einstellungsaenderung diese ~4.000 Tokens NICHT entwertet.
   *  2. `user` — Haltung, Konten, Kategorien, Speicher, Anweisungen. Innerhalb
   *     einer Sitzung stabil, aendert sich beim Speichern der Einstellungen.
   *     Eigener Breakpoint: ab der zweiten Nachricht danach wieder ein Treffer.
   *  3. `volatile` — aktuelle Seite und Datum, ohne Breakpoint. Laege die Route
   *     im gecachten Teil, wuerde jeder Navigationsklick den Praefix entwerten.
   *
   * Sie gehen ueber `instructions` (nicht `messages`): diese SDK-Version lehnt
   * System-Nachrichten im Nachrichten-Array ab ("System messages are not
   * allowed in the prompt or messages fields"). `instructions` nimmt ein Array
   * von System-Nachrichten; der Anthropic-Provider macht daraus ein
   * `system`-Array mit `cache_control` je Block (siehe @ai-sdk/anthropic,
   * convertToAnthropicMessagesPrompt).
   *
   * Achtung bei kuenftigen Aenderungen: `tools` rendert VOR `system`. Wird der
   * Werkzeugguertel pro Request unterschiedlich sortiert oder um ein
   * zeitabhaengiges Feld ergaenzt, trifft kein Breakpoint. Kontrolle laeuft
   * ueber cacheReadTokens im run.finish-Log.
   */
  const ephemeral = { anthropic: { cacheControl: { type: 'ephemeral' } } } as const
  const instructions: SystemModelMessage[] = [
    { role: 'system', content: systemBlocks.core, providerOptions: ephemeral },
    { role: 'system', content: systemBlocks.user, providerOptions: ephemeral },
    { role: 'system', content: systemBlocks.volatile },
  ]

  await log({
    event: 'run.start',
    message: titelQuelle.slice(0, 200),
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
    instructions,
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
    // Zwei Dinge je Schritt, zusammengeführt (prepareStep darf nur EIN Ergebnis liefern):
    //  1. die Container-ID (siehe oben),
    //  2. ein Cache-Haltepunkt an der LETZTEN Nachricht. Jeder der bis zu 24 Schritte schickt das bisherige Gespräch samt
    //     Werkzeug-Ergebnissen erneut mit; mit dem beweglichen Haltepunkt wird der unveränderte Anfang nur noch zu 10 %
    //     berechnet (im Wochenlauf rund 55 % weniger Kosten). Zusammen mit den zwei System-Blöcken sind das 3 von
    //     höchstens 4 erlaubten Haltepunkten; `cacheLetzteNachricht` entfernt alte, damit es nie mehr werden.
    prepareStep: ({ steps, messages }) => ({
      ...forwardAnthropicContainerIdFromLastStep({ steps }),
      messages: cacheLetzteNachricht(messages),
    }),

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
          // Eigene Felder statt nur `usage`: ob der Prompt-Cache greift, ist die
          // einzige Zahl, an der man einen stillen Cache-Killer erkennt (ein
          // zeitabhaengiges Feld im stabilen Block, umsortierte Werkzeuge).
          // cacheRead = 0 bei einem MEHRSCHRITTIGEN Lauf heisst: der
          // Breakpoint trifft nicht. Bei einem Ein-Schritt-Lauf ist 0 normal —
          // dann wurde nur geschrieben.
          cacheReadTokens: final.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
          cacheWriteTokens: final.totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0,
        },
      })

      // Titel erst am Ende: hier steht fest, dass der Lauf überhaupt zu einer
      // Antwort geführt hat, und der Titel blockiert den Stream nicht.
      if (isNewConversation && titelQuelle) {
        await titleConversation(supabase, activeConversationId, user.id, titelQuelle)
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
      instructions: TITLE_SYSTEM_PROMPT,
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

/**
 * „Neu generieren“: ersetzt die Antwort(en) NACH der letzten Nutzernachricht, außer dem neuen
 * Platzhalter. Zeilen mit offenen oder entschiedenen Vorschlägen (`ai_pending_actions`) bleiben — der
 * Vorschlag wäre sonst ohne Antwort-Zeile weiter freigebbar. Werkzeugaufrufe hängen per Cascade an
 * der Antwort-Zeile. Beschränkt auf „nach der letzten Nutzerzeile“, damit ein Doppelklick oder ein
 * zweiter Tab nicht die Antwort eines früheren Zuges löscht.
 */
async function ersetzeLetzteAntwort(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  conversationId: string,
  behalteId: string,
) {
  const { data: letzteNutzer } = await supabase
    .from('ai_messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!letzteNutzer) return

  const { data: alte } = await supabase
    .from('ai_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .gt('created_at', letzteNutzer.created_at)
    .neq('id', behalteId)
  const ids = (alte ?? []).map((a) => a.id)
  if (ids.length === 0) return

  const { data: mitVorschlag } = await supabase
    .from('ai_pending_actions')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', ids)
  const geschuetzt = new Set((mitVorschlag ?? []).map((p) => p.message_id))
  const loeschen = ids.filter((id) => !geschuetzt.has(id))
  if (loeschen.length > 0) {
    await supabase.from('ai_messages').delete().eq('user_id', userId).in('id', loeschen)
  }
}
