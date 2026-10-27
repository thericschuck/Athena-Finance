import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type { ScopeContext } from '@/lib/haushalt/scope'
import {
  akteurName, beschreibeAenderung, bereichTabellen, cursorKodieren, cursorLesen, objektLink, objektName,
  tabellenLabel, zeitraumAb, type AuditZeile, type MitgliedNamen,
} from '@/lib/aenderungen/format'

/**
 * Aenderungslog (Haushalt Phase 5): liest NUR die View v_audit_feed (security_invoker). Die RLS entscheidet, was der Nutzer
 * sieht: eigene Zeilen plus Zeilen der Haushaltstabellen seiner Peers (categories/belege der Peers nie).
 * Der Scope-Switcher gilt hier bewusst nicht: das Log zeigt immer alles, was der Nutzer sehen darf.
 */

type DB = SupabaseClient<Database>

const COLS = 'id, created_at, table_name, record_id, action, old_values, new_values, owner_id, actor_id, actor_kind, actor_name'

function obj(v: Json | null): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

type Roh = {
  id: number | null
  created_at: string | null
  table_name: string | null
  record_id: string | null
  action: string | null
  old_values: Json | null
  new_values: Json | null
  owner_id: string | null
  actor_id: string | null
  actor_kind: string | null
  actor_name: string | null
}

function zuZeile(r: Roh): AuditZeile | null {
  if (r.id === null || !r.created_at || !r.table_name || !r.action) return null
  return {
    id: r.id,
    created_at: r.created_at,
    table_name: r.table_name,
    record_id: r.record_id,
    action: r.action,
    old_values: obj(r.old_values),
    new_values: obj(r.new_values),
    owner_id: r.owner_id,
    actor_id: r.actor_id,
    actor_kind: r.actor_kind ?? 'unknown',
    actor_name: r.actor_name,
  }
}

/** Mitgliedsnamen aus dem Scope (die Peer-Sicht auf user_profiles kann in der View fehlen -> "Mitglied"). */
export function mitgliedNamen(ctx: ScopeContext): MitgliedNamen {
  return new Map(ctx.members.map(m => [m.id, m.name]))
}

/** Aenderungsanzeigen nur, wenn mehrere Mitglieder bearbeiten koennen (Alleinstehende: alles unveraendert). */
export function zeigeUrheber(ctx: ScopeContext): boolean {
  return ctx.available.length > 1
}

// ---------------------------------------------------------------------------------------------------------
// (a) Zuletzt geaendert

export type ZuletztGeaendertInfo = {
  /** ISO-Zeitpunkt der letzten Aenderung. */
  wann: string
  /** 'Du', Mitgliedsname, 'System' oder 'Unbekannt'. */
  wer: string
  /** Kurzer Satz, z. B. "Betrag von 12,00 EUR auf 15,00 EUR" oder "angelegt". */
  aktion: string
}

/**
 * Letzte Aenderung je Datensatz, in EINER Abfrage (kein N+1). Rueckgabe: Map record_id -> Info; Datensaetze ohne Logzeile
 * (z. B. vor dem Trigger angelegt) fehlen. Leer, wenn der Nutzer allein ist.
 * Der Abfrage-Deckel (ids * 6, max. 600) reicht, damit jede ID mit hoher Wahrscheinlichkeit ihre neueste Zeile erhaelt;
 * bei sehr aenderungsreichen Datensaetzen kann eine aeltere ID ohne Info bleiben (nur Anzeige, keine Fachlogik).
 */
