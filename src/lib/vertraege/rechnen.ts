/**
 * Reine Berechnungen der Verträge-Seite: Monatsumrechnung, nächster Termin, Kündigungsfrist,
 * Gruppierung und Kennzahlen. Alle Daten sind `YYYY-MM-DD`-Strings (Berliner Kalendertag), nie `Date`-Objekte,
 * damit kein Zeitzonen-Versatz entsteht. Keine '@/'-Importe, damit `node --test` die Datei direkt lädt.
 */
import { addTage, tageZwischen } from '../forecast/datum.ts'
import { termineImFenster } from '../forecast/termine.ts'

export type Vertrag = {
  id: string
  name: string
  type: string
  provider: string | null
  amount: number
  currency: string
  frequency: string
  start_date: string
  end_date: string | null
  notice_days: number
  auto_renews: boolean
  billing_day: number | null
  is_active: boolean
  account_id: string | null
  to_account_id: string | null
  category_id: string | null
  notes: string | null
}

/** Verträge, die Geld zwischen eigenen Konten bewegen: Sparraten, keine Fixkosten. */
const UMBUCHUNG = new Set(['transfer', 'savings_plan', 'building_savings'])
export const istUmbuchung = (type: string) => UMBUCHUNG.has(type)

/** Faktor Betrag je Intervall -> Betrag je Monat (52 Wochen, 26 Doppelwochen). */
const PRO_MONAT: Record<string, number> = {
  weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, biannual: 1 / 6, yearly: 1 / 12,
}

export function proMonat(betrag: number, frequenz: string): number {
  return betrag * (PRO_MONAT[frequenz] ?? 1)
}

export const proJahr = (betrag: number, frequenz: string) => proMonat(betrag, frequenz) * 12

/** Nächster Abbuchungstermin ab `heute` (heute eingeschlossen) nach derselben Regel wie die Prognose; `null` wenn keiner mehr kommt. */
export function naechsterTermin(v: Vertrag, heute: string): string | null {
  const termine = termineImFenster(
    { ...v, auto_renews: v.auto_renews === true },
    heute,
    addTage(heute, 800),
  )
  return termine[0] ?? null
}

/** Nächste monatliche Ausführung eines Depot-Sparplans (Tag 1..31, im kurzen Monat auf den Letzten gekappt), heute eingeschlossen. */
export function naechsteAusfuehrung(tag: number, heute: string): string | null {
  const t = termineImFenster(
    { frequency: 'monthly', billing_day: tag, start_date: '2000-01-01', end_date: null, auto_renews: true, is_active: true },
    heute, addTage(heute, 70),
  )
  return t[0] ?? null
}

export type KuendigungStatus = 'keine' | 'spaeter' | 'bald' | 'verstrichen' | 'endet' | 'beendet'

export type Kuendigung = {
  status: KuendigungStatus
  /** Letzter Tag, an dem gekündigt werden kann (Enddatum minus Frist). */
  frist: string | null
  /** Tage bis `frist` (bzw. bis zum Ende bei `endet`); negativ, wenn verstrichen. */
  tage: number | null
}

/** Ab so vielen Tagen vor der Frist gilt sie als „bald“. */
export const FRIST_BALD_TAGE = 30

/**
 * Kündigungslage eines aktiven Vertrags. Mit automatischer Verlängerung zählt die Frist (verstrichen =
 * der Vertrag verlängert sich); ohne Verlängerung endet er von selbst, dann gibt es nur das Ende.
 * Liegt das Enddatum in der Vergangenheit und der Vertrag verlängert sich, ist der Rhythmus schon weitergelaufen: keine Frist.
 */
export function kuendigung(v: Pick<Vertrag, 'is_active' | 'end_date' | 'notice_days' | 'auto_renews'>, heute: string): Kuendigung {
  const keine: Kuendigung = { status: 'keine', frist: null, tage: null }
  if (!v.is_active || !v.end_date) return keine
  if (v.end_date < heute) return v.auto_renews === true ? keine : { status: 'beendet', frist: null, tage: tageZwischen(heute, v.end_date) }
  if (v.auto_renews !== true) return { status: 'endet', frist: null, tage: tageZwischen(heute, v.end_date) }
  const frist = addTage(v.end_date, -Math.max(0, v.notice_days || 0))
  const tage = tageZwischen(heute, frist)
  if (tage < 0) return { status: 'verstrichen', frist, tage }
  return { status: tage <= FRIST_BALD_TAGE ? 'bald' : 'spaeter', frist, tage }
}

/** Datum `YYYY-MM-DD` im Anzeigeformat der Einstellungen (reiner Text, ohne Zeitzone). */
export function datumText(iso: string | null | undefined, format = 'dd.MM.yyyy'): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (format === 'MM/dd/yyyy') return `${m}/${d}/${y}`
  if (format === 'yyyy-MM-dd') return `${y}-${m}-${d}`
  return `${d}.${m}.${y}`
}

/** „heute“, „morgen“, „in 5 Tagen“ bzw. „vor 2 Tagen“. */
export function relativTage(tage: number): string {
  if (tage === 0) return 'heute'
  if (tage === 1) return 'morgen'
  if (tage === -1) return 'gestern'
  return tage > 0 ? `in ${tage} Tagen` : `vor ${-tage} Tagen`
}

// ─── Gruppen ──────────────────────────────────────────────────────────────────

