'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { saveAppearance, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SettingsMap } from '@/lib/settings'
import { Check } from 'lucide-react'

// ─── Theme Presets ────────────────────────────────────────────────────────────

const THEME_PRESETS = [
  {
    id:     'obsidian',
    name:   'Obsidian Terminal',
    desc:   'Dark · Monospace · Bloomberg',
    bg:     '#030303',
    card:   '#0c0c0c',
    fg:     '#e2e8f0',
    accent: '#00d4ff',
    border: 'rgba(255,255,255,0.08)',
    dark:   true,
  },
  {
    id:     'aurum',
    name:   'Aurum',
    desc:   'Dark · Serif · Luxury Finance',
    bg:     '#0c0800',
    card:   '#130d00',
    fg:     '#f0e6c8',
    accent: '#d4a017',
    border: 'rgba(212,160,23,0.25)',
    dark:   true,
  },
  {
    id:     'arctic',
    name:   'Arctic',
    desc:   'Light · Clean · Nordic SaaS',
    bg:     '#f8fafc',
    card:   '#ffffff',
    fg:     '#0f172a',
    accent: '#2563eb',
    border: '#e2e8f0',
    dark:   false,
  },
  {
    id:     'void',
    name:   'Void',
    desc:   'Dark · Neon · Deep Space',
    bg:     '#05050f',
    card:   '#0a0a1e',
    fg:     '#e0e7ff',
    accent: '#818cf8',
    border: 'rgba(129,140,248,0.2)',
    dark:   true,
  },
  {
    id:     'copper',
    name:   'Copper Wire',
    desc:   'Dark · Industrial · Warm',
    bg:     '#0a0502',
    card:   '#130900',
    fg:     '#f0e0c0',
    accent: '#c86820',
    border: 'rgba(200,104,32,0.2)',
    dark:   true,
  },
  {
    id:     'sakura',
    name:   'Sakura',
    desc:   'Light · Serif · Editorial',
    bg:     '#fffaf8',
    card:   '#ffffff',
    fg:     '#1a0f13',
    accent: '#e84077',
    border: '#f0d6e0',
    dark:   false,
  },
] as const

type PresetId = typeof THEME_PRESETS[number]['id'] | ''

// ─── Color fallback (no preset) ───────────────────────────────────────────────

const BASE_THEMES = [
  { value: 'light',  label: 'Hell' },
  { value: 'dark',   label: 'Dunkel' },
  { value: 'system', label: 'System' },
]

const COLORS = [
  { label: 'Blau',    value: '#00B4D8' },
  { label: 'Grün',    value: '#00C96B' },
  { label: 'Violett', value: '#7B2FBE' },
  { label: 'Orange',  value: '#FF8C00' },
  { label: 'Rose',    value: '#FF4466' },
  { label: 'Slate',   value: '#64748B' },
]

const NUMBER_FORMATS = [
  { value: 'de-DE', label: '1.234,56 (Deutsch)' },
  { value: 'en-US', label: '1,234.56 (Englisch)' },
  { value: 'fr-FR', label: '1 234,56 (Französisch)' },
]

const DATE_FORMATS = [
  { value: 'dd.MM.yyyy', label: '27.10.2025' },
  { value: 'MM/dd/yyyy', label: '10/27/2025' },
  { value: 'yyyy-MM-dd', label: '2025-10-27' },
]

const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  )
}

// ─── Mini preview card ────────────────────────────────────────────────────────

