'use client'

import { createContext, useContext, useEffect } from 'react'
import type { SettingsMap } from '@/lib/settings'

export type UserSettings = {
  locale:        string
  dateFormat:    string
  currency:      string
  compactTables: boolean
  primaryColor:  string | null
  themePreset:   string | null
}

const SettingsContext = createContext<UserSettings>({
  locale:        'de-DE',
  dateFormat:    'dd.MM.yyyy',
  currency:      'EUR',
  compactTables: false,
  primaryColor:  null,
  themePreset:   null,
})

export function useSettings(): UserSettings {
  return useContext(SettingsContext)
}

const DARK_PRESETS  = new Set(['obsidian', 'aurum', 'void', 'copper'])
const LIGHT_PRESETS = new Set(['arctic', 'sakura'])

export function SettingsProvider({
  settings,
  currency,
  children,
}: {
  settings: SettingsMap
  currency: string
  children: React.ReactNode
}) {
  const locale        = (settings.number_format as string) ?? 'de-DE'
  const dateFormat    = (settings.date_format   as string) ?? 'dd.MM.yyyy'
  const compactTables = !!(settings.compact_tables)
  const primaryColor  = (settings.primary_color as string) ?? null
  const themePreset   = (settings.theme_preset  as string) ?? null

  useEffect(() => {
    const root = document.documentElement

    if (themePreset) {
      root.setAttribute('data-theme', themePreset)
      if (DARK_PRESETS.has(themePreset)) {
        root.classList.add('dark')
        root.classList.remove('light')
      } else if (LIGHT_PRESETS.has(themePreset)) {
        root.classList.remove('dark')
        root.classList.add('light')
      }
      // Theme CSS handles all colours – clear any manual overrides
      root.style.removeProperty('--primary')
      root.style.removeProperty('--ring')
      root.style.removeProperty('--sidebar-primary')
    } else {
      root.removeAttribute('data-theme')
      if (primaryColor) {
        root.style.setProperty('--primary',         primaryColor)
        root.style.setProperty('--ring',            primaryColor)
        root.style.setProperty('--sidebar-primary', primaryColor)
      }
    }

    if (compactTables) root.setAttribute('data-compact', 'true')
    else root.removeAttribute('data-compact')
  }, [themePreset, primaryColor, compactTables])

  return (
    <SettingsContext.Provider value={{ locale, dateFormat, currency, compactTables, primaryColor, themePreset }}>
      {children}
    </SettingsContext.Provider>
  )
}
