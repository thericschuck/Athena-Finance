import { parse, tageZwischen } from './datum.ts'

/**
 * Einmalposten und statistische Ausreißer in der Historie der Prognose.
 *
 * Wichtig, weil es Ergebnis eines Tests ist und nicht einer Vermutung: ALLE großen Posten
 * pauschal auszuschließen verbesserte die Prognose in einem Rolling-Origin-Test auf den echten
 * Daten nicht — solche Posten kommen im echten Leben wieder vor (Krypto-Käufe, Bargeld,
 * Rückzahlungen), nur unregelmäßig, und gehören deshalb zum erwarteten Verlauf. Nur die wirklich
 * extremen Ausreißer (eine Bauspar-Auszahlung von 9.075 € bei einem Median von 19 € je Ausgabe)
 * verzerren den erwarteten Überschuss ohne Gegenwert; sie werden standardmäßig ausgeschlossen.
 *
 *   extrem      Betrag ≥ max(2.000 €, 5 × 95. Perzentil der Art): standardmäßig AUSGESCHLOSSEN.
 *   Vorschlag   sonstige große Posten (≥ max(500 €, 95. Perzentil)), die weder wiederkehren noch zum
 *               Geschäft gehören: stehen zur Auswahl, standardmäßig DRIN.
 *   nie         Gehalt (`lohn`) und Geschäftseinnahmen (`betriebseinnahme`) sind nie Kandidaten:
 *               unregelmäßige Projektzahlungen sind dein Geschäft und müssen in der Prognose bleiben.
 *               Ebenso wiederkehrende Große (≥ 3× dieselbe Gegenpartei mit ähnlichem Betrag), etwa
 *               eine Ratenzahlung.
 *
 * Der Nutzer überschreibt jede Entscheidung (`Ueberschreibung`): `aus` schließt zusätzlich aus,
 * `ein` holt einen standardmäßig ausgeschlossenen extremen Posten zurück.
 *
 * Keine Imports außer Datums-Helfern, damit `node --test` die Datei direkt laden kann.
 */

/** Schlüssel in `user_settings` für die Entscheidungen des Nutzers ({ aus: [...], ein: [...] }). */
export const UEBERSCHREIBUNG_KEY = 'forecast_overrides'

export type EinmalBuchung = {
  id: string
  /** `YYYY-MM-DD` */
  date: string
  type: 'income' | 'expense'
  /** Betrag in EUR, positiv. */
  amount: number
  flow_kind: string
  tax_role: string | null
  gegenpartei: string | null
  /** Kategoriepfad oder -name, nur zur Anzeige und zur Erkennung von Bargeld-Transfers. */
  kategorie: string | null
  /** Haushalts-Umbuchung, im Scope zur echten Einnahme/Ausgabe herabgestuft (nur Scopes Malik/Gemeinsam). */
  herabgestuft?: boolean
}

export type Ueberschreibung = { aus: string[]; ein: string[] }

export type EinmalKandidat = {
  id: string
  datum: string
  type: 'income' | 'expense'
  betrag: number
  gegenpartei: string | null
  kategorie: string | null
  grund: string
  extrem: boolean
  ausgeschlossen: boolean
  /** Was der Posten dem erwarteten Monatssaldo zuschreiben würde, bliebe er drin (Einnahme +, Ausgabe −). */
  effektProMonat: number
  /** Einlage/Entnahme zwischen Haushaltskonten ohne Zyklus-Muster (Standard: ausgeschlossen, wie `extrem`). */
  einlage?: boolean
}

export const EINLAGE_GRUND = 'Einlage/Entnahme Haushalt'

/**
 * Herabgestufte Haushalts-Umbuchungen (Geld, das zwischen Konten des Haushalts wandert, aber im Scope auf der anderen Seite
 * des Scope-Randes liegt) sind für die Prognose nur dann ein Muster, wenn sie regelmäßig kommen: dieselbe Richtung,
 * mindestens 3 verschiedene Monate mit einem ähnlichen Betrag (±20 %) an einem ähnlichen Tag im Monat (±4 Tage).
 * Alles andere sind unregelmäßige Einlagen/Entnahmen: sie kommen nicht in die Standardprognose.
 * Rückgabe: IDs der unregelmäßigen (also vom Lernen auszunehmenden) Posten.
 */
export function unregelmaessigeEinlagen(buchungen: EinmalBuchung[]): Set<string> {
  const einlagen = buchungen.filter(b => b.herabgestuft && ZAEHLT.has(b.flow_kind) && b.amount > 0)
  const unregelmaessig = new Set<string>()
  for (const b of einlagen) {
    const tag = parse(b.date).d
    const monate = new Set<string>()
    for (const x of einlagen) {
      if (x.type !== b.type) continue
      if (Math.abs(x.amount - b.amount) > 0.2 * b.amount) continue
      if (Math.abs(parse(x.date).d - tag) > 4) continue
      monate.add(x.date.slice(0, 7))
    }
    if (monate.size < 3) unregelmaessig.add(b.id)
  }
  return unregelmaessig
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ZAEHLT = new Set(['echt', 'anlage', 'forderung'])

export function leseUeberschreibung(roh: unknown): Ueberschreibung {
  const liste = (v: unknown): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, 500) : []
  if (!roh || typeof roh !== 'object') return { aus: [], ein: [] }
  const o = roh as Record<string, unknown>
  return { aus: liste(o.aus), ein: liste(o.ein) }
}

