'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseForm, issueMessage } from '@/lib/api/validate'
import { ANNAHME_FEHLER_TEXT, bereinigeName, hashToken, istTokenFormat, mappeAnnahmeFehler, normalisiereEmail } from '@/lib/haushalt/einladung'
import { ladeEinladung, versuchErlaubt } from '@/lib/haushalt/einladung-server'

export type EinladungState = { error: string } | null

const UNGUELTIG = ANNAHME_FEHLER_TEXT.ungueltig
const ZU_OFT = 'Zu viele Versuche. Bitte warte einige Minuten.'

const neuSchema = z.object({
  token: z.string({ error: UNGUELTIG }),
  name: z.string({ error: 'Name fehlt' }).transform(bereinigeName).pipe(z.string().min(1, 'Bitte gib einen Anzeigenamen an')),
  password: z.string({ error: 'Passwort fehlt' }).min(10, 'Das Passwort braucht mindestens 10 Zeichen').max(128, 'Das Passwort ist zu lang'),
  password2: z.string({ error: 'Bitte wiederhole das Passwort' }),
}).refine(d => d.password === d.password2, { message: 'Die Passwörter stimmen nicht überein', path: ['password2'] })

const loginSchema = z.object({
  token: z.string({ error: UNGUELTIG }),
  password: z.string({ error: 'Passwort fehlt' }).min(1, 'Passwort fehlt').max(1024),
})
const tokenSchema = z.object({ token: z.string({ error: UNGUELTIG }) })

/** Nimmt die Einladung fuer einen bestehenden Auth-Nutzer an (service_role-Funktion, prueft Token UND E-Mail serverseitig). */
async function nimm(token: string, userId: string, email: string): Promise<string | null> {
  const { error } = await createAdminClient().rpc('fn_accept_household_invite', {
    p_token_hash: hashToken(token), p_user: userId, p_email: email,
  })
  return error ? ANNAHME_FEHLER_TEXT[mappeAnnahmeFehler(error.message)] : null
}

/** Neuer Nutzer: Konto per Admin-API (E-Mail aus der Einladung, bestaetigt), Annahme, Anmeldung. */
export async function neuesKontoAnnehmen(_prev: EinladungState, formData: FormData): Promise<EinladungState> {
  if (!(await versuchErlaubt())) return { error: ZU_OFT }
  const p = parseForm(formData, neuSchema)
  if (!p.ok) return { error: issueMessage(p) }
  const inv = await ladeEinladung(p.data.token)
  if (!inv.ok) return { error: UNGUELTIG }

  const admin = createAdminClient()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: inv.email,
    password: p.data.password,
    email_confirm: true,
    user_metadata: { display_name: p.data.name },
  })
  if (createErr || !created.user) {
    const code = createErr && 'code' in createErr ? String(createErr.code) : ''
    if (code === 'email_exists' || code === 'user_already_exists') {
      return { error: 'Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte melde dich mit deinem Passwort an.' }
    }
    if (code === 'weak_password') return { error: 'Das Passwort ist zu schwach. Bitte wähle ein längeres oder weniger übliches Passwort.' }
    if (code === 'over_request_rate_limit' || createErr?.status === 429) return { error: ZU_OFT }
    return { error: 'Das Konto konnte nicht angelegt werden. Bitte versuche es später noch einmal.' }
  }
  const fehler = await nimm(p.data.token, created.user.id, inv.email)
  if (fehler) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: fehler }
  }
  await admin.from('user_profiles').update({ display_name: p.data.name }).eq('id', created.user.id)

  const supabase = await createClient()
  const { error: signErr } = await supabase.auth.signInWithPassword({ email: inv.email, password: p.data.password })
  if (signErr) redirect('/login?message=' + encodeURIComponent('Dein Konto ist angelegt. Bitte melde dich an.'))
  redirect('/dashboard')
}

/** Bestehender Nutzer ohne Sitzung: Anmeldung mit der E-Mail der Einladung, dann Annahme. */
export async function anmeldenUndAnnehmen(_prev: EinladungState, formData: FormData): Promise<EinladungState> {
  if (!(await versuchErlaubt())) return { error: ZU_OFT }
  const p = parseForm(formData, loginSchema)
  if (!p.ok) return { error: issueMessage(p) }
  const inv = await ladeEinladung(p.data.token)
  if (!inv.ok) return { error: UNGUELTIG }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: inv.email, password: p.data.password })
  if (error || !data.user) return { error: 'E-Mail oder Passwort stimmt nicht. Hast du noch kein Konto, lege es oben neu an.' }
  const fehler = await nimm(p.data.token, data.user.id, inv.email)
  if (fehler) return { error: fehler }
  redirect('/dashboard')
}

/** Bereits angemeldeter Nutzer: Annahme, wenn die angemeldete E-Mail zur Einladung passt. */
export async function angemeldetAnnehmen(_prev: EinladungState, formData: FormData): Promise<EinladungState> {
  if (!(await versuchErlaubt())) return { error: ZU_OFT }
  const p = parseForm(formData, tokenSchema)
  if (!p.ok) return { error: issueMessage(p) }
  const { user } = await getAuthUser()
  if (!user?.email) return { error: 'Bitte melde dich an.' }
  const inv = await ladeEinladung(p.data.token)
  if (!inv.ok || normalisiereEmail(user.email) !== inv.email) return { error: UNGUELTIG }
  const fehler = await nimm(p.data.token, user.id, user.email)
  if (fehler) return { error: fehler }
  redirect('/dashboard')
}

/** Abmelden und zur selben Einladung zurueck (falls mit der falschen Adresse angemeldet). */
export async function abmeldenFuerEinladung(formData: FormData): Promise<void> {
  const p = parseForm(formData, tokenSchema)
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(p.ok && istTokenFormat(p.data.token) ? `/einladung/${p.data.token}` : '/login')
}
