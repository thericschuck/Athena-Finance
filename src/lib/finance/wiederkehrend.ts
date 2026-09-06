/**
 * Erkennt wiederkehrende Zahlungen in den Buchungen.
 *
 * Reine Funktion, keine Datenbank. Der Zweck ist nicht, moeglichst viel zu
 * finden, sondern moeglichst wenig Falsches: jeder Treffer wird Eric als
 * Vertragsvorschlag vorgelegt, und ein Vorschlagsstapel voller Fehlgriffe ist
 * schlimmer als keiner. Deshalb sind die Schwellen streng und jeder Kandidat
 * traegt seine Begruendung mit.
 */

export type WiederkehrBuchung = {
  id: string | null
  datum: string
  /** Vorzeichenbehaftet, wie in unified_transactions. */
  betrag: number
  beschreibung: string | null
  merchant: string | null
  konto_id: string | null
  kategorie_id: string | null
}

export type BestehenderVertrag = {
  name: string
  betrag: number
  aktiv: boolean
}

export type Frequenz = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

export type Kandidat = {
  /** Der normalisierte Gruppenschluessel -- stabil, nicht fuer Menschen. */
  schluessel: string
  /** Der laengste tatsaechlich vorkommende Text, als Vorschlag fuer den Namen. */
  bezeichnung: string
  richtung: 'ausgabe' | 'einnahme'
  betrag: number
  betrag_schwankt: boolean
  frequenz: Frequenz
  median_abstand_tage: number
  /** Tag im Monat, an dem tatsaechlich gebucht wird. */
  tag_im_monat: number | null
  erste_buchung: string
  letzte_buchung: string
  anzahl: number
  jahreskosten: number
  konfidenz: 'hoch' | 'mittel'
  /** Letzte Buchung liegt innerhalb des erwarteten Fensters. */
  laeuft_noch: boolean
  konto_id: string | null
  kategorie_id: string | null
  /** Ein aktiver Vertrag passt zu Name und Betrag -- nicht noch einmal vorschlagen. */
  hat_vertrag: boolean
  begruendung: string
}

/** Mindestzahl an Buchungen, bevor etwas als Serie gilt. */
const MIN_BUCHUNGEN = 3

/**
 * Wie stark die Betraege innerhalb einer Serie schwanken duerfen.
 * Ein Abo darf teurer werden; der Wocheneinkauf beim selben Haendler ist keine
 * Serie, und genau daran wird er hier aussortiert.
 */
const MAX_BETRAGS_STREUUNG = 0.15

/** Wie stark die Abstaende schwanken duerfen, damit es ein Rhythmus ist. */
const MAX_ABSTANDS_ABWEICHUNG = 0.25

const FREQUENZEN: { name: Frequenz; tage: number; toleranz: number }[] = [
  { name: 'weekly',    tage: 7,   toleranz: 2 },
  { name: 'biweekly',  tage: 14,  toleranz: 3 },
  { name: 'monthly',   tage: 30,  toleranz: 4 },
  { name: 'quarterly', tage: 91,  toleranz: 10 },
  { name: 'yearly',    tage: 365, toleranz: 20 },
]

/** Woerter, die in Bankverwendungszwecken stehen und nichts unterscheiden. */
const FUELLWOERTER = new Set([
  'rechnung', 'rechnungsnr', 'kunde', 'kundennummer', 'vertrag', 'vertragsnr',
  'zahlung', 'lastschrift', 'ueberweisung', 'dauerauftrag', 'sepa', 'mandat',
  'referenz', 'verwendungszweck', 'bank', 'gmbh', 'aktiengesellschaft',
  'monat', 'monatlich', 'jahresbeitrag', 'beitrag', 'abschlag', 'end', 'to',
])

