'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, optText, optUuid, optMoneyField } from '@/lib/api/schemas'
import { pruefeEltern } from '@/lib/kategorien/berechnen'
import { requireRows } from '@/lib/data/mutation'
import { speichereSteuerOverride, type SteuerWerte } from '@/lib/tax/overrides'

export type CategoryActionState = { error: string } | { success: true } | null

type DB = SupabaseClient<Database>

/**
 * Erlaubte Werte fuer die steuerliche Rolle -- muss zum Check-Constraint aus
 * 20260906140000_tax_engine.sql passen. Leerer String heisst "nicht zugeordnet"
 * und wird zu NULL: die Steuer-Engine rechnet nur mit gesetzten Rollen und
 * meldet den Rest als unzugeordnet, statt etwas anzunehmen.
 */
const TAX_ROLES = ['betriebseinnahme', 'betriebsausgabe', 'lohn', 'privat'] as const

/**
 * Die EUER-Zeile. Geprueft wird nur die Form -- ob es die Nummer im
 * hinterlegten Jahrgang gibt, entscheidet der Rechenkern, und eine unbekannte
 * Nummer landet dort in der Sammelzeile statt zu verschwinden.
 */
function leseEuerZeile(formData: FormData): number | null {
  const roh = (formData.get('euer_zeile') as string | null)?.trim()
  if (!roh) return null
  const n = Number(roh)
  return Number.isInteger(n) && n > 0 && n < 200 ? n : null
}

function leseTaxRole(formData: FormData): string | null {
  const wert = (formData.get('tax_role') as string | null)?.trim()
  if (!wert) return null
  return (TAX_ROLES as readonly string[]).includes(wert) ? wert : null
}

/** Betrieblicher Anteil in Prozent. Leer = null (= 100 %); ausserhalb 0-100 oder keine Zahl = null. */
function leseBusinessShare(formData: FormData): number | null {
  const roh = (formData.get('business_share') as string | null)?.trim().replace(',', '.')
  if (!roh) return null
  const n = Number(roh)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null
}

/** Steuerwerte aus dem Formular. Neutrale Kategorien haben keine Steuerrolle — das Formular blendet das Feld aus, schickt den Wert aber mit. */
function leseSteuerWerte(formData: FormData, typ: string): SteuerWerte {
  return {
    tax_role: typ === 'neutral' ? null : leseTaxRole(formData),
    euer_zeile: leseEuerZeile(formData),
    business_share: leseBusinessShare(formData),
  }
}

/** Farbe nur als #rrggbb; alles andere wird zu null (die Seite faellt dann auf die Standardfarbe zurueck). */
const farbe = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim() ?? ''
    return /^#[0-9a-fA-F]{6}$/.test(t) ? t.toLowerCase() : null
  })

const categoryFields = {
  name: reqText('Name ist erforderlich', 100),
  type: reqEnum(['expense', 'income', 'neutral'] as const, 'Typ ist erforderlich'),
  parent_id: optUuid(),
  color: farbe,
  icon: optText(64),
  budget_monthly: optMoneyField('Monatsbudget ist ungültig'),
}
const createCategorySchema = z.object(categoryFields)
const updateCategorySchema = z.object({ id: idField(), ...categoryFields })

type Eltern = { id: string; name: string; parent_id: string | null; type: string }

/** Alle Kategorien des Haushalts (RLS) in der schmalen Form, die die Hierarchie-Pruefung braucht. */
async function ladeBaum(supabase: DB): Promise<{ liste: Eltern[]; fehler: string | null }> {
  const { data, error } = await supabase.from('categories').select('id, name, parent_id, type')
  if (error || !data) return { liste: [], fehler: error?.message ?? 'Kategorien konnten nicht gelesen werden' }
  return { liste: data, fehler: null }
}

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createCategorySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const felder = parsed.data

  const { liste, fehler } = await ladeBaum(supabase)
  if (fehler) return { error: fehler }
  // Besitz und Ebenen: die Eltern muessen zum Haushalt gehoeren (sonst stehen sie nicht in `liste`; die RLS liefert nur den Haushaltsbaum).
  const elternFehler = pruefeEltern(liste, null, felder.parent_id)
  if (elternFehler) return { error: elternFehler }
  // Eine Unterkategorie erbt den Typ der Hauptkategorie: ein abweichender Typ liesse Rollup und Fluss-Regel auseinanderlaufen.
  const eltern = felder.parent_id ? liste.find((k) => k.id === felder.parent_id) : undefined
  const typ = eltern?.type ?? felder.type

  // Ans Ende der Geschwister.
  const basis = supabase.from('categories').select('sort_order')
  const geschwister = await (felder.parent_id ? basis.eq('parent_id', felder.parent_id) : basis.is('parent_id', null))
    .order('sort_order', { ascending: false })
    .limit(1)
  const naechste = (geschwister.data?.[0]?.sort_order ?? -1) + 1

  // Steuerwerte gehoeren der Person (category_tax_overrides), nicht der geteilten Kategorie: erst die Kategorie, dann der Override des Handelnden.
  const { data: neu, error } = await supabase
    .from('categories')
    .insert({ ...felder, type: typ, user_id: user.id, sort_order: naechste })
    .select('id')
    .single()
  if (error || !neu) return { error: error?.message ?? 'Kategorie konnte nicht angelegt werden' }

  const steuer = await speichereSteuerOverride(supabase, user.id, neu.id, leseSteuerWerte(formData, typ))
  if (steuer.error) return { error: steuer.error }
  revalidatePath('/finance/categories')
  return { success: true }
}

