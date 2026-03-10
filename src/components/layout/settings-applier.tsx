'use client'

import { useEffect } from 'react'
import type { SettingsMap } from '@/lib/settings'

const DARK_PRESETS  = new Set(['obsidian', 'aurum', 'void', 'copper'])
const LIGHT_PRESETS = new Set(['arctic', 'sakura'])

export function SettingsApplier({ settings }: { settings: SettingsMap }) {
  const themePreset   = (settings.theme_preset  as string | undefined) ?? null
  const primaryColor  = (settings.primary_color as string | undefined) ?? null
  const compactTables = !!(settings.compact_tables)

  useEffect(() => {
    const root = document.documentElement

    if (themePreset) {
      root.setAttribute('data-theme', themePreset)
      // Apply dark/light class so Tailwind `dark:` variants work correctly
      if (DARK_PRESETS.has(themePreset)) {
        root.classList.add('dark')
        root.classList.remove('light')
      } else if (LIGHT_PRESETS.has(themePreset)) {
        root.classList.remove('dark')
        root.classList.add('light')
      }
      // Clear any manual primary color overrides – theme CSS handles everything
      root.style.removeProperty('--primary')
      root.style.removeProperty('--ring')
      root.style.removeProperty('--sidebar-primary')
    } else {
      root.removeAttribute('data-theme')
      // Fall back to manual primary color when no preset is active
      if (primaryColor) {
        root.style.setProperty('--primary', primaryColor)
        root.style.setProperty('--ring', primaryColor)
        root.style.setProperty('--sidebar-primary', primaryColor)
      }
    }

    if (compactTables) root.setAttribute('data-compact', 'true')
    else root.removeAttribute('data-compact')
  }, [themePreset, primaryColor, compactTables])

  return null
}
