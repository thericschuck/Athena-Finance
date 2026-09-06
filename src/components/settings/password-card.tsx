'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Check, Eye, EyeOff, KeyRound, X } from 'lucide-react'
import { changePassword, type SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/lib/use-reduced-motion'

const MIN_LENGTH = 8

/**
 * Grobe Stärke-Einschätzung, absichtlich nur clientseitig und nur als Hinweis:
 * die verbindliche Regel steht in `changePassword` (>= 8 Zeichen) und muss dort
 * stehen bleiben — ein Meter, das eine Server-Prüfung ersetzt, prüft nichts.
 * Punkte: Länge (zweimal, weil Länge mehr bringt als Zeichenvielfalt) plus je
 * ein Punkt für Klein+Groß gemischt und für Ziffern+Sonderzeichen.
 */
function scorePassword(value: string): number {
  if (!value) return 0
  let score = 0
  if (value.length >= MIN_LENGTH) score++
  if (value.length >= 14) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++
  return Math.min(4, score)
}

const STRENGTH_LABEL = ['', 'Schwach', 'Okay', 'Gut', 'Stark']

/**
 * Farbe des Stärke-Meters in drei Stufen statt vier, damit jede Stufe in JEDEM
 * Theme existiert: `destructive`, `primary` und `success` sind überall
 * definiert, die `chart-*`-Töne variieren zwischen den Presets zu stark.
 */
function strengthTone(score: number): string {
  if (score <= 1) return 'bg-destructive'
  if (score <= 3) return 'bg-primary'
  return 'bg-success'
}

function PasswordInput({
  id, name, label, autoComplete, value, onChange, children,
}: {
  id:           string
  name:         string
  label:        string
  autoComplete: string
  value:        string
  onChange:     (v: string) => void
  /** Slot rechts vom Label — trägt den Match-Hinweis am Bestätigungsfeld. */
  children?:    React.ReactNode
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {children}
      </div>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          required
          minLength={autoComplete === 'new-password' ? MIN_LENGTH : undefined}
          className="h-9 w-full rounded-md border border-input bg-background pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  )
}

/**
 * „Passwort ändern" saß vorher als `pt-6 border-t`-Abschnitt unter dem
 * Profilformular — optisch derselbe Rang wie „Anzeigename", obwohl es die
 * einzige sicherheitsrelevante und einzige nicht ohne Weiteres umkehrbare
 * Aktion der Seite ist. Jetzt eine eigene Karte mit Schlüssel-Kachel in
 * `primary`, standardmäßig zugeklappt: drei dauerhaft sichtbare Passwortfelder
 * sind auf einem Profil-Tab, den man wegen der Zeitzone öffnet, nur Rauschen —
 * und laden Browser-Autofill ein, sie ungefragt zu befüllen.
 */
export function PasswordCard() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePassword, null)
  const [open, setOpen]       = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const still                 = useReducedMotion()
  const uid                   = useId()
  const firstFieldRef         = useRef<HTMLDivElement>(null)

  const score    = scorePassword(next)
  const mismatch = confirm.length > 0 && next !== confirm
  const matches  = confirm.length > 0 && next === confirm

  useEffect(() => {
    if (!state) return
    if ('success' in state) {
      toast.success('Passwort geändert')
      setCurrent(''); setNext(''); setConfirm('')
      setOpen(false)
    }
    if ('error' in state) toast.error(state.error)
  }, [state])

  // Fokus erst NACH dem Aufklappen setzen: im Moment des Klicks steht das Panel
  // noch auf Höhe 0, ein sofortiges focus() würde den Seiten-Container an eine
  // Position scrollen, die es eine Animation später nicht mehr gibt.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      firstFieldRef.current?.querySelector('input')?.focus()
    }, still ? 0 : 180)
    return () => clearTimeout(t)
  }, [open, still])

  return (
    <div
      className={cn(
        'mt-8 rounded-xl border bg-card/40 transition-colors duration-200',
        open ? 'border-primary/35 bg-card/70' : 'border-border hover:border-primary/25',
      )}
    >
      {/* Kopf — steht beim Auf- und Zuklappen unverändert an derselben Stelle */}
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
            open ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          <KeyRound className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">Passwort ändern</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mindestens {MIN_LENGTH} Zeichen. Zur Bestätigung brauchst du dein aktuelles Passwort.
          </p>
        </div>

        <Button
          type="button"
          variant={open ? 'ghost' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => {
            if (open) { setCurrent(''); setNext(''); setConfirm('') }
            setOpen(o => !o)
          }}
          aria-expanded={open}
          aria-controls={`${uid}-panel`}
        >
          {open ? 'Abbrechen' : 'Ändern'}
        </Button>
      </div>

      {/* Panel: `height: auto` über framer-motion statt der CSS-Grid-Variante
          aus der Sidebar — hier soll zusätzlich der Inhalt selbst leicht
          nachrutschen, und die Karte kennt ihre Endhöhe erst zur Laufzeit. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            id={`${uid}-panel`}
            initial={still ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{
              height:  { duration: still ? 0 : 0.28, ease: [0.25, 0.46, 0.45, 0.94] },
              opacity: { duration: still ? 0 : 0.18, ease: 'easeOut' },
            }}
            className="overflow-hidden"
          >
            <form action={action} className="space-y-4 border-t border-border/70 p-4 sm:p-5">
              <div ref={firstFieldRef} className="space-y-3">
                <PasswordInput
                  id="current_password" name="current_password"
                  label="Aktuelles Passwort" autoComplete="current-password"
                  value={current} onChange={setCurrent}
                />

                <div className="space-y-2">
                  <PasswordInput
                    id="new_password" name="new_password"
                    label="Neues Passwort" autoComplete="new-password"
                    value={next} onChange={setNext}
                  />
                  {/* Stärke-Meter: vier feste Segmente, gefüllt nach Score. Es
                      animiert `scale-x` je Segment, nicht die Breite des ganzen
                      Balkens — bei festen Segmenten wäre eine Breiten-Animation
                      nur Zappeln. */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                          <div
                            className={cn(
                              'h-full w-full origin-left transition-transform duration-300 ease-out',
                              i <= score ? `${strengthTone(score)} scale-x-100` : 'scale-x-0',
                            )}
                          />
                        </div>
                      ))}
                    </div>
                    <span
                      className={cn(
                        'w-14 text-right text-xs transition-colors',
                        score >= 4 ? 'text-success' : score > 0 ? 'text-muted-foreground' : 'text-transparent',
                      )}
                    >
                      {STRENGTH_LABEL[score] || '—'}
                    </span>
                  </div>
                </div>

                <PasswordInput
                  id="confirm_password" name="confirm_password"
                  label="Passwort bestätigen" autoComplete="new-password"
                  value={confirm} onChange={setConfirm}
                >
                  {/* Live-Rückmeldung statt erst nach dem Absenden. Der Server
                      prüft die Gleichheit weiterhin selbst — das hier spart nur
                      den Fehl-Roundtrip. */}
                  {(matches || mismatch) && (
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs',
                        matches ? 'text-success' : 'text-destructive',
                      )}
                    >
                      {matches ? <Check className="size-3" /> : <X className="size-3" />}
                      {matches ? 'Stimmt überein' : 'Stimmt nicht überein'}
                    </span>
                  )}
                </PasswordInput>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={pending || mismatch || next.length < MIN_LENGTH || !current}
              >
                {pending ? 'Ändern…' : 'Passwort ändern'}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
