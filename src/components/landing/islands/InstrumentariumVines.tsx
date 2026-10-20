'use client'

import { useRef, type ReactNode } from 'react'
import { useInView } from 'framer-motion'

/*
 * Die Ranken selbst (<OliveVines>) werden vom Server als `children` geliefert
 * und hier nur gemountet, sobald die Ecke ins Bild scrollt — die Komponente
 * trägt dadurch nur den IntersectionObserver, nicht die Ranken-Geometrie.
 */
/**
 * Ranken-Hintergrund fürs Instrumentarium — dieselbe Zeichentechnik wie im
 * Hero (siehe OliveVines), aber erst gemountet, sobald die jeweilige Ecke ins
 * Bild scrollt (reine CSS-Wachs-Animation, siehe vines.css — läge sie wie im
 * Hero dauerhaft im Baum, wäre sie beim Erreichen der Sektion längst fertig
 * gewachsen und stünde nur noch reglos da). Zwei Instanzen rahmen die
 * Sektion oben UND unten (`dock`) statt einer einzigen, gestreckten Fläche —
 * die Karten dazwischen bleiben frei von Ranken-Deko.
 *
 * Liegt bewusst per z-index VOR dem Kartenraster (siehe zIndex am
 * Inhalts-Container), nicht dahinter — sonst schneidet das opake Raster jeden
 * weit genug reichenden Zweig an der eigenen Kante ab statt ihn sichtbar
 * über die Kacheln ragen zu lassen. `pointer-events:none` sorgt dafür, dass
 * Klicks/Hover trotzdem ganz normal bei den Karten ankommen.
 *
 * Höhe bewusst GEKAPPT statt über die volle (deutlich höhere) Sektion
 * gestreckt: OliveVines ist für eine ~viewporthohe Fläche im Seitenverhältnis
 * 520:900 gezeichnet (siehe VB in olive-vines.tsx). `preserveAspectRatio=
 * "slice"` skaliert dabei EINHEITLICH in x UND y auf den größeren der beiden
 * nötigen Faktoren — über eine viel höhere als breite Fläche gestreckt
 * gewinnt der Höhenfaktor deutlich, und genau dieser einheitliche Faktor
 * bläht dann auch die BREITE der Zweig-Geometrie auf: Astenden (und ihre
 * Ranken-Locken) landen weit außerhalb der eigenen Box — abgeschnitten vom
 * eigenen Ranken-Layer, nicht vom Kartenraster. Breite UND Höhe hier bewusst
 * größer als der Hero-Standard (clamp(112px,26vw,450px)), aber im GLEICHEN
 * Seitenverhältnis (900/520 ≈ 1.73) mitskaliert, damit der Vergrößerungs-
 * wunsch nicht denselben Streckungsfehler reproduziert.
 */
export function InstrumentariumVines({ dock, children }: { dock: 'top' | 'bottom'; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  // Breite 500px * (900/520) ≈ 865 — derselbe Seitenverhältnis-Kompromiss wie bei der Ranken-Breite (siehe InstrumentariumSection).
  const fade = 'linear-gradient(to bottom, black 0%, black 78%, transparent 96%)'
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        [dock]: 0,
        height: 'min(48%, 865px)',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 2,
        maskImage: fade,
        WebkitMaskImage: fade,
        // Untere Ecke ist dieselbe Geometrie, nur gespiegelt — lässt die
        // Zweige von der Unterkante nach oben ins Bild wachsen, statt eigene
        // Kurven für eine Aufwärtsrichtung zu entwerfen. Die Maske bleibt
        // dieselbe Formel: sie fasst „nahe der eigenen Kante voll deckend,
        // zur Sektionsmitte hin ausblendend" — genau das kehrt der Spiegel
        // automatisch mit um.
        transform: dock === 'bottom' ? 'scaleY(-1)' : undefined,
      }}
    >
      {/*
        static: diese Ranken sind reine Hintergrund-Deko ohne erzählerischen
        Moment — kein Grund, dafür Paint-Zeit für das einmalige Aufzeichnen
        UND (bei gemaskten, dauerhaft gemounteten Ranken wie hier) die
        endlose Wiege-Schleife zu zahlen. Erscheinen dadurch sofort fertig
        gewachsen, wie ein normales Bild. Verstärkt außerdem den früheren
        Grund für swaying={false}: eine Maske zwingt den Browser, ihren
        gesamten Inhalt bei JEDER Änderung eines Nachfahren neu zu
        kompositieren — bei „static" ändert sich hinter der Maske jetzt
        gar nichts mehr.
      */}
      {inView && children}
    </div>
  )
}
