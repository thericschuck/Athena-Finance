import { generateText, stepCountIs, tool } from 'ai'
import { anthropic, type AnthropicProviderOptions } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { getAthenaSettings, supportsThinking } from '@/lib/assistant/settings'
import { estimateCostUsd } from '@/lib/assistant/cost'
import { createLogger } from '@/lib/assistant/logger'
import { resolveScopeForUser } from '@/lib/haushalt/resolve-user'
import { buildAccountTools } from '@/lib/assistant/tools/accounts'
import { buildTransactionTools } from '@/lib/assistant/tools/transactions'
import { buildPlanningTools } from '@/lib/assistant/tools/planning'
import { buildForecastTools } from '@/lib/assistant/tools/forecast'
import { buildPortfolioTools } from '@/lib/assistant/tools/portfolio'
import { buildDataQualityTools } from '@/lib/assistant/tools/data-quality'
import { buildInsightTools } from '@/lib/assistant/tools/insights'
import { buildObligationTools } from '@/lib/assistant/tools/obligations'
import { buildSavingsPlanTools } from '@/lib/assistant/tools/savings-plans'
import { buildAccountHistoryTools } from '@/lib/assistant/tools/account-history'
import { buildTaxTools } from '@/lib/assistant/tools/tax'
import { buildRecurringTools } from '@/lib/assistant/tools/recurring'
import { buildCategoryTools } from '@/lib/assistant/tools/categories'
import {
  REVIEW_LAST_KEY, REVIEW_LOCK_KEY, REVIEW_SETTINGS_KEY, REVIEW_SYSTEM_PROMPT, REVIEW_TYP,
  cacheLetzteNachricht, istFaellig, istGesperrt, leseReviewConfig, waehleBefunde, type Befund,
} from '@/lib/assistant/review-regeln'

type DB = SupabaseClient<Database>

export type ReviewErgebnis =
  | { status: 'uebersprungen'; grund: string }
  | { status: 'fertig'; befunde: number; schritte: number; kostenUsd: number | null; zusammenfassung: string; abgebrochen: boolean }

/**
 * Athena-Wochenlauf: ein LLM-Lauf ohne Chat-Nachricht (Schicht 4 aus docs/athenas-takt.html).
 *
 * Bewusst enger als der Chat:
 *  - NUR Lese-Werkzeuge. Keine Vorschlags-Werkzeuge, kein Speicher, keine Wissensbasis, kein Web: ein Lauf, der
 *    unbeaufsichtigt Bankdaten liest, bekommt nichts, womit eine eingeschleuste Anweisung etwas bewirken könnte.
 *  - Die einzige Ausgabe ist `meldeBefund`. Was dort ankommt, wird bereinigt (review-regeln.ts), auf fünf
 *    begrenzt und als `insights`-Zeile (Typ athena_review) angelegt — ohne Bestätigungsschritt, weil ein Hinweis
 *    kein Geld bewegt und per Klick verschwindet. Das ist die schmale Ausnahme "B" aus der Takt-Notiz.
 *  - Eigene, schlanke Anweisung statt der Chat-Persona: kürzer (günstiger) und ohne die Schreib-Regeln.
 *
 * Läuft mit dem Service-Role-Client aus dem Cron; jedes Werkzeug filtert wie im Chat auf `userId`.
 */
/** Ein Lauf endet nach spätestens 240 s: Vercel kappt bei 300 s, und ein gekappter Lauf würde seine Befunde verlieren. */
const REVIEW_ZEITLIMIT_MS = 240_000

