import type { ReactNode } from 'react'

/** Eine Karte des Analyse-Stapels: Titel plus fertig gerendertes Innenleben. */
export type AnalyseCard = { title: string; body: ReactNode }

/** Ab hier läuft die Analyse-Sektion als gepinnte Erzählung (siehe
    AnalyseReveal); darunter bleibt die bestehende zweispaltige Darstellung
    unverändert. Gleiche Schwelle wie beim Säulen-Karussell. */
export const ANALYSE_MIN_WIDTH = 1024
/** Scrollstrecke pro Listenpunkt — lang genug, um die Grafik zu erfassen. */
export const ANALYSE_STEP_VH = 65
/** Nachlauf, damit der vierte Punkt nicht im selben Moment abreißt, in dem er
    fertig aufgebaut ist. */
export const ANALYSE_OUTRO_VH = 30

export const ANALYSE_ITEMS = [
  'Ausgaben-Heatmap im GitHub-Stil, mit GuV-Modus',
  'Sankey-Diagramm für die vollständige Geldfluss-Visualisierung',
  'Interaktiver Cashflow-Kalender — Popup direkt am Tag',
  'Divergierende Balken für Einnahmen und Ausgaben',
]

export const ANALYSE_SCROLL_VH = ANALYSE_STEP_VH * ANALYSE_ITEMS.length + ANALYSE_OUTRO_VH
export const ANALYSE_SCENE_VH = 100 + ANALYSE_SCROLL_VH

export const ANALYSE_LEAD_WORDS = (
  'Der Analyse-Tab verwandelt rohe Transaktionsdaten in aussagekräftige Bilder. ' +
  'Saisonale Muster werden sichtbar, Geldflüsse nachvollziehbar — und damit die ' +
  'Frage beantwortbar, wohin das Geld wirklich geht.'
).split(' ')
