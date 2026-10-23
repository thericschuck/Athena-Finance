// ── Shared types für die Analyse-Komponenten ──────────────────────────────────

export interface HeatmapDay {
  date:   string  // "2026-03-15"
  amount: number  // Ausgaben in €
  income: number  // Einnahmen in €
}

/** Rolle eines Knotens im Geldfluss: bestimmt Farbe, Position und Klickverhalten. */
export type SankeyArt =
  | 'quelle'      // Einnahmenquelle (links)
  | 'einnahmen'   // Mittelknoten
  | 'ausgabe'     // Ausgabenkategorie (rechts)
  | 'weitere'     // Sammelknoten für die kleinen Posten einer Seite
  | 'anlage'      // Anlagen (Krypto, Depot, Bauspar) — eigener, erkennbarer Fluss
  | 'ueberschuss' // übrig geblieben (rechts)
  | 'defizit'     // mehr ausgegeben als eingenommen (links, speist den Mittelknoten)

export interface SankeyNodeDatum {
  name: string
  /**
   * Alles Folgende ist optional, weil die Demodaten der Landingpage nur Namen kennen
   * (`normalisiereSankey` in lib/analyse/geldfluss.ts leitet die Rolle dann aus der Position ab).
   */
  art?: SankeyArt
  /** Haupt-Kategorie-ID für den Drill-down (`kat` in der URL); `'offen'` = ohne Kategorie. */
  kategorieId?: string
  /** Position innerhalb der Seite (0 = größter Posten) — wählt den Farbton. */
  rang?: number
  /** Echter Betrag in EUR (`value` im Layout kann bei Ausgaben gestaucht sein). */
  betrag?: number
  /** Bei einem Sammelknoten: was darin steckt, absteigend. */
  enthalten?: { name: string; betrag: number }[]
}
export interface SankeyLinkDatum {
  source: number
  target: number
  /**
   * Bandbreite im Diagramm. Fuer Ausgabenkategorien heruntergerechnet, damit die Summe der
   * abgehenden Baender zu den eingehenden Einnahmen passt — recharts' Sankey-Layout setzt
   * eine ausgeglichene Bilanz voraus (siehe buildSankey in analyse/page.tsx).
   */
  value: number
  /**
   * Der tatsaechliche Betrag in EUR — die Zahl, die im Tooltip stehen muss.
   *
   * Optional, weil `value` und `realValue` nur dann auseinanderfallen, wenn ueberhaupt
   * skaliert wurde. Wo beides identisch ist (z. B. die Demodaten der Landingpage), waere
   * die doppelte Angabe nur eine zweite Stelle, die man vergessen kann anzupassen. Der
   * Tooltip faellt entsprechend auf `value` zurueck.
   */
  realValue?: number
}
export interface SankeyData {
  nodes: SankeyNodeDatum[]
  links: SankeyLinkDatum[]
}

export interface CashflowEvent {
  date:   string
  type:   'income' | 'expense'
  label:  string
  amount: number
  /** `flow_kind` der Buchung: echt, anlage oder forderung. */
  kind:   string
  /** Zählt in die Tagessummen (Konsum, oder Anlage/Forderung bei eingeschaltetem Schalter). Sonst nur grau gelistet. */
  zaehlt: boolean
}

export interface MonthlyComparison {
  month:     string
  /**
   * `YYYY-MM` — der Monat, den `month` (nur ein Kurzlabel wie „Mär", über 24 Monate nicht
   * eindeutig) beschriftet. MonatsVergleich setzt damit den URL-Filter `monat`. Optional,
   * weil die Demodaten der Landingpage keinen Filter haben; ohne `key` ist der Balken nicht
   * anklickbar.
   */
  key?:      string
  einnahmen: number
  ausgaben:  number
  /**
   * Gespartes in Prozent der Einnahmen. `null` bei einem Monat ohne Einnahmen —
   * dann ist die Quote nicht definiert (Division durch 0) und die Linie in
   * MonatsVergleich bekommt eine Lücke. Vorher stand dort 0, was im Chart wie
   * eine schwarze Null aussah, obwohl in dem Monat nur Geld rausging.
   */
  sparquote: number | null
  /**
   * true nur bei der optional angehängten Zeile für den laufenden Monat (siehe
   * AnalysePage — buildMonthlyComparison selbst liefert nie einen laufenden Monat,
   * genau deshalb heißt die Reihe hier bewusst anders als die Werte der Vormonate).
   * MonatsVergleich stellt diese Zeile abgeschwächt dar, weil sie unvollständig ist.
   */
  laufend?: boolean
}

/** Umschaltbare Sicht der Analyse-Karten (Heatmap, Verteilung). */
export type AnalyseMode = 'ausgaben' | 'einnahmen' | 'guv'

/** Monatsreihen für die Verteilungs-Karte — je Modus ein Wert pro abgeschlossenem Monat. */
export interface MonthSeries {
  ausgaben:  number[]
  einnahmen: number[]
  guv:       number[]
}

/** Die drei Summen des laufenden Monats, gegen die Historie verglichen wird. */
export interface MonthTotals {
  ausgaben:  number
  einnahmen: number
  guv:       number
}

export interface CategoryDatum {
  name:  string
  value: number  // positiv = Einnahme, negativ = Ausgabe
  /** Unterkategorien einer Hauptkategorie, gleiche Vorzeichenregel. */
  children?: CategoryDatum[]
}
