'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { C, F, kicker } from '@/components/landing/landing-tokens'
import { joinWaitlist, type WaitlistState } from '@/app/actions/waitlist'
import './waitlist.css'

/**
 * Das Eintrage-Formular für die Interessenten-Liste.
 *
 * Eine Komponente für zwei Orte: den Abschluss der Landing Page und /interesse.
 * Beide stehen auf Onyx, deshalb gibt es bewusst KEINE hell/dunkel-Variante —
 * eine Farbvariante, die nirgends benutzt wird, veraltet unbemerkt.
 *
 * Der Zustand kommt aus `useActionState`: das Formular funktioniert damit auch,
 * bevor React hydriert hat (es ist ein echtes <form action>), und der
 * Pending-Zustand kostet keinen eigenen State.
 */
export function WaitlistForm() {
  const [state, formAction, isPending] = useActionState<WaitlistState, FormData>(joinWaitlist, null)

  /*
   * Erfolg ersetzt das Formular, statt eine Meldung darüber zu setzen: die
   * Adresse steht drin, ein zweites Absenden ändert nichts (die Tabelle hat
   * einen Unique-Index auf lower(email)). Ein stehen gebliebenes Formular
   * lädt genau dazu ein.
   */
  if (state && 'success' in state) {
    return (
      <div className="wl-done" role="status">
        <span className="wl-done-mark" aria-hidden>
          <Check size={16} strokeWidth={2} />
        </span>
        <p className="wl-done-title">Du stehst auf der Liste.</p>
        <p className="wl-done-text">
          Mehr passiert vorerst nicht — es gibt eine einzige Nachricht, und zwar dann,
          wenn sich beim Zugang wirklich etwas tut.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="wl-form">
      {/* Sichtbares Label statt Platzhalter-als-Label: der Platzhalter
          verschwindet beim Tippen, und genau dann braucht man ihn. */}
      <label htmlFor="wl-email" className="wl-label" style={{ ...kicker, fontSize: '10px' }}>
        E-Mail-Adresse
      </label>
      <div className="wl-field">
        <input
          id="wl-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="du@beispiel.de"
          className="wl-input"
          aria-describedby={state && 'error' in state ? 'wl-error' : undefined}
          aria-invalid={state && 'error' in state ? true : undefined}
        />
        <button type="submit" disabled={isPending} className="wl-submit">
          {isPending ? 'Wird eingetragen…' : 'Eintragen'}
          {!isPending && <ArrowRight size={15} strokeWidth={2} aria-hidden />}
        </button>
      </div>

      <label className="wl-consent">
        <input name="consent" type="checkbox" required className="wl-check" />
        <span>
          Ich möchte per E-Mail informiert werden, wenn sich beim Zugang etwas tut. Kein
          Newsletter, keine Weitergabe der Adresse — mehr dazu in der{' '}
          <Link href="/datenschutz" className="wl-link">
            Datenschutzerklärung
          </Link>
          .
        </span>
      </label>

      {/*
        role="alert" statt einer stillen Zeile: die Meldung erscheint nach dem
        Absenden, also lange nachdem der Fokus das Feld verlassen hat — ohne
        Live-Region bekäme ein Screenreader sie gar nicht mit.
      */}
      {state && 'error' in state && (
        <p id="wl-error" role="alert" className="wl-error">
          {state.error}
        </p>
      )}
    </form>
  )
}

/** Die drei Zusagen, die das Eintragen begleiten — auf der Landing Page als
    knappe Zeile unter dem Formular, auf /interesse als eigene Spalten. Der
    Text ist dieselbe Aussage in beiden Fassungen, deshalb hier zentral. */
export const WAITLIST_PROMISES = [
  {
    num: 'I',
    title: 'Kein Zugang, kein Datum.',
    text: 'Die Eintragung ist keine Warteliste mit Termin — nur ein Zeichen, dass Interesse besteht.',
  },
  {
    num: 'II',
    title: 'Höchstens eine E-Mail.',
    text: 'Nur, wenn sich beim Zugang wirklich etwas tut. Kein Newsletter, keine Weitergabe der Adresse.',
  },
  {
    num: 'III',
    title: 'Jederzeit wieder raus.',
    text: 'Ein kurzer Hinweis per Antwort-Mail genügt, dann ist die Adresse gelöscht.',
  },
] as const

/** Kleine Zeile unter dem Formular auf der Landing Page — dieselben drei
    Zusagen wie oben, nur auf ihre Kernaussage eingedampft. */
export function WaitlistPromiseLine() {
  return (
    <p className="wl-promise-line" style={{ fontFamily: F.sans }}>
      <span style={{ color: C.gold }}>·</span> Kein Newsletter{' '}
      <span style={{ color: C.gold }}>·</span> Höchstens eine E-Mail{' '}
      <span style={{ color: C.gold }}>·</span> Jederzeit wieder raus
    </p>
  )
}
