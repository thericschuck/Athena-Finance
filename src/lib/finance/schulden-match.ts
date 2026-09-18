/**
 * Ordnet eine Buchung, die als "Schulden" kategorisiert wurde, einer bestehenden Schuld zu --
 * Wortstamm-Abgleich zwischen Empfaenger/Beschreibung und Name/Glaeubiger der Schuld, dieselbe
 * Idee wie findeVertrag() in wiederkehrend.ts. Nur ein einzelner Treffer zaehlt: bei mehreren
 * passenden Schulden oder keiner ist das Ergebnis null -- raten ist hier teurer als nichts zu
 * finden, denn der Vorschlag geht als "das ist Schuld X" direkt in ein vorausgefuelltes Formular.
 */
import { normalisiere } from './wiederkehrend.ts'

export type SchuldFuerAbgleich = {
  id: string
  name: string
  creditor: string | null
}

export function matchDebtForText(
  text: string | null | undefined,
  debts: SchuldFuerAbgleich[],
): SchuldFuerAbgleich | null {
  const woerter = new Set(normalisiere(text ?? '').split(' ').filter(Boolean))
  if (woerter.size === 0) return null

  const treffer = debts.filter(d => {
    const kandidatWoerter = [
      ...normalisiere(d.name).split(' '),
      ...normalisiere(d.creditor ?? '').split(' '),
    ].filter(Boolean)
    return kandidatWoerter.some(w => woerter.has(w))
  })

  return treffer.length === 1 ? treffer[0] : null
}
