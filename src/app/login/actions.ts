'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { parseForm } from '@/lib/api/validate'

// Nur Grenzen gegen Missbrauch (Länge/Typ), keine Formatprüfung: Supabase entscheidet über
// gültige Zugangsdaten. Fehler laufen wie bisher per Redirect ?error= zurück an /login.
// Registrierung gibt es hier bewusst NICHT: Konten entstehen nur per Haushalts-Einladung (src/app/einladung/[token]).
const credentialsSchema = z.object({
  email: z.string({ error: 'E-Mail fehlt' }).max(320, 'E-Mail ist zu lang'),
  password: z.string({ error: 'Passwort fehlt' }).max(1024, 'Passwort ist zu lang'),
})

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const creds = parseForm(formData, credentialsSchema)
  if (!creds.ok) redirect(`/login?error=${encodeURIComponent(creds.issues[0]?.message ?? creds.error)}`)
  const { email, password } = creds.data

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // E-Mail mit zurück an /login geben (siehe LoginPage: `defaultValue` auf
    // dem Feld) — der Redirect ist eine echte Navigation, ohne das stünde
    // das Feld nach einem falschen Passwort wieder leer da.
    redirect(`/login?error=${encodeURIComponent(error.message)}&email=${encodeURIComponent(email)}`)
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
