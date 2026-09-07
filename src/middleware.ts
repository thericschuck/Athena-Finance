import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Public routes — skip session check entirely
  const { pathname } = request.nextUrl
  if (
    pathname.startsWith('/api/cron/') ||
    pathname === '/' ||
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

  // Refresh session – must not run logic between createServerClient and getUser()
  const { error } = await supabase.auth.getUser()

  // Invalid refresh token → clear session and redirect to login
  if (error?.code === 'refresh_token_not_found' || error?.status === 400) {
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
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
}
