'use client'

import Image from 'next/image'
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

const nichtsAbonnieren = () => () => {}

/**
 * Athena-Statue als Hintergrund der Darstellungs-Einstellungen — dieselbe Illustration wie
 * im Landing-Hero, dort bodenständig statt oben hängend (siehe .hero-athena in landing.css).
 * Nur ab `2xl` (≥1536px): darunter reicht der Platz neben `max-w-5xl` + Sidebar nicht, die
 * Statue würde sonst über echte Inhalte fallen.
 *
 * Per Portal direkt an <body>, nicht dort, wo die Komponente steht: `position: fixed` ist
 * relativ zum Viewport nur, solange KEIN Vorfahre einen Transform hat. Die Einstellungen
 * liegen aber in einem Panel mit framer-motion-Transform (Tab-Wechsel) und in der
 * Seiteneinblendung des PageWrappers. Während dieser Animationen war das Panel der
 * Bezugsrahmen, danach der Viewport — die Statue sprang beim Tab-Wechsel von einer Stelle
 * zur anderen. Am Body ist sie vom ersten Frame an fest im Viewport verankert.
 *
 * Erst nach dem Mount gerendert (Portal braucht `document`); da sie `fixed` ist, kostet das
 * kein Layout.
 */
export function AthenaStatue() {
  const bereit = useSyncExternalStore(
    nichtsAbonnieren,
    () => true,
    () => false,
  )
  if (!bereit) return null

  return createPortal(
    <Image
      src="/athena-statue.svg"
      alt=""
      aria-hidden
      width={95}
      height={142}
      unoptimized
      priority
      className="pointer-events-none fixed bottom-0 right-16 z-0 hidden h-[min(78vh,760px)] w-auto opacity-[0.4] 2xl:block"
    />,
    document.body,
  )
}
