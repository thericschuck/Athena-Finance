'use client'

import { createContext, useContext, useEffect } from 'react'
import type { SettingsMap } from '@/lib/settings'

export type UserSettings = {
  locale:        string
  dateFormat:    string
  currency:      string
  compactTables: boolean
  primaryColor:  string | null
}

const SettingsContext = createContext<UserSettings>({
  locale:        'de-DE',
  dateFormat:    'dd.MM.yyyy',
  currency:      'EUR',
  compactTables: false,
  primaryColor:  null,
})

export function useSettings(): UserSettings {
  return useContext(SettingsContext)
}

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

  useEffect(() => {
    const root = document.documentElement

    if (primaryColor) {
      root.style.setProperty('--primary',         primaryColor)
      root.style.setProperty('--ring',            primaryColor)
      root.style.setProperty('--sidebar-primary', primaryColor)
    }

    if (compactTables) {
      root.setAttribute('data-compact', 'true')
    } else {
      root.removeAttribute('data-compact')
    }
  }, [primaryColor, compactTables])

  return (
    <SettingsContext.Provider value={{ locale, dateFormat, currency, compactTables, primaryColor }}>
      {children}
    </SettingsContext.Provider>
  )
}
