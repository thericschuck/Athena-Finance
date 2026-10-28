/**
 * Haushalts-Scope (Ich | Partner | Gemeinsam) — reine Regeln, ohne Supabase-Import.
 *
 * Der Scope ist ein FILTER, keine Sicherheitsgrenze: die RLS laesst Haushalts-Peers ohnehin alles
 * Haushaltliche lesen und schreiben. Der Scope entscheidet nur, welche Teilmenge eine Seite zeigt.
 * (Nicht zu verwechseln mit `src/lib/bank/scope.ts`: das meint Zeitraum/Konto.)
 *
 * Semantik:
 *  - Konten (RLS liefert alle Peer-Konten): ich = user_id=u ODER shared; partner = user_id=partner ODER
 *    shared; gemeinsam = alle Haushaltskonten, jedes genau einmal.
 *  - Nicht kontengebundene Haushaltstabellen (contracts, debts, savings_goals, valuables, assets, depots,
 *    depot_*, savings_plans, budget_*): ich = user_id=u ODER shared; partner = user_id=partner ODER shared;
 *    gemeinsam = user_id in Peers (`ownerIds` + `includeShared`).
 *  - OWNER-ONLY-Daten (Steuer/EUeR, Reports, Krypto-Steuer/FIFO, Exchange-Keys, FinTS-State, Athena-Daten,
 *    user_settings, insights) bleiben IMMER user_id = ctx.userId — dafuer kein Scope-Helfer verwenden.
 *  - Ohne Haushalt oder mit nur einem Mitglied sind 'partner' und 'gemeinsam' nicht verfuegbar.
 */

export type ScopeName = 'ich' | 'partner' | 'gemeinsam'

export const SCOPE_NAMES: readonly ScopeName[] = ['ich', 'partner', 'gemeinsam']
export const DEFAULT_SCOPE: ScopeName = 'ich'

export type ScopeMember = { id: string; name: string | null; role: string }

export type ScopeContext = {
  userId: string
  /** Wirksamer Scope (nach Verfuegbarkeitspruefung). */
  scope: ScopeName
  /** Scopes, die dieser Nutzer waehlen kann. Mehr als einer = Switcher sichtbar. */
  available: ScopeName[]
  householdId: string | null
  /** Mitglieder nach Beitrittsdatum, inkl. des Nutzers selbst. */
  members: ScopeMember[]
  partnerId: string | null
  /** user_id-Werte fuer nicht kontengebundene Haushaltstabellen (ich [u], partner [partner], gemeinsam alle). */
  ownerIds: string[]
  /** Zusaetzlich Zeilen mit shared=true einbeziehen (ich/partner true, gemeinsam false). */
  includeShared: boolean
  /** Konten im Scope (jedes genau einmal). */
  accountIds: string[]
  /** Teilmenge der Scope-Konten mit shared=true. */
  sharedAccountIds: string[]
  /** `true`, wenn ein geteiltes Scope-Konto einem ANDEREN Nutzer als `userId` gehoert (dann fehlt es im eigenen Snapshot). */
  sharedFremdBesitz: boolean
  /** Normalisierte IBANs der Scope-Konten. */
  ibans: string[]
  /** Normalisierte IBANs aller Haushaltskonten (fuer Umbuchungen). */
  householdIbans: string[]
}

export type ScopeMemberInput = {
  id: string
  name?: string | null
  role: string
  /** ISO-Zeitstempel; bestimmt, wer bei mehr als zwei Mitgliedern „Partner“ ist. */
  joinedAt?: string | null
}

export type ScopeAccountInput = {
  id: string
  user_id: string
  shared: boolean
  bank_iban: string | null
}

export type ScopeInput = {
  userId: string
  requested?: string | null
  householdId?: string | null
  members: ScopeMemberInput[]
  accounts: ScopeAccountInput[]
}

/** Gleiche Normalisierung wie `normIban` in src/lib/bank/scope.ts (hier nachgebaut, damit das Modul keine Bank-Typen zieht). */
export function normIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

/**
 * EINZIGE Definition von „hat Haushaltspartner“ (mindestens ein weiteres Mitglied im Haushalt). Gleichbedeutend mit
 * `available.length > 1` und `partnerId !== null`. Ohne Partner gelten ueberall die bisherigen Einzelnutzer-Abfragen.
 * Nicht zu verwechseln mit `sharedFremdBesitz` (ein geteiltes Scope-Konto gehoert einem ANDEREN Nutzer).
 */
export function hatPartner(ctx: Pick<ScopeContext, 'partnerId'>): boolean {
  return ctx.partnerId !== null
}

