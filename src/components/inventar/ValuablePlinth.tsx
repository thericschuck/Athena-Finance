'use client'

import { MeanderFrieze } from '@/components/landing/olive-vines'
import { useSettings } from '@/components/providers/settings-context'
import { cn } from '@/lib/utils'

/**
 * Der Sockel einer Vitrinen-Kachel — der Steinblock, auf dem die Beschriftung sitzt.
 *
 * Die Kachel hatte oben ein Podest (Bild mit Sockelschimmer) und darunter nichts: zwei
 * Zeilen Text und eine Zahl auf der Kartenfläche. Damit war die Hälfte der Kachel
 * Ausstellung und die andere Hälfte Tabelle.
 *
 * Also die Metapher zu Ende gebaut: die Beschriftung sitzt jetzt auf einem eigenen Block,
 * der bis an die Kartenkanten läuft. Drei Schichten, alle aus Theme-Tokens, damit es unter
 * allen acht Presets funktioniert:
 *
 *  1. Kannelur — feine senkrechte Rillen wie an einem dorischen Säulenschaft. Nach unten
 *     ausgeblendet, damit der Block schwerer wirkt als sein oberer Rand.
 *  2. Kapitell — die Abschlusskante nach oben. In den Athena-Themes ein Mäander-Fries
 *     (dasselbe Motiv wie in der Seitenleiste, deshalb liest es sich als dieselbe Hand),
 *     sonst eine Haarlinie in der Farbe der Wertstufe. Ein griechischer Schlüssel in einem
 *     nüchternen Preset wäre stilfremd — genau die Trennung, die app-shell bei den
 *     Olivenranken auch macht.
 *  3. Fuge — eine hauchdünne helle Linie unter dem Kapitell: der Lichtsaum einer
 *     Steinkante. Ohne die sieht der Fries wie aufgeklebt aus statt wie gemeißelt.
 *
 * Beim Überfahren wird der Block eine Spur heller und der Fries deutlicher — als würde der
 * Strahler in der Vitrine nachziehen. Bewusst nur das: die Kachel hat oben schon den Sheen,
 * zwei konkurrierende Effekte wären Kirmes.
 */
export function ValuablePlinth({
  /** Eindeutig je Kachel — der Fries braucht eine eigene SVG-Pattern-ID. */
  id,
  /** Farbe der Wertstufe (`wertstufe(...).border`). Trägt Kapitell und Fries. */
  akzent,
  prunk = false,
  children,
  className,
}: {
  id: string
  akzent: string
  /**
   * Nur Sammlerstücke bekommen Kannelur und Mäander-Fries. Vorher trug jede Kachel das volle
   * Ornament, und im Raster aus zwanzig Karten war es Rauschen statt Auszeichnung — jetzt ist
   * der Schmuck selbst die Stufe.
   */
  prunk?: boolean
  children: React.ReactNode
  className?: string
}) {
  const { themePreset } = useSettings()
  const istAthena = themePreset === 'athena' || themePreset === 'athena-dark'

  return (
    // `-mx-3.5 -mb-3.5`: der Sockel läuft bis an die Kanten der Kachel (die trägt `p-3.5`). Ein
    // Block mit Rand um sich herum wäre eine Karte in der Karte, kein Sockel.
    //
    // `pointer-events-none` auf dem Sockel und nicht auf den Textblöcken darin: die Kachel
    // öffnet über eine flächige Schaltfläche, die UNTER allem liegt, und ein Kasten fängt
    // Klicks auch dann ab, wenn er durchsichtig ist. Mit der Regel nur an den Kindern wäre
    // die untere Kartenhälfte ein toter Bereich gewesen. Braucht hier später doch etwas
    // einen Klick, holt es sich `pointer-events-auto` einzeln zurück — so wie die
    // Blätter-Pfeile im Bild darüber.
    <div
      className={cn(
        'pointer-events-none relative z-10 -mx-3.5 -mb-3.5 mt-3.5 px-3.5 pb-3.5 pt-3',
        className,
      )}
    >
      {/* Steinfläche + Kannelur in einem Element, damit nur eine Schicht über der
          Kartenfläche liegt. */}
      {prunk && (
      <span
        aria-hidden
        className="absolute inset-0 opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          backgroundImage: [
            // Rillen. 5px Abstand, 1px Linie — bei einer Kachelbreite von ~200px sind das
            // gut 30 Rillen, fein genug, dass es als Textur und nicht als Streifen liest.
            'repeating-linear-gradient(90deg,' +
              ' transparent 0 5px,' +
              ' color-mix(in srgb, var(--foreground) 6%, transparent) 5px 6px)',
            // Der Block selbst: oben etwas Substanz, nach unten auslaufend.
            'linear-gradient(to bottom,' +
              ' color-mix(in srgb, var(--foreground) 5%, transparent),' +
              ' transparent 85%)',
          ].join(','),
          // Die Rillen enden weich, bevor sie die Unterkante erreichen — eine Textur, die
          // an der Kartenkante hart abbricht, sieht nach Fehler aus.
          maskImage: 'linear-gradient(to bottom, black 55%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent)',
        }}
      />
      )}

      {/* Kapitell. Die Wertstufe bestimmt die Farbe, und weil `basis` auf `var(--border)`
          liegt, ergibt sich daraus von selbst eine Steigerung: ein Alltagsgegenstand bekommt
          einen schlichten Sockel, ein Sammlerstück einen goldenen Fries. */}
      <span aria-hidden className="absolute inset-x-0 top-0">
        {istAthena && prunk ? (
          <span className="block opacity-60 transition-opacity duration-300 group-hover:opacity-100">
            <MeanderFrieze id={id} color={akzent} opacity={0.85} scale={0.55} />
          </span>
        ) : (
          <span className="block h-px w-full" style={{ background: akzent, opacity: 0.5 }} />
        )}
        {/* Fuge */}
        <span
          className="block h-px w-full"
          style={{ background: 'color-mix(in srgb, var(--foreground) 8%, transparent)' }}
        />
      </span>

      <div className="relative">{children}</div>
    </div>
  )
}
