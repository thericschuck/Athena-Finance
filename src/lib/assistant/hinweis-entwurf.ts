/**
 * Aus einem Dashboard-Hinweis („Im Chat“) wird ein fertiger Prompt für das Eingabefeld.
 *
 * Der Nutzer klickt am Hinweis auf „Im Chat“ und landet in Athena — ohne diesen Entwurf in einem
 * leeren Chat, in dem er den Hinweis erst abtippen müsste. Der Entwurf steht editierbar im Eingabefeld
 * und wird erst auf Klick gesendet (kein stilles Senden: jede Nachricht kostet und zählt aufs Tageslimit).
 *
 * Rein, ohne Server-/Browser-Abhängigkeit.
 */

export interface HinweisFuerEntwurf {
  title: string
  body: string | null
  type: string
  severity: string
}

const SCHWERE: Record<string, string> = { info: 'Zur Info', warning: 'Achtung', critical: 'Kritisch' }

/** Woher der Hinweis kommt — bestimmt die Schlussfrage. */
const HERKUNFT: Record<string, string> = { athena_review: 'Wochenlauf', reminder: 'Erinnerung' }

const SCHLUSSFRAGE: Record<string, string> = {
  athena_review:
    'Prüf das gegen meine aktuellen Zahlen: Stimmt das noch, wie groß ist der Effekt in Euro, und was ist der erste konkrete Schritt?',
  reminder: 'Was genau muss ich dafür tun, bis wann, und was passiert, wenn ich es lasse?',
}
const STANDARD_FRAGE =
  'Was steckt dahinter, wie sicher ist das, und was würdest du mir konkret empfehlen?'

/** Zeilenumbrüche im Titel würden den Entwurf zerreißen; Länge begrenzt, damit der Prompt kurz bleibt. */
function einzeilig(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export function hinweisEntwurf(h: HinweisFuerEntwurf): string {
  const herkunft = HERKUNFT[h.type]
  const marken = [herkunft, SCHWERE[h.severity]].filter(Boolean).join(', ')
  const kopf = `Zu diesem Hinweis auf meinem Dashboard${marken ? ` (${marken})` : ''}: „${einzeilig(h.title, 160)}“`
  const body = h.body?.trim() ? `\n${h.body.trim().slice(0, 1200)}` : ''
  return `${kopf}${body}\n\n${SCHLUSSFRAGE[h.type] ?? STANDARD_FRAGE}`
}
