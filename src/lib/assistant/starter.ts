/** Allgemeine Startfragen — gelten auf jeder Seite ohne eigenen Zuschnitt. */
const ALLGEMEIN = [
  'Wie hat sich mein Vermögen die letzten 6 Monate entwickelt?',
  'Welche Abos zahle ich, die ich kaum nutze?',
  'Kann ich mir in den nächsten Monaten etwas für 3.000 € leisten?',
  'Finde unkategorisierte Buchungen und schlag Kategorien vor',
]

/** Pro Bereich vier Fragen, die zu Werkzeugen passen, die Athena wirklich hat
    (Konten, Buchungen, Vermögensverlauf, Kategorien, Datenqualität, Steuer/EÜR,
    Verträge, Sparziele, Depot, Krypto, Inventar). */
const BEREICHE: { prefix: string; fragen: string[] }[] = [
  {
    prefix: '/dashboard',
    fragen: [
      'Was fällt diesen Monat auf?',
      'Wie entwickelt sich mein Vermögen im Vergleich zum Vorjahr?',
      'Welche Zahlungen stehen in den nächsten 30 Tagen an?',
      'Wie weit bin ich bei meinen Sparzielen?',
    ],
  },
  {
    prefix: '/analyse',
    fragen: [
      'Wo gebe ich am meisten Geld aus, und was hat sich verändert?',
      'Zeig mir die Ausgaben der letzten 6 Monate als Chart',
      'Welche wiederkehrenden Zahlungen gibt es?',
      'Wie steht es um die Datenqualität meiner Buchungen?',
    ],
  },
  {
    prefix: '/finance',
    fragen: [
      'Finde unkategorisierte Buchungen und schlag Kategorien vor',
      'Welche Verträge und Abos laufen aktuell, und was kosten sie?',
      'Wie hoch ist meine Steuerposition dieses Jahr?',
      'Wie sieht die Anlage EÜR bisher aus?',
    ],
  },
  {
    prefix: '/depot',
    fragen: [
      'Wie ist mein Depot aufgeteilt?',
      'Was haben meine Positionen zuletzt zum Vermögen beigetragen?',
      'Welche Sparpläne laufen, und was zahle ich monatlich ein?',
      'Wie hat sich mein Gesamtvermögen mit Depot entwickelt?',
    ],
  },
  {
    prefix: '/crypto',
    fragen: [
      'Wie ist mein Krypto-Portfolio aufgeteilt?',
      'Wie hoch ist der Krypto-Anteil an meinem Vermögen?',
      'Wie hat sich mein Vermögen inklusive Krypto entwickelt?',
      'Gibt es steuerlich relevante Positionen bei Krypto?',
    ],
  },
  {
    prefix: '/inventar',
    fragen: [
      'Was besitze ich an Wertgegenständen, und was ist es wert?',
      'Bei welchen Gegenständen fehlen Angaben?',
      'Welche Gegenstände haben noch keine Fotos?',
      'Wie viel macht das Inventar an meinem Vermögen aus?',
    ],
  },
  {
    prefix: '/strategy',
    fragen: [
      'Wie sieht meine Vermögensentwicklung in den nächsten Jahren aus?',
      'Wie viel kann ich monatlich zusätzlich sparen?',
      'Wie stehen meine Sparziele im Verhältnis zur Prognose?',
      'Welche Schulden belasten mich am meisten?',
    ],
  },
]

/** Passt ein Pfad zum Bereich? Ganzer Segment-Vergleich, damit `/financeX`
    nicht als `/finance` durchgeht. */
function passt(pfad: string, prefix: string): boolean {
  return pfad === prefix || pfad.startsWith(prefix + '/')
}

/** Vier Startfragen für den Leerzustand des Chats, passend zur aktuellen Seite. */
export function startfragenFuerRoute(pfad: string): string[] {
  const sauber = pfad.split(/[?#]/)[0].toLowerCase()
  const treffer = BEREICHE.find((b) => passt(sauber, b.prefix))
  return [...(treffer?.fragen ?? ALLGEMEIN)]
}
