import type { SankeyArt } from '@/lib/analyseData'

/**
 * Farben des Geldflusses — gemeinsam für das Sankey (Desktop) und die Fluss-Liste (Handy), damit
 * ein Posten in beiden Darstellungen denselben Ton trägt und die Legende zum Diagramm passt.
 *
 * Alles hängt an Theme-Tokens (siehe globals.css), keine festen Hex-Werte: Dark/Light und die
 * Theme-Presets ziehen automatisch mit. `color-mix()` erzeugt die Abstufungen zur Laufzeit.
 */

const heller = (token: string, anteil: number) =>
  `color-mix(in srgb, ${token} ${100 - anteil}%, white ${anteil}%)`
const dunkler = (token: string, anteil: number) =>
  `color-mix(in srgb, ${token} ${100 - anteil}%, black ${anteil}%)`

// Abstufungen von --chart-expense / --chart-income: wechselnd heller und dunkler, damit
// benachbarte Posten unterscheidbar bleiben, ohne eine zweite, thematisch fremde Farbe zu brauchen.
const AUSGABEN = [heller('var(--chart-expense)', 0), heller('var(--chart-expense)', 15), heller('var(--chart-expense)', 30),
  heller('var(--chart-expense)', 45), dunkler('var(--chart-expense)', 15), dunkler('var(--chart-expense)', 30),
  heller('var(--chart-expense)', 60), heller('var(--chart-expense)', 75)]
const QUELLEN = [heller('var(--chart-income)', 0), dunkler('var(--chart-income)', 25), dunkler('var(--chart-income)', 40),
  heller('var(--chart-income)', 20), heller('var(--chart-income)', 40)]

export const FARBE_EINNAHMEN = 'var(--chart-accent)'
export const FARBE_UEBERSCHUSS = 'color-mix(in srgb, var(--chart-income) 70%, var(--chart-accent) 30%)'
/** Anlagen: eine eigene Farbe (nicht Rot/Grün), damit sie als eigener Fluss auffallen. */
export const FARBE_ANLAGE = 'var(--chart-cat-1)'
/** „Weitere": bewusst neutral — es ist ein Sammelposten, keine Kategorie. */
export const FARBE_WEITERE = 'var(--chart-muted-1)'

export function farbeFuer(art: SankeyArt | undefined, rang = 0): string {
  switch (art) {
    case 'einnahmen': return FARBE_EINNAHMEN
    case 'ueberschuss': return FARBE_UEBERSCHUSS
    case 'anlage': return FARBE_ANLAGE
    case 'weitere': return FARBE_WEITERE
    case 'defizit': return 'var(--chart-expense)'
    case 'quelle': return QUELLEN[rang % QUELLEN.length]
    default: return AUSGABEN[rang % AUSGABEN.length]
  }
}

/** Anteil als „28 %", unter einem Prozent „<1 %" (statt eines irreführenden „0 %"). */
export function fmtAnteil(anteil: number): string {
  if (anteil <= 0) return '0 %'
  const p = anteil * 100
  return p < 1 ? '<1 %' : `${Math.round(p)} %`
}

export const fmtEuro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`
export const fmtEuroGenau = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
