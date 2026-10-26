/**
 * Die Karte der App, wie Athena sie sieht.
 *
 * ## Warum überhaupt eine Karte
 *
 * Athena hatte bis hierher einen Werkzeuggürtel, aber kein Bild davon, wozu die
 * Werkzeuge gehören. Sie wusste, dass es `getContracts` gibt — nicht, dass es
 * eine Seite „Planung" gibt, auf der Verträge, Schulden und Sparziele
 * zusammenliegen, und schon gar nicht, dass es einen ganzen Bereich
 * (`/strategy`) gibt, für den sie KEIN Werkzeug hat. Das Ergebnis war
 * vorhersehbar: bei allem, was nicht direkt auf einen Werkzeugnamen passte,
 * hat sie geraten oder das Thema verfehlt, statt zu sagen „das sehe ich nicht".
 *
 * ## Warum als Prompt-Block und nicht als RAG/Vektorindex
 *
 * Diese Karte ist ein Inhaltsverzeichnis, keine Datenmenge: rund 2 KB, die sich
 * nur ändern, wenn die App selbst sich ändert. Sie über einen Retrieval-Schritt
 * zu holen würde bedeuten, dass Athena erst suchen muss, um zu erfahren, was es
 * überhaupt zu suchen gibt — genau der Zirkel, an dem semantische Suche über
 * Struktur immer scheitert. Deshalb: die KARTE steht komplett im Prompt, die
 * DATEN kommen ausschließlich über Werkzeuge. Der Kontext, der pro Frage
 * wächst, ist damit nur der, der auch wirklich gebraucht wird.
 *
 * Der Block steht bewusst NACH `ATHENA_CORE`, aber vor allem Nutzerabhängigen:
 * er ist für alle Nutzer identisch und darf den Prompt-Cache nicht brechen
 * (siehe Kommentar an ATHENA_CORE in prompts.ts).
 *
 * ## Pflegepflicht
 *
 * `blind` ist der wichtigste Teil dieser Datei und der einzige, der veraltet,
 * ohne dass es auffällt: kommt ein Werkzeug für eine Domäne dazu, muss der
 * Eintrag hier weg — sonst behauptet Athena weiterhin, sie könne etwas nicht,
 * das sie längst kann. Umgekehrt gilt: eine neue Seite ohne Eintrag hier ist
 * für Athena nicht existent.
 */

export type AtlasDomain = {
  /** Hauptroute des Bereichs — dieselbe Schreibweise wie in der Sidebar. */
  route: string
  /** Name, wie er in der Navigation steht. */
  label: string
  /** Was auf der Seite tatsächlich zu sehen ist, in einem Satz. */
  shows: string
  /** Unterseiten mit eigenem Inhalt (Tab-Leiste im Seitenkopf). */
  subRoutes?: { route: string; shows: string }[]
  /** Werkzeuge, die Fragen zu diesem Bereich beantworten. Leer = blinder Fleck. */
  tools: string[]
  /**
   * Was Athena in diesem Bereich NICHT sehen kann, in Nutzersprache. Ehrlich
   * benannt, damit sie die Lücke nennen kann, statt sie zu überbrücken —
   * dieselbe Regel wie „Sag, was du nicht weißt" im Kern-Prompt.
   */
  blind?: string
}

export type AtlasSection = {
  title: string
  domains: AtlasDomain[]
}

