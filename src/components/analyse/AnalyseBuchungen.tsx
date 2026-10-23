import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'
import { AnalyseBuchungenListe } from './AnalyseBuchungenListe'

/**
 * Drill-down-Liste am Ende der Analyse-Seite. Server-Komponente, die dem Client nur das gibt, was
 * die Liste braucht: die Einzelbuchungen, schlanke Kategorien (ID, Name, Farbe, Symbol, Eltern),
 * die Konten als ID/Name und den Grundstock des Export-Links. Nicht durchgereicht werden die
 * Monatssummen, Fenster und Vergleichsdaten — die Liste braucht sie nicht, und sie wuerden sonst
 * ein weiteres Mal im Seitenpayload landen.
 *
 * Gefiltert wird im Browser (Liste und URL-Filter siehe AnalyseBuchungenListe), nicht hier: so
 * reagiert ein Klick im Chart sofort, auch bevor der Server die Seite neu geliefert hat.
 *
 * Der Export bekommt Zeitraum (`von`), Konten und den Schalter `anlage` mit — sonst waere seine
 * Grundmenge eine andere als die der Liste, und „Exportieren" lieferte etwas anderes als gezeigt.
 */
export function AnalyseBuchungen({ daten }: AnalyseAbschnittProps) {
  const basis = new URLSearchParams()
  if (daten.cutoff) basis.set('von', daten.cutoff)
  if (daten.kontoIds.length > 0) basis.set('accounts', daten.kontoIds.join(','))
  basis.set('anlage', daten.include.anlage || daten.include.forderung ? '1' : '0')

  return (
    <AnalyseBuchungenListe
      txns={daten.txns}
      categories={daten.categories.map(c => ({
        id: c.id, name: c.name, color: c.color, icon: c.icon, parent_id: c.parent_id,
      }))}
      konten={daten.konten.map(k => ({ id: k.id, name: k.name }))}
      locale={daten.locale}
      dateFormat={daten.dateFormat}
      exportBasis={basis.toString()}
    />
  )
}
