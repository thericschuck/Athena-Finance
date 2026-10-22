// Auto-categorization for bank transactions based on description/counterparty keywords.
//
// Suggestions resolve to the user's REAL Finance categories (the same `categories` table
// used by /finance), not an invented parallel taxonomy — a rule only ever fires if one of
// its candidate names actually exists for this user. That's deliberate: this user's real
// categories are a narrow, personal set (Lebensmittel, Abo, Freizeit, Gehalt, Taschengeld, …),
// not a generic "Transport/Versicherung/Bildung/…" expense taxonomy. If a rule's candidates
// don't exist yet, it stays silent instead of forcing a wrong category — create the matching
// category under /finance/categories and the same rule starts suggesting for it immediately.
import type { FinanceCategory } from '@/types/bank'
import { extrahiereHaendler } from './merchant-key.ts'

interface CategoryRule {
  /** Candidate real category names, tried in priority order. */
  candidates: string[]
  patterns: RegExp[]
}

const RULES: CategoryRule[] = [
  {
    candidates: ['Lebensmittel', 'Lebenserhaltung'],
    patterns: [
      /\b(rewe|edeka|aldi|lidl|penny|netto|kaufland|norma|tegut|bio\s?company|denn?s|basic|dm\s?markt|drogeriemarkt|rossmann|müller|bauer-?markt)\b/i,
      /\b(supermarkt|lebensmittel|bäckerei|metzger|fleisch|obst|gemüse)\b/i,
      // Getränkehändler und Hofläden: stehen auf dem Kontoauszug ohne Markennamen.
      /\b(kelterei|getränke|getraenke|getränkemarkt|hofladen|metzgerei)\b/i,
    ],
  },
  {
    candidates: ['Freizeit', 'Restaurant', 'Freizeitausgaben'],
    patterns: [
      /\b(restaurant|bistro|café|cafe|imbiss|mcdonalds|mc\s?donalds|burger\s?king|subway|kfc|pizza|lieferando|lieferheld|just\s?eat|uber\s?eats|wolt|doordash)\b/i,
      /\b(gaststätte|gasthof|wirtshaus|brauerei|kantine)\b/i,
      /\b(kino|cinema|steam|playstation|xbox|nintendo|switch|freizeitpark|bowling|escape\s?room)\b/i,
    ],
  },
  {
    // Eigene Unterkategorien pro Anbieter -- ohne diese vier Regeln landen Anthropic/Vercel/
    // Supabase/Figma-Buchungen alle in der groben "Abo"-Sammelkategorie darunter, obwohl für
    // jeden Anbieter längst eine eigene Unterkategorie existiert. Stehen vor dem generischen
    // Business-Tools-Fallback, der dieselben Muster nochmal abdeckt -- für Nutzer ohne eigene
    // Vendor-Kategorie greift dann der.
    candidates: ['Claude / Anthropic'],
    patterns: [/\b(anthropic|claude)\b/i],
  },
  {
    candidates: ['Vercel'],
    patterns: [/\bvercel\b/i],
  },
  {
    candidates: ['Supabase'],
    patterns: [/\bsupabase\b/i],
  },
  {
    candidates: ['Figma'],
    patterns: [/\bfigma\b/i],
  },
  {
    // Business/dev infrastructure — checked before the personal "Abo" rule so a webdesign/dev
    // tool doesn't get lumped in with Netflix-style consumer subscriptions.
    candidates: ['Business-Tools', 'Software & Tech', 'Abo'],
    patterns: [
      /\b(anthropic|claude|openai|vercel|supabase|github|netlify|figma|adobe|framer)\b/i,
      /\b(hosting|domain|server|cloud\s?computing|saas|api\b)\b/i,
    ],
  },
  {
    // Eigene Unterkategorie für Amazon Prime -- ohne diese Regel matcht die generische
    // "Abo"-Regel unten zwar auch (deren Muster enthält amazon\s?prime), landet aber in der
    // groben Sammelkategorie statt im eigens dafür angelegten Eintrag.
    candidates: ['Amazon Prime'],
    patterns: [/\bamazon\s?prime\b/i],
  },
  {
    // "marbis" matcht sonst keine Regel und blieb deshalb bisher immer unkategorisiert.
    candidates: ['marbis'],
    patterns: [/\bmarbis\b/i],
  },
  {
    // 'Sonstige Abos' vor dem groben 'Abo'-Fallback: Konsumenten-Abos ohne eigene
    // Vendor-Kategorie (Netflix, Spotify, iCloud, ...) landen so in der dafür vorgesehenen
    // Sammelkategorie statt in der Oberkategorie selbst.
    candidates: ['Sonstige Abos', 'Abo', 'Streaming'],
    patterns: [
      /\b(netflix|amazon\s?prime|disney\+|disney\s?plus|spotify|apple\s?music|deezer|tidal|youtube\s?premium|sky\s?ticket|joyn|maxdome)\b/i,
      /\b(icloud|dropbox|notion|canva|1password|lastpass|kindle|audible)\b/i,
      /\b(abo|abonnement|mitgliedschaft)\b/i,
    ],
  },
  {
    candidates: ['Shopping'],
    patterns: [
      /\b(amazon|zalando|about\s?you|otto|ebay|ikea|obi|bauhaus|hornbach|toom|hagebau|baumarkt|mediamarkt|saturn)\b/i,
      /\b(zara|h&m|primark|c&a|peek\s?&\s?cloppenburg|esprit|bonprix|tchibo)\b/i,
    ],
  },
  {
    candidates: ['Reisen'],
    patterns: [
      /\b(hotel|hostel|airbnb|booking\.com|apartments?|reisebüro|tui)\b/i,
      /\b(db\s?fernverkehr|fahrgastrechtsfall|asfinag|maut|vignette)\b/i,
      /\b(urlaub|reise|ferien|flughafen|airline)\b/i,
    ],
  },
  {
    // Nahverkehr, Tanken, Parken. Parkhäuser waren die häufigste unkategorisierte
    // Alltagsbuchung, obwohl es die Kategorie „Transport" längst gibt.
    candidates: ['Transport'],
    patterns: [
      /\b(parkhaus|parkplatz|parkservice|parkraum|parkgebühr|parken)\b/i,
      /\b(tankstelle|aral|shell|esso|jet\s?tankstelle|total\s?energies|agip|avia|orlen|bft)\b/i,
      // "OIL! 130 Elsenfeld" (Zahl folgt dem Namen, damit "olive oil" nicht trifft) und der
      // regionale Mineralölhändler Schmitt + Orschler, der auf dem Auszug nur als Name steht.
      /\boil!?\s?\d+\b/i,
      /\bschmitt\s?\+\s?orschler\b/i,
      /\b(db\s?vertrieb|deutsche\s?bahn|flixbus|vgn|rmv|vrn|mvg|taxi|uber\s?bv|bolt\s?operations)\b/i,
      /\b(werkstatt|tüv|dekra|kfz|autohaus)\b/i,
    ],
  },
  {
    // „MVZ" = Medizinisches Versorgungszentrum, so heißen die Labor-Rechnungen im
    // Verwendungszweck. „KVUE" ist die Kassenärztliche Vereinigung.
    candidates: ['Gesundheit'],
    patterns: [
      /\b(apotheke|arzt|ärzt|zahnarzt|klinik|krankenhaus|praxis|labor|mvz|kvue|physio|orthopäd|radiolog)\b/i,
      /\b(krankenkasse|krankenversicherung|aok|barmer|dak|techniker\s?krankenkasse)\b/i,
    ],
  },
  {
    candidates: ['Gehalt'],
    patterns: [
      /\b(gehalt|lohn|entgelt|vergütung|gehaltseingang|lohneingang)\b/i,
    ],
  },
  {
    candidates: ['Taschengeld'],
    patterns: [/\btaschengeld\b/i],
  },
  {
    candidates: ['Business Einnahmen'],
    patterns: [/\b(rechnung|honorar|auftrag|freelance|projektzahlung)\b/i],
  },
  {
    // `payward`: Kraken tritt auf dem Kontoauszug NIE als „Kraken" auf, sondern unter der
    // Rechtsform „Payward Ireland Limited". Das waren allein 12 Buchungen über 8.610 EUR,
    // die deshalb unkategorisiert blieben, obwohl es die Kategorie „Crypto" gibt.
    candidates: ['Crypto'],
    patterns: [/\b(kraken|payward|binance|bitpanda|coinbase|bitcoin|krypto|crypto)\b/i],
  },
  {
    // Vor der Depot-Regel: ein Bausparvertrag ist kein Wertpapierdepot. „BSV" ist die
    // Abkürzung im Verwendungszweck der LBS, gefolgt von der Vertragsnummer.
    //
    // Ziel ist bewusst die OBERkategorie „Bausparverträge" und nicht einer der drei
    // Verträge (10.000/20.000/30.000 EUR) — welcher gemeint ist, steht nur in der
    // Vertragsnummer, und die falsch zu raten wäre schlimmer als eine Ebene zu grob.
    candidates: ['Bausparverträge', 'Sparkonto'],
    patterns: [
      /\b(lbs|bausparen|bausparvertrag|bausparkasse|schwäbisch\s?hall|wüstenrot)\b/i,
      /\bbsv\s?\d/i,
    ],
  },
  {
    // Vor der Depot-Regel, deren Muster "dividende" ebenfalls enthält: eine Dividende ist eine Einnahme
    // (Kategorie "Kapitalerträge"), kein Depot-Vorgang. Gibt es die Kategorie nicht, fällt die Buchung wie bisher
    // an die Depot-Regel weiter.
    candidates: ['Kapitalerträge', 'Kapitalertraege', 'Dividenden'],
    patterns: [/\b(dividende|ausschüttung|ausschuettung|kapitalertrag)\b/i],
  },
  {
    candidates: ['Depot', 'Sparkonto'],
    patterns: [/\b(sparplan|festgeld|tagesgeld|fonds|etf|aktien|wertpapier|dividende|trade\s?republic|comdirect|ing\s?diba|scalable\s?capital)\b/i],
  },
  {
    // Kontoabschluss und Zinsgutschriften. Winzige Beträge, aber sie stehen dauerhaft als
    // „ohne Kategorie" in der Liste und lassen sie voller aussehen als sie ist.
    candidates: ['Zinsen', 'Einnahmen'],
    patterns: [/\b(abschluss\s?per|rechnungsabschluss|habenzins|sollzins|zinsgutschrift)\b/i],
  },
  {
    candidates: ['Schulden'],
    patterns: [/\b(kredit|darlehen|tilgung|ratenzahlung|schuld)\b/i],
  },
  {
    // Low-priority fallback — checked last so a more specific rule above always wins first.
    candidates: ['Auszahlung'],
    patterns: [/\b(geldautomat|bargeldauszahlung|girocard\s?ga)\b/i],
  },
]