export async function letzteAenderungen(
  supabase: DB,
  ctx: ScopeContext,
  tabelle: string,
  recordIds: readonly string[],
): Promise<Map<string, ZuletztGeaendertInfo>> {
  const out = new Map<string, ZuletztGeaendertInfo>()
  if (!zeigeUrheber(ctx)) return out
  const ids = [...new Set(recordIds.filter(Boolean))]
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('v_audit_feed')
    .select(COLS)
    .eq('table_name', tabelle)
    .in('record_id', ids)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.min(600, ids.length * 6))
  if (error || !data) return out

  const namen = mitgliedNamen(ctx)
  for (const r of data as Roh[]) {
    const z = zuZeile(r)
    if (!z?.record_id || out.has(z.record_id)) continue
    out.set(z.record_id, {
      wann: z.created_at,
      wer: akteurName(z, ctx.userId, namen),
      aktion: beschreibeAenderung(z),
    })
  }
  return out
}

export async function letzteAenderung(
  supabase: DB,
  ctx: ScopeContext,
  tabelle: string,
  recordId: string,
): Promise<ZuletztGeaendertInfo | null> {
  return (await letzteAenderungen(supabase, ctx, tabelle, [recordId])).get(recordId) ?? null
}

// ---------------------------------------------------------------------------------------------------------
// (b) Verlaufsliste

export type VerlaufFilter = {
  /** BereichKey aus format.ts; leer/unbekannt = alle. */
  bereich?: string | null
  /** 'alle' | 'ich' | 'system' | Mitglieds-ID. */
  person?: string | null
  /** ZeitraumKey: 'alle' | '24h' | '7d' | '30d' | '90d'. */
  zeitraum?: string | null
  /** Cursor aus einer vorherigen Antwort. */
  cursor?: string | null
  limit?: number
}

export type VerlaufEintrag = {
  id: number
  wann: string
  wer: string
  /** Bereich des Objekts, z. B. "Konto". */
  art: string
  /** Name des Objekts (gekuerzt, IBAN maskiert). */
  objekt: string
  /** Kurzer deutscher Satz. */
  aktion: string
  href: string | null
}

export type VerlaufSeite = {
  eintraege: VerlaufEintrag[]
  /** null = keine weiteren Eintraege. */
  naechsterCursor: string | null
}

export const VERLAUF_SEITE = 50

export async function ladeVerlauf(supabase: DB, ctx: ScopeContext, f: VerlaufFilter = {}): Promise<VerlaufSeite> {
  const limit = Math.min(Math.max(f.limit ?? VERLAUF_SEITE, 1), 200)
  let q = supabase.from('v_audit_feed').select(COLS)

  const tabellen = bereichTabellen(f.bereich)
  if (tabellen) q = q.in('table_name', tabellen)

  const ab = zeitraumAb(f.zeitraum)
  if (ab) q = q.gte('created_at', ab)

  const p = f.person
  if (p === 'ich') q = q.eq('actor_id', ctx.userId)
  else if (p === 'system') q = q.eq('actor_kind', 'system')
  else if (p && ctx.members.some(m => m.id === p)) q = q.eq('actor_id', p)

  const c = cursorLesen(f.cursor)
  if (c) {
    // Zeitstempel quoten (enthaelt ':' und ggf. '+'); Format ist durch cursorLesen streng geprueft.
    q = q.or(`created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`)
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (error || !data) return { eintraege: [], naechsterCursor: null }

  const zeilen = (data as Roh[]).map(zuZeile).filter((z): z is AuditZeile => z !== null)
  const mehr = zeilen.length > limit
  const seite = mehr ? zeilen.slice(0, limit) : zeilen
  const namen = mitgliedNamen(ctx)

  const eintraege = seite.map<VerlaufEintrag>(z => ({
    id: z.id,
    wann: z.created_at,
    wer: akteurName(z, ctx.userId, namen),
    art: tabellenLabel(z.table_name),
    objekt: objektName(z),
    aktion: beschreibeAenderung(z),
    href: objektLink(z),
  }))
  const letzte = seite[seite.length - 1]
  return {
    eintraege,
    naechsterCursor: mehr && letzte ? cursorKodieren({ createdAt: letzte.created_at, id: letzte.id }) : null,
  }
}
