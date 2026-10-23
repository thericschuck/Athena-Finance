/**
 * Datenzustand der Bankdaten: Wie frisch ist der Sync, fehlen Zeitraeume, gibt es doppelte
 * Buchungen, laeuft die Freigabe-Frist ab? Rein und ohne Datenbank, damit sich die Regeln
 * testen lassen (datenzustand.test.ts).
 *
 * Bewusst KEIN Saldo-Abgleich: Die Saldenhistorie in `account_balances` wird aus dem heutigen
 * `booked_balance` rueckwaerts ueber genau diese Buchungen gerechnet (Migration
 * 20260831000001, Funktion fn_recompute_account_balances). Sie stimmt daher per Konstruktion
 * mit der Summe der Buchungen ueberein und koennte eine FEHLENDE Buchung nie anzeigen — ein
 * solcher Vergleich waere eine Tautologie, die immer „alles gut" meldet. Einen unabhaengigen
 * zweiten Saldo gibt es nicht (`bank_balance` hat pro Konto nur die letzte Zeile, keinen
 * Anfangssaldo). Pruefungen, die die Daten nicht tragen, bleiben weg, statt Sicherheit
 * vorzutaeuschen.
 *
 * Die Eingaben sind absichtlich schmale Strukturtypen, nicht die vollen Zeilen aus
 * types/bank.ts — so brauchen die Tests keine Datenbankform nachzubauen.
 */

export interface ZustandBuchung {
  account_iban: string
  value_date: string
  amount: number
  counterpart_name: string | null
  description: string | null
  bank_reference?: string | null
}

export interface ZustandSaldo {
  account_iban: string
  account_name: string | null
  fetched_at: string
}

export interface ScaBank {
  bankLabel: string | null
  lastScaAt: string | null
  exemptionExpiresAt: string | null
  scaRequired: boolean
}

export type Stufe = 'warn' | 'fehler'
export type BefundArt = 'sync' | 'luecke' | 'duplikat' | 'sca'

export interface Befund {
  art: BefundArt
  stufe: Stufe
  /** Betroffenes Konto; null bei Befunden, die an der Bank statt am Konto haengen (Freigabe). */
  iban: string | null
  titel: string
  detail: string
  /** `YYYY-MM` fuer den Link „Buchungen ansehen" (zusammen mit `iban`); null = nur das Konto. */
  monat: string | null
}

export interface KontoZustand {
  iban: string
  name: string
  syncStunden: number | null
  syncStufe: Stufe | null
  letzteBuchung: string | null
  buchungen: number
}

export interface Datenzustand {
  befunde: Befund[]
  konten: KontoZustand[]
  /** Juengster Sync ueber alle Konten in Stunden; null ohne Saldenzeile. */
  juengsterSyncStunden: number | null
}

/** Schwellen. Der Sync laeuft taeglich per Cron, 36 h ist also „ein Lauf ausgefallen". */
export const SYNC_WARN_STUNDEN = 36
export const SYNC_FEHLER_STUNDEN = 5 * 24
export const MIN_LUECKE_TAGE = 14
/** Ein Konto gilt nur als „aktiv", wenn es genug Buchungen hat und zuletzt nicht lange still war. */
const AKTIV_MIN_BUCHUNGEN = 10
const AKTIV_MAX_STILLE_TAGE = 90
const LUECKEN_FENSTER_TAGE = 365
export const SCA_WARN_TAGE = 14

const TAG_MS = 24 * 60 * 60 * 1000

export function normIbanZustand(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / TAG_MS)
}

function tagePlus(datum: string, tage: number): string {
  return new Date(Date.parse(`${datum}T00:00:00Z`) + tage * TAG_MS).toISOString().slice(0, 10)
}

export function syncStufe(stunden: number): Stufe | null {
  if (stunden > SYNC_FEHLER_STUNDEN) return 'fehler'
  if (stunden > SYNC_WARN_STUNDEN) return 'warn'
  return null
}

/** „vor 3 Std.", „vor 2 Tagen" — grob, denn es geht um die Groessenordnung. */
export function alterText(stunden: number): string {
  if (stunden < 1) return 'vor wenigen Minuten'
  if (stunden < 48) return `vor ${Math.round(stunden)} Std.`
  return `vor ${Math.floor(stunden / 24)} Tagen`
}

function perzentil(sortiert: number[], p: number): number {
  if (sortiert.length === 0) return 0
  const i = Math.min(sortiert.length - 1, Math.ceil(p * sortiert.length) - 1)
  return sortiert[Math.max(0, i)]
}

