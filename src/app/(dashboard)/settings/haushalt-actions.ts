'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid } from '@/lib/api/schemas'
import {
  EINLADUNG_GUELTIG_TAGE, einladungsLink, erzeugeToken, hashToken, istTokenFormat, normalisiereEmail,
} from '@/lib/haushalt/einladung'
import { basisUrl } from '@/lib/haushalt/einladung-server'
import { mailKonfiguriert, sendeEinladungsMail } from '@/lib/haushalt/einladung-mail'
import { neuesLimit } from '@/lib/haushalt/rate-limit'

/**
 * Server Actions fuer den Einstellungs-Abschnitt "Haushalt". Owner-Aktionen pruefen die Rolle selbst (zusaetzlich zur RLS auf
 * household_invites); Einladungen werden mit der Nutzer-Sitzung angelegt (RLS), der Klartext-Token wird nur einmal an den
 * Browser zurueckgegeben und nie gespeichert.
 */

export type HaushaltMitglied = { id: string; name: string | null; email: string | null; role: string; joinedAt: string; ich: boolean }
export type OffeneEinladung = { id: string; email: string; expiresAt: string; abgelaufen: boolean }
export interface HaushaltUebersicht {
  haushaltName: string | null
  istOwner: boolean
  mitglieder: HaushaltMitglied[]
  einladungen: OffeneEinladung[]
  mailMoeglich: boolean
}
export type EinladungErstellt = { error: string } | { success: true; link: string; token: string; email: string; ablauf: string } | null
export type SimpleState = { error: string } | { success: true } | null

const mailLimit = neuesLimit(10, 60 * 60 * 1000)

export async function getHaushaltUebersicht(): Promise<HaushaltUebersicht> {
  const leer: HaushaltUebersicht = { haushaltName: null, istOwner: false, mitglieder: [], einladungen: [], mailMoeglich: false }
  const { supabase, user } = await getAuthUser()
  if (!user) return leer

  const { data: members } = await supabase.from('household_members').select('household_id, user_id, role, joined_at').order('joined_at')
  const eigene = members?.find(m => m.user_id === user.id)
  if (!eigene || !members) return leer
  const peers = members.filter(m => m.household_id === eigene.household_id)
  const istOwner = eigene.role === 'owner'

  const [{ data: haus }, { data: profile }] = await Promise.all([
    supabase.from('households').select('name').eq('id', eigene.household_id).maybeSingle(),
    supabase.from('user_profiles').select('id, display_name').in('id', peers.map(p => p.user_id)),
  ])
  const namen = new Map((profile ?? []).map(p => [p.id, p.display_name]))

  // E-Mail-Adressen der Mitglieder: nur ueber die Admin-API, nur fuer Mitglieder DES EIGENEN Haushalts (RLS hat sie oben geliefert).
  const admin = createAdminClient()
  const mails = new Map<string, string | null>()
  await Promise.all(peers.map(async p => {
    const { data } = await admin.auth.admin.getUserById(p.user_id)
    mails.set(p.user_id, data.user?.email ?? null)
  }))

  let einladungen: OffeneEinladung[] = []
  if (istOwner) {
    const { data } = await supabase
      .from('household_invites')
      .select('id, email, expires_at')
      .eq('household_id', eigene.household_id)
      .is('used_at', null)
      .order('created_at', { ascending: false })
    einladungen = (data ?? []).map(i => ({
      id: i.id, email: i.email, expiresAt: i.expires_at, abgelaufen: new Date(i.expires_at).getTime() <= Date.now(),
    }))
  }

  return {
    haushaltName: haus?.name ?? null,
    istOwner,
    mitglieder: peers.map(p => ({
      id: p.user_id, name: namen.get(p.user_id) ?? null, email: mails.get(p.user_id) ?? null,
      role: p.role, joinedAt: p.joined_at, ich: p.user_id === user.id,
    })),
    einladungen,
    mailMoeglich: istOwner && mailKonfiguriert(),
  }
}

