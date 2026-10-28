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

## Datenfunktionen: nur ScopeContext, Service-Role-Pfade

Alle scope-faehigen Datenfunktionen (`src/lib/data/*`, `forecast/laden.ts`) nehmen AUSSCHLIESSLICH `ctx: ScopeContext`. Es gibt keinen
`ScopeArg`/`string`-Zweig mehr (frueher Uebergangsschicht `scope-arg.ts`, entfernt). Keine Funktion verhaelt sich je nach Typ ihres
Arguments verschieden.

- **Eine Definition „hat Partner“:** `hatPartner(ctx)` (`src/lib/haushalt/scope.ts`, = `partnerId !== null` = `available.length > 1`).
  Alle Stellen nutzen sie (Herabstufung, Haushalts-Snapshot-Pfad von `getBewegungFlows`, Assistant-Scope-Helfer, Switcher-Sichtbarkeit
  in Seiten). Davon getrennt bleibt `nutztSnapshotFunktion(ctx)` (Scope ≠ 'ich' ODER `sharedFremdBesitz`: ein geteiltes Scope-Konto
  gehoert einem anderen Nutzer) — das ist eine andere Frage.
- **Service-Role-/Cron-Pfade ohne Request-Cookie** haben zwei erlaubte Wege:
  1. Scope „ich“ des Nutzers: `resolveScopeForUser(supabase, userId, 'ich')` (`haushalt/resolve-user.ts`), je Nutzer EINMAL bauen (nicht je Aufruf
     in einer Schleife). Es begrenzt Mitglieder und Konten auf den Haushalt des Nutzers.
  2. Owner-only-Daten mit eigener, klar benannter Funktion und explizitem `userId: string`, die nur `user_id = userId` filtert
     (kein Haushalts-/Peer-Filter): `getFlowTransactionsFuerNutzer` (Reports/EUeR), `ladeVertragsAbgleichFuerNutzer` (Erinnerungen),
     `getIncomeTarget`, `getOpenInsights`, Kraken-/Steuerfunktionen.
- `applyOwnerScope` zaehlt `shared`-Zeilen nur von Haushaltsmitgliedern (`ctx.members`), nicht von beliebigen Nutzern: unter RLS
  redundant, im Service-Role-Pfad (keine RLS) Pflicht, sonst waeren geteilte Zeilen fremder Haushalte lesbar.
- Athena-Tools: ohne Partner exakt die alte `user_id`-Abfrage (`assistant/tools/scope.ts`, `assistant/tools/buchungen.ts`), mit Partner der Scope.
- Seiten, die fest die eigene Sicht brauchen (Einstellungen, Krypto-Rebalancing): `resolveScope(supabase, user, 'ich')` (memoisiert,
  ignoriert das Cookie).

## Steuerwerte, Inventar-View

- Steuerrolle/EUeR-Zeile/betrieblicher Anteil: nur `category_tax_overrides` (Lesen und Schreiben). Kein Rueckfall auf die eingefrorenen
  Spalten `categories.tax_role/euer_zeile/business_share` (Schalter `STEUER_OVERRIDES_LIVE` entfernt); der Code fasst sie nicht mehr an.
- `valuables_current` hat `shared` und wird direkt ueber `applyOwnerScope` gefiltert (Schalter `VALUABLES_SHARED_LIVE` entfernt). Nur die
  Kindtabellen (Bilder, Bewertungen, Dokumente) laufen ueber die Stueck-IDs aus `valuables`.

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
`available.length > 1` (= `hatPartner`). `setScope(scope)` (Server Action, `src/lib/haushalt/actions.ts`) setzt das Cookie `athena_scope`
(httpOnly:false, sameSite lax, path /) und `revalidatePath('/', 'layout')`.

## Tests / Regression

`npm test` (scope.test.ts). Regel: Fuer einen Nutzer ohne Partner liefert `'ich'` exakt `user_id = u` (plus eigene shared-Zeilen,
die ohnehin ihm gehoeren).
