/**
 * Wert der gesamten Sammlung über die Zeit.
 *
 * Gleiche Regel wie die Summe auf der Seite (`gesamtwert(items, true)`): nur Stücke, die in
 * die Summe zählen (`im_vermoegen`). Für einen Stichtag zählt je Stück die jüngste Bewertung
 * BIS zu diesem Tag — wie `fn_valuables_total` in der DB. Ein Stück zählt erst ab seiner
 * ersten Bewertung und, wenn es verkauft wurde, nur VOR dem Verkaufsdatum: so bleibt die
 * Sammlung von 2025 in der Historie, was sie damals war.
 *
 * Rein und ohne Datenbankzugriff, damit sich die Regeln testen lassen.
 */

export interface VerlaufStueck {
  id: string
  im_vermoegen: boolean
  kaufpreis: number | null
  gekauft_am: string | null
  verkauft_am: string | null
}

export interface VerlaufBewertung {
  valuable_id: string
  bewertet_am: string
  wert: number
}

export interface Sammlungspunkt {
  datum: string
  /** Summe der jüngsten Bewertungen. */
  wert: number
  /** Summe der Kaufpreise der bis dahin gekauften Stücke. */
  eingekauft: number
  /** Anzahl Stücke, die zu diesem Stichtag zählen. */
  stuecke: number
}

export function sammlungsverlauf(
  stuecke: VerlaufStueck[],
  bewertungen: VerlaufBewertung[],
  heute: string,
): Sammlungspunkt[] {
  const zaehlt = stuecke.filter(s => s.im_vermoegen)
  const ids = new Set(zaehlt.map(s => s.id))

  // Bewertungen je Stück, aufsteigend nach Datum, ohne Zukunft.
  const je = new Map<string, VerlaufBewertung[]>()
  for (const b of bewertungen) {
    if (!ids.has(b.valuable_id) || b.bewertet_am > heute) continue
    const liste = je.get(b.valuable_id) ?? []
    liste.push(b)
    je.set(b.valuable_id, liste)
  }
  for (const l of je.values()) l.sort((a, b) => a.bewertet_am.localeCompare(b.bewertet_am))

  // Stichtage: jeder Tag, an dem sich etwas ändert, plus heute.
  const tage = new Set<string>([heute])
  for (const l of je.values()) for (const b of l) tage.add(b.bewertet_am)
  for (const s of zaehlt) {
    if (s.gekauft_am && s.gekauft_am <= heute) tage.add(s.gekauft_am)
    if (s.verkauft_am && s.verkauft_am <= heute) tage.add(s.verkauft_am)
  }

  const punkte: Sammlungspunkt[] = []
  for (const tag of [...tage].sort()) {
    let wert = 0
    let eingekauft = 0
    let anzahl = 0
    for (const s of zaehlt) {
      if (s.verkauft_am && tag >= s.verkauft_am) continue
      const l = je.get(s.id)
      // Jüngste Bewertung bis einschließlich `tag`.
      let aktuell: VerlaufBewertung | undefined
      if (l) for (const b of l) { if (b.bewertet_am <= tag) aktuell = b; else break }
      if (aktuell) {
        wert += Number(aktuell.wert)
        anzahl++
      }
      if (s.kaufpreis != null && s.gekauft_am && s.gekauft_am <= tag) eingekauft += Number(s.kaufpreis)
    }
    // Tage, an denen noch gar nichts bewertet war, sind kein Datenpunkt.
    if (anzahl === 0) continue
    punkte.push({ datum: tag, wert: Math.round(wert * 100) / 100, eingekauft, stuecke: anzahl })
  }
  return punkte
}
