import { ANNAHMEN_KEY } from './annahmen.ts'
import { UEBERSCHREIBUNG_KEY } from './einmalig.ts'
import { tageZwischen } from './datum.ts'

/**
 * Regeln, die die Prognose je Haushalts-Scope (ich | partner | gemeinsam) unterscheiden. Reine Funktionen,
 * keine Imports außer Datums-Helfern, damit `node --test` die Datei direkt laden kann.
 *
 *  Schlüssel   Annahmen und Einmalposten-Auswahl liegen in `user_settings` des Handelnden, aber je Scope getrennt:
 *              'ich' behält den bisherigen Schlüssel exakt, die anderen bekommen das Suffix `:partner` / `:gemeinsam`.
 *  Steuer      ist persönlich (owner-only) und gehört nur zur Ansicht 'ich'.
 *  Historie    Ein Scope lernt erst ab dem Tag, an dem er vollständig ist: dem Tag, an dem das jüngste seiner liquiden Konten
 *              mit Buchungen beginnt (Strukturbruch: ein später dazugekommenes geteiltes Konto ändert, was „Gemeinsam“ ist).
 *              'ich' lernt wie bisher aus allem. Unter 3 Monaten Historie im Scope gibt es keine Prognose, nur einen Hinweis.
 */

export type ScopeKurz = 'ich' | 'partner' | 'gemeinsam'

export const MIN_HISTORIE_TAGE = 90

export const STEUER_HINWEIS = 'Steuern sind persönlich und fließen nur in der Ansicht Ich ein.'
export const ZU_WENIG_HISTORIE_HINWEIS =
  'Zu wenig Historie: Für diese Ansicht gibt es erst weniger als 3 Monate Buchungen aller Konten. Die Prognose startet, sobald genug Verlauf da ist.'

export function annahmenKey(scope: ScopeKurz): string {
  return scope === 'ich' ? ANNAHMEN_KEY : `${ANNAHMEN_KEY}:${scope}`
}

export function ueberschreibungKey(scope: ScopeKurz): string {
  return scope === 'ich' ? UEBERSCHREIBUNG_KEY : `${UEBERSCHREIBUNG_KEY}:${scope}`
}

export function steuerErlaubt(scope: ScopeKurz): boolean {
  return scope === 'ich'
}

/**
 * Ab wann der Scope vollständig ist: das späteste „erste Buchungsdatum“ der liquiden Konten, die überhaupt Buchungen haben.
 * 'ich': null (keine Begrenzung, bisheriges Verhalten).
 */
export function lernStart(scope: ScopeKurz, ersteBuchungJeKonto: ReadonlyMap<string, string>, liquideKontoIds: readonly string[]): string | null {
  if (scope === 'ich') return null
  let start: string | null = null
  for (const id of liquideKontoIds) {
    const d = ersteBuchungJeKonto.get(id)
    if (d && (start === null || d > start)) start = d.slice(0, 10)
  }
  return start
}

/** Reicht die Historie ab `start` bis `heute`? Ohne Start (Scope 'ich') immer. */
export function historieReicht(start: string | null, heute: string): boolean {
  return start === null || tageZwischen(start, heute) >= MIN_HISTORIE_TAGE
}
