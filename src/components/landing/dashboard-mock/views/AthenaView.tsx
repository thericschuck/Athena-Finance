import { AlertTriangle, ArrowUp, Check, MessageSquare, Plus, X } from 'lucide-react'
import { AthenaAvatar } from '@/components/assistant/AthenaAvatar'
import { ATHENA_ACTION, ATHENA_SESSIONS } from '@/components/landing/dashboard-mock/mock-data'

// Rein statische Szene (kein State, keine Handler); AthenaAvatar ist selbst die
// einzige Client-Grenze darin.

/**
 * Athena-Szene — der Chat-Tab, aufgebaut wie die echte Seite
 * (app/(dashboard)/assistant/page.tsx): links die Session-Liste, rechts das
 * Gespräch mit Eingabezeile darunter.
 *
 * Klassen und Markup sind aus AthenaChat, SessionList und PendingActionCard
 * übernommen, nicht nachempfunden — möglich, seit das Mockup auf
 * data-theme="athena-dark" läuft: bg-muted, bg-primary, text-muted-foreground
 * und border-border treffen hier dieselben Farben wie in der App.
 *
 * Nachgebaut statt importiert: AthenaChat ist ein 30-KB-Client mit
 * Streaming-Anbindung an /api/assistant, SessionList und PendingActionCard
 * hängen an Server-Actions. Auf der Landing Page wären das Bedienelemente,
 * die entweder nichts tun oder echte Anfragen auslösen — und sie zögen den
 * halben Assistenten in ein Bundle, das ihn sonst nicht braucht.
 * AthenaAvatar ist die Ausnahme und wird direkt verwendet: reine Darstellung,
 * keine Logik.
 *
 * Der Verlauf endet bewusst auf einem VORSCHLAG statt auf einer erledigten
 * Änderung: dass Athena Schreibaktionen nur vorschlägt und erst ein Klick sie
 * ausführt, ist das Prinzip des Assistenten — in einem Standbild lässt es
 * sich nur so zeigen.
 */
export function AthenaView() {
  return (
    <div className="mock-athena">
      <aside className="mock-athena-sessions flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sessions</span>
          <Plus className="size-3.5 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-1.5">
          {ATHENA_SESSIONS.map((sess) => (
            <div
              key={sess.title}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                sess.active ? 'bg-accent text-foreground' : 'text-muted-foreground'
              }`}
            >
              <MessageSquare className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{sess.title}</span>
              <span className="shrink-0 text-[10px] opacity-70">{sess.when}</span>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          <div className="max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            Wie viel zahle ich diesen Monat für Abos?
          </div>

          <div className="flex gap-2.5">
            <AthenaAvatar size={28} className="mt-0.5" />
            <div className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              87,94 € auf sechs Verträge. Zwei davon hast du seit Juni nicht mehr
              benutzt: <span className="font-medium">Cloud Pro</span> (14,99 €) und
              Design Suite (24,00 €).
            </div>
          </div>

          <div className="max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            Kündige Cloud Pro zum nächstmöglichen Termin.
          </div>

          {/* Bestätigungskarte — Aufbau 1:1 wie PendingActionCard: Icon,
              Klartext-Satz, darunter die Aufschlüsselung, auf der die
              Entscheidung beruht, und erst dann die beiden Knöpfe. */}
          <div className="flex gap-2.5">
            <AthenaAvatar size={28} className="mt-0.5" />
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-medium text-foreground">{ATHENA_ACTION.summary}</p>
                  <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                    {ATHENA_ACTION.details.map((d) => (
                      <li key={d.label} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 flex-1 text-muted-foreground">{d.label}</span>
                        <span className="shrink-0 text-right font-medium tabular-nums text-foreground">{d.value}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Athena schlägt das vor — noch wurde nichts geändert.
                    <span className="ml-1.5 opacity-60">{ATHENA_ACTION.label}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2 pl-6">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                  <Check className="size-3.5" aria-hidden />
                  Bestätigen
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <X className="size-3.5" aria-hidden />
                  Verwerfen
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-input bg-card px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Frag Athena…</span>
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ArrowUp className="size-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