/**
 * Bankverwendungszwecke auf ihren wiedererkennbaren Kern reduzieren.
 *
 * Der Verwendungszweck derselben Abbuchung ist nie zweimal gleich -- er
 * enthaelt Rechnungsnummern, Monatsangaben, Mandatsreferenzen. Ohne diesen
 * Schritt ist jede Buchung ihre eigene Gruppe und es wird nie etwas gefunden.
 *
 * DREI Woerter, nicht vier. Der Grund steht in Erics Daten: dieselbe
 * Bausparkasse kam als
 *   "Bausparkasse Schwaebisch Hall Aktiengesellschaft - Baus"           und
 *   "Bausparkasse Schwaebisch Hall Aktiengesellschaft - Bausparkasse der Vol"
 * an -- die Bank kuerzt den Namen unterschiedlich lang ab. Das vierte Wort war
 * damit der Kuerzungsrest und zerlegte einen laufenden Vertrag in zwei
 * Gruppen, von denen eine als "beendet" gemeldet wurde. Die Identitaet eines
 * Zahlungsempfaengers steht vorne; hinten steht, wo abgeschnitten wurde.
 */
export function normalisiere(text: string | null): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')      // Ziffern und Zeichen raus -- dort stecken die Nummern
    .split(/\s+/)
    .filter(w => w.length >= 3 && !FUELLWOERTER.has(w))
    .slice(0, 3)                    // die ersten Wortstaemme tragen die Identitaet
    .join(' ')
    .trim()
}

/**
 * Taugt der Schluessel als Identitaet?
 *
 * Auch das kommt aus den echten Daten: ein Dauerauftrag an sich selbst hat bei
 * der Bank den Empfaenger "Ich". Daraus wurde ein Kandidat namens "ich" -- ein
 * Drei-Zeichen-Wort als Vertragsvorschlag. Ein einzelnes kurzes Wort ist keine
 * Identitaet; zwei Woerter oder ein langes sind eine.
 */
function schluesselTaugt(schluessel: string): boolean {
  const woerter = schluessel.split(' ').filter(Boolean)
  if (woerter.length === 0) return false
  if (woerter.length >= 2) return true
  return woerter[0].length >= 6
}

function median(werte: number[]): number {
  if (werte.length === 0) return 0
  const s = [...werte].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function tageZwischen(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  )
}

function erkenneFrequenz(medianAbstand: number): Frequenz | null {
  for (const f of FREQUENZEN) {
    if (Math.abs(medianAbstand - f.tage) <= f.toleranz) return f.name
  }
  return null
}

/** Passt ein bestehender Vertrag zu dieser Serie? Name UND Betrag muessen stimmen. */
function findeVertrag(
  bezeichnung: string,
  betrag: number,
  vertraege: BestehenderVertrag[],
): boolean {
  const woerter = new Set(normalisiere(bezeichnung).split(' ').filter(Boolean))
  if (woerter.size === 0) return false

  return vertraege.some(v => {
    if (!v.aktiv) return false
    if (Math.abs(Math.abs(v.betrag) - betrag) > Math.max(1, betrag * 0.02)) return false
    const vertragsWoerter = normalisiere(v.name).split(' ').filter(Boolean)
    return vertragsWoerter.some(w => woerter.has(w))
  })
}

