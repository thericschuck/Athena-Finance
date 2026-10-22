import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { estimateCostUsd } from '@/lib/assistant/cost'
import { createLogger } from '@/lib/assistant/logger'
import { normalizeIban } from './categorize'
import { klassifiziereStapel } from './ai-categorize'
import {
  KI_SETTINGS_KEY, kategorieOptionen, leseKiConfig,
  type KiBeispiel, type KiBuchung, type KiConfig,
} from './ai-categorize-regeln'

type DB = SupabaseClient<Database>

const STANDARD: KiConfig = { enabled: true, model: 'claude-haiku-4-5', mindestens: 'hoch', maxProLauf: 60, stapel: 15 }
/** Wie bei der Prüfung des Wochenlaufs: ein Lauf endet vor Vercels Zeitlimit und behält, was bis dahin entschieden ist. */
const ZEITLIMIT_MS = 200_000

export type KiLaufErgebnis =
  | { status: 'uebersprungen'; grund: string }
  | {
      status: 'fertig'
      modell: string
      kandidaten: number
      angewandt: number
      verworfen: number
      kostenUsd: number | null
      abgebrochen: boolean
      trockenlauf: boolean
      /** Trefferquote bisheriger KI-Zuordnungen: bestätigt (unverändert geblieben) vs. korrigiert. */
      bilanz: { offen: number; korrigiert: number }
      beispiele: { gegenpartei: string | null; text: string; betrag: number; kategorie: string }[]
    }

