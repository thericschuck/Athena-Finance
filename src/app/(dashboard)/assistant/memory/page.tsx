import { createClient } from '@/lib/supabase/server'
import { MemoryManager, type MemoryRow } from '@/components/assistant/MemoryManager'

export const dynamic = 'force-dynamic'

export default async function AthenaMemoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('ai_memories')
    .select('id, key, content, category, source, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <MemoryManager memories={(data ?? []) as MemoryRow[]} />
    </div>
  )
}