export function parseScope(value: unknown): ScopeName | null {
  return typeof value === 'string' && (SCOPE_NAMES as readonly string[]).includes(value)
    ? (value as ScopeName)
    : null
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

function ibansOf(accounts: ScopeAccountInput[]): string[] {
  return uniq(
    accounts
      .map(a => (a.bank_iban ? normIban(a.bank_iban) : ''))
      .filter(i => i !== ''),
  )
}

export function buildScopeContext(input: ScopeInput): ScopeContext {
  const { userId } = input

  // Mitglieder nach Beitritt sortieren (stabil), Duplikate entfernen.
  const seen = new Set<string>()
  const sorted = [...input.members]
    .sort((a, b) => (a.joinedAt ?? '').localeCompare(b.joinedAt ?? ''))
    .filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)))
  const members: ScopeMember[] = sorted.map(m => ({ id: m.id, name: m.name ?? null, role: m.role }))

  const isMember = members.some(m => m.id === userId)
  const partner = isMember ? members.find(m => m.id !== userId) ?? null : null
  const partnerId = partner?.id ?? null
  const householdId = isMember ? input.householdId ?? null : null

  const available: ScopeName[] = partner ? ['ich', 'partner', 'gemeinsam'] : ['ich']
  const requested = parseScope(input.requested)
  const scope: ScopeName = requested && available.includes(requested) ? requested : DEFAULT_SCOPE

  const memberIds = partner ? members.map(m => m.id) : [userId]

  // Haushaltskonten: Besitz durch ein Mitglied oder shared; jede Konto-ID nur einmal.
  const memberSet = new Set(memberIds)
  const seenAcc = new Set<string>()
  const householdAccounts = input.accounts.filter(
    a => (memberSet.has(a.user_id) || a.shared) && (seenAcc.has(a.id) ? false : (seenAcc.add(a.id), true)),
  )

  const ownerIds = scope === 'gemeinsam' ? memberIds : scope === 'partner' && partnerId ? [partnerId] : [userId]
  const includeShared = scope !== 'gemeinsam'

  const scoped =
    scope === 'gemeinsam'
      ? householdAccounts
      : householdAccounts.filter(a => a.shared || a.user_id === ownerIds[0])

  return {
    userId,
    scope,
    available,
    householdId,
    members,
    partnerId,
    ownerIds,
    includeShared,
    accountIds: scoped.map(a => a.id),
    sharedAccountIds: scoped.filter(a => a.shared).map(a => a.id),
    sharedFremdBesitz: scoped.some(a => a.shared && a.user_id !== userId),
    ibans: ibansOf(scoped),
    householdIbans: ibansOf(householdAccounts),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Query-Helfer (strukturell typisiert, damit kein Supabase-Import noetig ist)
// ---------------------------------------------------------------------------------------------------------------------

/** Minimale Form eines Supabase-Filter-Builders. */
export type ScopeFilterable<Q> = {
  in: (column: string, values: readonly string[]) => Q
  or: (filters: string) => Q
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Filtert eine Haushaltstabelle (nicht kontengebunden) auf den Scope.
 * `sharedColumn: true` bei Tabellen mit Spalte `shared` (ich/partner: eigene ODER geteilte Zeilen).
 * Ohne `shared`-Spalte (z. B. Kind-Tabellen) wird nur nach Besitzer gefiltert.
 * Geteilte Zeilen zaehlen nur, wenn ihr Besitzer ein Haushaltsmitglied ist (`ctx.members`), nie fremde Haushalte.
 */
export function applyOwnerScope<Q extends ScopeFilterable<Q>>(
  query: Q,
  ctx: Pick<ScopeContext, 'ownerIds' | 'includeShared'> & { members?: readonly { id: string }[] },
  opts: { sharedColumn: boolean; userColumn?: string } = { sharedColumn: true },
): Q {
  const userColumn = opts.userColumn ?? 'user_id'
  if (opts.sharedColumn && ctx.includeShared) {
    // UUIDs stammen aus der DB; die Pruefung verhindert trotzdem Filter-Injection im or()-String.
    const ids = ctx.ownerIds.filter(id => UUID_RE.test(id))
    // Geteilte Zeilen NUR von Haushaltsmitgliedern (bzw. dem Nutzer selbst ohne Haushalt): unter RLS redundant, aber Pflicht im
    // Service-Role-Pfad (Cron, keine RLS), sonst waeren geteilte Zeilen fremder Haushalte lesbar.
    const mitglieder = (ctx.members?.length ? ctx.members.map(m => m.id) : ctx.ownerIds).filter(id => UUID_RE.test(id))
    return query.or(`${userColumn}.in.(${ids.join(',')}),and(shared.eq.true,${userColumn}.in.(${mitglieder.join(',')}))`)
  }
  return query.in(userColumn, ctx.ownerIds)
}

/** Filtert kontengebundene Tabellen auf die Scope-Konten (Spalte standardmaessig `account_id`). */
export function applyAccountScope<Q extends ScopeFilterable<Q>>(
  query: Q,
  ctx: Pick<ScopeContext, 'accountIds'>,
  column = 'account_id',
): Q {
  return query.in(column, ctx.accountIds)
}

// ---------------------------------------------------------------------------------------------------------------------
// Umbuchungen
// ---------------------------------------------------------------------------------------------------------------------

/**
 * - 'intern':   Gegenkonto liegt im Scope -> neutral (weder Einnahme noch Ausgabe).
 * - 'haushalt': Gegenkonto liegt im Haushalt, aber ausserhalb des Scopes -> im Scope Ausgabe/Einlage.
 * - 'extern':   Fremdes Konto oder unbekannt -> normale Buchung.
 */
export type UmbuchungsArt = 'intern' | 'haushalt' | 'extern'

export function umbuchungsArt(
  counterpartIban: string | null | undefined,
  ctx: Pick<ScopeContext, 'ibans' | 'householdIbans'>,
): UmbuchungsArt {
  if (!counterpartIban) return 'extern'
  const iban = normIban(counterpartIban)
  if (iban === '') return 'extern'
  if (ctx.ibans.includes(iban)) return 'intern'
  if (ctx.householdIbans.includes(iban)) return 'haushalt'
  return 'extern'
}

/** Neutrale Umbuchung im aktuellen Scope. */
export function isOwnUmbuchung(
  counterpartIban: string | null | undefined,
  ctx: Pick<ScopeContext, 'ibans' | 'householdIbans'>,
): boolean {
  return umbuchungsArt(counterpartIban, ctx) === 'intern'
}

/** Umbuchung zwischen Haushaltskonten, die im Scope nicht neutral ist (z. B. privat -> geteilt in „Ich“). */
export function isHouseholdOnlyUmbuchung(
  counterpartIban: string | null | undefined,
  ctx: Pick<ScopeContext, 'ibans' | 'householdIbans'>,
): boolean {
  return umbuchungsArt(counterpartIban, ctx) === 'haushalt'
}
