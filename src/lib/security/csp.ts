/**
 * Content-Security-Policy (SECURITY-AUDIT.md 2.2), erzwungen seit 2026-11-14 (davor eine Phase als `Content-Security-Policy-Report-Only`).
 *
 * Warum: Das Sitzungs-Cookie ist fuer JavaScript lesbar (`httpOnly: false`, der Browser-Client liest die Sitzung). Jede Script-
 * Einschleusung, auch aus einer Abhaengigkeit, waere damit Kontouebernahme. Die CSP ist die zweite Verteidigungslinie: Sie erlaubt
 * Skripte nur mit Nonce (pro Anfrage neu, vom Proxy erzeugt) und nur von der eigenen Herkunft.
 *
 * Quellen, die die App im BROWSER wirklich braucht (aus dem Code abgeleitet, Stand 2026-11-13):
 *   - eigene Herkunft: Seiten, Skripte, Schriften (alle lokal ueber next/font, keine Google Fonts), Bilder, API-Routen (/api/...)
 *   - Supabase (`NEXT_PUBLIC_SUPABASE_URL`): Auth und Storage per fetch (connect-src); signierte Storage-URLs fuer Bilder und
 *     Avatare (img-src), Medien (media-src)
 *   - data: und blob: fuer Bilder (Cursor als SVG-Data-URI in globals.css, Vorschau beim Avatar-Upload per URL.createObjectURL)
 *   - data: fuer Schriften (die Balken-Schrift fuer versteckte Zahlen steht als Data-URI in globals.css; im Browsertest 2026-11-13 aufgefallen)
 * NICHT hierher gehoeren die serverseitigen Aufrufe (CoinGecko, Kraken, OpenAI, Anthropic, FinTS): der Browser ruft sie nie direkt auf.
 *
 * Bewusste Entscheidungen:
 *   - Kein `'unsafe-inline'` bei Skripten. `'strict-dynamic'` laesst nonce-markierte Skripte weitere nachladen (Next-Chunks).
 *   - `style-src` mit Nonce, aber `style-src-attr 'unsafe-inline'`: React/Bibliotheken setzen `style="..."`-Attribute (Diagramme,
 *     Animationen, `style={{}}` im Code). Ohne diese Zeile meldete jedes Style-Attribut einen Verstoss.
 *   - `style-src-elem 'self' 'unsafe-inline'` (ohne Nonce, sonst wirkungslos): sonner injiziert sein CSS zur Laufzeit (in 2.0.7 fest
 *     im Bundle, `styles.css` ersetzt das nicht) und das srcdoc-Iframe der Berichtsvorschau erbt die Richtlinie. Restrisiko: CSS-
 *     Einschleusung (Layout/Exfiltration ueber Selektoren), aber keine Skriptausfuehrung. Bewusst gegen die Alternativen abgewogen.
 *   - `frame-ancestors 'none'` (nur im erzwingenden Header wirksam); `X-Frame-Options: DENY` (headers.ts) bleibt als Rueckfall fuer
 *     aeltere Browser.
 *   - Kein `upgrade-insecure-requests` (wuerde in der lokalen Entwicklung auf http://localhost alles auf https umbiegen).
 *   - Entwicklung: `'unsafe-eval'` (React braucht es fuer Fehlerstapel) und `ws://localhost:*` (Hot Reload). Nie in Produktion.
 *
 * Reine Funktionen ohne Next-Importe, damit sie sich ohne Laufzeit testen lassen (csp.test.ts).
 */

export const CSP_HEADER = 'Content-Security-Policy'
export const NONCE_HEADER = 'x-nonce'
/** Ziel der Verstossmeldungen des Browsers (API-Route, die sie ins Server-Log schreibt). */
export const CSP_REPORT_PFAD = '/api/csp-report'

