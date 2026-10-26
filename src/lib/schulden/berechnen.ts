/**
 * Reine Berechnungen der Schulden-Seite: Fortschritt, Tilgungsanteil einer Zahlung, Restlaufzeit,
 * Zinsen, Restschuld-Verlauf und Kennzahlen. Keine '@/'-Importe, damit die Datei per node:test
 * testbar ist. Beträge sind Zahlen in der Währung der Schuld; Summen zählen nur EUR.
 *
 * Wichtige Regel: Eine Zahlung senkt die Restschuld nur um ihren TILGUNGSANTEIL. Zinsen sind
 * Kosten und mindern die Schuld nicht (früher wurde immer der volle Betrag abgezogen).
 */

export type SchuldTyp = 'borrowed' | 'lent'

export interface SchuldDaten {
  id: string
  type: string
  currency: string
  original_amount: number
  outstanding: number
  interest_rate: number | null
  monthly_payment: number | null
  due_date: string | null
  is_active: boolean
}

export interface ZahlungDaten {
  amount: number
  principal: number | null
  interest: number | null
  /** YYYY-MM-DD */
  payment_date: string
}

const EPS = 0.005

export function rund2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Tilgungs- und Zinsanteil einer Zahlung. Sind beide Anteile angegeben, gelten sie; ist nur einer
 * angegeben, ist der andere der Rest; ohne Angabe ist die ganze Zahlung Tilgung.
 */
export function zahlungsAnteile(z: { amount: number; principal: number | null; interest: number | null }): {
  tilgung: number
  zinsen: number
} {
  const { amount, principal, interest } = z
  if (principal != null && interest != null) return { tilgung: principal, zinsen: interest }
  if (principal != null) return { tilgung: principal, zinsen: rund2(amount - principal) }
  if (interest != null) return { tilgung: rund2(amount - interest), zinsen: interest }
  return { tilgung: amount, zinsen: 0 }
}

/**
 * Prüft eine neue Zahlung gegen die Restschuld. Gibt eine deutsche Fehlermeldung zurück oder null.
 * Anteile müssen zusammen den Betrag ergeben; die Tilgung darf die Restschuld nicht übersteigen.
 */
export function pruefeZahlung(
  z: { amount: number; principal: number | null; interest: number | null },
  outstanding: number,
): string | null {
  if (!(z.amount > 0)) return 'Betrag muss größer als 0 sein'
  if ((z.principal ?? 0) < 0) return 'Tilgung darf nicht negativ sein'
  if ((z.interest ?? 0) < 0) return 'Zinsanteil darf nicht negativ sein'
  const { tilgung, zinsen } = zahlungsAnteile(z)
  if (tilgung < -EPS || zinsen < -EPS) return 'Tilgung und Zinsen dürfen zusammen nicht mehr als der Betrag sein'
  if (Math.abs(tilgung + zinsen - z.amount) > EPS) return 'Tilgung und Zinsen müssen zusammen den Betrag ergeben'
  if (tilgung > outstanding + EPS) return 'Die Tilgung ist höher als die offene Restschuld'
  return null
}

/** Neue Restschuld nach einer Zahlung (nie unter 0). */
export function restNachZahlung(outstanding: number, z: { amount: number; principal: number | null; interest: number | null }): number {
  return Math.max(0, rund2(outstanding - zahlungsAnteile(z).tilgung))
}

/** Restschuld nachdem eine Zahlung gelöscht wurde (die Tilgung kommt zurück, höchstens bis zum Gesamtbetrag). */
export function restNachLoeschen(
  outstanding: number,
  original: number,
  z: { amount: number; principal: number | null; interest: number | null },
): number {
  return Math.min(original, rund2(outstanding + zahlungsAnteile(z).tilgung))
}

/** Getilgter Betrag, Prozent (0–100, ganze Zahl) und Anteil (0–1). */
export function fortschritt(original: number, outstanding: number): { getilgt: number; prozent: number; anteil: number } {
  if (!(original > 0)) return { getilgt: 0, prozent: 0, anteil: 0 }
  const getilgt = Math.max(0, Math.min(original, rund2(original - outstanding)))
  const anteil = getilgt / original
  return { getilgt, prozent: Math.round(anteil * 100), anteil }
}

/** Ist das Fälligkeitsdatum (YYYY-MM-DD) vor `heute` (Berliner Datum)? Der Fälligkeitstag selbst ist nicht überfällig. */
export function istUeberfaellig(dueDate: string | null, heute: string, aktiv = true): boolean {
  return aktiv && !!dueDate && dueDate < heute
}

