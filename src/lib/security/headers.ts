/**
 * Erzwungene Sicherheits-Header fuer alle Routen (SECURITY-AUDIT.md 2.2), eingebunden ueber `headers()` in next.config.ts.
 * Die Content-Security-Policy gehoert NICHT hierher: sie braucht eine Nonce pro Anfrage und wird im Proxy gesetzt (src/proxy.ts).
 *
 * Reine Daten ohne Next-Importe (testbar, headers.test.ts).
 */

export type HeaderEintrag = { key: string; value: string }

/**
 * Permissions-Policy: nur Funktionen sperren, die die App nachweislich nicht nutzt (Code-Suche 2026-11-13: kein getUserMedia,
 * keine Geolocation, kein Display-Capture, kein Payment Request, kein WebUSB/-Bluetooth/-Serial/-HID, keine Sensoren).
 * Bewusst NICHT genannt, damit die Voreinstellung des Browsers gilt: `clipboard-write` (Kopieren-Knoepfe), `fullscreen`, `web-share`.
 */
export const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'bluetooth=()',
  'serial=()',
  'hid=()',
  'display-capture=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
  'browsing-topics=()',
].join(', ')

export const SICHERHEITS_HEADER: HeaderEintrag[] = [
  // Clickjacking: die App darf in keinem fremden Frame laufen. (Das srcdoc-iframe der Berichtsvorschau ist davon nicht betroffen:
  // der Header gilt fuer geladene Seiten, nicht fuer eingebettetes HTML.) Beim Erzwingen der CSP zusaetzlich `frame-ancestors 'none'`.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  // Vercel setzt `max-age=63072000` selbst, ohne includeSubDomains. Ohne `preload`: das ist eine kaum rueckholbare Zusage.
  // Folge von includeSubDomains: JEDE Subdomain von athena-finance.de muss ueber https erreichbar sein.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]
