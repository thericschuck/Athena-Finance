import { tool } from 'ai'
import { WRITE_ACTIONS, proposeWriteAction, type WriteActionName } from '@/lib/assistant/actions'
import type { DB, AthenaToolOptions } from '@/lib/assistant/tools/shared'

/**
 * Erzeugt aus jeder Definition in WRITE_ACTIONS ein gleichnamiges Werkzeug, das
 * die Aktion NICHT ausführt, sondern in `ai_pending_actions` einreiht.
 *
 * Generiert statt handgeschrieben, weil sonst zwei Listen synchron gehalten
 * werden müssten: eine neue Aktion in actions.ts wäre für das Modell erst dann
 * sichtbar, wenn jemand daran denkt, hier ein Werkzeug nachzutragen. So gibt es
 * genau eine Stelle, an der eine Schreibaktion definiert wird.
 */
export function buildProposalTools(supabase: DB, userId: string, options: AthenaToolOptions) {
  const entries = Object.entries(WRITE_ACTIONS).map(([name, definition]) => [
    name,
    tool({
      description:
        definition.description +
        ' — WICHTIG: Dieses Werkzeug führt nichts aus. Es erzeugt einen Vorschlag, den der Nutzer ' +
        'im Chat bestätigen muss. Antworte danach entsprechend ("vorgeschlagen", nicht "erledigt").',
      inputSchema: definition.schema,
      execute: async (input: unknown) => {
        const actionName = name as WriteActionName
        // `proposeWriteAction` prüft erst (validate), dann erzeugt sie den Vorschlag: eine
        // Aktion, die am aktuellen Datenstand nicht ausführbar ist (Kategorie mit
        // Unterkategorien löschen, dritte Ebene anlegen), landet so als Werkzeugfehler beim
        // Modell statt als Karte bei Eric, die beim Klick scheitert. Der Fehler landet über
        // onStepFinish ohnehin in ai_tool_calls und im System-Log — hier deshalb kein zweiter
        // Log-Eintrag.
        //
        // `details` gehen bewusst durch die Werkzeugausgabe und nicht über eine eigene Spalte:
        // so landen sie mit den Nachrichten-Parts in ai_messages und stehen beim Wiederöffnen
        // der Session unverändert wieder da.
        return proposeWriteAction(
          actionName,
          input,
          { supabase, userId },
          { conversationId: options.conversationId, messageId: options.messageId, logger: options.logger },
        )
      },
    }),
  ])
  return Object.fromEntries(entries) as Record<string, ReturnType<typeof tool>>
}
