'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase
        .from('user_settings')
        .select('key, value')
        .eq('user_id', user.id)
        .then(({ data }) => {
          setSettings(Object.fromEntries((data ?? []).map(r => [r.key, r.value])))
          setLoading(false)
        })
    })
  }, [])

  return { settings, loading }
}
