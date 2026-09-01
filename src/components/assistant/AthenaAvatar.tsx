'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Ausschnitt aus `/athena-statue.svg`, in Nutzer-Einheiten der SVG-viewBox
 * (`0 0 95 142`). Die Datei zeigt die ganze Statue auf ihrem Kapitell; das
 * Medaillon zeigt davon Helm, Gesicht, Schulter und Schildkante.
 *
 * `x` ergibt sich nicht aus der Mitte des Kopfes, sondern aus dem Schwerpunkt
 * der gezeichneten Fläche in diesem Höhenband (x ~ 49, gemessen an der
 * gerenderten Alpha-Maske). Auf die Kopfmitte zentriert saß die Figur sichtbar
 * rechts im Kreis, weil Schild und Speerarm nur nach rechts ausschlagen.
 *
 * Nicht über eine zweite, zugeschnittene SVG-Datei gelöst: dann müssten zwei
 * Assets synchron bleiben, obwohl es dieselbe Zeichnung ist.
 */
const CROP = { x: 34, y: 18, size: 30 } as const

/** Natürliche Maße der Quelldatei — bestimmen, wie stark skaliert werden muss. */
const SVG = { w: 95, h: 142 } as const

/**
 * Athena als Gesicht des Agenten: rundes Medaillon mit dem Kopf der Statue.
 *
 * Der Ausschnitt liegt als `background-image` und nicht als `<img>` im Kreis:
 * so rastert der Browser die SVG genau in der Größe, in der sie am Ende steht
 * (und auf Retina in Gerätepixeln), statt ein überbreites Bild hinter einem
 * `overflow: hidden` zu skalieren. Nebeneffekt: der Rand darf ein
 * `inset`-Ring sein — der liegt über dem Hintergrund, aber unter Kindelementen,
 * und würde von einem `<img>` im Kreis wieder verdeckt.
 *
 * `thinking` legt einen rotierenden Ring darum. Bewusst ein Conic-Gradient und
 * kein Spinner-Icon: der Ring gehört zum Medaillon statt daneben zu stehen, und
 * das Medaillon selbst bleibt ruhig — ein mitdrehendes Gesicht wäre albern.
 */
export function AthenaAvatar({
  size = 28,
  thinking = false,
  className,
}: {
  size?: number
  thinking?: boolean
  className?: string
}) {
  // Der Ausschnitt soll das Medaillon exakt füllen: alles wird um denselben
  // Faktor vergrößert und dann so verschoben, dass die linke obere Ecke des
  // Ausschnitts auf der linken oberen Ecke des Kreises landet.
  const k = size / CROP.size

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {thinking && (
        <span
          aria-hidden
          className="absolute -inset-[3px] rounded-full motion-safe:animate-[spin_2.4s_linear_infinite]"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 190deg, color-mix(in oklab, var(--primary) 70%, transparent) 320deg, transparent 360deg)',
          }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative rounded-full bg-card bg-no-repeat',
          // Der Rand liegt bewusst nicht auf `--border`: das Token ist in den
          // dunklen Themes nur 8–12 % Weiß und verschwindet auf dem Medaillon.
          // `foreground/20` bleibt hell wie dunkel eine sichtbare Fassung.
          'ring-2 ring-inset ring-foreground/20',
        )}
        style={{
          width: size,
          height: size,
          // Zwei Ebenen in EINER Eigenschaft, damit beide unter dem inset-Ring
          // bleiben: oben der Schimmer, darunter die Zeichnung.
          backgroundImage:
            'linear-gradient(to bottom, color-mix(in oklab, var(--primary) 12%, transparent), transparent), url(/athena-statue.svg)',
          backgroundSize: `100% 100%, ${SVG.w * k}px ${SVG.h * k}px`,
          backgroundPosition: `0 0, ${-CROP.x * k}px ${-CROP.y * k}px`,
        }}
      />
    </span>
  )
}

/**
 * Ganze Statue als stiller Hintergrund einer Chat-Fläche. Rein dekorativ,
 * deshalb `aria-hidden` und `pointer-events-none`; unter `lg` ausgeblendet,
 * weil sie dort unter dem Text stünde statt neben ihm.
 */
export function AthenaBackdrop({ className }: { className?: string }) {
  return (
    <Image
      src="/athena-statue.svg"
      alt=""
      aria-hidden
      // `unoptimized`: dieselbe Begründung wie im Landing-Hero — der Optimizer
      // rastert die Zeichnung und nimmt ihr die Kanten.
      unoptimized
      width={SVG.w}
      height={SVG.h}
      className={cn(
        'pointer-events-none absolute bottom-0 right-6 hidden h-[min(62%,520px)] w-auto select-none opacity-[0.07] lg:block',
        className,
      )}
    />
  )
}
