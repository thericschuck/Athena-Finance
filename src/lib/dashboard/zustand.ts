/**
 * Zustandszeile des Dashboards: Bewertung von Bank-Sync, Freigabe-Frist, Steuerlage und offenen
 * Buchungen als reine Funktionen (Test: zustand.test.ts). Die Komponente (DashZustand) holt die Daten
 * und zeigt nur an, was hier herauskommt.
 *
 * Bewusst nichts Neues erfunden:
 *   - Bank: dieselben Schwellen wie lib/bank/datenzustand.ts (Sync gelb ab 36 Std., rot ab 5 Tagen;
 *     Freigabe gelb ab 14 Tagen Restlaufzeit, rot bei fehlender/abgelaufener Freigabe). Anders als
 *     dort zaehlt hier der AELTESTE Kontostand, nicht der juengste: ein Konto, das seit Tagen
 *     nicht mehr abgerufen wird, soll auffallen, auch wenn ein anderes frisch ist.
 *   - Steuer: dieselben Bedingungen wie die Erinnerungsregeln (lib/reminders/regeln.ts: Ruecklage-
 *     Luecke ab 50 EUR, Kleinunternehmer gelb/rot, Krypto-Freigrenze, Haltefrist in 30 Tagen).
 *     Die Eingabe ist deshalb genau `ErinnerungsEingabe['steuer']`.
 *
 * Vier Stufen: `ok` (ruhig, gruen), `info` (zur Kenntnis, neutral), `warn` (gelb), `fehler` (rot).
 * Der schlimmste Zustand bestimmt die Farbe eines Chips und der ganzen Zeile.
 *
 * Importe mit .ts-Endung und nur Typen aus anderen Modulen, damit `node --test` die Datei direkt laedt.
 */
import { alterText, syncStufe, SCA_WARN_TAGE, type ScaBank } from '../bank/datenzustand.ts'
import type { ErinnerungsEingabe } from '../reminders/regeln.ts'

export type ZStufe = 'ok' | 'info' | 'warn' | 'fehler'
export type ChipId = 'bank' | 'steuer' | 'daten'

export interface ZustandZeile {
  stufe: ZStufe
  titel: string
  detail?: string
}

export interface ZustandChip {
  id: ChipId
  /** Kurztext im Chip (einzeilig, wird bei Platzmangel gekuerzt). */
  label: string
  stufe: ZStufe
  href: string
  /** Befunde fuers Popover, schlimmste zuerst. Bei gesunden Chips die Bestaetigung(en). */
  zeilen: ZustandZeile[]
}

export const STUFEN_RANG: Record<ZStufe, number> = { ok: 0, info: 1, warn: 2, fehler: 3 }

/** Schlimmere der beiden Stufen. */
export function schlimmer(a: ZStufe, b: ZStufe): ZStufe {
  return STUFEN_RANG[a] >= STUFEN_RANG[b] ? a : b
}

/** Schlimmste Stufe einer Liste; leer = ok. */
export function schlimmste(stufen: ZStufe[]): ZStufe {
  return stufen.reduce<ZStufe>(schlimmer, 'ok')
}

/** Stabil nach Schwere absteigend sortiert (gleiche Stufe behaelt ihre Reihenfolge). */
function nachSchwere(zeilen: ZustandZeile[]): ZustandZeile[] {
  return zeilen
    .map((z, i) => ({ z, i }))
    .sort((a, b) => STUFEN_RANG[b.z.stufe] - STUFEN_RANG[a.z.stufe] || a.i - b.i)
    .map(x => x.z)
}