export const APP_ATLAS: AtlasSection[] = [
  {
    title: 'Überblick',
    domains: [
      {
        route: '/dashboard',
        label: 'Dashboard',
        shows:
          'Netto-Vermögen, Monatssaldo (Einnahmen minus Ausgaben im laufenden Monat), ' +
          'größte Ausgabenkategorien, offene Hinweise',
        tools: ['getNetWorthTrend', 'getSpendingSummary', 'getAccounts', 'checkDataQuality', 'getInsights'],
      },
    ],
  },
  {
    title: 'Finance — das Alltagsgeld',
    domains: [
      {
        route: '/finance/accounts',
        label: 'Konten',
        shows:
          'alle Konten mit aktuellem Saldo, der Bank-Sync (FinTS) und pro Konto eine Detailseite ' +
          'mit den Buchungen dieses Kontos',
        tools: ['getAccounts', 'getTransactions', 'checkDataQuality', 'getAccountBalanceHistory'],
        blind:
          'nichts Wesentliches mehr: Saldo-Verlauf je Konto über getAccountBalanceHistory, ' +
          'Frische des Bank-Syncs und Abweichung App ↔ Bank über checkDataQuality, ' +
          'Vermögensverlauf gesamt über getNetWorthTrend',
      },
      {
        route: '/finance/transactions',
        label: 'Transaktionen',
        shows: 'alle Buchungen mit Filter nach Zeitraum, Konto, Kategorie und Typ',
        subRoutes: [
          { route: '/finance/categories', shows: 'der Kategoriebaum mit Nutzungszahlen' },
        ],
        tools: ['getTransactions', 'getSpendingSummary', 'getCategories', 'getCategoryUsage'],
      },
      {
        route: '/finance/contracts',
        label: 'Planung',
        shows:
          'laufende Verträge und Abos mit Kündigungsfristen; darunter im selben Bereich die ' +
          'Schulden und die Sparziele',
        subRoutes: [
          { route: '/finance/debts', shows: 'Schulden mit Restsumme, Rate und Tilgungsplan' },
          { route: '/finance/goals', shows: 'Sparziele mit Zielsumme, Stand und Zieldatum' },
        ],
        tools: ['getContracts', 'getDebts', 'getGoals', 'getObligationCalendar', 'findRecurringPayments'],
        blind:
          'nichts Wesentliches mehr: getObligationCalendar liefert Vorausblick, ablaufende ' +
          'Kündigungsfristen, tatsächliche Vertragsbuchungen (`contract_executions`) und ' +
          'Tilgungen (`debt_payments`) — inklusive der Fälligkeiten, die wirklich offen sind',
      },
      {
        route: '/finance/budget',
        label: 'Budget',
        shows:
          'die Fixkosten-Posten nach Budget-Kategorie und daraus das nötige Mindesteinkommen ' +
          '(Fixkosten hochgerechnet plus Puffer-, Steuer- und Sparanteil aus den Zielvorgaben)',
        tools: ['getBudget', 'getTaxPosition'],
        blind:
          'nichts Wesentliches. Der `tax_pct` hier ist eine Planungsgroesse fuer das '  +
          'Mindesteinkommen und KEIN Steuersatz — die echte Steuerposition samt '        +
          'Grenzsteuersatz liefert getTaxPosition',
      },
      {
        route: '/finance/steuer',
        label: 'Steuer',
        shows:
          'die Steuerposition eines Jahres: Gewinn aus Schuck Webdesign, geschaetztes zu ' +
          'versteuerndes Einkommen mit offenem Rechenweg, Einkommensteuer, Grenzsteuersatz, ' +
          'Kleinunternehmer-Ampel, Ruecklage-Soll und die Einnahmen ohne steuerliche Rolle',
        tools: ['getTaxPosition', 'getEuerPosition'],
        subRoutes: [
          {
            route: '/finance/steuer/euer',
            shows:
              'die Anlage EUER auf Formularzeilen verteilt, mit den Einzelbuchungen je Zeile ' +
              'zum Aufklappen — die Vorlage zum Abtippen in Mein ELSTER, plus ein CSV-Export ' +
              'fuer das Steuerbuero',
          },
        ],
        blind:
          'nichts — die Seiten rechnen mit demselben Kern wie getTaxPosition und ' +
          'getEuerPosition. Umsatzsteuer, Gewerbesteuer und Vorauszahlungen sind bewusst ' +
          'nicht Teil davon; als Kleinunternehmer entfaellt die USt-Jahreserklaerung ohnehin',
      },
    ],
  },
  {
    title: 'Investing — das Kapital, das arbeiten soll',
    domains: [
      {
        route: '/crypto',
        label: 'Krypto',
        shows: 'Krypto-Bestände mit Menge, Einstand und aktuellem Kurswert',
        subRoutes: [
          { route: '/crypto/assets', shows: 'die Einzelpositionen zum Pflegen' },
          {
            route: '/crypto/rebalancing',
            shows: 'Soll-/Ist-Gewichtung des Portfolios und die daraus abgeleiteten Umschichtungen',
          },
        ],
        tools: ['getCryptoPortfolio'],
        blind:
          'die Rebalancing-Rechnung (Zielgewichte und vorgeschlagene Umschichtungen) und der ' +
          'Status der Kraken-Verbindung',
      },
      {
        route: '/depot',
        label: 'Depot',
        shows: 'Wertpapierbestand aus dem Bank-Depot mit Stückzahl, Kurswert und Einstand',
        tools: ['getDepotHoldings', 'getSavingsPlans'],
        blind:
          'Depot-Transaktionen (Käufe/Verkäufe, `depot_transactions`). Die Fonds-Sparpläne, ' +
          'die monatlich per Cron laufen, liest getSavingsPlans',
      },
      {
        route: '/strategy/indicators',
        label: 'Strategie',
        shows:
          'das Handels-/Makro-Regelwerk: Indikatoren mit Bewertungen, das TPI-Scoring, ' +
          'Indikator-Kombinationen, ausformulierte Strategien und deren Robustheitstests',
        subRoutes: [
          { route: '/strategy/combos', shows: 'Kombinationen aus Indikatoren mit Gewichtung' },
          { route: '/strategy/strategies', shows: 'Strategien mit Regelwerk und Performance' },
          { route: '/strategy/tests', shows: 'Robustheitstests und Backtest-Ergebnisse' },
        ],
        tools: [],
        blind:
          'ALLES in diesem Bereich. Du hast kein einziges Werkzeug für Indikatoren, TPI-Scores, ' +
          'Kombinationen, Strategien, Backtests oder offene Positionen. Fragt Eric nach seiner ' +
          'Marktmeinung, seinem TPI-Stand oder einer seiner Strategien: sag, dass dieser Bereich ' +
          'noch nicht an dich angeschlossen ist, und rate NICHT anhand allgemeinen Marktwissens',
      },
    ],
  },
  {
    title: 'Analyse — der Rückblick',
    domains: [
      {
        route: '/analyse',
        label: 'Analyse',
        shows:
          'Auswertungen über alle Buchungen (Bank + manuell zusammengeführt): Monatsverteilung, ' +
          'Kategorien im Zeitverlauf, Einnahmen gegen Ausgaben',
        subRoutes: [
          {
            route: '/analyse/banking',
            shows: 'dieselbe Auswertung auf den rohen, per FinTS gesyncten Bankdaten',
          },
          {
            route: '/analyse/verlauf',
            shows:
              'die Snapshot-Tabellen: Netto-Vermögen, Konten, Portfolio und Monatsübersicht je Stichtag',
          },
        ],
        tools: ['getSpendingSummary', 'getTransactions', 'getNetWorthTrend'],
        blind:
          'die rohen Bankdaten (`bank_transactions`, `bank_balance`) als eigene Quelle. Deine ' +
          'Buchungs-Werkzeuge lesen die App-Buchungen; Abweichungen zwischen Bank und App ' +
          'kannst du damit nicht finden',
      },
    ],
  },
  {
    title: 'Sonstiges',
    domains: [
      {
        route: '/inventar',
        label: 'Inventar',
        shows:
          'Wertgegenstände (Uhren, Schmuck, Lederwaren) mit Provenienz, Schätzwert und Artwork. ' +
          'Bewusst NICHT Teil des Vermögensverlaufs',
        tools: [
          'getValuables', 'getValuableImages', 'getValuableGaps', 'generateValuableArtwork',
          'addValuableValuation', 'markValuableSold',
        ],
      },
      {
        route: '/assistant',
        label: 'Athena',
        shows:
          'dein eigener Bereich: Chat, Kontext-Speicher, Wissensbasis, System-Log und deine ' +
          'Einstellungen (Modell, Denkstufe, Web-Recherche, Tageslimit)',
        tools: ['remember', 'forget', 'searchMemory', 'searchKnowledge', 'saveKnowledge', 'readAttachment'],
        blind: 'das System-Log (`ai_logs`) und deine eigenen Kosten pro Lauf',
      },
      {
        route: '/settings',
        label: 'Einstellungen',
        shows: 'Profil, Darstellung, Finanz-Vorgaben, Analyse-Vorgaben, Trading-Vorgaben, Integrationen',
        tools: ['getUserSettings'],
        blind:
          'die reinen Darstellungseinstellungen (Theme, Zahlen- und Datumsformat, Sidebar) — ' +
          'absichtlich, sie beeinflussen keine Zahl. Den Kontenfilter der Analyse liest ' +
          'getUserSettings: eine Auswertung dort kann von deinen Zahlen abweichen, ohne dass ' +
          'eine der beiden falsch ist',
      },
    ],
  },
]

