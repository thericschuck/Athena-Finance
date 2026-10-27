import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { z } from 'zod'
import { parseBody, parseParams } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'

const paramsSchema = z.object({ id: uuid })
// category_id muss vorhanden sein (null oder '' entfernt die Kategorie).
const bodySchema = z.object({
  category_id: z.union([uuid, z.literal(''), z.null()]).transform(v => v || null),
})

/**
 * PATCH /api/bank/transactions/:id
 * Body: { category_id: string | null }
 *
 * Updates the category of a single transaction. RLS limits access to the household (every member may edit).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const p = parseParams(await params, paramsSchema)
  if (p.response) return p.response
  const b = await parseBody(request, bodySchema)
  if (b.response) return b.response
  const { id } = p.data
  const categoryId = b.data.category_id

  // Der Fremdschluessel prueft nur, dass die Kategorie EXISTIERT; die RLS zeigt nur Kategorien des Haushalts.
  if (categoryId) {
    const { data: kat } = await supabase
      .from('categories').select('id').eq('id', categoryId).maybeSingle()
    if (!kat) return NextResponse.json({ error: 'Kategorie nicht gefunden' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('bank_transactions')
    .update({ category_id: categoryId, category_source: categoryId ? 'manual' : null })
    .eq('id', id)
    .select('id, category_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })

  return NextResponse.json({ transaction: data })
}
