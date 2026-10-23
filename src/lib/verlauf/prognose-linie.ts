import type { ProjektionPunkt } from './types.ts'

/**
 * Prognose-Tage (lib/forecast/cashflow.ts `PrognoseTag`) -> Linie fuer den Vermoegens-Chart.
 *
 * Die Cashflow-Prognose liefert einen Wert je Tag samt 80-%-Bereich. Fuer den Chart reicht ein
 * Punkt pro Woche (plus der letzte Tag): ueber ein Jahr sind das ~53 statt 365 Punkte im
 * Client-Bundle, und die Kurve bleibt dabei dieselbe, weil Cashflow-Sprunge (Lohn, Vertraege)
 * ueber die Woche kaum auseinanderfallen. Der Bereich wird nicht gemittelt, sondern am
 * Stichtag abgegriffen — sonst wuerde er an Sprungtagen schmaler aussehen, als er ist.
 */
export interface PrognoseTagVermoegen {
  datum: string
  vermoegen: number
  vermoegenUnten: number
  vermoegenOben: number
}

const runde = (n: number) => Math.round(n)

export function prognoseLinie(tage: PrognoseTagVermoegen[], schritt = 7): ProjektionPunkt[] {
  if (tage.length === 0) return []
  const punkte: ProjektionPunkt[] = []
  tage.forEach((t, i) => {
    if (i % schritt !== schritt - 1 && i !== tage.length - 1) return
    punkte.push({ datum: t.datum, wert: runde(t.vermoegen), unten: runde(t.vermoegenUnten), oben: runde(t.vermoegenOben) })
  })
  return punkte
}