const einladungSchema = z.object({
  email: z.string({ error: 'E-Mail fehlt' }).transform(normalisiereEmail)
    .pipe(z.string().max(320, 'E-Mail ist zu lang').regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Bitte gib eine gültige E-Mail-Adresse an')),
})

export async function erstelleEinladung(_prev: EinladungErstellt, formData: FormData): Promise<EinladungErstellt> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseForm(formData, einladungSchema)
  if (!p.ok) return { error: issueMessage(p) }

  const { data: me } = await supabase.from('household_members').select('household_id, role').eq('user_id', user.id).maybeSingle()
  if (!me || me.role !== 'owner') return { error: 'Nur der Owner des Haushalts kann einladen.' }

  const admin = createAdminClient()
  // Ist die Adresse schon Mitglied? (Auth-Nutzer mit dieser E-Mail im selben Haushalt)
  const { data: peers } = await supabase.from('household_members').select('user_id').eq('household_id', me.household_id)
  for (const peer of peers ?? []) {
    const { data } = await admin.auth.admin.getUserById(peer.user_id)
    if (data.user?.email && normalisiereEmail(data.user.email) === p.data.email) {
      return { error: 'Diese Person ist bereits Mitglied des Haushalts.' }
    }
  }

  // Alte offene Einladungen derselben Adresse zurueckziehen: pro Adresse gilt immer nur der neueste Link.
  await supabase.from('household_invites').delete().eq('household_id', me.household_id).eq('email', p.data.email).is('used_at', null)

  const token = erzeugeToken()
  const ablauf = new Date(Date.now() + EINLADUNG_GUELTIG_TAGE * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('household_invites').insert({
    household_id: me.household_id, email: p.data.email, token_hash: hashToken(token), expires_at: ablauf, created_by: user.id,
  })
  if (error) return { error: 'Die Einladung konnte nicht erstellt werden. Bitte versuche es erneut.' }

  revalidatePath('/settings')
  return { success: true, link: einladungsLink(await basisUrl(), token), token, email: p.data.email, ablauf }
}

const mailSchema = z.object({ token: z.string({ error: 'Einladung fehlt' }) })

/**
 * Versendet eine EXISTIERENDE Einladung per Mail. Der Token kommt vom Owner-Browser (dort wurde er einmal angezeigt), die
 * Adresse und der Haushalt werden aber aus der Einladung gelesen, nicht aus der Eingabe: so laesst sich die Funktion nicht
 * als Mail-Relay fuer beliebige Empfaenger/Links missbrauchen.
 */
export async function sendeEinladungPerMail(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  if (!mailKonfiguriert()) return { error: 'Mailversand ist nicht eingerichtet (RESEND_API_KEY / REPORT_FROM_EMAIL).' }
  if (!mailLimit.erlaube(user.id)) return { error: 'Zu viele Mails in der letzten Stunde.' }
  const p = parseForm(formData, mailSchema)
  if (!p.ok) return { error: issueMessage(p) }
  if (!istTokenFormat(p.data.token)) return { error: 'Einladung ist ungültig' }

  const { data: me } = await supabase.from('household_members').select('household_id, role').eq('user_id', user.id).maybeSingle()
  if (!me || me.role !== 'owner') return { error: 'Nur der Owner des Haushalts kann Einladungen versenden.' }

  const admin = createAdminClient()
  const { data: inv } = await admin
    .from('household_invites').select('email, household_id, expires_at, used_at').eq('token_hash', hashToken(p.data.token)).maybeSingle()
  if (!inv || inv.household_id !== me.household_id || inv.used_at !== null || new Date(inv.expires_at).getTime() <= Date.now()) {
    return { error: 'Die Einladung ist ungültig oder abgelaufen.' }
  }
  const [{ data: haus }, { data: profil }] = await Promise.all([
    admin.from('households').select('name').eq('id', me.household_id).maybeSingle(),
    admin.from('user_profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ])
  try {
    await sendeEinladungsMail({
      to: inv.email,
      link: einladungsLink(await basisUrl(), p.data.token),
      haushalt: haus?.name ?? 'Haushalt',
      von: profil?.display_name ?? user.email ?? 'Ein Mitglied',
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Versand fehlgeschlagen' }
  }
  return { success: true }
}

export async function widerrufeEinladung(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(idField(), id)
  if (!p.ok) return { error: issueMessage(p) }
  const { data, error } = await supabase.from('household_invites').delete().eq('id', p.data).select('id')
  if (error) return { error: 'Die Einladung konnte nicht widerrufen werden.' }
  if (!data || data.length === 0) return { error: 'Einladung nicht gefunden' }
  revalidatePath('/settings')
  return {}
}

export async function entferneMitglied(userId: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(uuid, userId)
  if (!p.ok) return { error: issueMessage(p) }
  if (p.data === user.id) return { error: 'Du kannst dich nicht selbst entfernen.' }

  // Owner-Pruefung ueber die RLS-sichtbaren Zeilen; die Funktion prueft sie nochmals (Rolle, Haushalt, nur Rolle "member").
  const { data: members } = await supabase.from('household_members').select('household_id, user_id, role')
  const me = members?.find(m => m.user_id === user.id)
  const ziel = members?.find(m => m.user_id === p.data)
  if (!me || me.role !== 'owner') return { error: 'Nur der Owner des Haushalts kann Mitglieder entfernen.' }
  if (!ziel || ziel.household_id !== me.household_id) return { error: 'Mitglied nicht gefunden' }

  const { error } = await createAdminClient().rpc('fn_remove_household_member', {
    p_household: me.household_id, p_user: p.data, p_actor: user.id,
  })
  if (error) return { error: 'Das Mitglied konnte nicht entfernt werden.' }
  revalidatePath('/', 'layout')
  return {}
}
