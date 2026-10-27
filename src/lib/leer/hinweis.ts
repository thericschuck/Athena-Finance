import type { ScopeContext, ScopeName } from '@/lib/haushalt/scope'

/**
 * Hinweis fuer Haushaltsmitglieder, deren aktueller Scope leer ist, obwohl der Haushalt weitere
 * Scopes anbietet. Nur Text und Ziel-Scope — kein Datenzugriff: ob dort wirklich Daten liegen,
 * weiss die Seite nicht, der Text sagt deshalb „kann“.
 */

export type ScopeHinweis = {
  /** Scope, zu dem der Hinweis wechseln laesst. */
  ziel: ScopeName
  text: string
  aktion: string
}

type Eingabe = Pick<ScopeContext, 'scope' | 'available' | 'members' | 'userId' | 'partnerId'>

function partnerName(ctx: Eingabe): string {
  const p = ctx.members.find(m => m.id === ctx.partnerId) ?? ctx.members.find(m => m.id !== ctx.userId)
  return p?.name?.trim() || 'dem Partner'
}

export function scopeHinweis(ctx: Eingabe, thema: string): ScopeHinweis | null {
  if (ctx.available.length <= 1) return null
  if (ctx.scope === 'gemeinsam') return null
  if (ctx.scope === 'ich' && ctx.available.includes('gemeinsam')) {
    return {
      ziel: 'gemeinsam',
      text: `In deiner Ansicht „Ich“ ist noch nichts vorhanden. ${thema} von ${partnerName(ctx)} oder geteilte Einträge siehst du in der Ansicht „Gemeinsam“.`,
      aktion: 'Zu „Gemeinsam“ wechseln',
    }
  }
  if (ctx.scope === 'partner' && ctx.available.includes('gemeinsam')) {
    return {
      ziel: 'gemeinsam',
      text: `${thema} von ${partnerName(ctx)} sind in dieser Ansicht noch leer. In „Gemeinsam“ siehst du alles aus dem Haushalt zusammen.`,
      aktion: 'Zu „Gemeinsam“ wechseln',
    }
  }
  return null
}
