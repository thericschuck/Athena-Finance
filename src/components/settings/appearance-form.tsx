'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { saveAppearance, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SettingsMap } from '@/lib/settings'

const THEMES = [
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

export function AppearanceForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const { setTheme } = useTheme()

  const [selectedTheme,   setSelectedTheme]   = useState((initialSettings.theme as string) ?? 'system')
  const [primaryColor,    setPrimaryColor]    = useState((initialSettings.primary_color as string) ?? '#00B4D8')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(!!(initialSettings.sidebar_collapsed))
  const [compactTables,   setCompactTables]   = useState(!!(initialSettings.compact_tables))
  const [numberFormat,    setNumberFormat]    = useState((initialSettings.number_format as string) ?? 'de-DE')
  const [dateFormat,      setDateFormat]      = useState((initialSettings.date_format as string) ?? 'dd.MM.yyyy')

  const [state, action, pending] = useActionState<SettingsState, FormData>(saveAppearance, null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Darstellung gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  function handleThemeChange(val: string) {
    setSelectedTheme(val)
    setTheme(val)
  }

  return (
    <form action={action} className="space-y-6">
      {/* Hidden inputs for controlled values */}
      <input type="hidden" name="theme"             value={selectedTheme} />
      <input type="hidden" name="primary_color"     value={primaryColor} />
      <input type="hidden" name="sidebar_collapsed" value={String(sidebarCollapsed)} />
      <input type="hidden" name="compact_tables"    value={String(compactTables)} />
      <input type="hidden" name="number_format"     value={numberFormat} />
      <input type="hidden" name="date_format"       value={dateFormat} />

      <div>
        <h2 className="text-base font-semibold">Darstellung</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Theme, Farben und Formatierung</p>
      </div>

      {/* Theme */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Theme</label>
        <div className="flex gap-2">
          {THEMES.map(t => (
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

      {/* Primary color */}
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

      {/* Toggles */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Optionen</label>

        <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">Sidebar eingeklappt</p>
            <p className="text-xs text-muted-foreground">Sidebar standardmäßig minimiert anzeigen</p>
          </div>
          <Toggle checked={sidebarCollapsed} onChange={setSidebarCollapsed} />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">Kompakte Tabellen</p>
            <p className="text-xs text-muted-foreground">Kompaktere Darstellung in Tabellen</p>
          </div>
          <Toggle checked={compactTables} onChange={setCompactTables} />
        </div>
      </div>

      {/* Number format */}
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
