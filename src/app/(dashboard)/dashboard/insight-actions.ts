'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Blendet einen von Athena erzeugten Hinweis aus. Bewusst kein DELETE: der
 * Hinweis bleibt als Beleg dafür erhalten, was Athena wann bemerkt hat, und
 * verschwindet nur aus der Dashboard-Ansicht (die auf `dismissed_at is null`
 * filtert).
 */
export async function dismissInsight(id: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('insights')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}
