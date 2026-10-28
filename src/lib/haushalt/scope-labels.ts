/**
 * Beschriftung des Scope-Umschalters: pro Scope ein einzelnes sichtbares Zeichen plus der volle Text
 * (aria-label/title). Reine Logik ohne React/Supabase, damit sie testbar bleibt.
 *
 * - Ich: Anfangsbuchstabe des eigenen Namens, sonst „I“.
 * - Partner: Anfangsbuchstabe des Partners, sonst „P“. Gleicht er dem eigenen, nimmt der Partner die ersten
 *   zwei Zeichen („Em“ -> „EM“); hilft das nicht (Ein-Zeichen-Name), fallen beide auf „I“/„P“ zurueck.
 * - Gemeinsam: „&“. Bewusst ein Symbol: Namen beginnen nie mit einem Symbol (Satz-/Sonderzeichen am
 *   Anfang werden uebersprungen), „&“ kann also nicht mit einem Namenszeichen kollidieren; ein Buchstabe
 *   („G“) kaeme bei „Greta“ in Konflikt.
 *
 * „Zeichen“ = Graphem-Cluster (Intl.Segmenter), nicht UTF-16-Einheit: Emoji und kombinierende Akzente bleiben ganz.
 */

import type { ScopeName } from './scope.ts'

export const GEMEINSAM_ZEICHEN = '&'
export const ICH_FALLBACK = 'I'
export const PARTNER_FALLBACK = 'P'

export type ScopeAnzeige = {
  /** Sichtbares Zeichen (GROSSBUCHSTABEN). */
  zeichen: string
  /** Voller Text fuer aria-label und title. */
  text: string
}

const SEGMENTER = new Intl.Segmenter('de', { granularity: 'grapheme' })
const VORSPANN = /^[^\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]+/u

/** Die ersten `anzahl` Graphem-Cluster des Namens (Leer-/Satz-/Sonderzeichen am Anfang uebersprungen), in Grossbuchstaben; '' wenn nichts uebrig. */
export function namensAnfang(name: string | null | undefined, anzahl = 1): string {
  const rest = (name ?? '').normalize('NFC').trim().replace(VORSPANN, '')
  if (rest === '') return ''
  let out = ''
  let n = 0
  for (const { segment } of SEGMENTER.segment(rest)) {
    out += segment === 'ß' ? 'S' : segment.toLocaleUpperCase('de')
    if (++n >= anzahl) break
  }
  return out
}

export function scopeAnzeige(
  ownName: string | null | undefined,
  partnerName: string | null | undefined,
): Record<ScopeName, ScopeAnzeige> {
  const own = ownName?.trim() || null
  const partner = partnerName?.trim() || null

  let ich = namensAnfang(own) || ICH_FALLBACK
  let pa = namensAnfang(partner) || PARTNER_FALLBACK
  if (ich === pa) {
    pa = namensAnfang(partner, 2)
    if (pa === ich || pa === '') {
      ich = ICH_FALLBACK
      pa = PARTNER_FALLBACK
    }
  }

  return {
    ich: { zeichen: ich, text: own ? `Ich (${own})` : 'Ich' },
    partner: { zeichen: pa, text: partner ?? 'Partner' },
    gemeinsam: { zeichen: GEMEINSAM_ZEICHEN, text: 'Gemeinsam' },
  }
}
