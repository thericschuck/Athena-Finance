/**
 * Kalenderrechnung auf `YYYY-MM-DD`-Strings, ohne Zeitzonen-Fallen: alles läuft über UTC-Mitternacht,
 * damit „heute plus 30 Tage" nie wegen Sommerzeit auf den falschen Tag fällt. Keine Imports,
 * damit `node --test` die Datei direkt laden kann.
 */

export function parse(d: string): { y: number; m: number; d: number } {
  const [y, m, t] = d.slice(0, 10).split('-').map(Number)
  return { y, m, d: t }
}

export function format(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Anzahl Tage des Monats (m = 1..12). */
export function tageImMonat(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Datum plus n Tage (n darf negativ sein). */
export function addTage(d: string, n: number): string {
  const { y, m, d: t } = parse(d)
  const x = new Date(Date.UTC(y, m - 1, t + n))
  return format(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate())
}

export function tageZwischen(von: string, bis: string): number {
  const a = parse(von), b = parse(bis)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}

/** `YYYY-MM` des Datums. */
export function monatVon(d: string): string {
  return d.slice(0, 7)
}

/** `YYYY-MM` plus n Monate. */
export function addMonate(monat: string, n: number): string {
  const { y, m } = parse(monat + '-01')
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

/** Anzahl Monate von `a` bis `b` (beide `YYYY-MM`); negativ, wenn b vor a liegt. */
export function monateZwischen(a: string, b: string): number {
  const x = parse(a + '-01'), z = parse(b + '-01')
  return (z.y - x.y) * 12 + (z.m - x.m)
}

/** Tag im Monat, auf dessen Länge begrenzt (31. im Februar = 28./29.). */
export function tagImMonat(monat: string, tag: number): string {
  const { y, m } = parse(monat + '-01')
  return format(y, m, Math.min(Math.max(1, tag), tageImMonat(y, m)))
}

/** Median einer Zahlenreihe; 0 bei leerer Reihe. */
export function median(werte: number[]): number {
  if (werte.length === 0) return 0
  const s = [...werte].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
