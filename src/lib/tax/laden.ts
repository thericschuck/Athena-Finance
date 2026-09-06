import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Tarif } from './tarif.ts'
import type { SteuerEingaben } from './position.ts'
import { leseSteuerprofil } from './profil.ts'
import { effektiveRollen } from './rollen.ts'

type DB = SupabaseClient<Database>

/**
 * Buchungen eines Jahres, seitenweise. Direkt abgefragt wuerde der
 * 1.000-Zeilen-Deckel von PostgREST stillschweigend zuschlagen -- bei einer
 * Steuerrechnung heisst das ein zu niedriger Gewinn ohne jede Fehlermeldung.
 * Dieselbe Falle ist in src/lib/account-history.ts dokumentiert.
 */
async function buchungenImJahr(supabase: DB, userId: string, jahr: number) {
  const SEITE = 1000
  const zeilen: { category_id: string | null; signed_amount: number; date: string }[] = []

  for (let seite = 0; seite < 50; seite++) {
    const { data, error } = await supabase
      .from('unified_transactions')
      .select('category_id, signed_amount, date')
      .eq('user_id', userId)
      .eq('flow_kind', 'echt')
      .gte('date', `${jahr}-01-01`)
      .lte('date', `${jahr}-12-31`)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(seite * SEITE, seite * SEITE + SEITE - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    for (const r of data) {
      if (r.signed_amount === null || r.date === null) continue
      zeilen.push({
        category_id: r.category_id,
        signed_amount: Number(r.signed_amount),
        date: r.date,
      })
    }
    if (data.length < SEITE) break
  }
  return zeilen
}

/** Erkennt das Ruecklage-Sparziel eines Jahres, tolerant gegen ue/ü. */
function istRuecklageZiel(beschreibung: string | null, jahr: number): boolean {
  if (!beschreibung) return false
  const normal = beschreibung.toLowerCase().replace(/ü/g, 'ue')
  return normal.includes('steuerruecklage') && normal.includes(String(jahr))
}

export type LadeErgebnis = {
  eingaben: SteuerEingaben
  /** Fuer die Anzeige: welche Kategorien welche Rolle tragen. */
  rollen: { kategorie: string; rolle: string | null; summe: number }[]
  /** Name des gefundenen Ruecklage-Sparziels, falls vorhanden. */
  ruecklageZiel: { id: string; beschreibung: string; ziel: number | null } | null
}

/**
 * Holt alles, was `berechneSteuerposition` braucht -- aus der Datenbank, unter
 * RLS, fuer genau einen Nutzer. Getrennt vom Rechnen, damit der Kern eine reine
 * Funktion bleibt und dieselbe Ladelogik von Athenas Werkzeug und von der
 * Steuer-Seite benutzt wird.
 */

export async function ladeSteuerdaten(
  supabase: DB,
  userId: string,
  jahr: number,
): Promise<LadeErgebnis> {
  const [tarifeRes, kategorienRes, profilRes, zieleRes] = await Promise.all([
    supabase.from('tax_tariffs').select('*').order('jahr', { ascending: true }),
    supabase.from('categories').select('id, name, parent_id, tax_role, type').eq('user_id', userId),
    supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', 'tax_profile').maybeSingle(),
    supabase.from('savings_goals').select('id, description, target_amount, current_amount').eq('user_id', userId),
  ])
  if (tarifeRes.error) throw new Error(tarifeRes.error.message)
  if (kategorienRes.error) throw new Error(kategorienRes.error.message)

  const tarife = (tarifeRes.data ?? []) as Tarif[]
  if (tarife.length === 0) {
    throw new Error(
      'Es ist kein Steuertarif hinterlegt (Tabelle tax_tariffs ist leer). Ohne Tarif wird hier nichts geschaetzt.',
    )
  }
  // Naechstgelegenes Jahr -- nicht einfach das neueste. Fuer eine Abfrage zu
  // 2024 ist der Tarif 2026 die schlechtere Wahl, wenn 2025 vorliegt.
  const tarif = tarife.reduce((beste, kandidat) =>
    Math.abs(kandidat.jahr - jahr) < Math.abs(beste.jahr - jahr) ? kandidat : beste,
  )

  const kategorien = kategorienRes.data ?? []
  const rollenMap = effektiveRollen(kategorien)
  const nameMap = new Map(kategorien.map(k => [k.id, k.name]))
  const typMap = new Map(kategorien.map(k => [k.id, k.type]))

  const [buchungen, buchungenVorjahr] = await Promise.all([
    buchungenImJahr(supabase, userId, jahr),
    buchungenImJahr(supabase, userId, jahr - 1),
  ])

  let betriebseinnahmen = 0
  let betriebsausgaben = 0
  let lohnNetto = 0
  const lohnMonate = new Set<string>()
  const unzugeordnetMap = new Map<string, number>()
  const summeJeKategorie = new Map<string, number>()

  for (const b of buchungen) {
    const rolle = b.category_id ? rollenMap.get(b.category_id) ?? null : null
    if (b.category_id) {
      summeJeKategorie.set(
        b.category_id,
        (summeJeKategorie.get(b.category_id) ?? 0) + b.signed_amount,
      )
    }

    if (rolle === 'betriebseinnahme') {
      // Nur Zufluesse. Eine Gutschrift in einer Einnahmen-Kategorie mit
      // negativem Vorzeichen ist eine Rueckzahlung und mindert den Umsatz.
      betriebseinnahmen += b.signed_amount
    } else if (rolle === 'betriebsausgabe') {
      betriebsausgaben += -b.signed_amount
    } else if (rolle === 'lohn') {
      if (b.signed_amount > 0) {
        lohnNetto += b.signed_amount
        lohnMonate.add(b.date.slice(0, 7))
      }
    } else if (rolle === null && b.signed_amount > 0) {
      // Zufluss in einer Kategorie ohne Rolle. Nur solche mit Kategorietyp
      // 'income' melden -- eine Erstattung in "Shopping" ist keine
      // unversteuerte Einnahme, sondern zurueckgegebenes Geld.
      const typ = b.category_id ? typMap.get(b.category_id) : undefined
      if (typ === 'income') {
        const name = (b.category_id ? nameMap.get(b.category_id) : null) ?? '(ohne Kategorie)'
        unzugeordnetMap.set(name, (unzugeordnetMap.get(name) ?? 0) + b.signed_amount)
      }
    }
  }

  let umsatzVorjahr: number | null = null
  for (const b of buchungenVorjahr) {
    const rolle = b.category_id ? rollenMap.get(b.category_id) ?? null : null
    if (rolle === 'betriebseinnahme') {
      umsatzVorjahr = (umsatzVorjahr ?? 0) + b.signed_amount
    }
  }
  // Kein Vorjahresumsatz gefunden: das kann "war 0" oder "keine Daten" heissen.
  // Gab es im Vorjahr ueberhaupt Buchungen, ist 0 eine Aussage; sonst nicht.
  if (umsatzVorjahr === null && buchungenVorjahr.length > 0) umsatzVorjahr = 0

  const ziel = (zieleRes.data ?? []).find(z => istRuecklageZiel(z.description, jahr)) ?? null

  return {
    eingaben: {
      jahr,
      tarif,
      betriebseinnahmen,
      betriebsausgaben,
      lohnNettoImJahr: lohnNetto,
      monateMitLohn: lohnMonate.size,
      profil: leseSteuerprofil(profilRes.data?.value ?? null),
      umsatzVorjahr,
      ruecklageIst: ziel ? Number(ziel.current_amount ?? 0) : null,
      unzugeordnet: Array.from(unzugeordnetMap, ([kategorie, betrag]) => ({
        kategorie,
        betrag: Math.round(betrag * 100) / 100,
      })).sort((a, b) => b.betrag - a.betrag),
    },
    rollen: kategorien
      .filter(k => rollenMap.get(k.id) !== null || summeJeKategorie.has(k.id))
      .map(k => ({
        kategorie: k.name,
        rolle: rollenMap.get(k.id) ?? null,
        summe: Math.round((summeJeKategorie.get(k.id) ?? 0) * 100) / 100,
      })),
    ruecklageZiel: ziel
      ? {
          id: ziel.id,
          beschreibung: ziel.description ?? '',
          ziel: ziel.target_amount === null ? null : Number(ziel.target_amount),
        }
      : null,
  }
}