export async function fuehreReviewAus(supabase: DB, userId: string, opts: { force?: boolean } = {}): Promise<ReviewErgebnis> {
  const log = createLogger(supabase, userId, null)
  const jetzt = new Date()

  const [settings, cfgRow, lastRow, lockRow] = await Promise.all([
    getAthenaSettings(supabase, userId),
    supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', REVIEW_SETTINGS_KEY).maybeSingle(),
    supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', REVIEW_LAST_KEY).maybeSingle(),
    supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', REVIEW_LOCK_KEY).maybeSingle(),
  ])
  // Günstiger als der Chat-Standard: mittlere Denktiefe, 14 Schritte. Über user_settings.athena_review änderbar.
  const cfg = leseReviewConfig(cfgRow.data?.value, { enabled: true, model: settings.model, effort: 'medium', maxSteps: 14 })
  if (!cfg.enabled) return { status: 'uebersprungen', grund: 'Wochenlauf ist in user_settings.athena_review deaktiviert.' }
  // Auch `force` umgeht die Sperre nicht: parallele Läufe erzeugen Dubletten und kosten doppelt.
  if (istGesperrt(lockRow.data?.value, jetzt)) return { status: 'uebersprungen', grund: 'Ein Wochenlauf läuft bereits.' }
  if (!opts.force && !istFaellig(lastRow.data?.value, jetzt)) {
    return { status: 'uebersprungen', grund: 'Der letzte Lauf liegt weniger als 5 Tage zurück.' }
  }

  await supabase.from('user_settings').upsert(
    { user_id: userId, key: REVIEW_LOCK_KEY, value: jetzt.toISOString() as unknown as Json },
    { onConflict: 'user_id,key' },
  )

  // Alte, nie angefasste Befunde archivieren, damit der Feed kein Friedhof wird.
  const vor14 = new Date(jetzt.getTime() - 14 * 86_400_000).toISOString()
  await supabase.from('insights').update({ dismissed_at: jetzt.toISOString() })
    .eq('user_id', userId).eq('type', REVIEW_TYP).is('dismissed_at', null).lt('created_at', vor14)

  const { data: offene } = await supabase.from('insights').select('title')
    .eq('user_id', userId).is('dismissed_at', null)
  const offeneTitel = (offene ?? []).map(o => o.title)

  // Wochenlauf läuft ohne Request/Cookie mit Service-Role: Scope 'ich' des Nutzers (eigene + geteilte Konten).
  const scopeCtx = await resolveScopeForUser(supabase, userId, 'ich')

  const befunde: Befund[] = []
  const tools = {
    ...buildAccountTools(supabase, scopeCtx),
    ...buildTransactionTools(supabase, scopeCtx),
    ...buildPlanningTools(supabase, scopeCtx),
    ...buildForecastTools(supabase, scopeCtx),
    ...buildPortfolioTools(supabase, scopeCtx),
    ...buildDataQualityTools(supabase, scopeCtx),
    ...buildInsightTools(supabase, scopeCtx),
    ...buildObligationTools(supabase, scopeCtx),
    ...buildSavingsPlanTools(supabase, scopeCtx),
    ...buildAccountHistoryTools(supabase, scopeCtx),
    ...buildTaxTools(supabase, scopeCtx),
    ...buildRecurringTools(supabase, scopeCtx),
    ...buildCategoryTools(supabase, scopeCtx),
    meldeBefund: tool({
      description:
        'Meldet EINEN Befund an Eric (landet als Hinweis auf dem Dashboard). Das ist deine einzige Ausgabe. ' +
        'Nur Neues, Belegtes, Handlungsrelevantes; höchstens fünf pro Lauf.',
      inputSchema: z.object({
        severity: z.enum(['info', 'warning']).describe('warning nur bei Geldverlust, Frist oder Datenfehler'),
        title: z.string().min(5).max(140).describe('Höchstens zwölf Wörter'),
        body: z.string().min(10).max(700).describe('Zahl, Zeitraum, Konsequenz und ein nächster Schritt'),
        quellen: z.array(z.string().max(60)).max(4).describe('Namen der Werkzeuge, aus denen die Zahlen stammen'),
      }),
      execute: async (b) => {
        if (befunde.length >= 5) return { abgelehnt: 'Mehr als fünf Befunde pro Lauf werden nicht angenommen.' }
        befunde.push(b)
        return { angenommen: true, bisher: befunde.length }
      },
    }),
  }

  await log({ event: 'run.start', message: 'Athena-Wochenlauf', meta: { kind: 'review', model: cfg.model, effort: cfg.effort, maxSteps: cfg.maxSteps, toolCount: Object.keys(tools).length } })
  const start = Date.now()

  const verbrauch = { inputTokens: 0, outputTokens: 0, inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }
  let schritte = 0
  let text = ''
  let abgebrochen = false
  let finishReason: string | undefined

  try {
    try {
      const result = await generateText({
        model: anthropic(cfg.model),
        // Cache-Haltepunkt am Ende von Werkzeugen und Systemprompt (identisch in jedem Schritt) ...
        instructions: [{ role: 'system', content: REVIEW_SYSTEM_PROMPT, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } }],
        prompt: `Heute ist ${jetzt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })}. Starte den Wochenlauf.`,
        tools,
        stopWhen: stepCountIs(cfg.maxSteps),
        maxOutputTokens: 8_000,
        // ... und einer, der mit dem wachsenden Gespraech mitwandert.
        prepareStep: ({ messages }) => ({ messages: cacheLetzteNachricht(messages) }),
        abortSignal: AbortSignal.timeout(REVIEW_ZEITLIMIT_MS),
        providerOptions: supportsThinking(cfg.model)
          ? { anthropic: { thinking: { type: 'adaptive', display: 'summarized' }, effort: cfg.effort } satisfies AnthropicProviderOptions }
          : undefined,
        // Nach jedem Schritt: Dauer, Werkzeuge, Tokens. Ohne das ist ein langsamer Lauf eine Black Box.
        onStepFinish: async (step) => {
          schritte++
          verbrauch.inputTokens += step.usage?.inputTokens ?? 0
          verbrauch.outputTokens += step.usage?.outputTokens ?? 0
          verbrauch.inputTokenDetails.noCacheTokens += step.usage?.inputTokenDetails?.noCacheTokens ?? 0
          verbrauch.inputTokenDetails.cacheReadTokens += step.usage?.inputTokenDetails?.cacheReadTokens ?? 0
          verbrauch.inputTokenDetails.cacheWriteTokens += step.usage?.inputTokenDetails?.cacheWriteTokens ?? 0
          await log({
            level: 'debug',
            event: 'step.finish',
            message: step.toolCalls.map(c => c.toolName).join(', ') || 'Antwort',
            durationMs: Date.now() - start,
            meta: { kind: 'review', schritt: schritte, input: step.usage?.inputTokens ?? 0, output: step.usage?.outputTokens ?? 0, cacheRead: step.usage?.inputTokenDetails?.cacheReadTokens ?? 0, cacheWrite: step.usage?.inputTokenDetails?.cacheWriteTokens ?? 0 },
          })
        },
      })
      text = result.text
      finishReason = result.finishReason
    } catch (e) {
      // Zeitlimit: mit dem weitermachen, was bis dahin gemeldet wurde. Jeder andere Fehler bricht ab.
      if (!(e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'))) throw e
      abgebrochen = true
      finishReason = 'timeout'
      await log({ level: 'warn', event: 'run.limit', message: `Wochenlauf nach ${REVIEW_ZEITLIMIT_MS / 1000} s abgebrochen`, meta: { kind: 'review', schritte } })
    }

    const auswahl = waehleBefunde(befunde, offeneTitel)
    if (auswahl.length > 0) {
      const { error } = await supabase.from('insights').insert(auswahl.map(b => ({
        user_id: userId,
        type: REVIEW_TYP,
        severity: b.severity,
        title: b.title,
        body: b.body,
        payload: { quellen: b.quellen, model: cfg.model, lauf: jetzt.toISOString() } as Json,
      })))
      if (error) throw new Error(error.message)
    }
    // Ein abgebrochener Lauf zählt nicht als erledigt, damit der nächste Auslöser es erneut versucht.
    if (!abgebrochen) {
      await supabase.from('user_settings').upsert(
        { user_id: userId, key: REVIEW_LAST_KEY, value: jetzt.toISOString() as unknown as Json },
        { onConflict: 'user_id,key' },
      )
    }

    const kostenUsd = estimateCostUsd(cfg.model, verbrauch)
    await log({
      event: 'run.finish',
      message: text.slice(0, 200),
      durationMs: Date.now() - start,
      meta: {
        kind: 'review', steps: schritte, finishReason, usage: verbrauch,
        model: cfg.model, gemeldet: befunde.length, angelegt: auswahl.length, kostenUsd, abgebrochen,
      },
    })
    return { status: 'fertig', befunde: auswahl.length, schritte, kostenUsd, zusammenfassung: text.slice(0, 300), abgebrochen }
  } catch (e) {
    await log({ level: 'error', event: 'run.error', message: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start, meta: { kind: 'review' } })
    throw e
  } finally {
    // Sperre immer lösen, auch nach Fehler oder Zeitlimit; sonst blockiert sie den nächsten Lauf bis zum Ablauf der TTL.
    await supabase.from('user_settings').delete().eq('user_id', userId).eq('key', REVIEW_LOCK_KEY)
  }
}
