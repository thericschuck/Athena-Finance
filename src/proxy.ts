import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Public routes — skip session check entirely
  const { pathname } = request.nextUrl
  // Die Startseite ist öffentlich und statisch (kein Auth-Aufruf in der Seite selbst). Wer eingeloggt ist, wird HIER zum Dashboard
  // weitergeleitet; ohne Sitzungs-Cookie geht die Anfrage sofort durch, ohne Aufruf bei Supabase.
  const istStartseite = pathname === '/'
  const hatSitzungsCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  if (istStartseite && !hatSitzungsCookie) return NextResponse.next()
  if (
    pathname.startsWith('/api/cron/') ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    // Öffentliche Prototyp-/Rechtsseiten ohne Login — sonst greift dieselbe
    // Auth-Prüfung wie überall sonst und schickt jeden nicht eingeloggten
    // Besuch auf /login, bevor die Seite selbst überhaupt lädt.
    pathname === '/interesse' ||
    pathname === '/datenschutz' ||
    pathname === '/impressum'
  ) {
    return NextResponse.next()
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