/** Tage von `heute` bis `datum` (negativ = vorbei), beide YYYY-MM-DD, kalendarisch ohne Zeitzone. */
export function tageBis(datum: string, heute: string): number {
  const a = Date.UTC(+datum.slice(0, 4), +datum.slice(5, 7) - 1, +datum.slice(8, 10))
  const b = Date.UTC(+heute.slice(0, 4), +heute.slice(5, 7) - 1, +heute.slice(8, 10))
  return Math.round((a - b) / 86_400_000)
}

/** Addiert Monate zu YYYY-MM-DD; der Tag wird auf das Monatsende gekappt (31.01. + 1 = 28.02.). */
export function addMonate(datum: string, monate: number): string {
  const j = +datum.slice(0, 4)
  const m = +datum.slice(5, 7) - 1
  const t = +datum.slice(8, 10)
  const gesamt = j * 12 + m + monate
  const nj = Math.floor(gesamt / 12)
  const nm = ((gesamt % 12) + 12) % 12
  const letzter = new Date(Date.UTC(nj, nm + 1, 0)).getUTCDate()
  return `${String(nj).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(t, letzter)).padStart(2, '0')}`
}

/** Zinsen pro Jahr auf die aktuelle Restschuld (einfach, ohne Zinseszins). */
export function zinsenProJahr(outstanding: number, zinssatz: number | null): number {
  if (!zinssatz || zinssatz <= 0 || outstanding <= 0) return 0
  return rund2((outstanding * zinssatz) / 100)
}

/**
 * Monate bis die Schuld mit fester Monatsrate abbezahlt ist (Annuität, Zinsen monatlich = Satz/12).
 * null, wenn keine Rate gesetzt ist oder die Rate die Monatszinsen nicht deckt (Schuld wächst).
 * 0, wenn nichts mehr offen ist.
 */
export function restlaufzeitMonate(outstanding: number, zinssatz: number | null, rate: number | null): number | null {
  if (outstanding <= EPS) return 0
  if (!rate || rate <= 0) return null
  const r = (zinssatz ?? 0) / 1200
  if (r <= 0) return Math.ceil(outstanding / rate - 1e-9)
  const x = (r * outstanding) / rate
  if (x >= 1) return null
  const n = -Math.log(1 - x) / Math.log(1 + r)
  return Math.ceil(n - 1e-9)
}

/** Gesamtzinsen, die bis zum Ende noch anfallen (Annuität); null, wenn die Laufzeit unbestimmt ist. */
export function restzinsen(outstanding: number, zinssatz: number | null, rate: number | null): number | null {
  const n = restlaufzeitMonate(outstanding, zinssatz, rate)
  if (n === null || !rate) return null
  const r = (zinssatz ?? 0) / 1200
  if (r <= 0 || n === 0) return 0
  // Alle Raten voll, die letzte kleiner: Summe der Zinsen über den Verlauf.
  let rest = outstanding
  let summe = 0
  for (let i = 0; i < n && rest > EPS; i++) {
    const z = rest * r
    summe += z
    rest = rest + z - Math.min(rate, rest + z)
  }
  return rund2(summe)
}

export interface VerlaufPunkt {
  datum: string
  rest: number
}

/**
 * Restschuld über die Zeit, rückwärts aus dem heutigen Stand und den Zahlungen gebaut (so passt der
 * letzte Punkt immer zur Anzeige, auch wenn der Gesamtbetrag später geändert wurde). Erster Punkt
 * ist der Start (`startDatum`), danach einer je Zahlungstag. Ohne Zahlungen: leer.
 */
export function restschuldVerlauf(
  outstanding: number,
  zahlungen: ZahlungDaten[],
  startDatum: string,
): VerlaufPunkt[] {
  if (zahlungen.length === 0) return []
  const sortiert = [...zahlungen].sort((a, b) => (a.payment_date < b.payment_date ? -1 : a.payment_date > b.payment_date ? 1 : 0))
  const gesamtTilgung = sortiert.reduce((s, z) => s + zahlungsAnteile(z).tilgung, 0)
  let rest = rund2(outstanding + gesamtTilgung)
  const start = startDatum <= sortiert[0].payment_date ? startDatum : sortiert[0].payment_date
  const punkte: VerlaufPunkt[] = [{ datum: start, rest }]
  for (const z of sortiert) {
    rest = Math.max(0, rund2(rest - zahlungsAnteile(z).tilgung))
    const letzter = punkte[punkte.length - 1]
    if (letzter.datum === z.payment_date && punkte.length > 1) letzter.rest = rest
    else punkte.push({ datum: z.payment_date, rest })
  }
  return punkte
}