/**
 * Luecken je Konto: Zeitraeume ohne jede Buchung, die laenger sind als fuer dieses Konto
 * ueblich. Schwelle = doppeltes 90. Perzentil der Abstaende zwischen Buchungstagen im letzten
 * Jahr, mindestens 14 Tage — ein Konto mit Buchungen jeden zweiten Tag soll nach zwei Wochen
 * Stille auffallen, eines mit Monatsbuchungen erst spaeter. Stillgelegte Konten (wenig
 * Buchungen oder lange nichts mehr) werden uebersprungen: bei ihnen ist Stille normal.
 * Die offene Luecke vom letzten Buchungstag bis heute zaehlt mit.
 */
export function findeLuecken(
  buchungen: ZustandBuchung[], heute: string,
): { iban: string; von: string; bis: string; tage: number; offen: boolean }[] {
  const tageJeKonto = new Map<string, Set<string>>()
  const anzahl = new Map<string, number>()
  for (const t of buchungen) {
    const k = normIbanZustand(t.account_iban)
    const s = tageJeKonto.get(k) ?? new Set<string>()
    s.add(t.value_date)
    tageJeKonto.set(k, s)
    anzahl.set(k, (anzahl.get(k) ?? 0) + 1)
  }

  const fensterStart = tagePlus(heute, -LUECKEN_FENSTER_TAGE)
  const ergebnis: { iban: string; von: string; bis: string; tage: number; offen: boolean }[] = []

  for (const [iban, tageSet] of tageJeKonto) {
    const tage = [...tageSet].sort()
    const letzter = tage[tage.length - 1]
    if ((anzahl.get(iban) ?? 0) < AKTIV_MIN_BUCHUNGEN) continue
    if (tageZwischen(letzter, heute) > AKTIV_MAX_STILLE_TAGE) continue

    // Abstaende zwischen aufeinanderfolgenden Buchungstagen, nur im Fenster der letzten 12 Monate.
    const abstaende: { von: string; bis: string; tage: number; offen: boolean }[] = []
    for (let i = 1; i < tage.length; i++) {
      if (tage[i] < fensterStart) continue
      abstaende.push({ von: tage[i - 1], bis: tage[i], tage: tageZwischen(tage[i - 1], tage[i]), offen: false })
    }
    const sortiert = abstaende.map(a => a.tage).sort((a, b) => a - b)
    const schwelle = Math.max(MIN_LUECKE_TAGE, 2 * perzentil(sortiert, 0.9))

    for (const a of abstaende) if (a.tage > schwelle) ergebnis.push({ iban, ...a })
    const offen = tageZwischen(letzter, heute)
    if (offen > schwelle) ergebnis.push({ iban, von: letzter, bis: heute, tage: offen, offen: true })
  }
  return ergebnis
}

/**
 * Moegliche Duplikate: gleiche IBAN, Datum, Betrag, Gegenpartei und Verwendungszweck mehrfach.
 * Legitim waeren zwei gleiche Kartenzahlungen am selben Tag — die unterscheiden sich aber in
 * der Bankreferenz. Daher zaehlt eine Gruppe NICHT als Verdacht, wenn jede Zeile eine eigene,
 * vorhandene Referenz hat. Ohne Referenz (aeltere Importe) bleibt es ein Verdacht.
 */
export function findeDuplikate(
  buchungen: ZustandBuchung[],
): { iban: string; datum: string; betrag: number; name: string; anzahl: number }[] {
  const gruppen = new Map<string, ZustandBuchung[]>()
  for (const t of buchungen) {
    const key = [
      normIbanZustand(t.account_iban), t.value_date, t.amount.toFixed(2),
      (t.counterpart_name ?? '').trim().toLowerCase(),
      (t.description ?? '').replace(/\s+/g, ' ').trim().toLowerCase(),
    ].join('|')
    const liste = gruppen.get(key)
    if (liste) liste.push(t)
    else gruppen.set(key, [t])
  }
  const ergebnis: { iban: string; datum: string; betrag: number; name: string; anzahl: number }[] = []
  for (const liste of gruppen.values()) {
    if (liste.length < 2) continue
    const refs = liste.map(t => t.bank_reference).filter((r): r is string => !!r)
    if (refs.length === liste.length && new Set(refs).size === liste.length) continue
    const t = liste[0]
    ergebnis.push({
      iban: normIbanZustand(t.account_iban), datum: t.value_date, betrag: t.amount,
      name: t.counterpart_name || t.description || 'Buchung', anzahl: liste.length,
    })
  }
  return ergebnis.sort((a, b) => b.datum.localeCompare(a.datum))
}

