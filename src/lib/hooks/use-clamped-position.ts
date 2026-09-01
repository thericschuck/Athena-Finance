'use client'

import { useLayoutEffect, useRef, useState } from 'react'

interface Point { x: number; y: number }

interface ClampedPositionOptions {
  /** Horizontal gap from the anchor when aligning to its right edge. Default 14. */
  gapX?: number
  /** Vertical gap from the anchor when aligning below/above it. Default 14. */
  gapY?: number
  /** Minimum distance kept from the viewport edge. Default 8. */
  margin?: number
  /** 'right' = box starts gapX to the right of anchor.x, flips left if that overflows.
   *  'center' = box is horizontally centered on anchor.x (then clamped). Default 'right'. */
  alignX?: 'right' | 'center'
  /** 'below' = box starts gapY below anchor.y, flips above if that overflows.
   *  'above' = box ends gapY above anchor.y, flips below if that overflows. Default 'below'. */
  alignY?: 'below' | 'above'
}

/**
 * Positions a floating tooltip/popover relative to an anchor point (cursor position, or a
 * hovered/clicked cell), then nudges it back on-screen once its real size is known — flips to
 * the opposite side instead of running off the viewport edge, which is what made the
 * Heatmap/Kalender overlays disappear near the screen border and feel disconnected from the
 * cursor.
 */
export function useClampedPosition(anchor: Point | null, opts?: ClampedPositionOptions) {
  const gapX   = opts?.gapX   ?? 14
  const gapY   = opts?.gapY   ?? 14
  const margin = opts?.margin ?? 8
  const alignX = opts?.alignX ?? 'right'
  const alignY = opts?.alignY ?? 'below'

  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false })

  useLayoutEffect(() => {
    if (!anchor || !ref.current) {
      setPos(p => (p.ready ? { left: 0, top: 0, ready: false } : p))
      return
    }
    const { width, height } = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left: number
    if (alignX === 'center') {
      left = anchor.x - width / 2
    } else {
      left = anchor.x + gapX
      if (left + width > vw - margin) left = anchor.x - gapX - width
    }

    let top: number
    if (alignY === 'above') {
      top = anchor.y - gapY - height
      if (top < margin) top = anchor.y + gapY
    } else {
      top = anchor.y + gapY
      if (top + height > vh - margin) top = anchor.y - gapY - height
    }

    // Final clamp covers the remaining case — anchor so close to an edge that even the
    // flipped/centered position would still overflow.
    left = Math.max(margin, Math.min(left, vw - width  - margin))
    top  = Math.max(margin, Math.min(top,  vh - height - margin))

    setPos(p => (p.ready && p.left === left && p.top === top ? p : { left, top, ready: true }))
    // Callers pass a fresh `{x, y}` literal on every render (e.g. `tip ? {x: tip.x, y: tip.y} :
    // null`), so depending on `anchor` itself would re-run this effect — and call setPos, which
    // creates a new state object every time — on every single render, forever. Depending on the
    // primitive coordinates instead means it only re-runs when the position actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.x, anchor?.y, gapX, gapY, margin, alignX, alignY])

  return {
    ref,
    style: {
      left: pos.left,
      top: pos.top,
      visibility: (pos.ready ? 'visible' : 'hidden') as 'visible' | 'hidden',
    },
  }
}
