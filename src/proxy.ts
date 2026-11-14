import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { CSP_HEADER, NONCE_HEADER, baueCsp, erzeugeNonce } from '@/lib/security/csp'

async function pruefeSitzung(request: NextRequest) {
  // Public routes — skip session check entirely
  const { pathname } = request.nextUrl
  // Nur bei PERF_LOG=1: Request-Kennung und Pfad fuer die Aufrufmessung (lib/perf/perf-log.ts) an die Server-Komponenten reichen.
  if (process.env.PERF_LOG === '1') {
    request.headers.set('x-perf-rid', Math.random().toString(36).slice(2, 10))
    request.headers.set('x-perf-path', pathname)
  }
  // Die Startseite ist öffentlich und statisch (kein Auth-Aufruf in der Seite selbst). Wer eingeloggt ist, wird HIER zum Dashboard
  // weitergeleitet; ohne Sitzungs-Cookie geht die Anfrage sofort durch, ohne Aufruf bei Supabase.
  const istStartseite = pathname === '/'
  const hatSitzungsCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  if (istStartseite && !hatSitzungsCookie) return NextResponse.next({ request })
  if (
    pathname.startsWith('/api/cron/') ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    // Einladungslink eines Haushalts: wer ihn bekommt, hat noch kein Konto. Die Seite prueft das Token selbst.
    pathname.startsWith('/einladung/') ||
    // Öffentliche Prototyp-/Rechtsseiten ohne Login — sonst greift dieselbe
    // Auth-Prüfung wie überall sonst und schickt jeden nicht eingeloggten
    // Besuch auf /login, bevor die Seite selbst überhaupt lädt.
    pathname === '/interesse' ||
    pathname === '/datenschutz' ||
    pathname === '/impressum'
  ) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Sitzung auffrischen und prüfen. `getClaims()` verifiziert das Token lokal (JWKS, ES256) statt bei jedem Seitenaufruf den
  // Auth-Server zu fragen, und erneuert abgelaufene Tokens über das Refresh-Token (setAll oben schreibt die neuen Cookies).
  // Zwischen createServerClient und diesem Aufruf darf keine Logik stehen.
  let hatClaims = false
  let authError: { code?: string; status?: number } | null = null
  try {
    const { data, error } = await supabase.auth.getClaims()
    hatClaims = !!data?.claims
    authError = error
  } catch {
    // Netzaussetzer beim Abruf der Schlüssel: nicht abmelden, die Seiten prüfen die Sitzung selbst (requireAuthUser).
    return supabaseResponse
  }

  // Startseite: Eingeloggte gehen zum Dashboard (mit den frisch gesetzten Cookies), alle anderen sehen die Seite.
  if (istStartseite) {
    if (!hatClaims) return supabaseResponse
    const zumDashboard = NextResponse.redirect(new URL('/dashboard', request.url))
    supabaseResponse.cookies.getAll().forEach(c => zumDashboard.cookies.set(c))
    return zumDashboard
  }

  // Ungültiges Refresh-Token oder gar keine Sitzung: Cookies löschen und zum Login.
  if (authError?.code === 'refresh_token_not_found' || authError?.status === 400 || (!hatClaims && !authError)) {
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

/**
 * Einstieg des Proxys: erzeugt pro Anfrage eine Nonce und setzt die Content-Security-Policy (erzwingend, siehe
 * lib/security/csp.ts), danach laeuft die bisherige Sitzungspruefung unveraendert.
 *
 * Next.js liest die Nonce waehrend des Renderns aus dem CSP-Header der ANFRAGE (auch aus Report-Only, hier erzwingend) und setzt sie auf seine
 * Skripte; das Layout liest sie aus `x-nonce` fuer das Theme-Script und den ThemeProvider. Folge: Alle Seiten werden dynamisch
 * gerendert (eine Nonce gibt es nur zur Anfragezeit), auch die frueher statischen oeffentlichen Seiten.
 */
export async function proxy(request: NextRequest) {
  const nonce = erzeugeNonce()
  const csp = baueCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === 'development',
  })
  request.headers.set(NONCE_HEADER, nonce)
  request.headers.set(CSP_HEADER, csp)

  const antwort = await pruefeSitzung(request)
  antwort.headers.set(CSP_HEADER, csp)
  return antwort
}

export const config = {
  matcher: [
    // Statische Assets müssen hier ausgenommen sein, sonst schickt die
    // Auth-Prüfung sie ohne Session per 307 auf /login — und der
    // Image-Optimizer, der die Datei über denselben Server holt, quittiert
    // das mit 400. Neue Bildformate deshalb immer mit aufnehmen.
    //
    // Dieselbe Falle trifft die von Next.js generierten Metadata-Routes:
    // robots.txt, sitemap.xml und manifest.webmanifest laufen ohne Session-
    // Cookie ebenfalls in die Auth-Prüfung und landeten deshalb bisher als
    // HTML-Login-Seite statt als robots/sitemap/manifest beim Crawler.
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
}