function quantil(werte: number[], q: number): number {
  if (werte.length === 0) return 0
  const s = [...werte].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * q))]
}

/**
 * Gegenpartei als Gruppenschlüssel: die ersten zwei Wörter, klein und ohne Satzzeichen. Dieselbe Firma
 * steht auf dem Kontoauszug oft verschieden („MySales Consulting GmbH" / „MySales Consulting – Coaching",
 * „Payward Ireland Limited" / „Payward Ireland Ltd."); ohne das zählten Raten als einmalig.
 */
const schluessel = (name: string | null) =>
  (name ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ')

export function erkenneEinmalposten(
  buchungen: EinmalBuchung[], ue: Ueberschreibung, heute: string,
): { kandidaten: EinmalKandidat[]; ausgeschlossen: Set<string> } {
  const zaehlend = buchungen.filter(b => ZAEHLT.has(b.flow_kind) && b.amount > 0)
  if (zaehlend.length === 0) return { kandidaten: [], ausgeschlossen: new Set() }

  const erstes = zaehlend.reduce((m, b) => (b.date < m ? b.date : m), zaehlend[0].date)
  const monate = Math.max(1, tageZwischen(erstes, heute) / 30.4375)

  const p95 = (typ: 'income' | 'expense') => quantil(zaehlend.filter(b => b.type === typ && !b.herabgestuft).map(b => b.amount), 0.95)
  const schwelle = { income: Math.max(500, p95('income')), expense: Math.max(500, p95('expense')) }
  const extremSchwelle = { income: Math.max(2000, 5 * p95('income')), expense: Math.max(2000, 5 * p95('expense')) }

  // Wie oft kommt die Gegenpartei (je Art) insgesamt und mit ähnlichem Betrag vor?
  const nachGegenpartei = new Map<string, EinmalBuchung[]>()
  for (const b of zaehlend) {
    const k = `${b.type}|${schluessel(b.gegenpartei)}`
    const l = nachGegenpartei.get(k) ?? []
    l.push(b); nachGegenpartei.set(k, l)
  }
  const wiederkehrend = (b: EinmalBuchung): boolean => {
    if (!schluessel(b.gegenpartei)) return false
    const gruppe = nachGegenpartei.get(`${b.type}|${schluessel(b.gegenpartei)}`) ?? []
    const aehnlich = gruppe.filter(x => Math.abs(x.amount - b.amount) <= 0.2 * b.amount)
    return aehnlich.length >= 3
  }

  const kandidaten: EinmalKandidat[] = []
  const einlagenIds = unregelmaessigeEinlagen(zaehlend)
  for (const b of zaehlend) {
    if (einlagenIds.has(b.id)) {
      // Unregelmäßige Haushalts-Einlage: immer Kandidat, standardmäßig ausgeschlossen (`extrem` = Standard „aus“).
      kandidaten.push({
        id: b.id, datum: b.date, type: b.type, betrag: b.amount,
        gegenpartei: b.gegenpartei, kategorie: b.kategorie, grund: EINLAGE_GRUND, extrem: true, einlage: true,
        ausgeschlossen: !ue.ein.includes(b.id) || ue.aus.includes(b.id),
        effektProMonat: Math.round(((b.type === 'income' ? 1 : -1) * b.amount / monate) * 100) / 100,
      })
      continue
    }
    if (b.herabgestuft) continue // regelmäßige Einlage: gehört ins Zyklusmodell, kein Einmalposten
    if (b.amount < schwelle[b.type]) continue
    if (b.tax_role === 'lohn' || b.tax_role === 'betriebseinnahme') continue
    if (wiederkehrend(b)) continue
    const extrem = b.amount >= extremSchwelle[b.type]
    const gegenpartei = schluessel(b.gegenpartei)
    const vorkommen = gegenpartei ? (nachGegenpartei.get(`${b.type}|${gegenpartei}`) ?? []).length : 0
    const kat = (b.kategorie ?? '').toLowerCase()
    const grund =
      b.flow_kind === 'anlage' ? 'Anlage oder Umschichtung'
      : b.flow_kind === 'forderung' ? 'Darlehen oder Forderung'
      : kat.includes('transfers') ? 'Bargeld oder Überweisung'
      : vorkommen === 1 ? 'einmalige Gegenpartei'
      : 'ungewöhnlich hoch'
    const ausgeschlossen = (extrem && !ue.ein.includes(b.id)) || ue.aus.includes(b.id)
    kandidaten.push({
      id: b.id, datum: b.date, type: b.type, betrag: b.amount,
      gegenpartei: b.gegenpartei, kategorie: b.kategorie, grund, extrem, ausgeschlossen,
      effektProMonat: Math.round(((b.type === 'income' ? 1 : -1) * b.amount / monate) * 100) / 100,
    })
  }
  kandidaten.sort((a, b) => b.betrag - a.betrag)

  // Auch Ausschlüsse, die nicht (mehr) Kandidat sind, gelten weiter — der Nutzer hat sie gewählt.
  const ausgeschlossen = new Set(kandidaten.filter(k => k.ausgeschlossen).map(k => k.id))
  for (const id of ue.aus) if (!ue.ein.includes(id)) ausgeschlossen.add(id)
  return { kandidaten: kandidaten.slice(0, 25), ausgeschlossen }
}
