/**
 * Gemeinsame Quelle der IBAN-basierten Umbuchungsregel (vorher mehrfach kopiert in bank/auswertung,
 * bank/buchungen, bank/feste-kosten).
 *
 * Eine Buchung ist im aktuellen Scope eine neutrale Umbuchung, wenn ihre Gegen-IBAN ein Konto IM SCOPE ist
 * (`ctx.ibans`). Ein Haushaltskonto ausserhalb des Scopes (z. B. privat Malik aus Sicht von 'ich') zaehlt
 * dagegen als normale Ausgabe/Einnahme (siehe `umbuchungsArt` in scope.ts).
 *
 * Reines Modul ohne Alias-Imports (laeuft auch unter `node --test`). Nicht zu verwechseln mit
 * `istUmbuchung(type)` in vertraege/rechnen.ts: das klassifiziert Vertragsarten (Sparraten), nicht Buchungen.
 */
import { hatPartner, normIban, type ScopeContext } from './scope.ts'

/** Normalisierte Menge der Scope-IBANs (Eingabe fuer `istUmbuchungIban`). */
export function ibanSet(ibans: readonly string[]): Set<string> {
  return new Set(ibans.map(normIban))
}

/** `true`, wenn die Gegen-IBAN zu einem Konto in der Menge gehoert (Menge bereits normalisiert, z. B. via `ibanSet`). */
export function istUmbuchungIban(counterpartIban: string | null | undefined, eigene: ReadonlySet<string>): boolean {
  return !!counterpartIban && eigene.has(normIban(counterpartIban))
}

// ---------------------------------------------------------------------------------------------------------------------
// Herabstufung haushaltsweiter Umbuchungen (unified_transactions / monthly_umbuchungen)
// ---------------------------------------------------------------------------------------------------------------------

/** Minimale Form einer Zeile aus unified_transactions bzw. monthly_umbuchungen. */
export type UmbuchungsZeile = {
  flow_kind: string | null
  account_id: string | null
  counterpart_account_id: string | null
  flow_kind_extern: string | null
}

/**
 * Verbindliche Regel: `flow_kind = 'umbuchung'` ist die HAUSHALTSWEITE Klassifikation. Eine solche Zeile ist im Scope
 * eine ECHTE Buchung (mit `flow_kind_extern`), wenn ihr Konto im Scope liegt und das Gegenkonto fehlt oder nicht im Scope liegt.
 * `accountIds` = `ctx.accountIds` (fuer alle Scopes die richtige Menge).
 */
export function wirdHerabgestuft(z: UmbuchungsZeile, accountIds: ReadonlySet<string> | readonly string[]): boolean {
  if (z.flow_kind !== 'umbuchung' || !z.account_id) return false
  const set = accountIds instanceof Set ? accountIds : new Set(accountIds as readonly string[])
  if (!set.has(z.account_id)) return false
  return !z.counterpart_account_id || !set.has(z.counterpart_account_id)
}

/** Effektive Art im Scope: herabgestufte Umbuchung -> `flow_kind_extern`, sonst unveraendert (`umbuchung` bleibt neutral). */
export function effektiverFlowKind(z: UmbuchungsZeile, accountIds: ReadonlySet<string> | readonly string[]): string | null {
  return wirdHerabgestuft(z, accountIds) ? z.flow_kind_extern : z.flow_kind
}

// ---------------------------------------------------------------------------------------------------------------------
// Herabstufung in Listen, Summen, Filtern und Exporten (unified_transactions)
// ---------------------------------------------------------------------------------------------------------------------
//
// EINE Stelle fuer alles, was die Transaktionsliste, ihre Kennzahlen, Kategorien-Nutzung, Vertragsabgleich, den Export und
// den Chip "offene Buchungen" brauchen. Dieselbe Regel wie in flows-scope.ts (`wirdHerabgestuft`), ausgedrueckt
//  (a) als Zeilen-Abbildung `effektiveBuchung` (Nachbearbeitung geladener Zeilen) und
//  (b) als PostgREST-Filterfragmente (serverseitige Filter/Zaehlungen, Paginierung bleibt exakt).
//
// Regel fuer MANUELLE Umbuchungen: in der Liste ist eine manuelle Umbuchung EINE Zeile (Abgang auf `account_id`,
// `counterpart_account_id` = transfer_to). Herabgestuft wird nur diese Abgangsseite, wenn `transfer_to` nicht im Scope liegt
// (dann Ausgabe, Art = flow_kind_extern). Die Zugangsseite (Cashflow: ID `<id>:zu`) erscheint in der Liste nicht als eigene Zeile:
// die Liste filtert nach `account_id` im Scope und zeigt je Buchung genau eine Zeile (bekannte, bewusste Luecke).
//
// SCHALTER: nur im Haushalt mit Partner (`hatPartner(ctx)`, `herabstufungsIds`). Ohne Partner liefert
// `herabstufungsIds` undefined, alle Aufrufer nehmen dann ihren bisherigen Pfad (kein neues Feld in select/filter).

/** Spalten, die `effektiveBuchung` braucht (zusaetzlich zu type, flow_kind, signed_amount, account_id). */
export const HERAB_SPALTEN = 'counterpart_account_id, flow_kind_extern'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ART_RE = /^[a-z_]{1,32}$/

/** Nur echte UUIDs (Kontext-IDs kommen aus der DB, landen aber in einem PostgREST-Filterstring). */
export function gueltigeKontoIds(ids: readonly string[]): string[] {
  return ids.filter(id => UUID_RE.test(id))
}

