// ── Kernel-Density-Estimate für die Verteilungs-Karte ─────────────────────────
//
// Monatswerte sind i. d. R. rechtsschief: harter unterer Rand durch Fixkosten,
// offener oberer Schwanz durch Einmalausgaben. Eine KDE bildet die tatsächliche
// Form der Daten ab, ohne eine Normalverteilung zu unterstellen — bewusst KEINE
// mean/stddev-Formel für die Kurve.

/** Gaussian-Kernel — der kleine Pro-Punkt-Kernel, NICHT die große Verteilungskurve. */
function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI)
}

/**
 * Silverman's Rule of Thumb — die Vorgabe, wenn der Aufrufer keine eigene
 * Bandbreite mitgibt. Die Verteilungs-Karte tut genau das und koppelt die
 * Bandbreite stattdessen an ihre Klassenbreite (Begründung dort), deshalb ist
 * das hier nicht exportiert.
 */
function silvermanBandwidth(data: number[]): number {
  const n = data.length
  // n < 2 ergäbe eine Division durch 0 in der Varianz (n - 1).
  if (n < 2) return 1
  const mean = data.reduce((a, b) => a + b, 0) / n
  const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
  const stdDev = Math.sqrt(variance)
  // stdDev === 0 (alle Werte identisch) würde h=0 und eine Division durch 0
  // ergeben — 1 € als Mindestbandbreite verhindert das, ohne die Kurvenform bei
  // echter Streuung zu beeinflussen.
  return Math.max(1.06 * stdDev * Math.pow(n, -1 / 5), 1)
}

/**
 * Dichte an einer einzelnen Stelle x.
 *
 * Ersetzt das frühere `computeKDE()`, das ein 200-Punkte-Raster über einen
 * selbst gewählten x-Bereich gelegt hat. Die Verteilung wird jetzt als
 * Histogramm gezeichnet und die Kurve nur noch an den Klassenmitten abgetastet:
 * dieselbe Mathematik, aber Kurve und Balken liegen garantiert auf demselben
 * Raster. Nebenbei fällt damit die Padding-Formel weg, die den Bereich links auf
 * 0 geklemmt hat („Monatsausgaben sind nie negativ") — für die GuV-Ansicht wäre
 * genau das falsch, dort sind negative Monate der interessante Teil.
 */
export function kdeDensityAt(data: number[], x: number, bandwidth?: number): number {
  const n = data.length
  if (n === 0) return 0
  const h = bandwidth ?? silvermanBandwidth(data)
  let sum = 0
  for (const xi of data) sum += gaussianKernel((x - xi) / h)
  return sum / (n * h)
}

/**
 * Perzentil des laufenden Monats in der Historie — kein
 * Normalverteilungs-Perzentil, sondern der tatsächliche empirische Rang
 * (Anteil der historischen Monate, die unter dem aktuellen Wert liegen).
 */
export function computePercentileRank(historicalData: number[], currentValue: number): number {
  if (historicalData.length === 0) return 0
  const countBelow = historicalData.filter(v => v < currentValue).length
  return Math.round((countBelow / historicalData.length) * 100)
}
