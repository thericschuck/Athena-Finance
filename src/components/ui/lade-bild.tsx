'use client'

import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type LadeBildProps = Omit<ComponentProps<'img'>, 'src' | 'alt'> & {
  src: string
  /** Pflicht: leerer String für rein dekorative Bilder. */
  alt: string
  /** Shimmer über der Bildfläche, bis das Bild fertig dekodiert ist. Braucht einen positionierten Elternteil. */
  platzhalter?: boolean
  platzhalterClassName?: string
}

/**
 * `<img>`, das erst sichtbar wird, wenn es vollständig geladen UND dekodiert ist — statt
 * zeilenweise von oben nach unten aufzubauen. Bis dahin liegt der App-weite `.shimmer`
 * über der Fläche, danach blendet das Bild weich ein.
 *
 * Bewusst kein next/image: die Bilder hier sind signierte Storage-URLs mit Ablaufdatum
 * (siehe Kommentar an der Inventarkarte).
 *
 * Der Ladezustand hängt an der URL (`fertigSrc === src`), nicht an einem Boolean: wechselt
 * die URL (neue Signatur, anderes Hauptbild), gilt das Bild automatisch wieder als
 * ungeladen, ohne dass ein Effekt den Zustand zurücksetzen muss.
 */
export function LadeBild({
  src,
  alt,
  className,
  style,
  onLoad,
  onError,
  platzhalter = true,
  platzhalterClassName,
  decoding = 'async',
  ...rest
}: LadeBildProps) {
  const ref = useRef<HTMLImageElement>(null)
  const [fertigSrc, setFertigSrc] = useState<string | null>(null)
  const fertig = fertigSrc === src

  const markiere = useCallback(
    (img: HTMLImageElement) => {
      // decode() wartet, bis das Bild malbereit ist — sonst kann der erste Frame nach dem
      // Einblenden noch leer sein. Schlägt es fehl (z. B. Safari bei SVG), trotzdem zeigen.
      const fertigMelden = () => setFertigSrc(src)
      if (typeof img.decode === 'function') img.decode().then(fertigMelden, fertigMelden)
      else fertigMelden()
    },
    [src],
  )

  // Aus dem Cache geladene (oder vor der Hydration fertige) Bilder feuern kein onLoad mehr,
  // das React noch mitbekäme.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth > 0) markiere(img)
  }, [markiere])

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- signierte URL, siehe oben */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        decoding={decoding}
        className={cn('motion-safe:transition-opacity motion-safe:duration-300', className)}
        style={fertig ? style : { ...style, opacity: 0 }}
        onLoad={e => {
          markiere(e.currentTarget)
          onLoad?.(e)
        }}
        onError={e => {
          // Kein ewiger Shimmer bei kaputter/abgelaufener URL.
          setFertigSrc(src)
          onError?.(e)
        }}
        {...rest}
      />
      {platzhalter && !fertig && (
        <span aria-hidden className={cn('shimmer pointer-events-none absolute inset-0', platzhalterClassName)} />
      )}
    </>
  )
}
