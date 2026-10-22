import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { modellpunkte } from '@/lib/inventar/wertmodell'

/**
 * Schreibt den geschätzten Wertverlauf (`quelle = 'modell'`) für aktive Gegenstände.
 *
 * Anker ist die jüngste HANDEINGABE bis heute (alles außer `modell`): Kaufpreis, eigene
 * Schätzung, Wert aus dem Formular. Das Modell läuft von dort bis heute. Modellpunkte NACH
 * dem Anker werden bei jedem Lauf ersetzt, so ist der Aufruf wiederholbar — und trägt der
 * Nutzer später einen neuen Wert ein, wird er zum neuen Anker, ohne dass das Modell ihn
 * überschreibt. Modellpunkte VOR dem Anker bleiben als Verlauf stehen.
 *
 * Stücke mit `wertmodus = 'stabil'` bekommen keine Punkte (bereits geschriebene hinter dem
 * Anker werden entfernt).
 */
type DB = SupabaseClient<Database>

interface Zeile {
  id: string
  kategorie: string
  nutzung: string
  wertmodus: string
  gekauft_am: string | null
  kaufpreis: number | null
}

export interface SchaetzErgebnis {
  verarbeitet: number
  punkte: number
  uebersprungen: number
}

export async function schaetzeWertverlauf(
  supabase: DB,
  userId: string,
  valuableId?: string,
  heute: Date = new Date(),
): Promise<SchaetzErgebnis | { error: string }> {
  let q = supabase
    .from('valuables')
    .select('id, kategorie, nutzung, wertmodus, gekauft_am, kaufpreis')
    .eq('user_id', userId)
    .eq('is_active', true)
  if (valuableId) q = q.eq('id', valuableId)
  const { data: stuecke, error } = await q
  if (error) return { error: error.message }

  const heuteIso = heute.toISOString().split('T')[0]
  const ergebnis: SchaetzErgebnis = { verarbeitet: 0, punkte: 0, uebersprungen: 0 }

  for (const s of (stuecke ?? []) as unknown as Zeile[]) {
    const { data: bew, error: bewErr } = await supabase
      .from('valuable_valuations')
      .select('wert, bewertet_am, quelle')
      .eq('valuable_id', s.id)
      .eq('user_id', userId)
      .lte('bewertet_am', heuteIso)
      .neq('quelle', 'modell')
      .order('bewertet_am', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (bewErr) return { error: bewErr.message }

    const anker = bew as { wert: number; bewertet_am: string } | null
    if (!anker) {
      ergebnis.uebersprungen++
      continue
    }

    // Alte Modellpunkte hinter dem Anker raus, danach ggf. neu schreiben.
    const { error: delErr } = await supabase
      .from('valuable_valuations')
      .delete()
      .eq('valuable_id', s.id)
      .eq('user_id', userId)
      .eq('quelle', 'modell')
      .gt('bewertet_am', anker.bewertet_am)
    if (delErr) return { error: delErr.message }

    ergebnis.verarbeitet++
    if (s.wertmodus === 'stabil') continue

    const punkte = modellpunkte(
      {
        kategorie: s.kategorie,
        nutzung: s.nutzung,
        ankerWert: Number(anker.wert),
        ankerDatum: anker.bewertet_am,
        gekauftAm: s.gekauft_am,
        kaufpreis: s.kaufpreis === null ? null : Number(s.kaufpreis),
      },
      heute,
    )
    if (punkte.length === 0) continue

    const { error: insErr } = await supabase.from('valuable_valuations').upsert(
      punkte.map(p => ({
        valuable_id: s.id,
        user_id: userId,
        wert: p.wert,
        bewertet_am: p.datum,
        quelle: 'modell',
        notiz: 'Geschätzt nach Kategorie und Nutzung',
      })) as never,
      { onConflict: 'valuable_id,bewertet_am' },
    )
    if (insErr) return { error: insErr.message }
    ergebnis.punkte += punkte.length
  }

  return ergebnis
}
