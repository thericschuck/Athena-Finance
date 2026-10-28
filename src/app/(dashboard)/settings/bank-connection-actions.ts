'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { parseForm, issueMessage } from '@/lib/api/validate'
import { idField, optText } from '@/lib/api/schemas'
import {
  createBankConnection, deleteBankConnection, listBankConnections, updateBankConnection,
  isEnvConnectionUser, envCredentials, maskUsername,
  type BankConnectionPublic,
} from '@/lib/fints/connections'

/**
 * Server Actions fuer die Bankverbindungen (Einstellungen -> Integrationen).
 * Geheimnisse (Benutzerkennung, PIN) werden hier nur entgegengenommen und sofort verschluesselt gespeichert;
 * zurueck zum Browser geht nie etwas davon (nur BankConnectionPublic mit maskiertem Namen).
 */

export type BankConnectionState = { error: string } | { success: true } | null

/** Hinweis fuer die UI: laeuft der Sync gerade ueber die alte Env-Verbindung (Fallback)? */
export interface BankConnectionsOverview {
  connections: BankConnectionPublic[]
  /** Nur gesetzt, wenn der Nutzer keine eigene Verbindung hat, aber die Env-Verbindung nutzt. */
  envFallback: { label: string; blz: string; usernameHint: string } | null
}

const required = 'Bitte alle Pflichtfelder ausfüllen'

const baseFields = {
  label: z.string({ error: required }).trim().min(1, 'Bezeichnung ist erforderlich').max(80, 'Bezeichnung ist zu lang (max. 80 Zeichen)'),
  fints_url: z.string({ error: required }).trim().min(1, 'Bank-URL ist erforderlich').max(300, 'Bank-URL ist zu lang'),
  tan_medium: optText(100),
}

const createSchema = z.object({
  ...baseFields,
  blz: z.string({ error: required }).transform(v => v.replace(/\D/g, '')).pipe(z.string().length(8, 'Die BLZ muss genau 8 Ziffern haben')),
  username: z.string({ error: required }).trim().min(1, 'Benutzerkennung ist erforderlich').max(100, 'Benutzerkennung ist zu lang'),
  pin: z.string({ error: required }).min(1, 'PIN ist erforderlich').max(100, 'PIN ist zu lang'),
})

const updateSchema = z.object({
  id: idField(),
  ...baseFields,
  // Leer = PIN unveraendert lassen.
  pin: z.string().max(100, 'PIN ist zu lang').optional(),
})

const deleteSchema = z.object({ id: idField() })

export async function getBankConnectionsOverview(): Promise<BankConnectionsOverview> {
  const { user } = await getAuthUser()
  if (!user) return { connections: [], envFallback: null }
  const connections = await listBankConnections(user.id)
  let envFallback: BankConnectionsOverview['envFallback'] = null
  if (connections.length === 0 && isEnvConnectionUser(user.id, process.env)) {
    const env = envCredentials(process.env)
    if (env) envFallback = { label: env.label, blz: env.blz, usernameHint: maskUsername(env.username) }
  }
  return { connections, envFallback }
}

export async function addBankConnection(_prev: BankConnectionState, formData: FormData): Promise<BankConnectionState> {
  const { user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const d = parsed.data

  try {
    await createBankConnection(user.id, {
      label: d.label, fintsUrl: d.fints_url, blz: d.blz, username: d.username, pin: d.pin, tanMedium: d.tan_medium,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Speichern fehlgeschlagen' }
  }
  revalidatePath('/settings')
  return { success: true }
}

export async function editBankConnection(_prev: BankConnectionState, formData: FormData): Promise<BankConnectionState> {
  const { user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const d = parsed.data

  try {
    await updateBankConnection(user.id, d.id, {
      label: d.label, fintsUrl: d.fints_url, tanMedium: d.tan_medium, pin: d.pin || undefined,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Speichern fehlgeschlagen' }
  }
  revalidatePath('/settings')
  return { success: true }
}

export async function removeBankConnection(_prev: BankConnectionState, formData: FormData): Promise<BankConnectionState> {
  const { user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, deleteSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  try {
    await deleteBankConnection(user.id, parsed.data.id)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Löschen fehlgeschlagen' }
  }
  revalidatePath('/settings')
  return { success: true }
}