async function leseSeiten<T>(frage: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const aus: T[] = []
  for (let seite = 0; seite < 10; seite++) {
    const { data, error } = await frage(seite * 1000, seite * 1000 + 999)
    if (error) throw new Error(error.message)
    aus.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return aus
}

/**
 * Ordnet unkategorisierte Bankbuchungen per KI zu — die dritte Stufe nach festen Regeln und gelernter Zuordnung.
 * Schreibt nur `category_id`, `category_source = 'ai'` und `ai_category_id`, und nur bei Zeilen, die beim Schreiben
 * noch keine Kategorie haben. Eigene Umbuchungen (Gegen-IBAN = eigenes Konto) bleiben außen vor.
 */
export async function kategorisiereMitKi(supabase: DB, userId: string, opts: { trockenlauf?: boolean } = {}): Promise<KiLaufErgebnis> {
  const log = createLogger(supabase, userId, null)
  const { data: cfgRow } = await supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', KI_SETTINGS_KEY).maybeSingle()
  const cfg = leseKiConfig(cfgRow?.value, STANDARD)
  if (!cfg.enabled) return { status: 'uebersprungen', grund: 'KI-Kategorisierung ist in user_settings.ai_categorization deaktiviert.' }

  const [{ data: kategorien }, { data: eigene }] = await Promise.all([
    supabase.from('categories').select('id, name, type, parent_id').eq('user_id', userId),
    supabase.from('accounts').select('bank_iban').eq('user_id', userId).not('bank_iban', 'is', null),
  ])
  const katList = kategorien ?? []
  const eigeneIbans = new Set((eigene ?? []).map(a => normalizeIban(a.bank_iban as string)))

  const { data: offen, error: offenFehler } = await supabase
    .from('bank_transactions')
    .select('id, counterpart_name, counterpart_iban, description, amount')
    .eq('user_id', userId)
    .is('category_id', null)
    .order('value_date', { ascending: false })
    .limit(cfg.maxProLauf * 2)
  if (offenFehler) throw new Error(offenFehler.message)

  const kandidaten: KiBuchung[] = (offen ?? [])
    .filter(r => !(r.counterpart_iban && eigeneIbans.has(normalizeIban(r.counterpart_iban))))
    .slice(0, cfg.maxProLauf)
    .map(r => ({ id: r.id, counterpart_name: r.counterpart_name, description: r.description, amount: Number(r.amount) }))

  // Trefferquote bisheriger KI-Zuordnungen: Zeilen mit KI-Vorschlag, die der Nutzer seitdem geändert hat.
  const ki = await leseSeiten(async (von, bis) => await supabase.from('bank_transactions')
    .select('category_id, category_source, ai_category_id, counterpart_name, description, amount')
    .eq('user_id', userId).not('ai_category_id', 'is', null).range(von, bis))
  const bilanz = {
    offen: ki.filter(r => r.category_source === 'ai').length,
    korrigiert: ki.filter(r => r.category_source === 'manual' && r.category_id !== r.ai_category_id).length,
  }

  if (kandidaten.length === 0) {
    return { status: 'fertig', modell: cfg.model, kandidaten: 0, angewandt: 0, verworfen: 0, kostenUsd: 0, abgebrochen: false, trockenlauf: !!opts.trockenlauf, bilanz, beispiele: [] }
  }

  // Beispiele: nur Entscheidungen des Nutzers (nicht Regel- oder KI-Treffer), damit die KI nicht von sich selbst lernt.
  const entschieden = await leseSeiten(async (von, bis) => await supabase.from('bank_transactions')
    .select('counterpart_name, description, amount, category_id')
    .eq('user_id', userId).not('category_id', 'is', null).or('category_source.is.null,category_source.eq.manual')
    .range(von, bis))
  const beispiele: KiBeispiel[] = entschieden.map(r => ({
    counterpart_name: r.counterpart_name, description: r.description, amount: Number(r.amount), category_id: r.category_id as string,
  }))
  // Die letzten Korrekturen: dort lag die KI falsch, und der Nutzer hat entschieden.
  const korrekturen: KiBeispiel[] = ki
    .filter(r => r.category_source === 'manual' && r.category_id && r.category_id !== r.ai_category_id)
    .slice(0, 8)
    .map(r => ({ counterpart_name: r.counterpart_name, description: r.description, amount: Number(r.amount), category_id: r.category_id as string, ki_category_id: r.ai_category_id }))

  const optionen = kategorieOptionen(katList)
  const pfad = new Map(optionen.map(o => [o.id, o.pfad]))

  await log({ event: 'run.start', message: 'KI-Kategorisierung', meta: { kind: 'categorize', model: cfg.model, kandidaten: kandidaten.length, beispiele: beispiele.length, korrekturen: korrekturen.length } })
  const start = Date.now()
  const signal = AbortSignal.timeout(ZEITLIMIT_MS)
  const verbrauch = { inputTokens: 0, outputTokens: 0 }
  const zuordnungen: { id: string; categoryId: string }[] = []
  let verworfen = 0
  let abgebrochen = false

  try {
    for (let i = 0; i < kandidaten.length; i += cfg.stapel) {
      if (signal.aborted) { abgebrochen = true; break }
      const stapel = kandidaten.slice(i, i + cfg.stapel)
      try {
        const res = await klassifiziereStapel({ model: cfg.model, stapel, optionen, beispiele, korrekturen, mindestens: cfg.mindestens, abortSignal: signal })
        verbrauch.inputTokens += res.usage.inputTokens
        verbrauch.outputTokens += res.usage.outputTokens
        verworfen += res.verworfen
        zuordnungen.push(...res.zuordnungen.map(z => ({ id: z.id, categoryId: z.categoryId })))
      } catch (e) {
        if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) { abgebrochen = true; break }
        throw e
      }
    }

    let angewandt = 0
    if (!opts.trockenlauf) {
      const nachKategorie = new Map<string, string[]>()
      for (const z of zuordnungen) nachKategorie.set(z.categoryId, [...(nachKategorie.get(z.categoryId) ?? []), z.id])
      for (const [categoryId, ids] of nachKategorie) {
        const { data, error } = await supabase.from('bank_transactions')
          .update({ category_id: categoryId, category_source: 'ai', ai_category_id: categoryId })
          .in('id', ids).eq('user_id', userId).is('category_id', null).select('id')
        if (!error) angewandt += data?.length ?? 0
      }
    }

    const kostenUsd = estimateCostUsd(cfg.model, verbrauch)
    await log({
      event: 'run.finish', message: `KI-Kategorisierung: ${opts.trockenlauf ? 'Trockenlauf, ' : ''}${zuordnungen.length} Zuordnungen`, durationMs: Date.now() - start,
      meta: { kind: 'categorize', model: cfg.model, usage: verbrauch, kostenUsd, kandidaten: kandidaten.length, zugeordnet: zuordnungen.length, angewandt, verworfen, abgebrochen, bilanz } as unknown as Record<string, Json>,
    })

    const byId = new Map(kandidaten.map(k => [k.id, k]))
    return {
      status: 'fertig', modell: cfg.model, kandidaten: kandidaten.length, angewandt, verworfen, kostenUsd, abgebrochen, trockenlauf: !!opts.trockenlauf, bilanz,
      beispiele: opts.trockenlauf
        ? zuordnungen.slice(0, 40).map(z => {
            const b = byId.get(z.id)!
            return { gegenpartei: b.counterpart_name, text: (b.description ?? '').replace(/\s+/g, ' ').slice(0, 90), betrag: b.amount, kategorie: pfad.get(z.categoryId) ?? z.categoryId }
          })
        : [],
    }
  } catch (e) {
    await log({ level: 'error', event: 'run.error', message: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start, meta: { kind: 'categorize' } })
    throw e
  }
}
