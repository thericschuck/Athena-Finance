// Auto-categorization for bank transactions based on description keywords

interface CategoryRule {
  category: string
  patterns: RegExp[]
}

const RULES: CategoryRule[] = [
  {
    category: 'Lebensmittel',
    patterns: [
      /\b(rewe|edeka|aldi|lidl|penny|netto|kaufland|norma|tegut|bio\s?company|denn?s|basic|dm\s?markt|rossmann|müller)\b/i,
      /\b(supermarkt|lebensmittel|bäckerei|metzger|fleisch|obst|gemüse)\b/i,
    ],
  },
  {
    category: 'Restaurant & Café',
    patterns: [
      /\b(restaurant|bistro|café|cafe|imbiss|mcdonalds|mc\s?donalds|burger\s?king|subway|kfc|pizza|lieferando|lieferheld|just\s?eat|uber\s?eats|wolt|doordash)\b/i,
      /\b(gaststätte|gasthof|wirtshaus|brauerei|kantine)\b/i,
    ],
  },
  {
    category: 'Transport',
    patterns: [
      /\b(db\s?bahn|deutsche\s?bahn|bvg|mvv|hvv|vvs|rnv|üstra|s-bahn|u-bahn|stadtbahn|nahverkehr|ticket|fahrkarte)\b/i,
      /\b(uber|lyft|taxi|mietwagen|sixt|hertz|avis|europcar|flinkster|share\s?now|miles|cambio)\b/i,
      /\b(lufthansa|eurowings|ryanair|easyjet|wizz\s?air|condor|tuifly|flug|airline|airport|flughafen)\b/i,
    ],
  },
  {
    category: 'Tanken & Auto',
    patterns: [
      /\b(shell|aral|bp|esso|total|jet\s?tankstelle|tankstelle|tanken|tank\s?&\s?rast)\b/i,
      /\b(adac|tuev|kfz|werkstatt|autohaus|reifendienst|parkhaus|parkschein|parken)\b/i,
    ],
  },
  {
    category: 'Streaming & Medien',
    patterns: [
      /\b(netflix|amazon\s?prime|disney\+|disney\s?plus|spotify|apple\s?music|deezer|tidal|youtube\s?premium|sky\s?ticket|joyn|zdf|ard\s?mediathek|maxdome)\b/i,
      /\b(kindle|audible|ebook|buch|zeitung|magazin|spiegel|zeit\s?abo|faz)\b/i,
    ],
  },
  {
    category: 'Software & Tech',
    patterns: [
      /\b(adobe|microsoft|google|apple|icloud|dropbox|github|slack|notion|figma|canva|1password|lastpass)\b/i,
      /\b(hosting|domain|server|cloud|saas|software|app\s?store|play\s?store|steam)\b/i,
    ],
  },
  {
    category: 'Miete & Wohnen',
    patterns: [
      /\b(miete|warmmiete|kaltmiete|nebenkosten|hausgeld|mietkaution|wohnungsgeld)\b/i,
      /\b(strom|gas|wasser|heizung|enercity|enbw|e\.on|rwe|vattenfall|stadtwerke|netze|fernwärme)\b/i,
      /\b(internet|dsl|glasfaser|telekom|vodafone|o2|1&1|unitymedia|kabel\s?deutschland)\b/i,
    ],
  },
  {
    category: 'Versicherung',
    patterns: [
      /\b(versicherung|assurance|allianz|huk|axa|ergo|generali|zurich|debeka|signal\s?iduna|dak|aok|tkk|barmer|techniker\s?krankenkasse)\b/i,
      /\b(krankenversicherung|haftpflicht|hausrat|kfz-versicherung|lebensversicherung|unfallversicherung|rechtsschutz)\b/i,
    ],
  },
  {
    category: 'Gehalt & Einkommen',
    patterns: [
      /\b(gehalt|lohn|entgelt|vergütung|honorar|rente|pension|arbeitslosengeld|kindergeld|elterngeld|bafög)\b/i,
      /\b(gutschrift\s*gehalt|gehaltseingang|lohneingang)\b/i,
    ],
  },
  {
    category: 'Gesundheit',
    patterns: [
      /\b(apotheke|arzt|zahnarzt|krankenhaus|klinik|physiotherapie|optiker|hörakustik|medikament|rezept)\b/i,
      /\b(fitnessstudio|mcfit|fitx|john\s?reed|clever\s?fit|sport\s?studio|gym)\b/i,
    ],
  },
  {
    category: 'Shopping',
    patterns: [
      /\b(amazon|zalando|about\s?you|otto|zara|h&m|primark|c&a|peek\s?&\s?cloppenburg|esprit|s\.oliver|bonprix|tchibo|ikea|obi|bauhaus|hornbach|mediamarkt|saturn|ebay|paypal)\b/i,
      /\b(onlineshop|versandhandel|kleidung|schuhe|mode|haushalt|möbel|elektro)\b/i,
    ],
  },
  {
    category: 'Bildung',
    patterns: [
      /\b(schulgeld|studienbeitrag|seminargebühr|kurs|weiterbildung|udemy|coursera|duolingo|volkshochschule|vhs)\b/i,
      /\b(bücher|bücherei|bibliothek|lehrmittel)\b/i,
    ],
  },
  {
    category: 'Reisen & Urlaub',
    patterns: [
      /\b(hotel|hostel|airbnb|booking\.com|trivago|expedia|holidaycheck|reisebüro|tui|alltours|neckermann|fti)\b/i,
      /\b(urlaub|reise|ferien|sightseeing|museum|zoo|freizeitpark)\b/i,
    ],
  },
  {
    category: 'Sparen & Anlegen',
    patterns: [
      /\b(sparplan|sparrate|spareinlage|festgeld|tagesgeld|depot|fonds|etf|aktien|wertpapier|dividende|trade\s?republic|comdirect|ing\s?diba|dkb)\b/i,
    ],
  },
  {
    category: 'Überweisung',
    patterns: [
      /\b(überweisung|überweisu|sepa|gutschrift|lastschrift|dauerauftrag|standing\s?order)\b/i,
    ],
  },
]

/**
 * Derive a category from the transaction description.
 * Returns null if no rule matches.
 */
export function categorize(description: string | null | undefined): string | null {
  if (!description) return null
  const text = description.toLowerCase()

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) return rule.category
    }
  }
  return null
}