/** Freigabe-Frist je Bank (PSD2: 90 Tage). */
export function scaBefunde(banken: ScaBank[], jetzt: number): Befund[] {
  const ergebnis: Befund[] = []
  for (const b of banken) {
    const name = b.bankLabel ?? 'Bank'
    if (b.scaRequired) {
      ergebnis.push({
        art: 'sca', stufe: 'fehler', iban: null, monat: null,
        titel: `${name}: Freigabe fehlt`,
        detail: 'Der automatische Sync wartet auf eine neue Freigabe. Einmal manuell synchronisieren und in SecureGo plus bestaetigen.',
      })
      continue
    }
    if (!b.exemptionExpiresAt) continue
    const resttage = Math.floor((Date.parse(b.exemptionExpiresAt) - jetzt) / TAG_MS)
    if (resttage < 0) {
      ergebnis.push({
        art: 'sca', stufe: 'fehler', iban: null, monat: null,
        titel: `${name}: Freigabe abgelaufen`,
        detail: 'Die 90-Tage-Frist ist vorbei, der naechste Sync braucht eine neue Freigabe in SecureGo plus.',
      })
    } else if (resttage <= SCA_WARN_TAGE) {
      ergebnis.push({
        art: 'sca', stufe: 'warn', iban: null, monat: null,
        titel: `${name}: Freigabe laeuft in ${resttage} ${resttage === 1 ? 'Tag' : 'Tagen'} ab`,
        detail: 'Danach braucht der Sync eine neue Freigabe in SecureGo plus. Ein manueller Sync vorher erneuert sie.',
      })
    }
  }
  return ergebnis
}

export function pruefeDatenzustand(input: {
  balances: ZustandSaldo[]
  transactions: ZustandBuchung[]
  /** Heutiges Datum `YYYY-MM-DD`. */
  heute: string
  /** Aktueller Zeitpunkt in ms (Date.now()). */
  jetzt: number
}): Datenzustand {
  const { balances, transactions, heute, jetzt } = input
  const befunde: Befund[] = []
  const name = new Map(balances.map(b => [normIbanZustand(b.account_iban), b.account_name || b.account_iban]))
  const anzeige = (iban: string) => name.get(iban) ?? iban

  const konten: KontoZustand[] = balances.map(b => {
    const iban = normIbanZustand(b.account_iban)
    const stunden = (jetzt - Date.parse(b.fetched_at)) / (60 * 60 * 1000)
    const stufe = Number.isFinite(stunden) ? syncStufe(stunden) : null
    const eigene = transactions.filter(t => normIbanZustand(t.account_iban) === iban)
    const letzte = eigene.reduce<string | null>((m, t) => (m === null || t.value_date > m ? t.value_date : m), null)
    if (stufe) {
      befunde.push({
        art: 'sync', stufe, iban: b.account_iban, monat: null,
        titel: `${anzeige(iban)}: letzter Sync ${alterText(stunden)}`,
        detail: stufe === 'fehler'
          ? 'Seit Tagen kein Abruf. Neue Buchungen fehlen, bis der Sync wieder laeuft (Freigabe pruefen).'
          : 'Der taegliche Abruf scheint ausgefallen zu sein; neueste Buchungen koennten fehlen.',
      })
    }
    return {
      iban: b.account_iban, name: b.account_name || b.account_iban,
      syncStunden: Number.isFinite(stunden) ? stunden : null, syncStufe: stufe,
      letzteBuchung: letzte, buchungen: eigene.length,
    }
  })

  for (const l of findeLuecken(transactions, heute)) {
    befunde.push({
      art: 'luecke', stufe: 'warn', iban: l.iban, monat: l.offen ? null : l.bis.slice(0, 7),
      titel: l.offen
        ? `${anzeige(l.iban)}: seit ${l.tage} Tagen keine Buchung`
        : `${anzeige(l.iban)}: ${l.tage} Tage ohne Buchung`,
      detail: l.offen
        ? `Letzte Buchung am ${l.von}. Fuer dieses Konto ist das ungewoehnlich lang.`
        : `Zwischen ${l.von} und ${l.bis}. Fuer dieses Konto ist das ungewoehnlich lang, moeglicherweise fehlen Buchungen.`,
    })
  }

  for (const d of findeDuplikate(transactions)) {
    befunde.push({
      art: 'duplikat', stufe: 'warn', iban: d.iban, monat: d.datum.slice(0, 7),
      titel: `${anzeige(d.iban)}: ${d.anzahl}x dieselbe Buchung`,
      detail: `${d.datum}, ${d.name}, ${d.betrag.toFixed(2).replace('.', ',')} EUR — gleiche Gegenpartei, Betrag und Verwendungszweck, ohne unterscheidende Bankreferenz.`,
    })
  }

  const syncs = konten.map(k => k.syncStunden).filter((s): s is number => s !== null)
  return { befunde, konten, juengsterSyncStunden: syncs.length ? Math.min(...syncs) : null }
}
