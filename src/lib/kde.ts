// ── Kernel-Density-Estimate für die Ausgabenverteilung ────────────────────────
//
// Monatsausgaben sind i. d. R. rechtsschief: harter unterer Rand durch
// Fixkosten, offener oberer Schwanz durch Einmalausgaben. Eine KDE bildet die
// tatsächliche Form der Daten ab, ohne eine Normalverteilung zu unterstellen —
// bewusst KEINE mean/stddev-Formel für die Hauptkurve.

/** Gaussian-Kernel — der kleine Pro-Punkt-Kernel, NICHT die große Verteilungskurve. */
function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI)
}

/** Silverman's Rule of Thumb für die Bandbreite. */
function silvermanBandwidth(data: number[]): number {
  const n = data.length
  const mean = data.reduce((a, b) => a + b, 0) / n
  const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
  const stdDev = Math.sqrt(variance)
  // stdDev === 0 (alle Werte identisch) würde h=0 und eine Division durch 0 in
  // computeKDE ergeben — 1 € als Mindestbandbreite verhindert das, ohne die
  // Kurvenform bei echter Streuung zu beeinflussen.
  return Math.max(1.06 * stdDev * Math.pow(n, -1 / 5), 1)
}

export interface KdePoint { x: number; density: number }

/** KDE über ein Raster von x-Werten (für die Chart-Kurve). */
export function computeKDE(
  data: number[],
  gridPoints: number = 200,
  bandwidthOverride?: number,
): KdePoint[] {
  const n = data.length
  const h = bandwidthOverride ?? silvermanBandwidth(data)
  const min = Math.min(...data)
  const max = Math.max(...data)
  const padding = (max - min) * 0.3 || max * 0.3 || 1 // etwas Luft an den Rändern
  // Monatsausgaben sind nie negativ — die Padding-Formel allein könnte bei
  // wenig Streuung links unter 0 rutschen, das ist kein reales x.
  const xMin = Math.max(0, min - padding)
  const xMax = max + padding
  const step = (xMax - xMin) / gridPoints

  const result: KdePoint[] = []
  for (let i = 0; i <= gridPoints; i++) {
    const x = xMin + i * step
    let sum = 0
    for (const xi of data) {
      sum += gaussianKernel((x - xi) / h)
    }
    const density = sum / (n * h)
    result.push({ x, density })
  }
  return result
}

/**
 * Perzentil des aktuellen Monats in der Historie — kein
 * Normalverteilungs-Perzentil, sondern der tatsächliche empirische Rang
 * (Anteil der historischen Monate, die unter dem aktuellen Wert liegen).
 */
export function computePercentileRank(historicalData: number[], currentValue: number): number {
  const countBelow = historicalData.filter(v => v < currentValue).length
  return Math.round((countBelow / historicalData.length) * 100)
}
