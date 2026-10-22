/**
 * Händler aus dem Verwendungszweck, wenn die „Gegenpartei" nur ein Zahlungsabwickler ist.
 *
 * Bei Kartenzahlungen steht als Gegenpartei „DZ BANK AG", bei PayPal „PayPal Europe S.a.r.l."; den
 * Händler nennt erst der Verwendungszweck. Die Zuordnung „Gegenpartei -> Kategorie" lernt dort Unsinn:
 * 63 Buchungen der DZ BANK verteilten sich auf 15 Kategorien, und die häufigste (Claude / Anthropic)
 * wurde auf jede neue Kartenzahlung angewandt, etwa auf Alipay-Käufe in China.
 *
 * Zwei Muster, jeweils an ihrer Form erkannt und nicht am Namen der Gegenpartei, damit auch
 * unbekannte Abwickler funktionieren:
 *   PayPal   "…/PP.8546.PP/. Namecheap, Inc, Ihr Einkauf bei Namecheap, Inc EREF: …"  -> "namecheap"
 *   Karte    "Alipay.Starbucks/CHAOYANGQU…/CN 15.10.2026 / 10:21 Ortszeit PHYS Zahlung …"  -> "alipay starbucks"
 *            (Erkennung an "<Datum> / <Uhrzeit> Ortszeit", das nur Kartenumsätze tragen)
 *
 * Rein und ohne Imports, damit `node --test` die Datei direkt lädt.
 */

const RECHTSFORM = /\b(inc|llc|ltd|limited|gmbh|ag|se|sa|s\.?a\.?r\.?l|co|corp|corporation|plc|bv|nv|ug|kg|ohg|gbr|e\.?k|mbh)\b\.?/g

function bereinige(roh: string): string {
  return roh
    .toLowerCase()
    .replace(RECHTSFORM, ' ')
    .replace(/\d+$/g, '')                    // laufende Filial-/Terminalnummer am Ende ("otherretail344")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Kartenumsatz: "<Händler>/<Ort>/… 15.10.2026 / 10:21 Ortszeit …" */
const KARTE = /^([^/]{3,60})\/[^]*?\d{2}\.\d{2}\.\d{4}\s*\/\s*\d{2}:\d{2}\s*Ortszeit/i
const PAYPAL = /Ihr Einkauf bei\s+(?!EREF:|MREF:)(.+?)(?:\s+EREF:|\s+MREF:|\s*$)/i

/**
 * Der Händler als Lernschlüssel, oder null, wenn der Text keinen erkennbaren Händler enthält (etwa der
 * PayPal-Einkauf bei „...................."). null heißt: nicht raten, die Buchung geht an Regeln bzw. KI.
 */
export function extrahiereHaendler(beschreibung: string | null | undefined): string | null {
  if (!beschreibung) return null
  const text = beschreibung.replace(/\s+/g, ' ').trim()

  const pp = PAYPAL.exec(text)
  if (pp) {
    const name = bereinige(pp[1])
    return name.length >= 3 && /\p{L}/u.test(name) ? name : null
  }

  const karte = KARTE.exec(text)
  if (karte) {
    const name = bereinige(karte[1])
    return name.length >= 3 && /\p{L}/u.test(name) ? name : null
  }
  return null
}

/** "VERCEL INC." -> "Vercel Inc.": nur wenn der Text komplett groß geschrieben ist, sonst unverändert. */
function schoenerName(roh: string): string {
  const t = roh.replace(/\s+/g, ' ').replace(/[.,;:\s]+$/g, '').trim()
  if (t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/(^|[\s.\-/])(\p{L})/gu, (_m, vor: string, buchstabe: string) => vor + buchstabe.toUpperCase())
}

/**
 * Der Händlername zum Anzeigen (mit Groß-/Kleinschreibung des Belegs), wenn der Händler im Verwendungszweck steht (PayPal, Karte);
 * sonst null. Gegenstück zu `extrahiereHaendler`, das den Lernschlüssel liefert.
 */
export function haendlerName(beschreibung: string | null | undefined): string | null {
  if (!extrahiereHaendler(beschreibung)) return null
  const text = (beschreibung ?? '').replace(/\s+/g, ' ').trim()
  const pp = PAYPAL.exec(text)
  if (pp) return schoenerName(pp[1])
  const karte = KARTE.exec(text)
  return karte ? schoenerName(karte[1]) : null
}
