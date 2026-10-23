/**
 * Aufteilung des Vermögens für den Ring im Dashboard: jedes Konto, jedes Depot und Krypto als
 * eigener, benannter Posten statt einer Sammelposition „Konten".
 *
 * Die Posten sind genau die Bausteine des Nettovermögens (siehe dashboard-seite.ts): Konten
 * (Giro, Spar, Cash, Bausparer, Geschäftsanteile), Depots, Krypto. Sparziele zählen nicht
 * (liegen schon auf einem Konto), Konten im Minus und Kreditkonten kann ein Ring nicht zeigen —
 * sie stehen als `minus` daneben, damit „Gesamt" in der Mitte nicht stillschweigend von der
 * Net-Worth-Zahl abweicht.
 *
 * Rein, ohne Imports: node --test lädt die Datei direkt.
 */

export interface AufteilungKonto { id: string; name: string; type: string; saldo: number }
export interface AufteilungDepot { id: string; name: string; wert: number }

export interface Posten {
  key: string
  label: string
  value: number
  /** Herkunft, für die Legende: 'konto' | 'depot' | 'krypto'. */
  art: 'konto' | 'depot' | 'krypto'
}

export interface Aufteilung {
  posten: Posten[]
  /** Summe der Posten (positiv). */
  total: number
  /** Betrag, der nicht im Ring steht: Konten im Minus und Kreditkonten (negativ oder 0). */
  minus: number
}

/** Kontotypen, die als eigener Posten im Ring stehen. */
const RING_TYPEN = new Set(['checking', 'savings', 'cash', 'other', 'building_savings', 'investment'])

export function baueAufteilung(input: {
  konten: AufteilungKonto[]
  depots: AufteilungDepot[]
  /** Krypto-Positionen PLUS Kryptokonten (kern.buckets.krypto). */
  krypto: number
}): Aufteilung {
  const posten: Posten[] = []
  let minus = 0

  for (const k of input.konten) {
    if (k.type === 'crypto') continue // steckt in `krypto`
    if (k.saldo < 0) { minus += k.saldo; continue }
    if (!RING_TYPEN.has(k.type)) continue
    if (k.saldo > 0) posten.push({ key: `konto-${k.id}`, label: k.name, value: k.saldo, art: 'konto' })
  }
  for (const d of input.depots) {
    if (d.wert > 0) posten.push({ key: `depot-${d.id}`, label: d.name, value: d.wert, art: 'depot' })
  }
  if (input.krypto > 0) posten.push({ key: 'krypto', label: 'Krypto', value: input.krypto, art: 'krypto' })

  // Größte zuerst: Ring und Legende lesen sich so von der wichtigsten Position nach unten.
  posten.sort((a, b) => b.value - a.value)
  return { posten, total: posten.reduce((s, p) => s + p.value, 0), minus }
}

/** Winkel je Posten in Bruchteilen des Rings (0..1) mit Start; für den SVG-Ring. */
export function ringSegmente(posten: readonly { value: number }[]): { start: number; anteil: number }[] {
  const total = posten.reduce((s, p) => s + p.value, 0)
  if (total <= 0) return posten.map(() => ({ start: 0, anteil: 0 }))
  let start = 0
  return posten.map(p => {
    const anteil = p.value / total
    const seg = { start, anteil }
    start += anteil
    return seg
  })
}
