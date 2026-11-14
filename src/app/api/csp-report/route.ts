import { formatiereBericht } from '@/lib/security/csp'

/**
 * Empfaengt die Verstossmeldungen der Content-Security-Policy (`report-uri`, siehe lib/security/csp.ts) und schreibt je Meldung eine
 * Zeile ins Server-Log. Die Stelle, an der man sieht, was die erzwungene Richtlinie blockiert hat,
 * auch fuer die geschuetzten Seiten (Dashboard, Analyse, ...), die sich nicht von aussen pruefen lassen.
 *
 * Oeffentlich und ohne Anmeldung (der Browser sendet die Meldung ohne Cookies und ohne Auth-Kopf; /api ist vom Proxy ausgenommen).
 * Deshalb defensiv: nur POST, Textkoerper hoechstens 8 KB, nur bekannte Felder gekuerzt ins Log (formatiereBericht), nie ein Fehler
 * nach aussen, immer 204. Es liest und aendert nichts in der Datenbank.
 */
const MAX_BYTES = 8 * 1024

export async function POST(request: Request) {
  const laenge = Number(request.headers.get('content-length') ?? '0')
  if (laenge > MAX_BYTES) return new Response(null, { status: 204 })
  const roh = (await request.text().catch(() => '')).slice(0, MAX_BYTES)
  const zeile = formatiereBericht(roh)
  if (zeile) console.warn(`[csp-report] ${zeile}`)
  return new Response(null, { status: 204 })
}
