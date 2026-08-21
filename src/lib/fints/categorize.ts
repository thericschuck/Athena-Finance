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
    // Business/dev infrastructure — checked before the personal "Abo" rule so a webdesign/dev
    // tool doesn't get lumped in with Netflix-style consumer subscriptions.
    candidates: ['Business-Tools', 'Software & Tech', 'Abo'],
    patterns: [
      /\b(anthropic|claude|openai|vercel|supabase|github|netlify|figma|adobe|framer)\b/i,
      /\b(hosting|domain|server|cloud\s?computing|saas|api\b)\b/i,
    ],
  },
  {
    candidates: ['Abo', 'Streaming'],
    patterns: [
      /\b(netflix|amazon\s?prime|disney\+|disney\s?plus|spotify|apple\s?music|deezer|tidal|youtube\s?premium|sky\s?ticket|joyn|maxdome)\b/i,
      /\b(icloud|dropbox|notion|canva|1password|lastpass|kindle|audible)\b/i,
      /\b(abo|abonnement|mitgliedschaft)\b/i,
    ],
  },
  {
    candidates: ['Shopping'],
    patterns: [
      /\b(amazon|zalando|about\s?you|otto|ebay|paypal|ikea|obi|bauhaus|hornbach|mediamarkt|saturn)\b/i,
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
    candidates: ['Crypto'],
    patterns: [/\b(kraken|binance|bitpanda|coinbase|bitcoin|krypto|crypto)\b/i],
  },
  {
    candidates: ['Depot', 'Sparkonto'],
    patterns: [/\b(sparplan|festgeld|tagesgeld|fonds|etf|aktien|wertpapier|dividende|trade\s?republic|comdirect|ing\s?diba|scalable\s?capital)\b/i],
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

/** Case-insensitive name match; prefers the duplicate with an icon set (the actively-used one — this account has a few leftover duplicate category rows with the same name and no icon). */
function pickCategoryByName(name: string, categories: FinanceCategory[]): FinanceCategory | null {
  const matches = categories.filter(c => c.name.toLowerCase() === name.toLowerCase())
  if (matches.length === 0) return null
  return matches.find(c => c.icon) ?? matches[0]
}

/** Exported so callers (e.g. the suggestion-review UI) can group by the same key this module learns by. */
export function normalizeCounterpart(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** counterparty (normalized) → most-picked category id, learned from the user's own history. */
export type LearnedCategoryMap = Map<string, string>

/**
 * Learns "this counterparty is always category X" from transactions the user has already
 * categorized (manually or by accepting a suggestion) — e.g. once a "Rewe" purchase is set
 * to Lebensmittel, every future Rewe transaction is suggested that same category even before
 * any keyword rule would fire, and it overrides a rule that would have guessed differently.
 */
export function buildLearnedCategoryMap(
  rows: { counterpart_name: string | null; category_id: string | null }[],
): LearnedCategoryMap {
  const counts = new Map<string, Map<string, number>>()
  for (const row of rows) {
    if (!row.counterpart_name || !row.category_id) continue
    const key = normalizeCounterpart(row.counterpart_name)
    if (!key) continue
    const perCategory = counts.get(key) ?? new Map<string, number>()
    perCategory.set(row.category_id, (perCategory.get(row.category_id) ?? 0) + 1)
    counts.set(key, perCategory)
  }

  const learned: LearnedCategoryMap = new Map()
  for (const [key, perCategory] of counts) {
    let bestId: string | null = null
    let bestCount = 0
    for (const [categoryId, count] of perCategory) {
      if (count > bestCount) { bestId = categoryId; bestCount = count }
    }
    if (bestId) learned.set(key, bestId)
  }
  return learned
}

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
): FinanceCategory | null {
  if (counterpartName && learnedMap) {
    const learnedId = learnedMap.get(normalizeCounterpart(counterpartName))
    if (learnedId) {
      const learned = categories.find(c => c.id === learnedId)
      if (learned) return learned
    }
  }

  const text = `${counterpartName ?? ''} ${description ?? ''}`.toLowerCase()
  if (!text.trim()) return null

  for (const rule of RULES) {
    if (!rule.patterns.some(p => p.test(text))) continue
    for (const name of rule.candidates) {
      const match = pickCategoryByName(name, categories)
      if (match) return match
    }
  }
  return null
}