export type Ansicht = 'alle' | 'fixkosten' | 'sparraten' | 'inaktiv'
export const ANSICHTEN: readonly Ansicht[] = ['alle', 'fixkosten', 'sparraten', 'inaktiv']

export function ansichtVon(wert: string | string[] | undefined): Ansicht {
  const w = Array.isArray(wert) ? wert[0] : wert
  return ANSICHTEN.find(a => a === w) ?? 'alle'
}

export type VertragsGruppen = { fixkosten: Vertrag[]; sparraten: Vertrag[]; inaktiv: Vertrag[] }

/** Aktive Ausgaben-Verträge, aktive Umbuchungen (Sparraten) und inaktive; je Gruppe nach nächstem Termin, dann Name. */
export function gruppiere(liste: Vertrag[], heute: string): VertragsGruppen {
  const termin = new Map(liste.map(v => [v.id, v.is_active ? naechsterTermin(v, heute) : null]))
  const sortiert = [...liste].sort((a, b) => {
    const ta = termin.get(a.id) ?? '9999-12-31'
    const tb = termin.get(b.id) ?? '9999-12-31'
    return ta === tb ? a.name.localeCompare(b.name, 'de') : ta < tb ? -1 : 1
  })
  return {
    fixkosten: sortiert.filter(v => v.is_active && !istUmbuchung(v.type)),
    sparraten: sortiert.filter(v => v.is_active && istUmbuchung(v.type)),
    inaktiv: sortiert.filter(v => !v.is_active),
  }
}

// ─── Kennzahlen ───────────────────────────────────────────────────────────────

export type VertragsKennzahlen = {
  anzahlFixkosten: number
  anzahlSparraten: number
  monatlich: number
  jahr: number
  /** Sparraten pro Monat inkl. Depot-Sparpläne. */
  sparMonatlich: number
  /** Aktive Ausgaben-Verträge in anderer Währung (stehen nicht in den Summen). */
  fremdwaehrung: number
  naechsteKuendigung: { id: string; name: string; frist: string; tage: number } | null
  verstrichene: number
  naechsteAbbuchung: { id: string; name: string; termin: string; betrag: number; tage: number } | null
  /** Aktive Verträge, deren letzte Abbuchung laut Abgleich fehlt. */
  ohneAbbuchung: number
}

export function kennzahlen(
  liste: Vertrag[],
  depotSparMonatlich: number,
  offeneIds: ReadonlySet<string>,
  heute: string,
): VertragsKennzahlen {
  const aktiv = liste.filter(v => v.is_active)
  const fix = aktiv.filter(v => !istUmbuchung(v.type))
  const spar = aktiv.filter(v => istUmbuchung(v.type))
  const fixEur = fix.filter(v => v.currency === 'EUR')
  const monatlich = fixEur.reduce((s, v) => s + proMonat(v.amount, v.frequency), 0)
  const sparMonatlich = spar.filter(v => v.currency === 'EUR').reduce((s, v) => s + proMonat(v.amount, v.frequency), 0) + depotSparMonatlich

  let naechsteKuendigung: VertragsKennzahlen['naechsteKuendigung'] = null
  let verstrichene = 0
  for (const v of fix) {
    const k = kuendigung(v, heute)
    if (k.status === 'verstrichen') verstrichene++
    if ((k.status === 'bald' || k.status === 'spaeter') && k.frist !== null && k.tage !== null &&
      (!naechsteKuendigung || k.frist < naechsteKuendigung.frist)) {
      naechsteKuendigung = { id: v.id, name: v.name, frist: k.frist, tage: k.tage }
    }
  }

  let naechsteAbbuchung: VertragsKennzahlen['naechsteAbbuchung'] = null
  for (const v of fix) {
    const t = naechsterTermin(v, heute)
    if (t && (!naechsteAbbuchung || t < naechsteAbbuchung.termin)) {
      naechsteAbbuchung = { id: v.id, name: v.name, termin: t, betrag: v.amount, tage: tageZwischen(heute, t) }
    }
  }

  return {
    anzahlFixkosten: fix.length,
    anzahlSparraten: spar.length,
    monatlich,
    jahr: monatlich * 12,
    sparMonatlich,
    fremdwaehrung: fix.length - fixEur.length,
    naechsteKuendigung,
    verstrichene,
    naechsteAbbuchung,
    ohneAbbuchung: aktiv.filter(v => offeneIds.has(v.id)).length,
  }
}

/** Zeile je Konto: Fixkosten pro Monat (aktive EUR-Ausgaben-Verträge), größte zuerst; Verträge ohne Konto unter `null`. */
export function fixkostenNachKonto(liste: Vertrag[], kontoName: (id: string) => string | undefined) {
  const map = new Map<string | null, { id: string | null; name: string; monatlich: number }>()
  for (const v of liste) {
    if (!v.is_active || istUmbuchung(v.type) || v.currency !== 'EUR') continue
    const e = map.get(v.account_id) ?? {
      id: v.account_id, name: v.account_id ? kontoName(v.account_id) ?? 'Unbekannt' : 'Ohne Konto', monatlich: 0,
    }
    e.monatlich += proMonat(v.amount, v.frequency)
    map.set(v.account_id, e)
  }
  return [...map.values()].sort((a, b) => b.monatlich - a.monatlich)
}