/**
 * Case-insensitive Namenstreffer. Gibt es den Namen mehrfach, gewinnt die Variante MIT Icon:
 * das ist erfahrungsgemäß die gepflegte, die ohne Icon eine Altlast. Aktuell sind die
 * Kategorien dieses Accounts duplikatfrei — die Auswahl bleibt trotzdem stehen, weil sie
 * genau dann greift, wenn beim Anlegen wieder ein Doppel entsteht.
 */
function pickCategoryByName(name: string, categories: FinanceCategory[]): FinanceCategory | null {
  const matches = categories.filter(c => c.name.toLowerCase() === name.toLowerCase())
  if (matches.length === 0) return null
  return matches.find(c => c.icon) ?? matches[0]
}

/** Exported so callers (e.g. the suggestion-review UI) can group by the same key this module learns by. */
export function normalizeCounterpart(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Gelernte Zuordnung aus dem, was der Nutzer selbst entschieden hat. Schlüssel, vom Allgemeinen zum Besonderen:
 *   `<gegenpartei>`            Gegenpartei normalisiert ("rewe markt gmbh") -> häufigste Kategorie
 *   `<gegenpartei>|in` / `|out`  dasselbe, getrennt nach Richtung (Ein- und Auszahlung beim selben Institut)
 *   `<gegenpartei>#<betrag>`   fester Betrag, nur wenn mindestens zweimal und stets gleich entschieden
 *                              (Abos und Raten: "Amazon Prime 8,99 €" ist nicht "Amazon 23,40 €")
 * und jeweils dasselbe mit `h:<händler>` statt der Gegenpartei, wenn der Händler im Verwendungszweck steht.
 */
export type LearnedCategoryMap = Map<string, string>

/** Ab so vielen verschiedenen Kategorien ohne klare Mehrheit ist eine Gegenpartei kein Händler, sondern ein Abwickler. */
const ABWICKLER_MIN_KATEGORIEN = 3
const ABWICKLER_MAX_MEHRHEIT = 0.6
/** Ein fester Betrag zählt erst ab so vielen übereinstimmenden Entscheidungen. */
const BETRAG_MIN_TREFFER = 2

type LernZeile = { counterpart_name: string | null; category_id: string | null; description?: string | null; amount?: number | string | null }

/** Alle Schlüssel einer Buchung, spezifischste zuerst. */
function schluesselFuer(basis: string, betrag: number | null): string[] {
  if (betrag === null || betrag === 0) return [basis]
  const richtung = betrag > 0 ? 'in' : 'out'
  return [`${basis}#${betrag.toFixed(2)}`, `${basis}|${richtung}`, basis]
}

function alsZahl(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Learns "this counterparty is always category X" from transactions the user has already
 * categorized (manually or by accepting a suggestion) — e.g. once a "Rewe" purchase is set
 * to Lebensmittel, every future Rewe transaction is suggested that same category even before
 * any keyword rule would fire, and it overrides a rule that would have guessed differently.
 *
 * Schutzmaßnahmen gegen den Fehler, der Alipay-Käufe in "Claude / Anthropic" einsortierte:
 *  - Steht der Händler im Verwendungszweck (PayPal, Karte), lernt die Buchung unter `h:<händler>`.
 *  - Verteilt sich eine Gegenpartei auf mindestens drei Kategorien ohne klare Mehrheit (die DZ BANK stand bei
 *    63 Buchungen in 15), wird sie NICHT gelernt: dort sagt die Gegenpartei nichts über die Kategorie.
 *  - Richtung und fester Betrag trennen, was derselbe Name vermischt (Einzahlung/Auszahlung, Abo/Einkauf).
 */
export function buildLearnedCategoryMap(rows: LernZeile[]): LearnedCategoryMap {
  const counts = new Map<string, Map<string, number>>()
  const zaehle = (key: string, categoryId: string) => {
    const perCategory = counts.get(key) ?? new Map<string, number>()
    perCategory.set(categoryId, (perCategory.get(categoryId) ?? 0) + 1)
    counts.set(key, perCategory)
  }
  for (const row of rows) {
    if (!row.category_id) continue
    const betrag = alsZahl(row.amount)
    const haendler = extrahiereHaendler(row.description)
    if (haendler) {
      // Der Händler steht im Verwendungszweck, die Gegenpartei ist nur der Abwickler (DZ BANK, PayPal): sie lernt hier nichts.
      for (const k of schluesselFuer(`h:${haendler}`, betrag)) zaehle(k, row.category_id)
      continue
    }
    if (!row.counterpart_name) continue
    // Ein Zahlungsabwickler sagt auch ohne erkennbaren Händler nichts über die Kategorie ("PayPal" ist alles Mögliche).
    if (ABWICKLER.test(row.counterpart_name)) continue
    const key = normalizeCounterpart(row.counterpart_name)
    if (key) for (const k of schluesselFuer(key, betrag)) zaehle(k, row.category_id)
  }

  const learned: LearnedCategoryMap = new Map()
  for (const [key, perCategory] of counts) {
    let bestId: string | null = null
    let bestCount = 0
    let total = 0
    for (const [categoryId, count] of perCategory) {
      total += count
      if (count > bestCount) { bestId = categoryId; bestCount = count }
    }
    if (!bestId) continue
    if (key.includes('#')) {
      // Fester Betrag: nur bei Einigkeit und mindestens zwei Treffern.
      if (perCategory.size > 1 || bestCount < BETRAG_MIN_TREFFER) continue
    } else if (!key.startsWith('h:') && perCategory.size >= ABWICKLER_MIN_KATEGORIEN && bestCount / total < ABWICKLER_MAX_MEHRHEIT) {
      continue
    }
    learned.set(key, bestId)
  }
  return learned
}

/** Der Schlüssel, unter dem eine Buchung gruppiert wird: Händler aus dem Verwendungszweck, sonst die Gegenpartei. */
export function lernSchluessel(counterpartName: string | null | undefined, description: string | null | undefined): string | null {
  const haendler = extrahiereHaendler(description)
  if (haendler) return `h:${haendler}`
  const gegenpartei = counterpartName ? normalizeCounterpart(counterpartName) : ''
  return gegenpartei || null
}

/**
 * Zahlungsabwickler: ihr Name sagt nichts über die Art der Zahlung. Regeln dürfen auf ihnen nicht feuern, sonst wird
 * jede PayPal-Zahlung zum "Shopping" (40 falsche Treffer in den eigenen Daten).
 */
const ABWICKLER = /\b(paypal|dz\s?bank|klarna|stripe|payone|adyen|sumup|concardis|worldline|ratepay)\b/i

/**
 * Suggests a real Finance category for a transaction: first from what the user has already
 * chosen for this same counterparty (see buildLearnedCategoryMap), then falling back to the
 * keyword rules. Returns null if neither finds a match, or a matching rule's candidate
 * categories don't exist for this user.
 */
export function suggestCategory(
  counterpartName: string | null | undefined,
  description: string | null | undefined,
  categories: FinanceCategory[],
  learnedMap?: LearnedCategoryMap,
  amount?: number | string | null,
): FinanceCategory | null {
  const haendler = extrahiereHaendler(description)
  if (learnedMap) {
    // Erst der Händler aus dem Verwendungszweck, dann die Gegenpartei; jeweils vom festen Betrag zur Gegenpartei allein.
    const betrag = alsZahl(amount)
    const bases = [
      haendler ? `h:${haendler}` : null,
      counterpartName && !ABWICKLER.test(counterpartName) ? normalizeCounterpart(counterpartName) : null,
    ].filter((k): k is string => !!k)
    for (const base of bases) {
      for (const key of schluesselFuer(base, betrag)) {
        const learnedId = learnedMap.get(key)
        const learned = learnedId ? categories.find(c => c.id === learnedId) : undefined
        if (learned) return learned
      }
    }
  }

  // Regeln: bei einem Abwickler nur auf Händler und Verwendungszweck, nie auf den Namen des Abwicklers.
  const name = counterpartName && ABWICKLER.test(counterpartName) ? '' : counterpartName ?? ''
  const text = `${name} ${haendler ?? ''} ${description ?? ''}`.toLowerCase()
  if (!text.trim()) return null

  for (const rule of RULES) {
    if (!rule.patterns.some(p => p.test(text))) continue
    for (const candidate of rule.candidates) {
      const match = pickCategoryByName(candidate, categories)
      if (match) return match
    }
  }
  return null
}

/** IBAN ohne Leerzeichen und in Großbuchstaben, damit „DE12 3456" und „de123456" gleich sind. */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

export type BacklogRow = {
  id: string
  counterpart_name: string | null
  counterpart_iban: string | null
  description: string | null
  amount?: number | string | null
}

/**
 * Plant, welche unkategorisierten Buchungen welche Kategorie automatisch bekommen: je Buchung der
 * Vorschlag aus gelernter Zuordnung und Regeln (`suggestCategory`). Ergebnis: Kategorie-ID → Buchungs-IDs.
 *
 * Übersprungen werden Umbuchungen zwischen eigenen Konten (Gegen-IBAN gehört dem Nutzer): sie sind
 * über die IBAN eindeutig erkannt und brauchen keine Kategorie — ein Regeltreffer auf den Namen
 * des Empfängers würde sie sonst z. B. als „Freizeit" einsortieren.
 *
 * Rein, damit sie ohne Datenbank testbar ist; das Schreiben macht der Aufrufer.
 */
export function planBacklog(
  rows: BacklogRow[],
  categories: FinanceCategory[],
  learnedMap: LearnedCategoryMap,
  ownIbans: Set<string>,
): Map<string, string[]> {
  const plan = new Map<string, string[]>()
  for (const row of rows) {
    if (row.counterpart_iban && ownIbans.has(normalizeIban(row.counterpart_iban))) continue
    const suggested = suggestCategory(row.counterpart_name, row.description, categories, learnedMap, row.amount)
    if (!suggested) continue
    const ids = plan.get(suggested.id) ?? []
    ids.push(row.id)
    plan.set(suggested.id, ids)
  }
  return plan
}
