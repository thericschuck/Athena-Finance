import type { ScopeContext } from '@/lib/haushalt/scope'
import { scopeHinweis } from '@/lib/leer/hinweis'
import { ScopeLeerHinweis } from './ScopeLeerHinweis'

/**
 * Server-Baustein für Leerzustände: zeigt den Haushalts-Hinweis („in Gemeinsam kann etwas
 * liegen“) nur bei `ctx.available.length > 1` und nicht im Scope „Gemeinsam“, sonst nichts.
 * `thema` steht im Satz vor „von <Partner>“, z. B. „Konten“ oder „Verträge“.
 */
export function ScopeHinweisFuer({ ctx, thema }: { ctx: Pick<ScopeContext, 'scope' | 'available' | 'members' | 'userId' | 'partnerId'>; thema: string }) {
  const h = scopeHinweis(ctx, thema)
  return h ? <ScopeLeerHinweis hinweis={h} /> : null
}
