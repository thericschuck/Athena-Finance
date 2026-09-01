import { createClient } from '@/lib/supabase/server'
import { KnowledgeManager, type KnowledgeRow } from '@/components/assistant/KnowledgeManager'

export const dynamic = 'force-dynamic'

export default async function AthenaKnowledgePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('ai_knowledge')
    .select('id, title, content, tags, source_url, source, pinned, updated_at')
    .eq('user_id', user.id)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <KnowledgeManager entries={(data ?? []) as KnowledgeRow[]} />
    </div>
  )
}
