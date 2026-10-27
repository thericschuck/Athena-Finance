/** Reine Hilfsfunktion der Performance-Messung (ohne Next-Abhaengigkeit, damit sie testbar ist). */

/** Struktur einer PostgREST-URL ohne Werte: Tabelle/RPC, Filter als `spalte=operator`, select-Spaltenliste. */
export function describeUrl(raw: string): { target: string; key: string; select: string | null } {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { target: 'unbekannt', key: 'unbekannt', select: null }
  }
  const target = u.pathname.replace(/^\/(rest|auth|storage|functions)\/v1\//, '$1/')
  const keep = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
  let select: string | null = null
  const parts: string[] = []
  for (const [k, v] of u.searchParams) {
    if (k === 'select') {
      select = v.slice(0, 300)
      continue
    }
    if (keep.has(k)) parts.push(`${k}=${v.slice(0, 80)}`)
    else parts.push(`${k}=${v.split('.')[0]}`)
  }
  parts.sort()
  return { target, key: `${target}?${parts.join('&')}`, select }
}