export async function updateCategory(
  _prev: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateCategorySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...felder } = parsed.data

  const { liste, fehler } = await ladeBaum(supabase)
  if (fehler) return { error: fehler }
  const aktuell = liste.find((k) => k.id === id)
  if (!aktuell) return { error: 'Kategorie nicht gefunden' }

  if (istFest(aktuell)) {
    if (felder.name.trim().toLowerCase() !== aktuell.name.trim().toLowerCase() || felder.parent_id !== null) {
      return {
        error: `Die Hauptkategorie „${aktuell.name}“ ist fest in die Auswertung eingebaut (Anlagen und Forderungen werden an ihrem Namen erkannt) und lässt sich nicht umbenennen oder verschieben.`,
      }
    }
  }

  // Nur pruefen, wenn sich die Eltern aendern -- ein bestehender Altbestand soll sich weiter speichern lassen.
  if (felder.parent_id !== aktuell.parent_id) {
    const elternFehler = pruefeEltern(liste, id, felder.parent_id)
    if (elternFehler) return { error: elternFehler }
  }
  const eltern = felder.parent_id ? liste.find((k) => k.id === felder.parent_id) : undefined
  const typ = eltern?.type ?? felder.type

  const { error } = await requireRows(supabase
    .from('categories')
    .update({ ...felder, type: typ })
    .eq('id', id))
  if (error) return { error: error.message }

  // Steuerwerte nur fuer den Handelnden (Override); die Legacy-Spalten in categories werden nicht mehr beschrieben (siehe lib/tax/overrides.ts).
  const steuer = await speichereSteuerOverride(supabase, user.id, id, leseSteuerWerte(formData, typ))
  if (steuer.error) return { error: steuer.error }

  // Aendert sich der Typ einer Hauptkategorie, ziehen die Unterkategorien nach (sonst waere die Vererbung gebrochen).
  if (!felder.parent_id && typ !== aktuell.type) {
    const { error: kinderFehler } = await supabase
      .from('categories')
      .update({ type: typ })
      .eq('parent_id', id)
    if (kinderFehler) return { error: kinderFehler.message }
  }

  revalidatePath('/finance/categories')
  return { success: true }
}

// ─── Loeschen mit Folgen ──────────────────────────────────────────────────────────

export interface LoeschFolgen {
  /** Manuelle Buchungen (transactions) in dieser Kategorie. */
  buchungen: number
  /** Bankbuchungen (bank_transactions) in dieser Kategorie. */
  bankBuchungen: number
  /** Vertraege, die diese Kategorie nutzen (sie verlieren die Zuordnung). */
  vertraege: number
  /** Direkte Unterkategorien. */
  unterkategorien: number
}

async function zaehle(
  supabase: DB,
  tabelle: 'transactions' | 'bank_transactions' | 'contracts' | 'categories',
  spalte: 'category_id' | 'parent_id',
  id: string,
): Promise<number> {
  const { count } = await supabase
    .from(tabelle)
    .select('id', { count: 'exact', head: true })
    .eq(spalte as 'id', id)
  return count ?? 0
}

/** Was haengt an der Kategorie? Frisch aus der Datenbank, damit der Dialog nicht mit veralteten Zahlen warnt. */
export async function ladeLoeschFolgen(id: string): Promise<{ error?: string; folgen?: LoeschFolgen }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const [buchungen, bankBuchungen, vertraege, unterkategorien] = await Promise.all([
    zaehle(supabase, 'transactions', 'category_id', id),
    zaehle(supabase, 'bank_transactions', 'category_id', id),
    zaehle(supabase, 'contracts', 'category_id', id),
    zaehle(supabase, 'categories', 'parent_id', id),
  ])
  return { folgen: { buchungen, bankBuchungen, vertraege, unterkategorien } }
}

