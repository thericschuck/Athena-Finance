/**
 * Anzeigename des angemeldeten Nutzers in Athenas Texten (reine Funktionen, ohne Imports).
 *
 * Die Prompt-Texte bleiben feste Konstanten mit Platzhaltern; erst beim Bauen wird der Name eingesetzt:
 *   {{n}}  Nominativ, mitten im Satz     „Eric“      | „der Nutzer“
 *   {{N}}  Nominativ, Satzanfang          „Eric“      | „Der Nutzer“
 *   {{d}}  Dativ                          „Eric“      | „dem Nutzer“
 *   {{a}}  Akkusativ                      „Eric“      | „den Nutzer“
 *   {{g:Wort|Ersatz}}  Genitiv + Wort     „Erics Wort“ | „Ersatz“ (voller Ersatztext, grammatisch passend geschrieben)
 * Ein Durchlauf mit Funktions-Ersetzung: ein Name, der selbst „{{…}}“ enthielte, wird nie erneut ausgewertet
 * (und die Bereinigung entfernt Klammern ohnehin).
 */

const MAX_NAME = 30

/**
 * Macht aus dem gespeicherten Anzeigenamen einen sicheren Vornamen oder `null`.
 * - nur der erste Namensteil („Eric Schuck“ -> „Eric“): Anrede, nicht Aktenzeichen
 * - nur Buchstaben, Ziffern, Bindestrich, Apostroph: keine Zeilenumbrüche, Anführungszeichen, Klammern,
 *   Backticks oder Markdown, damit der Name keine Anweisung einschleusen kann
 * - eine E-Mail-Adresse ist kein Name (-> `null`); höchstens 30 Zeichen
 */
export function anzeigeName(roh: string | null | undefined): string | null {
  if (typeof roh !== 'string') return null
  const erstes = roh.normalize('NFC').trim().split(/\s+/)[0] ?? ''
  if (erstes.includes('@')) return null
  const sauber = erstes
    .replace(/[^\p{L}\p{M}\p{N}'’-]/gu, '')
    .replace(/^['’-]+|['’-]+$/g, '')
    .slice(0, MAX_NAME)
  return sauber.length > 0 ? sauber : null
}

/** Genitiv-s: „Erics“, aber „Max’“ nach s, ß, x, z. */
export function genitivVon(name: string): string {
  return /[sßxz]$/i.test(name) ? `${name}’` : `${name}s`
}

const PLATZHALTER = /\{\{(?:([nNda])|g:([^|}]*)\|([^}]*))\}\}/g

/** Setzt den Namen in einen Text mit Platzhaltern ein. `name` kommt bereits bereinigt (anzeigeName) oder `null`. */
export function personalisiere(text: string, name: string | null): string {
  return text.replace(PLATZHALTER, (_m, form: string | undefined, wort: string | undefined, ersatz: string | undefined) => {
    if (form) {
      if (name) return name
      return { n: 'der Nutzer', N: 'Der Nutzer', d: 'dem Nutzer', a: 'den Nutzer' }[form] ?? ''
    }
    return name ? `${genitivVon(name)} ${wort}` : (ersatz ?? '')
  })
}
