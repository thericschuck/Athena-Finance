'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart2, CandlestickChart, Mail, Palette, Plug, User, Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import type { UserProfile, SettingsMap } from '@/lib/settings'
import { ProfileForm }       from './profile-form'
import { AppearanceForm }    from './appearance-form'
import { FinanceForm }       from './finance-form'
import { AnalyseForm, type AnalyseFormAccount } from './analyse-form'
import { TradingForm }       from './trading-form'
import { IntegrationsForm }  from './integrations-form'
import { WaitlistPanel }     from './waitlist-panel'
import type { WaitlistRow }  from '@/lib/waitlist'

const TABS = [
  { id: 'profil',         label: 'Profil',         icon: User             },
  { id: 'darstellung',    label: 'Darstellung',    icon: Palette          },
  { id: 'finanzen',       label: 'Finanzen',       icon: Wallet           },
  { id: 'analyse',        label: 'Analyse',        icon: BarChart2        },
  { id: 'trading',        label: 'Trading',        icon: CandlestickChart },
  { id: 'integrationen',  label: 'Integrationen',  icon: Plug            },
  // Erscheint nur, wenn die Seite überhaupt Zeilen mitgeliefert hat — also für
  // den Eigentümer (siehe lib/waitlist.ts). Für alle anderen ist der Reiter
  // nicht etwa deaktiviert, sondern gar nicht vorhanden.
  { id: 'warteliste',     label: 'Warteliste',     icon: Mail             },
] as const

type TabId = typeof TABS[number]['id']

/**
 * Gemeinsame Feder für Indikator und Panel. Bewusst `type: 'spring'` mit hoher
 * Dämpfung statt einer `ease`-Kurve: der Indikator legt je nach Sprungweite
 * unterschiedliche Distanzen zurück (Profil → Integrationen ist fünfmal so weit
 * wie Profil → Darstellung), und eine feste Dauer lässt kurze Sprünge träge und
 * weite Sprünge gehetzt wirken. Die Feder skaliert das von sich aus.
 */
const INDICATOR_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 } as const

/**
 * Das Panel folgt dorthin, wo der Indikator hingelaufen ist: nach unten
 * geklickt (`dir = 1`) kommt der neue Inhalt von unten herein und der alte
 * verlaesst das Feld nach oben. Als Variants-Funktionen und nicht als
 * feste Objekte, weil die Richtung des ABGEHENDEN Panels ueber
 * `AnimatePresence custom=` nachgeliefert werden muss — ein abgehendes Element
 * rendert nicht mehr mit und kennt sonst nur die Richtung des vorherigen
 * Wechsels. `dir = 0` (Reduced Motion) laesst nur die Deckkraft uebrig.
 */
const PANEL_VARIANTS = {
  enter:  (dir: number) => ({ opacity: 0, y:  dir * 10 }),
  center: { opacity: 1, y: 0 },
  exit:   (dir: number) => ({ opacity: 0, y: -dir * 6 }),
}