const TAG_MS = 24 * 60 * 60 * 1000
const euroGerundet = (n: number, schritt = 10) =>
  (Math.round(n / schritt) * schritt).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const euroExakt = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis.slice(0, 10)}T00:00:00Z`) - Date.parse(`${von.slice(0, 10)}T00:00:00Z`)) / TAG_MS)
}

// ── Bank ───────────────────────────────────────────────────────────────────────────────────────

export interface BankEingabe {
  /** Alter des AELTESTEN Kontostands (`bank_balance.fetched_at`) in Stunden; null = keine Salden. */
  aeltesterSyncStunden: number | null
  sca: ScaBank[]
}

/** Aeltester Abruf in Stunden aus den `fetched_at`-Werten; ungueltige Werte werden ignoriert. */
export function aeltesterSyncStunden(fetchedAt: (string | null)[], jetzt: number): number | null {
  const stunden = fetchedAt
    .map(f => (f ? (jetzt - Date.parse(f)) / 3_600_000 : NaN))
    .filter(Number.isFinite)
  return stunden.length ? Math.max(...stunden) : null
}

export function bewerteBank(e: BankEingabe, jetzt: number): ZustandChip | null {
  const zeilen: ZustandZeile[] = []

  if (e.aeltesterSyncStunden !== null) {
    const s = syncStufe(e.aeltesterSyncStunden)
    const alter = alterText(e.aeltesterSyncStunden)
    zeilen.push({
      stufe: s ?? 'ok',
      titel: `Letzter Sync ${alter}`,
      detail: s === 'fehler'
        ? 'Seit Tagen kein Abruf, neue Buchungen fehlen (Freigabe prüfen).'
        : s === 'warn'
          ? 'Der tägliche Abruf scheint ausgefallen zu sein.'
          : 'Ältester Kontostand über alle Konten.',
    })
  }

  for (const b of e.sca) {
    const name = b.bankLabel ?? 'Bank'
    if (b.scaRequired) {
      zeilen.push({ stufe: 'fehler', titel: `${name}: Freigabe fehlt`, detail: 'Der automatische Sync wartet auf eine neue Freigabe in SecureGo plus.' })
      continue
    }
    if (!b.exemptionExpiresAt) continue
    const rest = Math.floor((Date.parse(b.exemptionExpiresAt) - jetzt) / TAG_MS)
    if (!Number.isFinite(rest)) continue
    if (rest < 0) {
      zeilen.push({ stufe: 'fehler', titel: `${name}: Freigabe abgelaufen`, detail: 'Die 90-Tage-Frist ist vorbei, der nächste Sync braucht eine neue Freigabe.' })
    } else if (rest <= SCA_WARN_TAGE) {
      zeilen.push({ stufe: 'warn', titel: `${name}: Freigabe läuft in ${rest} ${rest === 1 ? 'Tag' : 'Tagen'} ab`, detail: 'Ein manueller Sync davor erneuert sie.' })
    } else {
      zeilen.push({ stufe: 'ok', titel: `${name}: Freigabe noch ${rest} Tage gültig` })
    }
  }

  if (zeilen.length === 0) return null
  const sortiert = nachSchwere(zeilen)
  const stufe = sortiert[0].stufe
  const syncAlter = e.aeltesterSyncStunden !== null ? alterText(e.aeltesterSyncStunden) : null
  const label = stufe === 'ok'
    ? (syncAlter ? `Bank ${syncAlter}` : 'Bank ok')
    : `Bank: ${sortiert[0].titel.replace(/^Letzter Sync /, 'Sync ')}`
  return { id: 'bank', label, stufe, href: '/analyse/banking', zeilen: sortiert }
}

// ── Steuer ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Kernaussage der Steuerlage. Gleiche Bedingungen wie `erzeugeErinnerungen`; `null` (Berechnung nicht
 * moeglich) ergibt keinen Chip, statt „ok" vorzutaeuschen.
 */
export function bewerteSteuer(s: ErinnerungsEingabe['steuer'], heute: string): ZustandChip | null {
  if (!s) return null
  const zeilen: ZustandZeile[] = []
  const { ruecklage, kleinunternehmer: ku, krypto } = s

  if (ruecklage.soll > 0 && (ruecklage.luecke ?? ruecklage.soll) >= 50) {
    zeilen.push(ruecklage.ist === null
      ? { stufe: 'warn', titel: 'Rücklage: kein Sparziel', detail: `Geschätzte Steuer ${s.jahr}: ${euroExakt(ruecklage.soll)}. Lege ein Sparziel „Steuerrücklage ${s.jahr}" an.` }
      : { stufe: 'warn', titel: `Rücklage fehlt ca. ${euroGerundet(ruecklage.luecke ?? 0)}`, detail: `Soll ${euroExakt(ruecklage.soll)}, zurückgelegt ${euroExakt(ruecklage.ist)}.` })
  } else if (ruecklage.soll > 0) {
    zeilen.push({ stufe: 'ok', titel: 'Rücklage ok', detail: `Soll ${euroExakt(ruecklage.soll)}, zurückgelegt ${ruecklage.ist === null ? '—' : euroExakt(ruecklage.ist)}.` })
  }

  if (ku.status === 'rot') {
    zeilen.push({ stufe: 'fehler', titel: 'Kleinunternehmer-Grenze überschritten', detail: `Umsatz ${s.jahr}: ${euroExakt(ku.umsatzLaufend)} von ${euroExakt(ku.grenzeLaufend)}. Umsatzsteuer wird fällig.` })
  } else if (ku.status === 'gelb') {
    zeilen.push({ stufe: 'warn', titel: 'Kleinunternehmer-Grenze rückt näher', detail: `Umsatz ${s.jahr}: ${euroExakt(ku.umsatzLaufend)} von ${euroExakt(ku.grenzeLaufend)}.` })
  }

  if (krypto) {
    if (krypto.zuVersteuern > 0) {
      zeilen.push({ stufe: 'warn', titel: 'Krypto: Freigrenze überschritten', detail: `Steuerpflichtiger Saldo ${euroExakt(krypto.saldoSteuerpflichtig)}, Freigrenze ${euroExakt(krypto.freigrenze)}.` })
    } else if (krypto.saldoSteuerpflichtig > 0 && krypto.saldoSteuerpflichtig >= 0.8 * krypto.freigrenze) {
      zeilen.push({ stufe: 'info', titel: `Krypto: ${euroExakt(krypto.freigrenze - krypto.saldoSteuerpflichtig)} bis zur Freigrenze`, detail: `Steuerpflichtiger Saldo ${euroExakt(krypto.saldoSteuerpflichtig)}.` })
    }
    const fristen = krypto.offeneLose
      .map(l => ({ l, t: tageZwischen(heute, l.steuerfreiAb) }))
      .filter(x => x.t > 0 && x.t <= 30)
      .sort((a, b) => a.t - b.t)
    if (fristen.length > 0) {
      const { l, t } = fristen[0]
      const mehr = fristen.length > 1 ? ` (+${fristen.length - 1} weitere)` : ''
      zeilen.push({
        stufe: 'info',
        titel: `Krypto: Frist endet in ${t} ${t === 1 ? 'Tag' : 'Tagen'}${mehr}`,
        detail: `${l.asset} wird nach einem Jahr Haltefrist steuerfrei.`,
      })
    }
  }

  if (zeilen.length === 0) zeilen.push({ stufe: 'ok', titel: 'Steuer ok', detail: `Keine offenen Punkte für ${s.jahr}.` })
  const sortiert = nachSchwere(zeilen)
  const stufe = sortiert[0].stufe
  const label = stufe === 'ok' ? 'Steuer ok' : sortiert[0].titel.startsWith('Krypto') || sortiert[0].titel.startsWith('Kleinunternehmer') ? sortiert[0].titel : `Steuer: ${sortiert[0].titel}`
  return { id: 'steuer', label, stufe, href: '/finance/steuer', zeilen: sortiert }
}

