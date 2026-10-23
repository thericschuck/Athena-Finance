import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'
import { gegenparteien, monatsAchse } from '@/lib/analyse/gegenparteien'
import { AnalyseGegenparteienListe } from './AnalyseGegenparteienListe'

/**
 * Top-Gegenparteien ueber ALLE Quellen (Bank und manuell). Server-Komponente: sie rechnet beide
 * Richtungen vorab und gibt dem Client nur die zehn Zeilen je Richtung — nicht die Einzelbuchungen.
 * Das Umschalten Ausgaben/Einnahmen ist dann reine Anzeige ohne Rechnen im Browser.
 *
 * Gerechnet wird auf `daten.txns`, also dem Zeitraum und den Konten der Seite. Die URL-Filter
 * `kat`, `monat`, `tag` und `partei` schraenken die Liste hier bewusst NICHT ein: sonst bliebe nach
 * einem Klick nur die gewaehlte Partei uebrig und man koennte nicht mehr zu einer anderen
 * wechseln, und ein gewaehlter Monat liesse den Mini-Verlauf auf einen Balken schrumpfen.
 *
 * Anlagen und Forderungen: ihr Zaehlen richtet sich allein nach dem Schalter `anlage`. Der Loader
 * (ladeAnalyse -> getFlowTransactions) holt sie nur, wenn `daten.include` sie einschliesst; hier
 * ist deshalb nichts zu filtern, und die Summen stimmen mit Kennzahlen und Kategorien ueberein.
 */

const TOP_N = 10
const MAX_MONATE = 12

export function AnalyseGegenparteien({ daten }: AnalyseAbschnittProps) {
  const ausgaben = gegenparteien(daten.txns, 'ausgaben', TOP_N)
  const einnahmen = gegenparteien(daten.txns, 'einnahmen', TOP_N)
  return (
    <AnalyseGegenparteienListe
      locale={daten.locale}
      topN={TOP_N}
      richtungen={{
        ausgaben: { ...ausgaben, monate: monatsAchse(ausgaben.zeilen, MAX_MONATE) },
        einnahmen: { ...einnahmen, monate: monatsAchse(einnahmen.zeilen, MAX_MONATE) },
      }}
    />
  )
}