function ThemePreviewCard({
  preset,
  selected,
  onSelect,
}: {
  preset: typeof THEME_PRESETS[number]
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative rounded-xl border-2 overflow-hidden text-left transition-all duration-150 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]' : 'border-border hover:border-muted-foreground/40'
      )}
    >
      {/* Mini UI preview */}
      <div className="h-24 w-full relative" style={{ background: preset.bg }}>
        {/* Sidebar strip */}
        <div
          className="absolute left-0 top-0 bottom-0 w-8"
          style={{ background: preset.bg, borderRight: `1px solid ${preset.border}` }}
        >
          <div className="mt-3 mx-1.5 space-y-1">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-1.5 rounded-full"
                style={{ background: i === 1 ? preset.accent : preset.border, width: i === 1 ? '80%' : '60%', opacity: i === 1 ? 1 : 0.4 }}
              />
            ))}
          </div>
        </div>
        {/* Content area */}
        <div className="absolute left-9 right-0 top-0 bottom-0 p-2">
          <div className="flex items-center justify-between mb-2">
            <div className="h-2 w-12 rounded" style={{ background: preset.fg, opacity: 0.9 }} />
            <div className="h-4 w-10 rounded" style={{ background: preset.accent }} />
          </div>
          <div className="grid grid-cols-2 gap-1 mb-2">
            {[1, 2].map(i => (
              <div key={i} className="h-8 rounded" style={{ background: preset.card, border: `1px solid ${preset.border}` }}>
                <div className="p-1">
                  <div className="h-1 w-8 rounded mb-1" style={{ background: preset.fg, opacity: 0.3 }} />
                  <div className="h-1.5 w-6 rounded" style={{ background: i === 1 ? '#22c55e' : '#ef4444', opacity: 0.8 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="h-6 rounded" style={{ background: preset.card, border: `1px solid ${preset.border}` }} />
        </div>
      </div>

      {/* Label */}
      <div className="px-3 py-2 bg-card border-t border-border">
        <p className="text-xs font-semibold text-foreground">{preset.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</p>
      </div>

      {/* Selected checkmark */}
      {selected && (
        <div
          className="absolute top-1.5 right-1.5 size-5 rounded-full flex items-center justify-center"
          style={{ background: preset.accent }}
        >
          <Check className="size-3" style={{ color: preset.bg }} />
        </div>
      )}
    </button>
  )
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export function AppearanceForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const { setTheme } = useTheme()

  const [themePreset,     setThemePreset]     = useState<PresetId>((initialSettings.theme_preset as PresetId) ?? '')
  const [selectedTheme,   setSelectedTheme]   = useState((initialSettings.theme as string) ?? 'system')
  const [primaryColor,    setPrimaryColor]    = useState((initialSettings.primary_color as string) ?? '#00B4D8')
  const [compactTables,   setCompactTables]   = useState(!!(initialSettings.compact_tables))
  const [numberFormat,    setNumberFormat]    = useState((initialSettings.number_format as string) ?? 'de-DE')
  const [dateFormat,      setDateFormat]      = useState((initialSettings.date_format as string) ?? 'dd.MM.yyyy')

  const [state, action, pending] = useActionState<SettingsState, FormData>(saveAppearance, null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Darstellung gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  function handlePresetSelect(id: PresetId) {
    setThemePreset(id)
    const root = document.documentElement
    if (id) {
      root.setAttribute('data-theme', id)
      const preset = THEME_PRESETS.find(p => p.id === id)
      if (preset) {
        root.classList[preset.dark ? 'add' : 'remove']('dark')
        root.classList[preset.dark ? 'remove' : 'add']('light')
        setTheme(preset.dark ? 'dark' : 'light')
      }
      root.style.removeProperty('--primary')
      root.style.removeProperty('--ring')
      root.style.removeProperty('--sidebar-primary')
    } else {
      root.removeAttribute('data-theme')
    }
  }

  function handleThemeChange(val: string) {
    setSelectedTheme(val)
    setTheme(val)
  }

  return (
    <form action={action} className="space-y-8">
      {/* Hidden inputs */}
      <input type="hidden" name="theme_preset"      value={themePreset} />
      <input type="hidden" name="theme"             value={selectedTheme} />
      <input type="hidden" name="primary_color"     value={primaryColor} />
      <input type="hidden" name="compact_tables" value={String(compactTables)} />
      <input type="hidden" name="number_format"     value={numberFormat} />
      <input type="hidden" name="date_format"       value={dateFormat} />

      <div>
        <h2 className="text-base font-semibold">Darstellung</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Theme, Farben und Formatierung</p>
      </div>

      {/* Theme Presets */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Theme</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEME_PRESETS.map(preset => (
            <ThemePreviewCard
              key={preset.id}
              preset={preset}
              selected={themePreset === preset.id}
              onSelect={() => handlePresetSelect(preset.id)}
            />
          ))}
        </div>

        {/* "No preset" / custom option */}
        <button
          type="button"
          onClick={() => handlePresetSelect('')}
          className={cn(
            'w-full rounded-lg border px-4 py-2.5 text-sm text-left transition-colors',
            themePreset === ''
              ? 'border-primary bg-primary/5 text-primary font-medium'
              : 'border-border text-muted-foreground hover:border-foreground/30'
          )}
        >
          Eigene Farbe verwenden (kein Preset)
        </button>
      </div>

      {/* Custom mode: dark/light + accent color */}
      {themePreset === '' && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium">Hell / Dunkel</label>
            <div className="flex gap-2">
              {BASE_THEMES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleThemeChange(t.value)}
                  className={cn(
                    'flex-1 rounded-md border px-4 py-2 text-sm transition-colors',
                    selectedTheme === t.value
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Akzentfarbe</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setPrimaryColor(c.value)}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-all',
                    primaryColor === c.value ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Toggles */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Optionen</label>

        <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">Kompakte Tabellen</p>
            <p className="text-xs text-muted-foreground">Kompaktere Darstellung in Tabellen</p>
          </div>
          <Toggle checked={compactTables} onChange={setCompactTables} />
        </div>
      </div>

      {/* Formats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Zahlenformat</label>
          <select
            className={selectCls}
            value={numberFormat}
            onChange={e => setNumberFormat(e.target.value)}
          >
            {NUMBER_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Datumsformat</label>
          <select
            className={selectCls}
            value={dateFormat}
            onChange={e => setDateFormat(e.target.value)}
          >
            {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