export type CspOptionen = {
  /** Nonce dieser Anfrage (Base64, siehe erzeugeNonce). */
  nonce: string
  /** `NEXT_PUBLIC_SUPABASE_URL`, z. B. https://abc.supabase.co. Fehlt sie, werden keine Supabase-Quellen freigegeben. */
  supabaseUrl?: string
  /** Entwicklungsmodus (`NODE_ENV === 'development'`). */
  dev: boolean
}

/** Frische, unvorhersagbare Nonce pro Anfrage (128 Bit Zufall als Base64). Laeuft in jeder Laufzeit mit Web-Crypto. */
export function erzeugeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/** Herkunft (Schema + Host) einer URL, oder `undefined`, wenn sie fehlt oder ungueltig ist. */
function herkunft(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : undefined
  } catch {
    return undefined
  }
}

/** Baut den Wert des CSP-Headers fuer eine Anfrage. */
export function baueCsp({ nonce, supabaseUrl, dev }: CspOptionen): string {
  const supabase = herkunft(supabaseUrl)
  const mitSupabase = (...basis: string[]) => (supabase ? [...basis, supabase] : basis)

  const direktiven: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", `'nonce-${nonce}'`],
    // Style-ELEMENTE: 'unsafe-inline' OHNE Nonce. sonner legt sein CSS zur Laufzeit als <style> ohne Nonce an (nicht abstellbar),
    // und das srcdoc-Iframe der Berichtsvorschau erbt diese Richtlinie und hat ein eigenes <style>. Eine Nonce in derselben Liste
    // wuerde 'unsafe-inline' unwirksam machen (CSP3), darum steht sie hier bewusst nicht. Skripte bleiben streng.
    'style-src-elem': ["'self'", "'unsafe-inline'"],
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': mitSupabase("'self'", 'data:', 'blob:'),
    'font-src': ["'self'", 'data:'],
    'connect-src': mitSupabase("'self'", ...(dev ? ['ws://localhost:*'] : [])),
    'media-src': mitSupabase("'self'", 'blob:'),
    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    // Verstoesse einsammeln (veraltet, aber in Chrome/Edge/Firefox verbreiteter als report-to). Siehe app/api/csp-report/route.ts.
    'report-uri': [CSP_REPORT_PFAD],
  }
  return Object.entries(direktiven)
    .map(([name, werte]) => `${name} ${werte.join(' ')}`)
    .join('; ')
}

const kuerze = (v: unknown, max: number): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/\s+/g, ' ').slice(0, max)

/**
 * Macht aus dem Rohtext einer Verstossmeldung (Content-Type `application/csp-report`, Form `{"csp-report": {...}}`) EINE Logzeile,
 * oder `null`, wenn der Text keine brauchbare Meldung ist. Nur bekannte Felder, jeweils gekuerzt: Der Endpunkt ist oeffentlich,
 * das Log soll sich nicht beliebig fuellen oder mit fremden Inhalten vermuellen lassen.
 */
export function formatiereBericht(roh: string): string | null {
  let obj: unknown
  try {
    obj = JSON.parse(roh)
  } catch {
    return null
  }
  const b = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)['csp-report'] : null
  if (!b || typeof b !== 'object') return null
  const r = b as Record<string, unknown>
  const direktive = kuerze(r['effective-directive'] ?? r['violated-directive'], 40)
  if (!direktive) return null
  const seite = kuerze(r['document-uri'], 120).replace(/\?.*$/, '') // ohne Query (koennte Tokens enthalten)
  return [
    'direktive=' + direktive,
    'blockiert=' + (kuerze(r['blocked-uri'], 100).replace(/\?.*$/, '') || '(inline)'),
    'seite=' + seite,
    'quelle=' + kuerze(r['source-file'], 100).replace(/\?.*$/, '') + (r['line-number'] ? ':' + kuerze(r['line-number'], 8) : ''),
    'beispiel=' + kuerze(r['script-sample'], 60),
    'modus=' + (kuerze(r['disposition'], 10) || 'report'),
  ].join(' | ')
}
