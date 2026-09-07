'use server'

import { createClient } from '@/lib/supabase/server'

export type WaitlistState = { error: string } | { success: true } | null

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Trägt eine E-Mail-Adresse in die Interesse-Liste ein (`waitlist_signups`).
 *
 * Liegt hier statt in `app/interesse/`, weil das Formular an zwei Stellen steht:
 * im Abschluss der Landing Page und auf /interesse (siehe WaitlistForm). Eine
 * Server-Action aus einem fremden Routen-Ordner zu importieren funktioniert zwar,
 * legt aber nahe, sie gehöre zu jener Route — sie gehört zu keiner.
 *
 * Bewusst kein Double-Opt-in: das ist ein Prototyp ohne angebundenen Mail-Versand
 * (kein Provider konfiguriert, siehe .env.local). Bevor die Seite öffentlich beworben
 * wird, sollte das nachgerüstet werden — Rechtsgrundlage siehe Datenschutzerklärung.
 */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const consent = formData.get('consent') === 'on'

  if (!email || !EMAIL_RE.test(email)) {
    return { error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
  }
  if (!consent) {
    return { error: 'Bitte bestätige, dass wir dich per E-Mail informieren dürfen.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('waitlist_signups').insert({ email, consent })

  // Unique-Verletzung (Adresse steht schon drin) ist für die Person kein Fehler —
  // sie ist ja bereits auf der Liste, das fühlt sich für sie wie Erfolg an.
  if (error && error.code !== '23505') {
    return { error: 'Das hat leider nicht geklappt. Versuch es gleich noch einmal.' }
  }

  return { success: true }
}