/**
 * Rendert die Karte als Prompt-Block.
 *
 * Kompakt gehalten (eine Zeile pro Bereich plus Unterzeilen), weil dieser Block
 * in JEDEM Lauf mitgeht: er darf ein Inhaltsverzeichnis kosten, nicht ein
 * Kapitel. Blinde Flecken stehen ausdrücklich mit dabei — eine Karte, die nur
 * zeigt, was funktioniert, verleitet zum Erfinden des Rests.
 */
export function renderAtlas(): string {
  const lines: string[] = [
    '## Karte der App',
    '',
    'So ist Athena Finance aufgebaut — die Oberfläche, auf die Eric schaut, wenn er dich fragt. ' +
      'Nutze sie, um seine Frage dem richtigen Bereich und den richtigen Werkzeugen zuzuordnen, ' +
      'und um in deiner Antwort zu sagen, WO in der App etwas steht ("steht unter Finance → Planung").',
    '',
    'Die Karte ist ein Inhaltsverzeichnis, keine Datenquelle: Zahlen kommen ausschließlich aus ' +
      'Werkzeugen. Steht bei einem Bereich "Blind:", hast du dafür kein Werkzeug — dann sagst du ' +
      'genau das, statt zu schätzen oder aus allgemeinem Wissen zu antworten.',
  ]

  for (const section of APP_ATLAS) {
    lines.push('', `### ${section.title}`)
    for (const d of section.domains) {
      lines.push('', `**${d.label}** — \`${d.route}\``, `Zeigt: ${d.shows}.`)
      for (const sub of d.subRoutes ?? []) {
        lines.push(`  - \`${sub.route}\`: ${sub.shows}`)
      }
      lines.push(d.tools.length ? `Werkzeuge: ${d.tools.join(', ')}` : 'Werkzeuge: keine')
      if (d.blind) lines.push(`Blind: ${d.blind}.`)
    }
  }

  return lines.join('\n')
}