export function erkenneWiederkehrend(
  buchungen: WiederkehrBuchung[],
  vertraege: BestehenderVertrag[] = [],
  heute = new Date().toISOString().slice(0, 10),
): Kandidat[] {
  // Gruppieren nach dem normalisierten Text. Der Betrag geht NICHT in den
  // Schluessel: ein Abo darf teurer werden, und ein Preissprung soll die Serie
  // nicht in zwei Haelften zerlegen, die beide unter die Mindestzahl fallen.
  const gruppen = new Map<string, WiederkehrBuchung[]>()
  for (const b of buchungen) {
    const schluessel = normalisiere(b.merchant ?? b.beschreibung)
    if (!schluesselTaugt(schluessel)) continue
    const richtung = b.betrag < 0 ? 'a' : 'e'
    const voll = `${richtung}|${schluessel}`
    const liste = gruppen.get(voll)
    if (liste) liste.push(b)
    else gruppen.set(voll, [b])
  }

  const kandidaten: Kandidat[] = []

  for (const [schluessel, roh] of gruppen) {
    if (roh.length < MIN_BUCHUNGEN) continue

    const sortiert = [...roh].sort((a, b) => a.datum.localeCompare(b.datum))
    const betraege = sortiert.map(b => Math.abs(b.betrag))
    const medianBetrag = median(betraege)
    if (medianBetrag <= 0) continue

    // Betragsstreuung: der Wocheneinkauf beim selben Haendler faellt hier raus.
    const streuung = Math.max(...betraege.map(x => Math.abs(x - medianBetrag))) / medianBetrag
    if (streuung > MAX_BETRAGS_STREUUNG) continue

    const abstaende: number[] = []
    for (let i = 1; i < sortiert.length; i++) {
      abstaende.push(tageZwischen(sortiert[i - 1].datum, sortiert[i].datum))
    }
    const medianAbstand = median(abstaende)
    const frequenz = erkenneFrequenz(medianAbstand)
    if (!frequenz) continue

    // Rhythmus: die Mehrheit der Abstaende muss nah am Median liegen. Vier
    // Zahlungen in einer Woche und dann ein Jahr Pause haben denselben Median
    // wie ein sauberer Monatsrhythmus -- aber keinen Rhythmus.
    const passend = abstaende.filter(
      d => Math.abs(d - medianAbstand) <= medianAbstand * MAX_ABSTANDS_ABWEICHUNG,
    ).length
    if (passend / abstaende.length < 0.6) continue

    const erste = sortiert[0].datum
    const letzte = sortiert[sortiert.length - 1].datum
    const tageSeitLetzter = tageZwischen(letzte, heute)
    const laeuftNoch = tageSeitLetzter <= medianAbstand * 1.5

    // Der Tag im Monat, an dem wirklich gebucht wird -- nur bei Monatsrhythmus
    // und nur, wenn er stabil ist. Genau diese Zahl fehlt spaeter im Vertrag,
    // wenn niemand sie setzt.
    const tage = sortiert.map(b => Number(b.datum.slice(8, 10)))
    const medianTag = Math.round(median(tage))
    const tagStabil =
      frequenz === 'monthly' &&
      tage.filter(t => Math.abs(t - medianTag) <= 3).length / tage.length >= 0.6
    const tagImMonat = tagStabil ? medianTag : null

    const bezeichnung = sortiert
      .map(b => (b.merchant ?? b.beschreibung ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] ?? schluessel

    const proJahr = 365 / medianAbstand
    const betragSchwankt = new Set(betraege.map(x => x.toFixed(2))).size > 1

    kandidaten.push({
      schluessel,
      bezeichnung,
      richtung: sortiert[0].betrag < 0 ? 'ausgabe' : 'einnahme',
      betrag: Math.round(medianBetrag * 100) / 100,
      betrag_schwankt: betragSchwankt,
      frequenz,
      median_abstand_tage: medianAbstand,
      tag_im_monat: tagImMonat,
      erste_buchung: erste,
      letzte_buchung: letzte,
      anzahl: sortiert.length,
      jahreskosten: Math.round(medianBetrag * proJahr * 100) / 100,
      // Hoch nur, wenn es viele Buchungen sind, der Rhythmus sauber ist und es
      // noch laeuft. Alles andere ist ein Hinweis, keine Feststellung.
      konfidenz:
        sortiert.length >= 4 && passend === abstaende.length && laeuftNoch ? 'hoch' : 'mittel',
      laeuft_noch: laeuftNoch,
      konto_id: sortiert[sortiert.length - 1].konto_id,
      kategorie_id: sortiert[sortiert.length - 1].kategorie_id,
      hat_vertrag: findeVertrag(bezeichnung, medianBetrag, vertraege),
      begruendung:
        `${sortiert.length} Buchungen zwischen ${erste} und ${letzte}, ` +
        `im Median alle ${medianAbstand} Tage` +
        (betragSchwankt ? `, Betrag schwankt um bis zu ${Math.round(streuung * 100)} %` : ', immer derselbe Betrag') +
        (tagImMonat ? `, meist am ${tagImMonat}.` : '') +
        (laeuftNoch ? '' : `, zuletzt vor ${tageSeitLetzter} Tagen`),
    })
  }

  // Das Teuerste zuerst -- danach entscheidet sich, ob sich das Anlegen lohnt.
  return kandidaten.sort((a, b) => b.jahreskosten - a.jahreskosten)
}
