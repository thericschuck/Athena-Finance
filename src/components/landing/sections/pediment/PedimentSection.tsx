import { C } from '@/components/landing/landing-tokens'
import { LaurelWreath, MeanderFrieze } from '@/components/landing/olive-vines'
import { PedimentReveal } from './PedimentReveal'
import { StatsBandFallback } from './StatsBandFallback'

/*
  ══ GIEBEL-ENTHÜLLUNG ══
  Ersetzt die frühere gerahmte Browserfenster-Vorschau: dasselbe
  Dashboard zweimal kurz hintereinander hätte die Wirkung des Effekts
  verpuffen lassen.

  Aufbau: die Szene ist SCENE_VH hoch, darin klebt ein Viewport-hoher
  Container. Beim Durchscrollen wächst ein Tempelgiebel (clip-path-
  Dreieck) über den Bildschirm und gibt das Dashboard frei. Der letzte
  Viertel des Scrollwegs ist bewusst Halteweg, damit das offene
  Dashboard einen Moment steht, bevor die Seite weiterläuft.
*/
export function PedimentSection() {
  return (
    <PedimentReveal
      introContent={
        <>
          {/*
            Fries mit Lücke in der Mitte statt einer durchgehenden Bahn —
            klassisches Motiv „Mäander mit Medaillon": der Kranz nestet sich
            in die Lücke, statt lose darunter zu schweben, und kann dadurch
            viel näher an den Fries heranrücken (Kranz zentriert exakt auf
            der Frieshöhe, siehe .pediment-intro-wreath).
          */}
          <div className="pediment-intro-frieze-row">
            <div className="pediment-intro-frieze-half">
              <MeanderFrieze id="frieze-pediment-top-l" color={C.ink} opacity={0.14} />
            </div>
            <div className="pediment-intro-gap" />
            <div className="pediment-intro-frieze-half">
              <MeanderFrieze id="frieze-pediment-top-r" color={C.ink} opacity={0.14} />
            </div>
          </div>
          <div className="pediment-intro-wreath">
            <LaurelWreath size={230} tone="light" opacity={0.2} />
          </div>
        </>
      }
      statsStill={<StatsBandFallback />}
      statsBand={<StatsBandFallback className="stats-band-sm" />}
    />
  )
}
