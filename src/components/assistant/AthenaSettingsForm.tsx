'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { ToggleField } from '@/components/assistant/einstellungen/ToggleField'
import {
  EinstellungenTabs,
  type EinstellungenTab,
} from '@/components/assistant/einstellungen/EinstellungenTabs'

/** Gleiche Klasse wie in den App-Einstellungen (settings/profile-form.tsx).
    `bg-background` ist hier nicht kosmetisch: das native Options-Popup erbt
    die Hintergrundfarbe des <select>. Mit `bg-transparent` steht der helle
    Vordergrund des Dark-Themes auf dem weißen System-Popup — unlesbar.
    `text-base sm:text-sm` verhindert den iOS-Zoom beim Fokussieren. */
const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-2.5 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:text-sm'

/** Ruhiger Abschnitt: Überschrift, eine Zeile Beschreibung, Felder darunter. */
function Abschnitt({
  titel,
  beschreibung,
  aktion,
  children,
}: {
  titel: string
  beschreibung: string
  aktion?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{titel}</h2>
          <p className="text-xs text-muted-foreground">{beschreibung}</p>
        </div>
        {aktion}
      </div>
      {children}
    </section>
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
  const [tab, setTab] = useState<EinstellungenTab>('persoenlichkeit')

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
  const gewaehlt = ATHENA_PERSONAS.find((p) => p.id === persona)

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

  // Inaktive Reiter nur ausblenden, nie aushängen: alle Felder müssen beim
  // Speichern in der FormData stehen.
  const panel = (id: EinstellungenTab) =>
    cn('flex flex-col gap-4', tab !== id && 'hidden')

  // `noValidate`: ein ungültiger Wert in einem verdeckten Tab würde das Absenden sonst ohne
  // Meldung blockieren ("not focusable"). Die Server Action prüft ohnehin.
  return (
    <form action={submit} noValidate className="flex max-w-3xl flex-col gap-4">
      <EinstellungenTabs aktiv={tab} onChange={setTab} />

      {/* Persönlichkeit steht vorn: die Haltung ändert man am ehesten, und sie
          prägt jede Antwort. */}
      <div
        role="tabpanel"
        id="panel-persoenlichkeit"
        aria-labelledby="tab-persoenlichkeit"
        className={panel('persoenlichkeit')}
      >
        <Abschnitt
          titel="Persönlichkeit"
          beschreibung="Worauf Athena zuerst schaut und wie sie formuliert."
          aktion={
            <span className="text-xs text-muted-foreground">
              {istEigeneFassung ? 'Eigene Fassung' : `Vorlage: ${gewaehlt?.label ?? persona}`}
            </span>
          }
        >
          {/* Vorlagen als Startpunkt. Ein Klick ersetzt den Text im Feld darunter
              — danach ist alles frei editierbar. */}
          <div className="flex flex-wrap gap-2">
            {ATHENA_PERSONAS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => vorlageWaehlen(option.id)}
                aria-pressed={persona === option.id && !istEigeneFassung}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors',
                  persona === option.id && !istEigeneFassung
                    ? 'border-foreground bg-foreground font-medium text-background'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
            {istEigeneFassung && (
              <button
                type="button"
                onClick={() => vorlageWaehlen(persona)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Vorlage zurücksetzen
              </button>
            )}
          </div>

          {gewaehlt && (
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <p>{gewaehlt.hint}</p>
              <blockquote className="border-l-2 border-border pl-3 italic">{gewaehlt.beispiel}</blockquote>
            </div>
          )}

          {/* `persona` fährt als verstecktes Feld mit: der Server braucht die
              Herkunft, um einen unverändert gelassenen Text als NULL zu speichern
              statt als eingefrorene Kopie. */}
          <input type="hidden" name="persona" value={persona} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="persona_text">Haltung</Label>
            {/* `field-sizing-fixed` hebt das `field-sizing-content` der
                Textarea-Basis auf; die Höhe kommt allein aus `rows`, das Feld
                scrollt bei langem Text innen. */}
            <Textarea
              id="persona_text"
              name="persona_text"
              rows={12}
              value={personaText}
              onChange={(e) => setPersonaText(e.target.value)}
              className="field-sizing-fixed resize-y font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 max-w-prose text-xs text-muted-foreground">
                Identität, Werkzeugregeln und unverhandelbare Punkte stehen fest im Code — du kannst sie
                hier nicht wegkürzen.
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
          </div>
        </Abschnitt>

        <Abschnitt
          titel="Anweisungen"
          beschreibung="Sachvorgaben, unabhängig vom Ton — sie überleben einen Vorlagenwechsel."
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custom_instructions" className="sr-only">
              Anweisungen
            </Label>
            <Textarea
              id="custom_instructions"
              name="custom_instructions"
              rows={4}
              defaultValue={settings.customInstructions ?? ''}
              placeholder="z. B. Rechne Krypto immer separat vom übrigen Vermögen aus. Oder: Buchungen unter 5 € interessieren mich nicht."
            />
            <p className="text-xs text-muted-foreground">
              Eigener Abschnitt im Prompt; hebt die unverhandelbaren Regeln nicht auf.
            </p>
          </div>
        </Abschnitt>
      </div>

      <div role="tabpanel" id="panel-modell" aria-labelledby="tab-modell" className={panel('modell')}>
        <Abschnitt
          titel="Modell"
          beschreibung="Welches Claude-Modell antwortet und wie gründlich es nachdenkt."
          aktion={
            <Button variant="outline" size="sm" className="min-h-10 gap-1.5" asChild>
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">
                Abrechnung
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="model">Modell</Label>
              <select id="model" name="model" defaultValue={settings.model} className={selectCls}>
                {ATHENA_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} — {model.hint}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="effort">Denktiefe</Label>
              <select id="effort" name="effort" defaultValue={settings.effort} className={selectCls}>
                {EFFORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Denktiefe wirkt nur bei Opus 5 und Sonnet 5 — Haiku ignoriert sie.
          </p>
        </Abschnitt>

        <Abschnitt titel="Limits" beschreibung="Obergrenzen gegen Abbrüche und unerwartete Kosten.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="max_steps">Schritte pro Lauf</Label>
              <Input
                id="max_steps"
                name="max_steps"
                type="number"
                min={1}
                max={60}
                defaultValue={settings.maxSteps}
                className="h-10 text-base sm:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Werkzeugaufrufe pro Antwort. Zu niedrig bricht komplexe Aufträge ab.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="daily_message_cap">Nachrichten pro Tag</Label>
              <Input
                id="daily_message_cap"
                name="daily_message_cap"
                type="number"
                min={1}
                defaultValue={settings.dailyMessageCap}
                className="h-10 text-base sm:text-sm"
              />
              <p className="text-xs text-muted-foreground">Kostenbremse — greift ab Mitternacht neu.</p>
            </div>
          </div>
        </Abschnitt>
      </div>

      <div
        role="tabpanel"
        id="panel-faehigkeiten"
        aria-labelledby="tab-faehigkeiten"
        className={panel('faehigkeiten')}
      >
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">Fähigkeiten</h2>
            <p className="text-xs text-muted-foreground">Was Athena selbstständig tun darf.</p>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            <ToggleField
              name="web_research"
              label="Web-Recherche"
              hint="Sucht externes Wissen und liest Seiten. Deine Zahlen verlassen die App dabei nicht."
              defaultChecked={settings.webResearch}
            />
            <ToggleField
              name="memory_enabled"
              label="Kontext-Speicher nutzen"
              hint="Gespeicherte Fakten stehen in jeder Session im Kontext. Aus: Start ohne Vorwissen."
              defaultChecked={settings.memoryEnabled}
            />
            <ToggleField
              name="auto_memory"
              label="Selbstständig merken"
              hint="Legt Fakten von sich aus ab. Aus: sie liest den Speicher, pflegen musst du ihn selbst."
              defaultChecked={settings.autoMemory}
            />
          </div>
        </section>
      </div>

      {/* Haftet am unteren Rand des scrollenden Wrappers; das Polster darunter
          hält die letzten Felder frei. */}
      <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex flex-wrap items-center gap-3 border-t border-border bg-background px-1 py-3">
        <Button type="submit" className="min-h-10" disabled={isPending || zuLang}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Speichern
        </Button>
        {saved && !isPending && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Gespeichert
          </span>
        )}
        {error && <p className="min-w-0 text-sm text-destructive">{error}</p>}
      </div>
    </form>
  )
}