export interface SchuldenKennzahlen {
  /** Ich schulde (aktiv, EUR). */
  schulde: number
  /** Mir wird geschuldet (aktiv, EUR). */
  geschuldet: number
  /** Summe der Monatsraten der aktiven Schulden, die ich bezahle (EUR). */
  monatlicheLast: number
  /** Anzahl aktiver Schulden mit Rate. */
  mitRate: number
  /** Zinsen pro Jahr auf meine aktiven Schulden (EUR). */
  zinsenProJahr: number
  /** Bisher getilgt von meinen Schulden (aktiv und abgeschlossen, EUR). */
  getilgt: number
  /** Ursprüngliche Summe meiner Schulden (EUR). */
  urspruenglich: number
  /** Datum, an dem alle meine Schulden mit Rate abbezahlt wären; null, wenn offen/unbestimmt. */
  schuldenfrei: string | null
  /** Aktive Schulden ohne Rate oder mit zu kleiner Rate: das Enddatum ist dann nicht bestimmbar. */
  ohneEnde: number
  aktiv: number
  abgeschlossen: number
  /** Aktive Einträge in anderer Währung (stehen nicht in den Summen). */
  fremdwaehrung: number
  ueberfaellig: number
}

export function schuldenKennzahlen(schulden: SchuldDaten[], heute: string): SchuldenKennzahlen {
  const k: SchuldenKennzahlen = {
    schulde: 0, geschuldet: 0, monatlicheLast: 0, mitRate: 0, zinsenProJahr: 0, getilgt: 0, urspruenglich: 0,
    schuldenfrei: null, ohneEnde: 0, aktiv: 0, abgeschlossen: 0, fremdwaehrung: 0, ueberfaellig: 0,
  }
  let maxMonate = 0
  let endeBekannt = false
  for (const s of schulden) {
    if (s.is_active) k.aktiv++
    else k.abgeschlossen++
    if (s.is_active && istUeberfaellig(s.due_date, heute)) k.ueberfaellig++
    if (s.currency !== 'EUR') {
      if (s.is_active) k.fremdwaehrung++
      continue
    }
    if (s.type === 'borrowed') {
      k.urspruenglich += s.original_amount
      k.getilgt += fortschritt(s.original_amount, s.outstanding).getilgt
    }
    if (!s.is_active) continue
    if (s.type === 'lent') {
      k.geschuldet += s.outstanding
      continue
    }
    k.schulde += s.outstanding
    k.zinsenProJahr += zinsenProJahr(s.outstanding, s.interest_rate)
    if (s.monthly_payment && s.monthly_payment > 0) {
      k.monatlicheLast += s.monthly_payment
      k.mitRate++
    }
    const n = restlaufzeitMonate(s.outstanding, s.interest_rate, s.monthly_payment)
    if (n === null) k.ohneEnde++
    else {
      endeBekannt = true
      maxMonate = Math.max(maxMonate, n)
    }
  }
  k.schulde = rund2(k.schulde)
  k.geschuldet = rund2(k.geschuldet)
  k.zinsenProJahr = rund2(k.zinsenProJahr)
  k.getilgt = rund2(k.getilgt)
  k.urspruenglich = rund2(k.urspruenglich)
  if (endeBekannt && k.ohneEnde === 0 && k.schulde > 0) k.schuldenfrei = addMonate(heute, maxMonate)
  return k
}

/** YYYY-MM-DD nach dem Datumsformat der Einstellungen, ohne Zeitzonen-Umweg über `Date`. */
export function formatDatum(iso: string | null, format = 'dd.MM.yyyy'): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—'
  const j = iso.slice(0, 4)
  const m = iso.slice(5, 7)
  const t = iso.slice(8, 10)
  if (format === 'MM/dd/yyyy') return `${m}/${t}/${j}`
  if (format === 'yyyy-MM-dd') return `${j}-${m}-${t}`
  return `${t}.${m}.${j}`
}

/** Monat und Jahr („04/2027“), für „schuldenfrei ca.“. */
export function formatMonatJahr(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
