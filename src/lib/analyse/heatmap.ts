import type { AnalyseMode, HeatmapDay } from '@/lib/analyseData'

/**
 * Reine Rechnung hinter der Ausgaben-Heatmap: Wochenraster und Farbstufen.
 *
 * Aus der Komponente herausgezogen, damit sie ohne Browser testbar ist. Der wichtigste
 * Grund: das Raster wurde vorher mit `new Date(...)` und `toISOString()` gebaut. Lokale
 * Mitternacht ist in Deutschland aber der Vortag 22:00/23:00 UTC, `toISOString()` lieferte
 * also das Datum des VORTAGS — jede Zelle zeigte die Summe des Tages davor, und ein Klick
 * hätte den falschen Tag gefiltert. Hier wird ausschließlich mit Kalendertagen in UTC
 * gerechnet (kein Zeitzonen- oder Sommerzeit-Einfluss).
 */

export interface HeatmapZelle {
  date:   string
  amount: number
  income: number
}

export interface HeatmapRaster {
  /** Spalten = Wochen (Montag bis Sonntag, älteste zuerst); `null` = Tag nach heute. */
  wochen: (HeatmapZelle | null)[][]
  /** Wochenindex → Monat (0–11), wenn in dieser Woche ein Monatserster liegt. */
  monatsMarken: Map<number, number>
}

/** `YYYY-MM-DD` plus/minus `n` Kalendertage. */
export function tagPlus(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Wochentag mit Montag = 0 … Sonntag = 6. */
export function wochentag(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/**
 * Raster der letzten `wochenAnzahl` Wochen bis einschließlich `heute`. Tage ohne Buchung
 * werden mit 0 € aufgefüllt, damit jede Zelle klickbar und beschriftbar ist.
 */
export function baueRaster(data: readonly HeatmapDay[], heute: string, wochenAnzahl = 52): HeatmapRaster {
  const nachTag = new Map(data.map(d => [d.date, d]))
  const start = tagPlus(heute, -wochentag(heute) - (wochenAnzahl - 1) * 7)

  const tage: HeatmapZelle[] = []
  for (let iso = start; iso <= heute; iso = tagPlus(iso, 1)) {
    const d = nachTag.get(iso)
    tage.push({ date: iso, amount: d?.amount ?? 0, income: d?.income ?? 0 })
  }

  const wochen: (HeatmapZelle | null)[][] = []
  for (let i = 0; i < tage.length; i += 7) {
    const w: (HeatmapZelle | null)[] = tage.slice(i, i + 7)
    while (w.length < 7) w.push(null)
    wochen.push(w)
  }

  const monatsMarken = new Map<number, number>()
  wochen.forEach((woche, wi) => {
    for (const z of woche) {
      if (z && z.date.endsWith('-01')) monatsMarken.set(wi, Number(z.date.slice(5, 7)) - 1)
    }
  })
  return { wochen, monatsMarken }
}

// ── Farbstufen ────────────────────────────────────────────────────────────────

export function ausgabenStufe(v: number): number {
  if (v === 0) return 0
  if (v <= 80) return 1
  if (v <= 200) return 2
  if (v <= 350) return 3
  if (v <= 550) return 4
  return 5
}

export function einnahmenStufe(v: number): number {
  if (v === 0) return 0
  if (v <= 50) return 1
  if (v <= 200) return 2
  if (v <= 1000) return 3
  if (v <= 2500) return 4
  return 5
}

/** Netto-Stufe von −5 (hohe Ausgaben) bis +5 (hohe Einnahmen); 0 = ausgeglichen oder leer. */
export function guvStufe(income: number, amount: number): number {
  const net = income - amount
  if (net > 2000) return 5
  if (net > 500)  return 4
  if (net > 100)  return 3
  if (net > 10)   return 2
  if (net > 0)    return 1
  if (net === 0)  return 0
  if (net >= -10)   return -1
  if (net >= -100)  return -2
  if (net >= -500)  return -3
  if (net >= -2000) return -4
  return -5
}

/**
 * Index in die Farbleiter der jeweiligen Ansicht: 0–5 bei Ausgaben/Einnahmen, 0–10 bei der
 * GuV (−5 … +5, um 5 verschoben, damit der Index nie negativ ist).
 */
export function zellenIndex(zelle: HeatmapZelle, mode: AnalyseMode): number {
  if (mode === 'ausgaben')  return ausgabenStufe(zelle.amount)
  if (mode === 'einnahmen') return einnahmenStufe(zelle.income)
  return guvStufe(zelle.income, zelle.amount) + 5
}

/** Hat der Tag in der gewählten Ansicht überhaupt etwas zu zeigen? Steuert die Beschriftung. */
export function hatBetrag(zelle: HeatmapZelle, mode: AnalyseMode): boolean {
  if (mode === 'ausgaben')  return zelle.amount > 0
  if (mode === 'einnahmen') return zelle.income > 0
  return zelle.amount > 0 || zelle.income > 0
}