/** Konten-IDs fuer die Herabstufung, oder `undefined` (kein Partner / keine gueltigen IDs): dann alles wie bisher. */
export function herabstufungsIds(ctx: Pick<ScopeContext, 'partnerId' | 'accountIds'>): string[] | undefined {
  if (!hatPartner(ctx)) return undefined
  const ids = gueltigeKontoIds(ctx.accountIds)
  return ids.length > 0 ? ids : undefined
}

/** Gegenkonto fehlt oder liegt ausserhalb des Scopes (NULL faellt bei `not.in` sonst heraus). */
function nichtImScope(ids: readonly string[]): string {
  return `or(counterpart_account_id.is.null,counterpart_account_id.not.in.(${gueltigeKontoIds(ids).join(',')}))`
}

/** Bedingung "herabgestufte Umbuchung" (plus Zusatzbedingungen) als and()-Ausdruck fuer `.or(...)`. */
function herabgestuft(ids: readonly string[], ...zusatz: string[]): string {
  return `and(flow_kind.eq.umbuchung,${[...zusatz, nichtImScope(ids)].join(',')})`
}

/**
 * `.or()`-Ausdruck: Buchungen, deren EFFEKTIVE Art in `arten` liegt (echt/anlage/forderung/anfangsbestand):
 * flow_kind direkt oder herabgestufte Umbuchung mit flow_kind_extern in `arten`. Unzulaessige Namen fallen weg.
 */
export function artFragment(ids: readonly string[], arten: readonly string[]): string {
  const liste = arten.filter(a => ART_RE.test(a) && a !== 'umbuchung').join(',')
  return `flow_kind.in.(${liste}),${herabgestuft(ids, `flow_kind_extern.in.(${liste})`)}`
}

/** `.or()`-Ausdruck: effektive Einnahme/Ausgabe: type direkt oder herabgestufte Umbuchung mit passendem Vorzeichen (> 0 = Einnahme). */
export function typFragment(ids: readonly string[], typ: 'income' | 'expense'): string {
  const vorzeichen = typ === 'income' ? 'signed_amount.gt.0' : 'signed_amount.lte.0'
  return `type.eq.${typ},${herabgestuft(ids, vorzeichen)}`
}

/** Filtermethoden, die `wendeHerabFilterAn` braucht (Methodensignaturen, damit der typisierte Supabase-Builder passt). */
export interface HerabBuilder<Q> {
  eq(spalte: string, wert: string): Q
  in(spalte: string, werte: string[]): Q
  or(ausdruck: string): Q
}

/**
 * Ersatz fuer `.eq('type', typ)` und `.eq('flow_kind', art)` im Haushalt: filtert nach der EFFEKTIVEN Art/Richtung.
 *  - art 'umbuchung' / type 'transfer': nur Umbuchungen, deren Gegenkonto IM Scope liegt (herabgestufte sind echte Buchungen).
 *  - art X: flow_kind = X oder herabgestufte Umbuchung mit flow_kind_extern = X.
 *  - type income/expense: type direkt oder herabgestufte Umbuchung (Richtung aus signed_amount).
 * Mehrere `.or()` werden von PostgREST mit UND verknuepft.
 */
export function wendeHerabFilterAn<Q extends HerabBuilder<Q>>(
  query: Q, ids: readonly string[], f: { type?: string; art?: string },
): Q {
  let q = query
  const imScope = [...gueltigeKontoIds(ids)]
  if (f.type === 'transfer') q = q.eq('type', 'transfer').in('counterpart_account_id', imScope)
  else if (f.type === 'income' || f.type === 'expense') q = q.or(typFragment(ids, f.type))
  else if (f.type) q = q.eq('type', f.type)
  if (f.art === 'umbuchung') q = q.eq('flow_kind', 'umbuchung').in('counterpart_account_id', imScope)
  else if (f.art) q = q.or(artFragment(ids, [f.art]))
  return q
}

/** Minimale Form einer Buchungszeile fuer `effektiveBuchung`. */
export type BuchungsZeile = {
  type: string
  flow_kind: string
  signed_amount: number
  account_id?: string | null
  counterpart_account_id?: string | null
  flow_kind_extern?: string | null
}

/**
 * Effektive Buchung im Scope: eine herabgestufte Umbuchung wird zur normalen Einnahme/Ausgabe
 * (flow_kind := flow_kind_extern, type nach Vorzeichen von signed_amount, `herabgestuft: true`, `type_db` = urspruenglicher Typ).
 * Alle anderen Zeilen kommen UNVERAENDERT (gleiche Referenz) zurueck. Fehlen die Spalten (counterpart_account_id === undefined)
 * oder ist flow_kind_extern leer, bleibt die Zeile ebenfalls unveraendert.
 */
export function effektiveBuchung<T extends BuchungsZeile>(
  z: T, accountIds: ReadonlySet<string> | readonly string[],
): T | (T & { herabgestuft: true; type_db: string }) {
  if (z.counterpart_account_id === undefined || !z.flow_kind_extern) return z
  const hs = wirdHerabgestuft({
    flow_kind: z.flow_kind, account_id: z.account_id ?? null,
    counterpart_account_id: z.counterpart_account_id, flow_kind_extern: z.flow_kind_extern,
  }, accountIds)
  if (!hs) return z
  return {
    ...z,
    flow_kind: z.flow_kind_extern,
    type: Number(z.signed_amount) > 0 ? 'income' : 'expense',
    herabgestuft: true as const,
    type_db: z.type,
  }
}

/** `effektiveBuchung` fuer eine Liste; `accountIds` undefined (kein Partner) = Liste unveraendert (gleiche Referenz). */
export function effektiveBuchungen<T extends BuchungsZeile>(zeilen: T[], accountIds: readonly string[] | undefined): T[] {
  if (!accountIds) return zeilen
  const set = new Set(accountIds)
  return zeilen.map(z => effektiveBuchung(z, set))
}
