# Haushalts-Scope: API-Leitfaden (src/lib/haushalt/)

Der Scope (`'ich' | 'partner' | 'gemeinsam'`) ist ein Filter, keine Sicherheitsgrenze (die RLS regelt den Zugriff).
Nicht verwechseln mit `src/lib/bank/scope.ts` (Zeitraum/Konto).

## Aufruf

```ts
// page.tsx (Server Component)
const { supabase, user } = await requireAuthUser()
const ctx = await resolveScope(supabase, user)             // Cookie athena_scope, sonst 'ich' (kein ?scope=)

// Server Action / Route Handler
const ctx = await resolveScope(supabase, user)             // nur Cookie
```

`resolveScope` ist pro Request memoisiert. Das Cookie ist die EINZIGE Quelle (Switcher setzt es); Seiten und Export-Routen
lesen kein `?scope=`, sonst koennten Layout (Cookie) und Seite (URL) auseinanderlaufen. Der optionale dritte Parameter von
`resolveScope` bleibt nur fuer Tests und den Cron-Pfad.

`ScopeContext`: `userId, scope, available, householdId, members[{id,name,role}], partnerId, ownerIds, includeShared,
accountIds, sharedAccountIds, ibans, householdIbans`. Ohne Haushalt oder mit nur einem Mitglied ist `available = ['ich']`
und jeder angeforderte Scope wird zu `'ich'`.

## Muster: vorher / nachher

```ts
// Tabellen mit Spalte shared (contracts, debts, savings_goals, valuables, assets, depots, savings_plans, budget_*)
// vorher
.from('contracts').select('*').eq('user_id', userId)
// nachher
applyOwnerScope(supabase.from('contracts').select('*'), ctx)                       // eigene ODER shared; gemeinsam: user_id in Peers

// Haushaltstabellen ohne shared-Spalte (Kind-Tabellen, z. B. depot_transactions ueber user_id)
applyOwnerScope(q, ctx, { sharedColumn: false })

// Kontengebundene Daten (transactions, bank_transactions, account_balances, ...)
// vorher
.from('bank_transactions').select('*').eq('user_id', userId)
// nachher
applyAccountScope(supabase.from('bank_transactions').select('*'), ctx)               // .in('account_id', ctx.accountIds)
applyAccountScope(q, ctx, 'konto_id')                                                // andere Spaltennamen
// Rohdaten ohne account_id: ueber IBAN filtern, Menge ctx.ibans (bereits normalisiert, ohne Leerzeichen, Grossbuchstaben)
```

Die Helfer geben den Query-Builder zurueck (Typ bleibt erhalten), danach normal weiter mit `.order()`, `.limit()` usw.
`ctx.accountIds` kann leer sein: `.in(col, [])` liefert dann nichts (gewollt).

## Owner-only: kein Scope-Helfer

Bleiben IMMER `.eq('user_id', ctx.userId)`: Steuer/EUeR/Steuerprofil, Reports, Krypto-Steuer/FIFO (kraken_*), Exchange-Keys,
FinTS-State, Athena-Chats/Settings/Memory (ai_*), user_settings, insights, belege, income_targets.

## Umbuchungen

```ts
umbuchungsArt(counterpart_iban, ctx)        // 'intern' | 'haushalt' | 'extern'
isOwnUmbuchung(iban, ctx)                   // intern: Gegenkonto im Scope -> neutral
isHouseholdOnlyUmbuchung(iban, ctx)         // Haushaltskonto ausserhalb des Scopes -> im Scope Ausgabe/Einlage
```

`intern` nutzt `ctx.ibans` (nur Scope), `haushalt` zusaetzlich `ctx.householdIbans`. Beispiel: privat -> geteilt ist in
'ich' neutral (beide Konten in 'ich'), von Maliks Sicht in 'partner' ebenfalls; privat(Eric) -> privat(Malik) ist in 'ich'
`haushalt` (Ausgabe), in 'gemeinsam' `intern`. IBANs werden intern normalisiert (`normIban`).

## Switcher

`src/components/haushalt/ScopeSwitcher.tsx` sitzt in der Sidebar (Desktop und mobiler Drawer), nur sichtbar bei
`available.length > 1`. `setScope(scope)` (Server Action, `src/lib/haushalt/actions.ts`) setzt das Cookie `athena_scope`
(httpOnly:false, sameSite lax, path /) und `revalidatePath('/', 'layout')`.

## Tests / Regression

`npm test` (scope.test.ts). Regel: Fuer einen Nutzer ohne Partner liefert `'ich'` exakt `user_id = u` (plus eigene shared-Zeilen,
die ohnehin ihm gehoeren).
