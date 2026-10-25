import { getAuthUser } from '@/lib/supabase/server'
import { MemoryManager, type MemoryRow } from '@/components/assistant/MemoryManager'

export const dynamic = 'force-dynamic'

export default async function AthenaMemoryPage() {
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  const { data } = await supabase
    .from('ai_memories')
    .select('id, key, content, category, source, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto pb-6">
      <MemoryManager memories={(data ?? []) as MemoryRow[]} />
    </div>
  )
}
