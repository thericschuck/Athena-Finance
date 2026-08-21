'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Zeichen, durch die jede Stelle läuft, bevor sie sich auf den Zielwert
    festlegt — bewusst Symbole statt Buchstaben, damit es wie eine
    Entschlüsselung aussieht, nicht wie zufälliger Buchstabensalat. */
const SCRAMBLE_CHARS = '!<>-_\\/[]{}=+*^?#%$&@'
const SCRAMBLE_MASK_CHAR = '•'
const SCRAMBLE_DURATION_MS = 850
/** Wie oft sich eine noch nicht festgelegte Stelle neu würfelt — bewusst
    deutlich langsamer als eine typische Flacker-Rate, damit es nach ruhigem
    Durchlaufen statt nach Wildem Geflimmer aussieht (siehe Chat: „etwas zu
    wild … sauberer/langsamer"). */
const SCRAMBLE_TICK_MS = 65

/**
 * Passwort-Feld mit Anzeigen/Verbergen-Umschalter — eigene Client-Komponente,
 * weil `page.tsx` sonst eine Server-Komponente bleiben kann (kein State
 * nötig für alles andere auf der Seite).
 *
 * Der Umschalter setzt `type` nicht mehr hart um, sondern läuft über eine
 * kurze Entschlüsseln/Verschlüsseln-Animation: jede Stelle würfelt erst durch
 * Symbole, bevor sie sich — von links nach rechts, mit etwas Zufallsstreuung
 * statt einer starren Welle — auf den Zielwert festlegt (siehe Chat: „stück
 * für stück entschlüsselt/verschlüsselt"). Läuft komplett über einen
 * `requestAnimationFrame`-Loop mit direkt gesetztem State pro Frame, nicht
 * über CSS-Transitions — bei einzelnen Zeichen, die sich unabhängig
 * voneinander und zu leicht unterschiedlichen Zeitpunkten festlegen, gibt es
 * keine feste Start/End-Property, die eine Transition sinnvoll interpolieren
 * könnte.
 *
 * Sicherheitsrelevant bleibt NUR das echte `<input>` — die Animation ist ein
 * rein kosmetischer Overlay obendrauf (eigenes, pointer-events:none-Element,
 * siehe .af-field-scramble), der Wert selbst wandert nie zusätzlich irgendwo
 * hin. Während die Animation läuft, wird lediglich die Textfarbe des echten
 * Feldes durchsichtig (nicht `opacity`, sonst verschwände auch der Rahmen).
 */
export function PasswordField() {
  const [visible, setVisible] = useState(false)
  const [scrambleText, setScrambleText] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rafRef = useRef(0)

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const toggle = () => {
    const input = inputRef.current
    const value = input?.value ?? ''
    const nextVisible = !visible

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!input || !value || reduced) {
      setVisible(nextVisible)
      return
    }

    cancelAnimationFrame(rafRef.current)

    const len = value.length
    const finalChars = nextVisible ? value.split('') : Array.from({ length: len }, () => SCRAMBLE_MASK_CHAR)
    // Von links nach rechts, mit LEICHTER Streuung statt einer starren
    // Kante — die Welle selbst trägt jetzt den Großteil des Timings
    // (0.8 statt 0.55), der Zufallsanteil ist nur noch ein kleines Zittern
    // (0.2 statt 0.45) für den organischen Touch, nicht mehr die Hauptursache
    // dafür, wann eine Stelle sich festlegt (siehe Chat: „zu wild").
    const revealAt = Array.from({ length: len }, (_, i) =>
      (i / Math.max(1, len - 1)) * SCRAMBLE_DURATION_MS * 0.8 + Math.random() * SCRAMBLE_DURATION_MS * 0.2,
    )
    const nextTickAt = new Array(len).fill(0)
    const current = new Array(len).fill('')
    const start = performance.now()

    const tick = () => {
      const now = performance.now()
      const elapsed = now - start
      let allSettled = true
      for (let i = 0; i < len; i++) {
        if (elapsed >= revealAt[i]) {
          current[i] = finalChars[i]
        } else {
          allSettled = false
          if (now >= nextTickAt[i]) {
            current[i] = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
            nextTickAt[i] = now + SCRAMBLE_TICK_MS
          }
        }
      }
      setScrambleText(current.join(''))
      if (!allSettled) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setScrambleText(null)
        setVisible(nextVisible)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const animating = scrambleText !== null

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        id="password"
        name="password"
        type={visible ? 'text' : 'password'}
        required
        autoComplete="current-password"
        placeholder="••••••••"
        className="af-field"
        style={{
          paddingRight: '44px',
          // Nur die Textfarbe ausblenden, NICHT opacity — der Rahmen und der
          // Fokus-Ring des echten Feldes sollen währenddessen sichtbar bleiben.
          color: animating ? 'transparent' : undefined,
          caretColor: animating ? 'transparent' : undefined,
        }}
      />
      {animating && (
        <div className="af-field-scramble" aria-hidden>
          {scrambleText}
        </div>
      )}
      <button
        type="button"
        className="af-field-toggle"
        onClick={toggle}
        aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        aria-pressed={visible}
      >
        <span key={visible ? 'off' : 'on'} className="af-field-toggle-icon">
          {visible ? <EyeOff size={17} strokeWidth={1.6} /> : <Eye size={17} strokeWidth={1.6} />}
        </span>
      </button>
    </div>
  )
}
