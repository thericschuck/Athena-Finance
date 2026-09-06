'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  ATHENA_MODELS,
  ATHENA_PERSONAS,
  ATHENA_TEXT_MAX,
  ATHENA_EFFORT_OPTIONS as EFFORT_OPTIONS,
  type AthenaPersona,
  type AthenaSettings,
} from '@/lib/assistant/settings'
import { saveAthenaSettings } from '@/app/(dashboard)/assistant/actions'

/** Gleiche Klasse wie in den App-Einstellungen (settings/profile-form.tsx).
    `bg-background` ist hier nicht kosmetisch: das native Options-Popup erbt
    die Hintergrundfarbe des <select>. Mit `bg-transparent` steht der helle
    Vordergrund des Dark-Themes auf dem weißen System-Popup — unlesbar. */
const selectCls =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

/** Checkbox von Radix liefert keinen Formularwert — ein verstecktes Input
    daneben trägt den Zustand in die FormData, damit die Server Action mit dem
    üblichen `=== 'on'` auskommt. */
function ToggleField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string
  label: string
  hint: string
  defaultChecked: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked)
  return (
    <label
      htmlFor={name}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
    >
      <Checkbox
        id={name}
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
        className="mt-0.5"
      />
      {checked && <input type="hidden" name={name} value="on" />}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

export function AthenaSettingsForm({
  settings,
  templates,
}: {
  settings: AthenaSettings
  /** Die eingebauten Vorlagentexte, aus der Server-Komponente. */
  templates: Record<AthenaPersona, string>
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Die Haltung ist ein freies Textfeld; `persona` merkt sich nur, welche
  // Vorlage der Startpunkt war. Ein Klick auf eine Vorlage ersetzt den Text —
  // deshalb kontrolliert und nicht `defaultValue`, sonst ruehrt sich das Feld
  // beim Umschalten nicht.
  const [persona, setPersona] = useState<AthenaPersona>(settings.persona)
  const [personaText, setPersonaText] = useState(
    settings.personaText ?? templates[settings.persona] ?? '',
  )
  // Vergleich gegen die Vorlage statt eines eigenen "geaendert"-Flags: so ist
  // der Zustand nach Zurueckstellen automatisch wieder "Vorlage", ohne dass
  // irgendwo ein Flag nachgezogen werden muss. Genau dieselbe Regel entscheidet
  // serverseitig, ob NULL oder eine Kopie gespeichert wird.
  const vorlagentext = (templates[persona] ?? '').trim()
  const istEigeneFassung = personaText.trim() !== vorlagentext
  const zuLang = personaText.length > ATHENA_TEXT_MAX

  function vorlageWaehlen(id: AthenaPersona) {
    setPersona(id)
    setPersonaText(templates[id] ?? '')
  }

  function submit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveAthenaSettings(formData)
      if (result && 'error' in result) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form action={submit} className="flex h-full min-h-0 max-w-2xl flex-col gap-4 lg:max-w-none">
      {/* Ab lg zwei Spalten: links die Schalter (kurz, selten angefasst),
          rechts die beiden Textfelder (lang, staendig in Arbeit). Ziel ist,
          dass auf einem breiten Schirm nichts mehr gescrollt werden muss —
          darunter stapelt es wie vorher.
          Die linke Spalte waechst in drei Stufen mit, statt eine feste Breite
          zu haben: bei genau 1024 px bleiben nach Seitenleiste und Padding nur
          rund 740 px Inhalt, da wuerde eine breite linke Spalte das Textfeld
          rechts erdruecken. Ab xl und 2xl ist der Platz wirklich da. */}
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:gap-8 2xl:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        {/* Linke Spalte scrollt notfalls fuer sich, damit sie auf kurzen
            Schirmen nicht die rechte Spalte mitzieht. */}
        <div className="flex flex-col gap-5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Modell</h2>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">
                Abrechnung
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
            {/* Nebeneinander, sobald die Spalte es traegt: bei 24rem wuerden die
              Hinweistexte in den Optionen abgeschnitten, ab 28rem nicht mehr. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model">Modell</Label>
              <select
                id="model"
                name="model"
                defaultValue={settings.model}
                className={selectCls}
              >
                {ATHENA_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} — {model.hint}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effort">Denktiefe</Label>
              <select
                id="effort"
                name="effort"
                defaultValue={settings.effort}
                className={selectCls}
              >
                {EFFORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Denktiefe wirkt nur bei Opus 5 und Sonnet 5 — Haiku unterstützt sie nicht und ignoriert die
            Einstellung.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Fähigkeiten</h2>
          <ToggleField
            name="web_research"
            label="Web-Recherche"
            hint="Athena darf für externes Wissen (Marktdaten, Steuerregeln, Anbieter) suchen und Seiten lesen. Deine eigenen Zahlen verlassen die App dabei nicht."
            defaultChecked={settings.webResearch}
          />
          <ToggleField
            name="memory_enabled"
            label="Kontext-Speicher nutzen"
            hint="Gespeicherte Fakten stehen bei jeder Session im Kontext. Aus heißt: Athena startet jedes Gespräch ohne Vorwissen über dich."
            defaultChecked={settings.memoryEnabled}
          />
          <ToggleField
            name="auto_memory"
            label="Selbstständig merken"
            hint="Athena legt Fakten von sich aus ab. Aus heißt: sie liest den Speicher weiter, pflegen musst du ihn selbst."
            defaultChecked={settings.autoMemory}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Leitplanken</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="max_steps">Schritte pro Lauf</Label>
              <Input
                id="max_steps"
                name="max_steps"
                type="number"
                min={1}
                max={60}
                defaultValue={settings.maxSteps}
              />
              <p className="text-xs text-muted-foreground">
                Obergrenze für Werkzeugaufrufe in einer Antwort. Zu niedrig bricht komplexe Aufträge ab.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daily_message_cap">Nachrichten pro Tag</Label>
              <Input
                id="daily_message_cap"
                name="daily_message_cap"
                type="number"
                min={1}
                defaultValue={settings.dailyMessageCap}
              />
              <p className="text-xs text-muted-foreground">Kostenbremse — greift ab Mitternacht neu.</p>
            </div>
          </div>
        </section>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
        {/* Steht vor „Modell": die Haltung ist die Entscheidung, die man am
            ehesten ändert, und sie prägt jede Antwort — anders als Denktiefe oder
            Schrittlimit, die man einmal einstellt und dann vergisst. */}
        <section className="flex min-h-0 flex-col gap-3 lg:flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Persönlichkeit</h2>
            <span className="text-xs text-muted-foreground">
              {istEigeneFassung
                ? 'Eigene Fassung'
                : `Vorlage: ${ATHENA_PERSONAS.find((p) => p.id === persona)?.label ?? persona}`}
            </span>
          </div>

          {/* Vorlagen als Startpunkt. Ein Klick ersetzt den Text im Feld darunter
              — danach ist alles frei editierbar. */}
          <div className="flex flex-wrap gap-1.5">
            {ATHENA_PERSONAS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => vorlageWaehlen(option.id)}
                title={option.hint}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                  persona === option.id && !istEigeneFassung
                    ? 'border-primary bg-primary/5 font-medium text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
            {istEigeneFassung && (
              <button
                type="button"
                onClick={() => vorlageWaehlen(persona)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-destructive/40 hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Vorlage zurücksetzen
              </button>
            )}
          </div>

          {/* `persona` fährt als verstecktes Feld mit: der Server braucht die
              Herkunft, um einen unverändert gelassenen Text als NULL zu speichern
              statt als eingefrorene Kopie. */}
          <input type="hidden" name="persona" value={persona} />
          {/* `field-sizing-fixed` hebt das `field-sizing-content` der
              Textarea-Basis auf: das laesst das Feld mit dem Inhalt wachsen und
              wuerde `h-full` in einem Flex-Container ignorieren. Der Wrapper
              traegt die Hoehe, damit `min-h-0` greift und das Feld INNEN scrollt
              statt die Seite nach unten zu schieben. */}
          <div className="min-h-40 flex-1 lg:min-h-0">
            <Textarea
              id="persona_text"
              name="persona_text"
              rows={12}
              value={personaText}
              onChange={(e) => setPersonaText(e.target.value)}
              className="field-sizing-fixed h-full resize-none font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="max-w-prose text-xs text-muted-foreground">
              Worauf Athena zuerst schaut und wie sie formuliert. Was hier fehlt, gilt trotzdem:
              Identität, Werkzeugregeln und die unverhandelbaren Punkte stehen fest im Code — du
              kannst sie hier nicht versehentlich wegkürzen.
            </p>
            <span
              className={cn(
                'shrink-0 text-xs tabular-nums',
                zuLang ? 'font-medium text-destructive' : 'text-muted-foreground',
              )}
            >
              {personaText.length.toLocaleString('de-DE')} / {ATHENA_TEXT_MAX.toLocaleString('de-DE')}
            </span>
          </div>
        </section>

        <section className="flex shrink-0 flex-col gap-1.5">
          <Label htmlFor="custom_instructions">Anweisungen</Label>
          <Textarea
            id="custom_instructions"
            name="custom_instructions"
            rows={4}
            defaultValue={settings.customInstructions ?? ''}
            placeholder="z. B. Rechne Krypto immer separat vom übrigen Vermögen aus. Oder: Buchungen unter 5 € interessieren mich nicht."
          />
          <p className="max-w-prose text-xs text-muted-foreground">
            Sachvorgaben, unabhängig vom Ton — und anders als die Persönlichkeit überleben sie einen
            Vorlagenwechsel. Eigener Abschnitt im Prompt; hebt die unverhandelbaren Regeln nicht auf.
          </p>
        </section>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border pt-3">
        <Button type="submit" disabled={isPending || zuLang}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Speichern
        </Button>
        {saved && !isPending && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Gespeichert
          </span>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  )
}