// ── Daten ──────────────────────────────────────────────────────────────────────────────────────

/** Buchungen ohne Kategorie; nur anzeigen, wenn es welche gibt. Ruhig (info): Handlungsbedarf, kein Alarm. */
export function bewerteDaten(unkategorisiert: number): ZustandChip | null {
  if (!Number.isFinite(unkategorisiert) || unkategorisiert <= 0) return null
  return {
    id: 'daten',
    label: `${unkategorisiert} ohne Kategorie`,
    stufe: 'info',
    href: '/analyse/banking?kat=offen',
    zeilen: [{
      stufe: 'info',
      titel: `${unkategorisiert} ${unkategorisiert === 1 ? 'Buchung' : 'Buchungen'} ohne Kategorie`,
      detail: 'Ohne Kategorie fehlen sie in Auswertung und Steuer.',
    }],
  }
}

// ── Gesamt ─────────────────────────────────────────────────────────────────────────────────────

export interface Zustandszeile {
  chips: ZustandChip[]
  stufe: ZStufe
  /** Nichts Auffaelliges: ruhig und gruen darstellen. */
  gesund: boolean
}

export function bewerteZustand(chips: (ZustandChip | null)[]): Zustandszeile {
  const da = chips.filter((c): c is ZustandChip => c !== null)
  const stufe = schlimmste(da.map(c => c.stufe))
  return { chips: da, stufe, gesund: stufe === 'ok' || stufe === 'info' }
}
