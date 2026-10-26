/**
 * Reine Textlogik für @-Bezüge im Eingabefeld: welches `@…` ist am Cursor gerade offen, wie
 * wird die Auswahl eingesetzt, welche gewählten Bezüge stehen beim Senden noch im Text.
 * Die Auswahlliste selbst (Optionen, Filter) kommt aus mentions.ts.
 */

import type { Mention } from './mentions.ts'

export interface MentionToken {
  /** Position des `@`. */
  start: number
  /** Ende des Tokens (= Cursor). */
  ende: number
  /** Text hinter dem `@` bis zum Cursor, ohne Leerraum. */
  suche: string
}

/**
 * Das offene `@`-Token links vom Cursor: `@` am Textanfang oder nach Leerzeichen/Zeilenumbruch,
 * danach nur Nicht-Leerraum bis zum Cursor. Mit Leerzeichen dazwischen ist das Token beendet —
 * so öffnet ein „@“ mitten in einem fertigen Satz kein Menü mehr.
 */
export function aktivesToken(text: string, cursor: number): MentionToken | null {
  if (cursor < 1 || cursor > text.length) return null
  for (let i = cursor - 1; i >= 0; i--) {
    const z = text[i]
    if (/\s/.test(z)) return null
    if (z === '@') {
      if (i > 0 && !/\s/.test(text[i - 1])) return null
      return { start: i, ende: cursor, suche: text.slice(i + 1, cursor) }
    }
  }
  return null
}

/** Setzt `@<label> ` an die Stelle des Tokens; liefert Text und neue Cursorposition. */
export function setzeMention(
  text: string,
  token: MentionToken,
  label: string,
): { text: string; cursor: number } {
  const einsatz = `@${label} `
  // Folgt direkt ein Leerzeichen, nicht doppelt setzen.
  const rest = text.slice(token.ende)
  const rest2 = rest.startsWith(' ') ? rest.slice(1) : rest
  const neu = text.slice(0, token.start) + einsatz + rest2
  return { text: neu, cursor: token.start + einsatz.length }
}

/** `@<label>` steht im Text und endet an Textende, Leerraum oder Satzzeichen. */
function steht(text: string, label: string): boolean {
  const marke = `@${label}`
  let von = 0
  for (;;) {
    const i = text.indexOf(marke, von)
    if (i < 0) return false
    const davor = i === 0 || /\s/.test(text[i - 1])
    const danach = text[i + marke.length]
    if (davor && (danach === undefined || /[\s.,;:!?)]/.test(danach))) return true
    von = i + 1
  }
}

/** Nur die gewählten Bezüge, deren `@<Label>` noch im Text steht; ohne Doppelte. */
export function gueltigeMentions(text: string, gewaehlt: Mention[]): Mention[] {
  const gesehen = new Set<string>()
  return gewaehlt.filter((m) => {
    const k = `${m.typ}:${m.id}`
    if (gesehen.has(k) || !m.label || !steht(text, m.label)) return false
    gesehen.add(k)
    return true
  })
}

/**
 * Schlüssel, unter dem die Labels der @-Bezüge an den Textteil einer Nutzernachricht gehängt werden
 * (`providerMetadata.athena.mentions`). Der Anthropic-Provider liest nur seinen eigenen Schlüssel,
 * das Modell sieht davon nichts — die Anzeige braucht es, um nach einem Neuladen zu wissen, wie weit
 * ein „@Girokonto DKB“ reicht (Labels dürfen Leerzeichen enthalten).
 */
export const MENTION_META_SCHLUESSEL = 'athena'

/**
 * Die Labels aus den Metadaten eines Textteils; alles Unerwartete ergibt eine leere Liste. Die Einträge
 * sind ganze Bezüge (`{ typ, id, label }`, damit „Neu generieren“ sie erneut senden kann); ältere
 * Nachrichten haben nur Label-Strings — beides wird gelesen.
 */
export function mentionLabelsAus(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return []
  const roh = (meta as Record<string, unknown>)[MENTION_META_SCHLUESSEL]
  const liste = roh && typeof roh === 'object' ? (roh as Record<string, unknown>).mentions : undefined
  if (!Array.isArray(liste)) return []
  return liste.flatMap((e) => {
    const label = typeof e === 'string' ? e : (e as { label?: unknown } | null)?.label
    return typeof label === 'string' && label.length > 0 ? [label] : []
  })
}

export interface TextSegment {
  text: string
  mention: boolean
}

/**
 * Zerlegt eine Nachricht in Teile, damit die @-Bezüge hervorgehoben werden können. Ein Treffer ist
 * `@<Label>` an Wortgrenze (wie `steht`). Überlappende Treffer — ein Label ist Teil eines längeren —
 * ergeben nur den längeren.
 */
export function zerlegeMentions(text: string, labels: string[]): TextSegment[] {
  const bereiche: [number, number][] = []
  for (const label of labels) {
    const marke = `@${label}`
    let von = 0
    for (;;) {
      const i = text.indexOf(marke, von)
      if (i < 0) break
      const davor = i === 0 || /\s/.test(text[i - 1])
      const danach = text[i + marke.length]
      if (davor && (danach === undefined || /[\s.,;:!?)]/.test(danach))) {
        bereiche.push([i, i + marke.length])
      }
      von = i + 1
    }
  }
  if (bereiche.length === 0) return [{ text, mention: false }]

  bereiche.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const aus: TextSegment[] = []
  let pos = 0
  for (const [start, ende] of bereiche) {
    if (start < pos) continue
    if (start > pos) aus.push({ text: text.slice(pos, start), mention: false })
    aus.push({ text: text.slice(start, ende), mention: true })
    pos = ende
  }
  if (pos < text.length) aus.push({ text: text.slice(pos), mention: false })
  return aus
}