/** Alle Routen der Karte, längste zuerst — damit `/finance/accounts` vor
    `/finance` trifft und nicht umgekehrt. */
const ROUTE_INDEX: { route: string; label: string; shows: string }[] = APP_ATLAS
  .flatMap(s => s.domains)
  .flatMap(d => [
    { route: d.route, label: d.label, shows: d.shows },
    ...(d.subRoutes ?? []).map(sub => ({ route: sub.route, label: d.label, shows: sub.shows })),
  ])
  .sort((a, b) => b.route.length - a.route.length)

/**
 * Ordnet die Route, auf der Eric gerade steht, einem Kartenpunkt zu.
 *
 * Der Sinn ist Auflösung von Bezügen, nicht Überwachung: „was ist das hier für
 * eine Zahl", „kannst du das erklären" und „passt das so?" sind ohne die Seite
 * unbeantwortbar, und Athena hat bisher in genau diesen Fällen zurückgefragt
 * oder das Falsche geholt.
 *
 * Robust gegen unbekannte Routen (Detailseiten mit ID, neue Seiten ohne
 * Atlas-Eintrag): dann lieber kein Block als ein falscher.
 */
export function describeCurrentRoute(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const hit = ROUTE_INDEX.find(r => pathname === r.route || pathname.startsWith(`${r.route}/`))
  if (!hit) return null

  return `## Wo Eric gerade ist

Er hat dich von \`${pathname}\` aus geschrieben — ${hit.label}. Dort steht: ${hit.shows}.

Beziehe unbestimmte Verweise ("das hier", "diese Zahl", "sieht das richtig aus?") zuerst auf \
diese Seite und hol die passenden Daten dafür, statt zurückzufragen. Die Seite legt aber nur \
den Bezug fest, nicht das Thema: fragt er nach etwas anderem, antworte auf das andere.`
}
