import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'

// Obergrenze, damit die IN-Liste der Abfrage nicht unbegrenzt waechst; die UI teilt
// groessere Auswahlen nicht auf, sondern begrenzt die Auswahl selbst.
const MAX_IDS = 200

const bodySchema = z.object({
  ids: z.array(uuid).min(1).max(MAX_IDS),
  category_id: z.union([uuid, z.literal(''), z.null()]).transform(v => v || null),
})

/**
 * PATCH /api/bank/transactions/bulk
 * Body: { ids: uuid[] (max 200), category_id: uuid | null }
 *
 * Setzt die Kategorie fuer mehrere Buchungen in EINER Abfrage (statt 200 Einzel-PATCHes).
 * Wie die Einzelroute markiert sie die Quelle als 'manual', damit die automatische
 * Kategorisierung die Entscheidung nicht wieder ueberschreibt. Zusaetzlich zu RLS filtert
 * `.eq('user_id')`; fremde IDs werden einfach nicht gezaehlt.
 */
export async function PATCH(request: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const b = await parseBody(request, bodySchema)
  if (b.response) return b.response
  const { ids, category_id: categoryId } = b.data

  // Der Fremdschluessel prueft nur, dass die Kategorie EXISTIERT, nicht wem sie gehoert.
  if (categoryId) {
    const { data: kat } = await supabase
      .from('categories').select('id').eq('id', categoryId).eq('user_id', user.id).maybeSingle()
    if (!kat) return NextResponse.json({ error: 'Kategorie nicht gefunden' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('bank_transactions')
    .update({ category_id: categoryId, category_source: categoryId ? 'manual' : null })
    .in('id', [...new Set(ids)])
    .eq('user_id', user.id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updated: data?.length ?? 0 })
}
