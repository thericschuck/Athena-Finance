'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { ATHENA_MODELS, ATHENA_EFFORT_OPTIONS as EFFORT_OPTIONS, type AthenaSettings } from '@/lib/assistant/settings'
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

export function AthenaSettingsForm({ settings }: { settings: AthenaSettings }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

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
    <form action={submit} className="flex max-w-2xl flex-col gap-5">
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
        <div className="grid gap-3 sm:grid-cols-2">
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

      <section className="flex flex-col gap-1.5">
        <Label htmlFor="custom_instructions">Eigene Vorgaben</Label>
        <Textarea
          id="custom_instructions"
          name="custom_instructions"
          rows={5}
          defaultValue={settings.customInstructions ?? ''}
          placeholder='z. B. Rechne Krypto immer separat vom übrigen Vermögen aus. Oder: Sprich mich mit Du an, ohne Anrede.'
        />
        <p className="text-xs text-muted-foreground">
          Kommt zusätzlich in Athenas System-Prompt. Die Sicherheitsregeln (nur echte Zahlen,
          Bestätigungspflicht bei Änderungen) lassen sich damit nicht aushebeln.
        </p>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Speichern
        </Button>
        {saved && !isPending && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Gespeichert
          </span>
        )}
      </div>
    </form>
  )
}
