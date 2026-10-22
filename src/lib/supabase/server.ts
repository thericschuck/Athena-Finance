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

/**
 * supabase.auth.getUser() ist kein lokales JWT-Decode, sondern ein Roundtrip zum
 * Supabase-Auth-Server. Ohne React cache() ruft ihn z.B. das Dashboard-Layout und
 * die darunter gerenderte Seite je einmal auf -- selber Request, zwei Auth-Calls.
 * cache() dedupliziert das pro Request (Next.js legt für RSC-Renders und Route
 * Handler je einen eigenen Cache-Scope an), Server Actions bleiben unberührt, da
 * sie als eigener Request laufen.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