/**
 * Die View `unified_transactions` erkennt Forderungen und Anlagen am NAMEN der Hauptkategorie
 * („Schulden“ bzw. alles Neutrale außer „Transfers“). Wer diese zwei Hauptkategorien umbenennt, verschiebt
 * oder löscht, kippt still alle ihre Buchungen in eine andere Buchungsart — deshalb sind sie gesperrt.
 */
const FESTE_HAUPTKATEGORIEN = new Set(['transfers', 'schulden'])
const istFest = (k: { name: string; parent_id: string | null }) =>
  k.parent_id === null && FESTE_HAUPTKATEGORIEN.has(k.name.trim().toLowerCase())

const loeschSchema = z.object({ id: uuid, zielId: uuid.nullable() })

/**
 * Loescht eine Kategorie. Mit `zielId` werden vorher alle Buchungen (manuell und Bank) und
 * Vertraege in die Zielkategorie umgehaengt; ohne verlieren sie ihre Kategorie (die Datenbank setzt
 * die Verweise auf NULL, ON DELETE SET NULL). Hat die Kategorie Unterkategorien, wird NICHT
 * geloescht: sonst wuerden sie still zu Hauptkategorien (ebenfalls SET NULL). Die Reihenfolge ist
 * bewusst: erst umhaengen, dann loeschen -- bricht etwas dazwischen ab, ist nichts verloren.
 */
export async function verschiebeBuchungenUndLoesche(
  id: string,
  zielId: string | null,
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(loeschSchema, { id, zielId })
  if (!p.ok) return { error: issueMessage(p) }

  const { liste, fehler } = await ladeBaum(supabase)
  if (fehler) return { error: fehler }
  const zuLoeschen = liste.find((k) => k.id === id)
  if (!zuLoeschen) return { error: 'Kategorie nicht gefunden' }
  if (istFest(zuLoeschen)) {
    return { error: `Die Hauptkategorie „${zuLoeschen.name}“ ist fest in die Auswertung eingebaut und lässt sich nicht löschen.` }
  }
  if (liste.some((k) => k.parent_id === id)) {
    return { error: 'Die Kategorie hat Unterkategorien. Verschiebe oder lösche diese zuerst.' }
  }

  if (zielId) {
    if (zielId === id) return { error: 'Das Ziel darf nicht die gelöschte Kategorie sein' }
    if (!liste.some((k) => k.id === zielId)) return { error: 'Zielkategorie nicht gefunden' }

    const buchungen = await supabase
      .from('transactions')
      .update({ category_id: zielId })
      .eq('category_id', id)
    if (buchungen.error) return { error: buchungen.error.message }

    // Bankbuchungen: die Zuordnung ist jetzt eine bewusste, die KI/Regeln duerfen sie nicht ueberschreiben.
    const bank = await supabase
      .from('bank_transactions')
      .update({ category_id: zielId, category_source: 'manual' })
      .eq('category_id', id)
    if (bank.error) return { error: bank.error.message }

    const vertraege = await supabase
      .from('contracts')
      .update({ category_id: zielId })
      .eq('category_id', id)
    if (vertraege.error) return { error: vertraege.error.message }
  }

  const { error } = await requireRows(supabase.from('categories').delete().eq('id', id))
  if (error) return { error: error.message }

  revalidatePath('/finance/categories')
  revalidatePath('/finance/transactions')
  return {}
}

// ─── Reihenfolge ──────────────────────────────────────────────────────────────────

const sortSchema = z.array(uuid).max(500, 'Zu viele Kategorien')

/** Speichert die Anzeigereihenfolge: `sort_order` = Index in `ids` (Kategorien des Haushalts, RLS). */
export async function sortiereKategorien(ids: string[]): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const parsed = parseInput(sortSchema, ids)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  if (new Set(parsed.data).size !== parsed.data.length) return { error: 'Doppelte Kategorien' }

  const ergebnisse = await Promise.all(
    parsed.data.map((id, index) =>
      supabase.from('categories').update({ sort_order: index }).eq('id', id),
    ),
  )
  const fehler = ergebnisse.find((r) => r.error)?.error
  if (fehler) return { error: fehler.message }

  revalidatePath('/finance/categories')
  return {}
}
