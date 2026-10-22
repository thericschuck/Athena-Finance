import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

/** Der angemeldete Nutzer, soweit die App ihn braucht (Kennung und E-Mail aus dem geprüften Token). */
export type AuthUser = { id: string; email: string | undefined }

/**
 * Angemeldeter Nutzer aus den Claims des Zugriffstokens.
 *
 * `auth.getUser()` ist ein Roundtrip zum Supabase-Auth-Server, bei jeder Seite und vor jeder Datenabfrage. `getClaims()` prüft die
 * Signatur des Tokens lokal gegen die öffentlichen Schlüssel des Projekts (JWKS, zwischengespeichert; dieses Projekt signiert mit ES256)
 * und prüft das Ablaufdatum; abgelaufene Tokens werden vorher über das Refresh-Token erneuert. Fällt der Schlüsseltyp auf symmetrisch
 * zurück, ruft `getClaims()` selbst den Auth-Server auf, es bleibt also immer korrekt, nur nicht schneller.
 *
 * Unterschied: ein serverseitig widerrufenes Token (z. B. „überall abmelden") gilt bis zu seinem Ablauf weiter (Standard: 1 Stunde).
 * Für eine Ein-Personen-App und reine Anzeige ist das vertretbar; Datenzugriffe schützt die RLS ohnehin über dasselbe Token. Pfade, die
 * Geld bewegen oder Konten ändern (Rebalancing, Passwort, Reports), fragen weiter mit `auth.getUser()` direkt beim Server nach.
 *
 * React `cache()` dedupliziert das pro Request (RSC-Renders und Route Handler bekommen je einen eigenen Cache-Scope); Server Actions
 * bleiben unberührt, da sie als eigener Request laufen.
 */
export const getAuthUser = cache(async (): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; user: AuthUser | null }> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const user: AuthUser | null = claims?.sub
    ? { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined }
    : null
  return { supabase, user }
})

/**
 * Wie `getAuthUser`, aber für Seiten, die ohne angemeldeten Nutzer nichts anzeigen können: ohne Sitzung geht es zum
 * Login, mit Sitzung ist `user` garantiert vorhanden.
 *
 * Wozu: Das Dashboard-Layout prüft die Sitzung ebenfalls, aber Layout und Seite rendern nebeneinander. Läuft die Seite
 * früher oder schlägt der Auth-Aufruf einmal fehl (abgelaufene Sitzung, Netzaussetzer), war `user` hier `null`, und
 * `user!.id` stürzte mit "Cannot read properties of null (reading 'id')" ab, statt zum Login zu führen.
 */
export async function requireAuthUser() {
  const { supabase, user } = await getAuthUser()
  if (!user) redirect('/login')
  return { supabase, user }
}
