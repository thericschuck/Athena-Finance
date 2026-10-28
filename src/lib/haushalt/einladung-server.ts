import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken, istTokenFormat } from './einladung'
import { neuesLimit } from './rate-limit'
import { SITE } from '@/lib/seo'

/**
 * Serverseitiger Zugriff auf Einladungen (Service-Role). Gesucht wird ausschliesslich per sha256-Hash des Tokens; der
 * Klartext wird nie gespeichert oder geloggt. Fehlerfaelle (unbekannt, abgelaufen, benutzt) sind fuer Aufrufer nicht
 * unterscheidbar: nur `ok: false`.
 */
export type EinladungInfo =
  | { ok: true; id: string; email: string; haushalt: string; haushaltId: string; ablauf: string }
  | { ok: false }

export async function ladeEinladung(token: unknown): Promise<EinladungInfo> {
  if (!istTokenFormat(token)) return { ok: false }
  const admin = createAdminClient()
  const { data: inv } = await admin
    .from('household_invites')
    .select('id, email, household_id, expires_at, used_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (!inv || inv.used_at !== null || new Date(inv.expires_at).getTime() <= Date.now()) return { ok: false }
  const { data: h } = await admin.from('households').select('name').eq('id', inv.household_id).maybeSingle()
  return {
    ok: true, id: inv.id, email: inv.email, haushalt: h?.name ?? 'Haushalt', haushaltId: inv.household_id, ablauf: inv.expires_at,
  }
}

/** Begrenzung je Client-Adresse (Token-Raten, Passwort-Probieren): 15 Versuche / 15 Minuten, best effort je Instanz. */
const limit = neuesLimit(15, 15 * 60 * 1000)

export async function versuchErlaubt(): Promise<boolean> {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || 'unbekannt'
  return limit.erlaube(ip)
}

/**
 * Basisadresse der Einladungslinks. Reihenfolge: NEXT_PUBLIC_SITE_URL, in Produktion die feste Site-URL (src/lib/seo.ts);
 * nur in der Entwicklung die Request-Header (localhost). Request-Header sind in Produktion bewusst NICHT die Quelle: ein
 * manipulierter Host-Header koennte sonst Links auf fremde Adressen erzeugen.
 */
export async function basisUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (env) return env.replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'production') return SITE.url
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`
}