export function SettingsShell({
  initialProfile,
  initialSettings,
  accounts,
  email,
  waitlist,
}: {
  initialProfile: UserProfile
  initialSettings: SettingsMap
  accounts: AnalyseFormAccount[]
  email: string
  /** `null`, wenn die Liste für dieses Konto nicht sichtbar ist. */
  waitlist?: WaitlistRow[] | null
}) {
  // Richtung im selben State wie der Tab, nicht in einer Ref: `AnimatePresence`
  // liest sie beim Rendern, und genau das darf man mit einer Ref nicht tun
  // (react-hooks/refs) — sie wuerde beim Wechsel auch gar nicht neu gelesen.
  // Die tatsächlich angezeigten Reiter. Der Index-Vergleich in `select` unten
  // rechnet mit dieser Liste, nicht mit TABS — sonst stimmte die Richtung der
  // Panel-Animation nicht mehr, sobald ein Reiter fehlt.
  const tabs = useMemo(() => TABS.filter(t => t.id !== 'warteliste' || waitlist != null), [waitlist])
  const [{ active, dir }, setTab] = useState<{ active: TabId; dir: number }>({ active: 'profil', dir: 1 })
  const still = useReducedMotion()
  const direction = still ? 0 : dir

  function select(id: TabId) {
    setTab(prev => prev.active === id ? prev : {
      active: id,
      dir: tabs.findIndex(t => t.id === id) > tabs.findIndex(t => t.id === prev.active) ? 1 : -1,
    })
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      {/* Mobile: horizontal scrollbare Tab-Leiste. Eigene `layoutId` als die
          Desktop-Navigation, weil BEIDE Leisten im DOM stehen (`hidden` blendet
          nur aus) — mit derselben ID würde framer-motion zwei Kandidaten für
          denselben Indikator sehen und zwischen ihnen hin und her messen. */}
      <nav className="-mx-4 flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 pb-1 sm:hidden">
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => select(tab.id)}
              className={cn(
                // `isolate`: der Indikator liegt auf `-z-10` und braucht einen
                // eigenen Stacking-Context AM BUTTON, sonst faellt er hinter den
                // Hintergrund des naechsten Kontexts (PageWrapper/AppShell) und ist
                // schlicht nicht zu sehen.
                'relative isolate shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                isActive ? 'text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="settings-tab-mobile"
                  className="absolute inset-0 -z-10 rounded-md bg-accent"
                  transition={still ? { duration: 0 } : INDICATOR_SPRING}
                />
              )}
              {tab.label}
            </button>
          )
        })}
      </nav>

      {/* Desktop: vertikale Navigation */}
      <nav className="hidden w-44 shrink-0 flex-col gap-0.5 sm:flex">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => select(id)}
              className={cn(
                // `isolate` wie oben; `group`, damit die Hover-Flaeche auf den
                // Hover des BUTTONS reagiert und nicht auf ihren eigenen — sie liegt
                // hinter Icon und Label, dort ist sie gar nicht das oberste Element
                // unter dem Zeiger.
                'group relative isolate flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                isActive ? 'text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* Die gleitende Fläche liegt HINTER dem Label (`-z-10`) statt als
                  `background` am Button selbst — nur so kann ein einziges
                  Element von Tab zu Tab wandern, anstatt dass sechs
                  Hintergründe unabhängig ein- und ausblenden. */}
              {isActive && (
                <motion.span
                  layoutId="settings-tab-desktop"
                  className="absolute inset-0 -z-10 rounded-md bg-accent"
                  transition={still ? { duration: 0 } : INDICATOR_SPRING}
                />
              )}
              {/* Hover-Fläche separat, damit sie nicht mit dem gleitenden
                  Indikator um denselben Hintergrund konkurriert. */}
              {!isActive && (
                <span className="absolute inset-0 -z-10 rounded-md bg-accent/0 transition-colors duration-150 group-hover:bg-accent/50" />
              )}
              <Icon className={cn('size-4 shrink-0 transition-opacity', isActive ? 'opacity-100' : 'opacity-60')} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Inhalt. `mode="wait"` (und nicht das überlappende Default): die Panels
          sind unterschiedlich hoch, zwei gleichzeitig gerenderte würden den
          Container während des Wechsels auf die Höhe des höheren aufblasen und
          danach zurückschnappen. Aus-Dauer deutlich kürzer als Ein-Dauer,
          damit sich der Klick trotz der Wartephase direkt anfühlt. */}
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={active}
            custom={direction}
            variants={PANEL_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              opacity: { duration: still ? 0.12 : 0.2, ease: 'easeOut' },
              y:       { duration: still ? 0 : 0.24, ease: [0.25, 0.46, 0.45, 0.94] },
            }}
          >
            {active === 'profil'        && <ProfileForm      initialProfile={initialProfile} email={email} />}
            {active === 'darstellung'   && <AppearanceForm   initialSettings={initialSettings} />}
            {active === 'finanzen'      && <FinanceForm      initialSettings={initialSettings} />}
            {active === 'analyse'       && <AnalyseForm      initialSettings={initialSettings} accounts={accounts} />}
            {active === 'trading'       && <TradingForm      initialSettings={initialSettings} />}
            {active === 'integrationen' && <IntegrationsForm />}
            {active === 'warteliste'    && waitlist != null && <WaitlistPanel rows={waitlist} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
