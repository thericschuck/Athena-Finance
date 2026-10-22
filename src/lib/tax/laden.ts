import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Tarif } from './tarif.ts'
import type { SteuerEingaben } from './position.ts'
import { leseSteuerprofil } from './profil.ts'
import { effektiveRollen, effektiveEuerZeilen, effektiveAnteile, wendeAnteilAn } from './rollen.ts'
import type { EuerBuchung, EuerZeileDef } from './euer.ts'
import { ladeKrakenRoh, ladeKrakenSteuer, type KrakenRoh } from './krypto-laden.ts'
import type { KrakenSteuer } from './krypto-kraken.ts'

type DB = SupabaseClient<Database>

/**
 * Buchungen eines Jahres, seitenweise. Direkt abgefragt wuerde der
 * 1.000-Zeilen-Deckel von PostgREST stillschweigend zuschlagen -- bei einer
 * Steuerrechnung heisst das ein zu niedriger Gewinn ohne jede Fehlermeldung.
 * Dieselbe Falle ist in src/lib/account-history.ts dokumentiert.
 */
async function buchungenImJahr(supabase: DB, userId: string, jahr: number) {
  const SEITE = 1000
  const zeilen: { id: string | null; category_id: string | null; signed_amount: number; date: string; description: string | null }[] = []

  for (let seite = 0; seite < 50; seite++) {
    const { data, error } = await supabase
      .from('unified_transactions')
      .select('id, category_id, signed_amount, date, description')
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
        id: r.id,
        category_id: r.category_id,
        signed_amount: Number(r.signed_amount),
        date: r.date,
        description: r.description,
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
  /** Alles, was `berechneEuer` zusaetzlich braucht. */
  euer: {
    zeilen: EuerZeileDef[]
    buchungen: EuerBuchung[]
    rollen: Map<string, string | null>
    euerZeilen: Map<string, number | null>
  }
  /** Belege des Nutzers, ohne die bereits ersetzten. */
  belege: {
    id: string
    transaction_id: string | null
    dateiname: string
    beleg_datum: string | null
    betrag: number | null
    aussteller: string | null
    pfad: string
    sha256: string | null
    hochgeladen_am: string
  }[]
  /** Fuer die Anzeige: welche Kategorien welche Rolle tragen. */
  rollen: { kategorie: string; rolle: string | null; summe: number }[]
  /** Name des gefundenen Ruecklage-Sparziels, falls vorhanden. */
  ruecklageZiel: { id: string; beschreibung: string; ziel: number | null } | null
  /** Krypto-Veraeusserungen (§ 23 EStG) aus der Kraken-Historie; null, wenn sie nicht geladen werden konnte. */
  krypto: KrakenSteuer | null
  /** Warum `krypto` fehlt. Wird angezeigt: ohne sie wuerde die Steuer still zu niedrig ausfallen. */
  kryptoFehler: string | null
}

/**
 * Holt alles, was `berechneSteuerposition` braucht -- aus der Datenbank, unter
 * RLS, fuer genau einen Nutzer. Getrennt vom Rechnen, damit der Kern eine reine
 * Funktion bleibt und dieselbe Ladelogik von Athenas Werkzeug und von der
 * Steuer-Seite benutzt wird.
 */

/**
 * Gemeinsamer Zwischenspeicher für mehrere Aufrufe von `ladeSteuerdaten` im selben Vorgang (die Prognose lädt drei Jahre auf einmal):
 * Jahresbuchungen und Kraken-Historie werden dann je einmal geladen statt je Aufruf. Lebt nur so lange wie der Vorgang.
 */
export type SteuerLadeCache = {
  buchungen: Map<number, ReturnType<typeof buchungenImJahr>>
  krypto: Promise<KrakenRoh> | null
}

export function neuerSteuerCache(): SteuerLadeCache {
  return { buchungen: new Map(), krypto: null }
}

export async function ladeSteuerdaten(
  supabase: DB,
  userId: string,
  jahr: number,
  cache: SteuerLadeCache = neuerSteuerCache(),
): Promise<LadeErgebnis> {
  const holeBuchungen = (j: number) => {
    let p = cache.buchungen.get(j)
    if (!p) { p = buchungenImJahr(supabase, userId, j); cache.buchungen.set(j, p) }
    return p
  }
  // Alles, was nicht voneinander abhängt, startet JETZT und läuft gleichzeitig: Basisdaten, Buchungen von Jahr und Vorjahr und die
  // Kraken-Historie. Vorher folgte jedes auf das vorige (drei bis vier Wartezeiten hintereinander).
  const buchungenP = Promise.all([holeBuchungen(jahr), holeBuchungen(jahr - 1)])
  const kryptoRohP = (cache.krypto ??= ladeKrakenRoh(supabase, userId))
  // Schlägt das Laden fehl, wird der Fehler unten (kryptoFehler) behandelt; bis dahin soll er nicht als unbehandelt gelten.
  kryptoRohP.catch(() => undefined)
  buchungenP.catch(() => undefined)

  const [tarifeRes, kategorienRes, profilRes, zieleRes, euerRes, belegeRes] = await Promise.all([
    supabase.from('tax_tariffs').select('jahr, grundfreibetrag, zone2_bis, zone2_faktor, zone2_konstante, zone3_bis, zone3_faktor, zone3_konstante, zone3_sockel, zone4_bis, zone4_satz, zone4_abzug, zone5_satz, zone5_abzug, werbungskostenpauschale, sonderausgabenpauschale, soli_freigrenze, kleinunternehmer_vorjahr, kleinunternehmer_laufend, quelle, geprueft_am').order('jahr', { ascending: true }),
    supabase.from('categories').select('id, name, parent_id, tax_role, type, business_share').eq('user_id', userId),
    supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', 'tax_profile').maybeSingle(),
    supabase.from('savings_goals').select('id, description, target_amount, current_amount').eq('user_id', userId),
    supabase.from('euer_zeilen').select('jahr, zeile, bezeichnung, art, sammelzeile, quelle, geprueft_am').order('zeile', { ascending: true }),
    supabase.from('belege').select('id, transaction_id, dateiname, beleg_datum, betrag, aussteller, pfad, sha256, hochgeladen_am, ersetzt_durch').eq('user_id', userId),
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
  const euerZeilenMap = effektiveEuerZeilen(kategorien)
  const anteilMap = effektiveAnteile(kategorien.map(k => ({ ...k, business_share: k.business_share === null ? null : Number(k.business_share) })))

  // Zeilendefinitionen des naechstgelegenen Jahres -- dieselbe Regel wie beim
  // Tarif. Die Nummern verschieben sich jaehrlich, deshalb wird das Jahr
  // mitgegeben und in der Anzeige genannt.
  const alleEuerZeilen = (euerRes.data ?? []) as EuerZeileDef[]
  const euerJahre = Array.from(new Set(alleEuerZeilen.map(z => z.jahr)))
  const euerJahr = euerJahre.length > 0
    ? euerJahre.reduce((beste, k) => (Math.abs(k - jahr) < Math.abs(beste - jahr) ? k : beste))
    : null
  const euerZeilen = euerJahr === null ? [] : alleEuerZeilen.filter(z => z.jahr === euerJahr)
  const nameMap = new Map(kategorien.map(k => [k.id, k.name]))
  const typMap = new Map(kategorien.map(k => [k.id, k.type]))

  const [buchungen, buchungenVorjahr] = await buchungenP

  // Betrieblicher Anteil gemischt genutzter Ausgaben (categories.business_share): steuerlich zaehlt
  // nur der betriebliche Teil. Wirkt hier, an EINER Stelle, damit EUER und Steuerposition
  // dieselbe Zahl sehen; Dashboard und Analyse rechnen mit dem vollen Betrag (das Geld ist
  // tatsaechlich abgeflossen). `summeJeKategorie` bleibt bewusst ungekuerzt.
  const betrieblich = (b: (typeof buchungen)[number]) => {
    const kid = b.category_id
    if (!kid || rollenMap.get(kid) !== 'betriebsausgabe') return b
    const anteil = anteilMap.get(kid) ?? null
    if (anteil === null || anteil >= 100) return b
    return {
      ...b,
      signed_amount: wendeAnteilAn(b.signed_amount, anteil),
      description: `${b.description ?? ''} (${anteil} % betrieblich)`.trim(),
    }
  }

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
      betriebsausgaben += -betrieblich(b).signed_amount
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

  // Krypto-Gewinne gehoeren ins Einkommen. Scheitert das Laden, wird das gesagt (kryptoFehler) statt mit 0
  // weiterzurechnen -- der Rest der Steuerposition bleibt trotzdem nutzbar.
  let krypto: KrakenSteuer | null = null
  let kryptoFehler: string | null = null
  try {
    krypto = await ladeKrakenSteuer(supabase, userId, jahr, await kryptoRohP)
  } catch (fehler) {
    kryptoFehler = fehler instanceof Error ? fehler.message : 'Krypto-Daten nicht ladbar.'
  }

  return {
    // Ersetzte Belege bleiben in der Datenbank, gehoeren aber nicht in die
    // aktuelle Liste -- sonst zaehlt ein korrigierter Beleg doppelt.
    belege: (belegeRes.data ?? [])
      .filter(x => x.ersetzt_durch === null)
      .map(x => ({
        id: x.id,
        transaction_id: x.transaction_id,
        dateiname: x.dateiname,
        beleg_datum: x.beleg_datum,
        betrag: x.betrag === null ? null : Number(x.betrag),
        aussteller: x.aussteller,
        pfad: x.pfad,
        sha256: x.sha256,
        hochgeladen_am: x.hochgeladen_am,
      })),
    euer: {
      zeilen: euerZeilen,
      // Nur Betriebsbuchungen weiterreichen -- alles andere gehoert nicht ins
      // Formular und blaeht die Einzelbuchungsliste nur auf.
      buchungen: buchungen
        .filter(x => {
          const r = x.category_id ? rollenMap.get(x.category_id) ?? null : null
          return r === 'betriebseinnahme' || r === 'betriebsausgabe'
        })
        .map(betrieblich)
        .map(x => ({
          id: x.id,
          datum: x.date,
          betrag: x.signed_amount,
          kategorie_id: x.category_id,
          kategorie: (x.category_id ? nameMap.get(x.category_id) : null) ?? '(ohne Kategorie)',
          beschreibung: x.description,
        })),
      rollen: rollenMap,
      euerZeilen: euerZeilenMap,
    },
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
      kryptoZuVersteuern: krypto?.ergebnis.zuVersteuernEur ?? 0,
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
    krypto,
    kryptoFehler,
  }
}
