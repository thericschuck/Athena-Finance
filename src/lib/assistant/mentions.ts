/**
 * @-Bezüge im Eingabefeld: der Nutzer verweist auf ein konkretes Konto, eine Kategorie, eine
 * Depotposition, ein Krypto-Asset, ein Inventarstück oder ein Sparziel. Athena bekommt den Bezug
 * fest mit (inklusive Kurzfakten aus der Datenbank) und muss nicht raten, welches „DKB“ gemeint ist.
 *
 * Rein und ohne Server-/Browser-Abhängigkeit: der Client baut die Auswahl daraus, die Route
 * bereinigt damit, was aus dem Request kommt (siehe mention-daten.ts für den Serverteil).
 */

export const MENTION_TYPEN = ['konto', 'kategorie', 'depot', 'krypto', 'inventar', 'sparziel'] as const
export type MentionTyp = (typeof MENTION_TYPEN)[number]

export const MENTION_LABEL: Record<MentionTyp, string> = {
  konto: 'Konto',
  kategorie: 'Kategorie',
  depot: 'Depot',
  krypto: 'Krypto',
  inventar: 'Inventar',
  sparziel: 'Sparziel',
}

/** Was mit der Nachricht mitgeschickt wird. */
export interface Mention {
  typ: MentionTyp
  id: string
  label: string
}

/** Eintrag der Auswahl; `sub` ist die graue Zweitzeile (Institut, Pfad, ISIN …). */
export interface MentionOption extends Mention {
  sub?: string
}

export const MAX_MENTIONS = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Macht aus dem, was im Request steht, eine saubere Liste: nur bekannte Typen, nur UUIDs,
 * Label eingekürzt und von Zeilenumbrüchen befreit (es landet im Prompt), keine Doppelten.
 * Alles andere fällt stillschweigend heraus — der Client ist nicht vertrauenswürdig.
 */
export function bereinigeMentions(roh: unknown): Mention[] {
  if (!Array.isArray(roh)) return []
  const gesehen = new Set<string>()
  const aus: Mention[] = []
  for (const eintrag of roh) {
    if (!eintrag || typeof eintrag !== 'object') continue
    const { typ, id, label } = eintrag as Record<string, unknown>
    if (typeof typ !== 'string' || !(MENTION_TYPEN as readonly string[]).includes(typ)) continue
    if (typeof id !== 'string' || !UUID.test(id)) continue
    const schluessel = `${typ}:${id.toLowerCase()}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    aus.push({
      typ: typ as MentionTyp,
      id: id.toLowerCase(),
      label: (typeof label === 'string' ? label : '').replace(/\s+/g, ' ').trim().slice(0, 80),
    })
    if (aus.length >= MAX_MENTIONS) break
  }
  return aus
}

/** Schlüssel für Filter und Auswahl: Kleinschreibung, Umlaute bleiben. */
export function filtereMentionOptionen(
  optionen: MentionOption[],
  suche: string,
  limit = 30,
): MentionOption[] {
  const q = suche.trim().toLocaleLowerCase('de-DE')
  const treffer = q
    ? optionen.filter((o) =>
        `${o.label} ${o.sub ?? ''} ${MENTION_LABEL[o.typ]}`.toLocaleLowerCase('de-DE').includes(q),
      )
    : optionen
  return treffer.slice(0, limit)
}
