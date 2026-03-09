'use client'

import { useEffect } from 'react'
import type { SettingsMap } from '@/lib/settings'

/**
 * Invisible Client Component that applies user appearance settings to the DOM:
 * - primary_color → overrides --primary CSS variable
 * - compact_tables → sets data-compact="true" on <html>
 */
export function SettingsApplier({ settings }: { settings: SettingsMap }) {
  const primaryColor  = (settings.primary_color  as string | undefined) ?? null
  const compactTables = !!(settings.compact_tables)

  useEffect(() => {
    const root = document.documentElement

    // Primary color override
    if (primaryColor) {
      root.style.setProperty('--primary', primaryColor)
      root.style.setProperty('--ring', primaryColor)
      root.style.setProperty('--sidebar-primary', primaryColor)
    }

    // Compact tables
    if (compactTables) {
      root.setAttribute('data-compact', 'true')
    } else {
      root.removeAttribute('data-compact')
    }
  }, [primaryColor, compactTables])

  return null
}
