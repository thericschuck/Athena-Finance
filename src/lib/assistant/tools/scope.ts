import { applyAccountScope, applyOwnerScope, type ScopeContext, type ScopeFilterable } from '../../haushalt/scope.ts'

/**
 * Scope-Helfer fuer die Athena-Werkzeuge. Der Scope kommt IMMER vom Server (ScopeContext), nie aus dem
 * Tool-Input des Modells.
 *
 * Regressionsgarantie: Ohne Partner (kein weiteres Haushaltsmitglied) ist das Ergebnis exakt die alte Abfrage
 * `.eq('user_id', ctx.userId)`. Erst mit Partner greifen die Scope-Helfer aus `@/lib/haushalt/scope`.
 */

type Eq<Q> = ScopeFilterable<Q> & { eq: (column: string, value: string) => Q }

/** true = ein einzelner Nutzer ohne Haushalts-Partner (heutiges Verhalten, keine Scope-Filter noetig). */
export function istAlleinstehend(ctx: Pick<ScopeContext, 'partnerId'>): boolean {
  return ctx.partnerId === null
}

/** Haushaltstabellen mit `shared`-Spalte (contracts, debts, savings_goals, depots, savings_plans, assets, budget_* ...). */
export function scopeOwner<Q extends Eq<Q>>(
  query: Q,
  ctx: ScopeContext,
  opts: { sharedColumn: boolean } = { sharedColumn: true },
): Q {
  if (istAlleinstehend(ctx)) return query.eq('user_id', ctx.userId)
  // Zusätzlich auf die Haushaltsmitglieder begrenzen: `shared.eq.true` allein würde mit dem Service-Role-Client (Review-Lauf,
  // keine RLS) geteilte Zeilen fremder Haushalte treffen. Unter RLS ist das Filter redundant.
  return applyOwnerScope(query.in('user_id', ctx.members.map(m => m.id)), ctx, opts)
}

/** Kontengebundene Tabellen/Views (unified_transactions, account_balances, ...): Konten des Scopes. */
export function scopeKonten<Q extends Eq<Q>>(query: Q, ctx: ScopeContext, column = 'account_id'): Q {
  return istAlleinstehend(ctx) ? query.eq('user_id', ctx.userId) : applyAccountScope(query, ctx, column)
}

/** Tabelle `accounts` selbst: Konten des Scopes ueber die Konto-ID. */
export function scopeKontenTabelle<Q extends Eq<Q>>(query: Q, ctx: ScopeContext): Q {
  return scopeKonten(query, ctx, 'id')
}

/** Rohdaten ueber IBAN (bank_balance.account_iban): IBANs des Scopes. */
export function scopeIbans<Q extends Eq<Q>>(query: Q, ctx: ScopeContext, column = 'account_iban'): Q {
  return istAlleinstehend(ctx) ? query.eq('user_id', ctx.userId) : query.in(column, ctx.ibans)
}

/**
 * Haushaltsweite Daten ohne Scope-Unterschied (ein Kategorienbaum pro Haushalt): ohne Partner wie bisher auf den
 * Nutzer gefiltert, mit Partner auf die Haushaltsmitglieder (`user_id in Mitglieder`). Das Filter ist unter RLS redundant,
 * aber Pflicht im Service-Role-Pfad (cron/athena-review, keine RLS), sonst waeren fremde Haushalte lesbar.
 * Gilt fuer `categories` und `category_tree` (beide haben `user_id`).
 */
export function scopeHaushaltsweit<Q extends Eq<Q>>(query: Q, ctx: ScopeContext): Q {
  return istAlleinstehend(ctx) ? query.eq('user_id', ctx.userId) : query.in('user_id', ctx.members.map(m => m.id))
}

/** Kurzer Klartext zum aktiven Scope fuer Prompt und Tool-Hinweise; null ohne Partner (dann gibt es nichts zu sagen). */
export function scopeBeschreibung(ctx: ScopeContext): string | null {
  if (istAlleinstehend(ctx)) return null
  const partner = ctx.members.find(m => m.id === ctx.partnerId)?.name ?? 'der Partner'
  switch (ctx.scope) {
    case 'ich':
      return 'Ansicht „Ich“: eigene Konten plus geteilte Konten und Verträge/Schulden/Ziele/Inventar des Nutzers bzw. als geteilt markiert.'
    case 'partner':
      return `Ansicht „${partner}“: Konten und Daten von ${partner} plus geteilte.`
    case 'gemeinsam':
      return 'Ansicht „Gemeinsam“: der gesamte Haushalt (alle Konten beider Mitglieder, geteilte Konten nur einmal gezählt).'
  }
}

/**
 * Argument fuer Datenfunktionen, die `ScopeContext | string` (ScopeArg) akzeptieren: ohne Partner die userId (strikt das alte
 * Verhalten, Regressionsgarantie), mit Partner der ScopeContext.
 */
export function wer(ctx: ScopeContext): ScopeContext | string {
  return istAlleinstehend(ctx) ? ctx.userId : ctx
}
