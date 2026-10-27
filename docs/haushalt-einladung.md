# Haushalt: Einladung und Beitritt (Phase 4)

Stand: 2026-10-31. Status: Code und Migration liegen vor, **nichts ist live angewendet, nichts versendet, kein Nutzer angelegt.**
Bezug: `docs/haushalt-multiuser.md` (Abschnitte 4, 5, Phase 4), Migration `supabase/migrations/20261031100000_household_invites.sql`,
Rollback `supabase/rollbacks/20261031100000_household_invites.down.sql`, Test `supabase/tests/household_invites.sql`.

## Ablauf

1. Eric (Owner) öffnet Einstellungen, Reiter **Haushalt**, gibt die E-Mail-Adresse ein und klickt „Einladungslink erstellen".
2. Der Link `https://<Host>/einladung/<Token>` wird **einmal** angezeigt (kopierbar). Optional „Per E-Mail senden" (nur wenn
   `RESEND_API_KEY` und `REPORT_FROM_EMAIL` gesetzt sind, nur auf Klick; die Mail geht immer an die Adresse der Einladung).
3. Die eingeladene Person öffnet den Link (ohne Login erreichbar). Sie sieht Haushaltsname und eingeladene E-Mail und wählt:
   - **Neues Konto:** Anzeigename und Passwort (min. 10 Zeichen). Die Server Action legt den Account über die Admin-API an
     (`email_confirm: true`, E-Mail aus der Einladung), nimmt die Einladung an und meldet an.
   - **Ich habe ein Konto:** Anmeldung mit der E-Mail der Einladung, danach Annahme. Ist man schon angemeldet (richtige Adresse),
     genügt ein Klick. Falsche Adresse: Hinweis und „Abmelden".
4. `fn_accept_household_invite` trägt den Nutzer als `member` ein, markiert die Einladung benutzt und führt die Kategorien zusammen.
5. Offene Einladungen lassen sich widerrufen; pro Adresse gilt immer nur der neueste Link. Gültigkeit 7 Tage.

`signUp` in `src/app/login/actions.ts` ist entfernt. Konten entstehen nur noch über Einladung.

## Sicherheit

- Token: 32 Zufallsbytes (`crypto.randomBytes`), base64url (43 Zeichen). In der Datenbank steht nur `sha256(Token)`; der Klartext existiert
  nur im Link. Der Hash ist für `authenticated` per Spaltenrecht nicht lesbar (wie `bank_connections`).
- Annahme ausschließlich serverseitig: `fn_accept_household_invite` (SECURITY DEFINER, `search_path ''`, EXECUTE nur `service_role`) prüft
  Existenz, Ablauf, „nicht benutzt", E-Mail (case-insensitiv) und dass die E-Mail dem `auth.users`-Eintrag des Nutzers entspricht.
- Alle Token-Probleme liefern denselben Fehlercode (`invite_invalid`) und dieselbe Meldung: Unbefugte erfahren nicht, ob ein Token existiert,
  abgelaufen oder benutzt ist. Ein Format-Check (43 Zeichen base64url) greift vor jedem DB-Zugriff; Suche per Hash (Indexzugriff).
- Einladungen laufen höchstens 14 Tage (CHECK `expires_at <= created_at + 14 Tage`, auch wenn ein Client ein anderes Datum schickt).
- Links: Basis-URL aus `NEXT_PUBLIC_SITE_URL`, in Produktion sonst die feste Site-URL (`src/lib/seo.ts`); Request-Header nur in der Entwicklung.
  Fehlermeldungen beim Anlegen sind generisch (kein rohes DB-Fehlertext); `createUser`-Fehler werden nach `error.code` unterschieden.
- Begrenzung: 15 Versuche je Client-Adresse und 15 Minuten (`src/lib/haushalt/rate-limit.ts`). Auf Vercel nur best effort (Speicher je Instanz);
  der eigentliche Schutz ist die Token-Entropie (2^256).
- Die Einladungsmail kann nicht als Relay missbraucht werden: Die Server Action nimmt nur den Token, liest Adresse und Haushalt aus der
  Einladung und prüft, dass sie zum Haushalt des Owners gehört (max. 10 Mails/Stunde).
- `app.audit_skip` (Transaktionsvariable) unterdrückt Audit-Zeilen nur, wenn `auth.uid()` null ist (Service-Kontext). Eingeloggte Nutzer
  können das Änderungslog damit nicht umgehen (getestet).
- Unvollständige Annahme: Schlägt die Annahme nach dem Anlegen des Accounts fehl, wird der neue Account wieder gelöscht.

## Kategorien-Zusammenführung

`fn_merge_user_categories_into_household(user, haushalt)`, idempotent, aus `supabase/data/haushalt_kategorien_merge_entwurf.sql`:
Matching per vollständigem Pfad + Typ (case-insensitiv, getrimmt); Wurzeln „Schulden" und „Transfers" immer auf die Haushaltswurzel; bei mehreren
Treffern gewinnt die Kategorie des Owners (dann kleinste id). FKs (`transactions`, `bank_transactions` inkl. `ai_category_id`, `contracts`,
`categories.parent_id`) werden umgehängt, Steuer-Overrides des Nutzers wandern auf die Zielkategorie (nie überschrieben), neue Äste bleiben
mit `household_id`. Budget, Icon, Farbe, Reihenfolge: die Haushaltskategorie gewinnt (Maliks Budgetwerte werden nicht addiert).

## IBAN-Dubletten

- `accounts`: Trigger lehnt eine `bank_iban` ab, die bei einem Konto eines anderen Mitglieds steht (normalisiert, Fehler 23505 mit klarer Meldung).
- `fn_ensure_linked_account`: besitzt ein Peer die IBAN, wird kein Konto angelegt (der Besitzer synchronisiert). `institution` kommt aus
  `bank_balance.bank_label`, sonst aus dem Label der einen Bankverbindung, sonst „Bank" (vorher fest „Raiffeisenbank").
- `bank_balance` / `bank_transactions`: BEFORE-INSERT überspringt Zeilen, wenn ein Peer die IBAN besitzt oder dieselbe `account_iban + external_id`
  hat. Kurzschluss: Besitzt der einfügende Nutzer die IBAN selbst schon (eigener Saldo bzw. eigenes Konto, bei Buchungen auch eigene Zeile mit
  gleicher IBAN+external_id), wird immer durchgelassen. So laufen Upserts eigener Zeilen auch bei einer Dublette vor dem Beitritt weiter. Nutzer ohne
  Haushalt sind nicht betroffen, der Upsert `on_conflict (user_id, external_id)` bleibt intakt.
- Beitritt: `fn_accept_household_invite` prüft vor dem Eintragen, ob der beitretende Nutzer eine IBAN (Konto oder Saldo) hat, die schon bei einem
  Mitglied steht, und lehnt mit `iban_conflict` ab (Meldung in der App; die Einladung bleibt offen). Vorher die Verknüpfung auf einer Seite entfernen.
- `fn_ensure_linked_account` ist nicht mehr für `anon`/PUBLIC ausführbar (wird nur vom Trigger `trg_link_bank_account` aufgerufen).
- Wirkung für Eric: Seine Zeilen laufen unverändert; ein zweites Mitglied kann dieselbe Bank-IBAN nicht doppelt synchronisieren.

## Mitglied entfernen (Regel)

Nur Owner, nicht sich selbst, nur Rolle `member` (`fn_remove_household_member`, service_role). Die Daten des Mitglieds bleiben bei ihm.
- Alle `shared`-Flags des Mitglieds (Konten, Verträge, Schulden, Sparziele, Inventar, Assets, Depots, Depot-Bestände und -Buchungen, Sparpläne, Budget) werden `false`, sonst würde
  ein Wiederbeitritt stillschweigend wieder teilen. Sein geteiltes Konto verschwindet damit aus der Haushaltssicht, bleibt aber sein Konto.
- Kategorien: Das Mitglied bekommt eine **private Kopie** des aktuellen Haushaltsbaums; seine Buchungen, Verträge und Steuer-Overrides werden
  auf die Kopie umgehängt. Von ihm angelegte Haushaltskategorien gehen an den Owner. Der Haushaltsbaum bleibt vollständig.
- Danach ist es kein Mitglied mehr und sieht nichts mehr vom Haushalt (RLS). Der Dialog erklärt das.

## Schalter „Mit Haushalt teilen"

Im Konto-Formular („Geteiltes Konto"), bei Verträgen, Schulden, Sparzielen und Budget-Kategorien, nur sichtbar bei mehr als einem Mitglied
(`HaushaltProvider` im Dashboard-Layout). Die Server Actions setzen `shared` nur für eigene Zeilen und nur, wenn Haushaltsmitglieder existieren
(`src/lib/haushalt/teilen.ts`; Entzug ist immer erlaubt). Beim Bearbeiten erscheint der Schalter nur, wenn der Ist-Wert geladen wurde (kein
versehentliches Zurücksetzen). Nicht umgesetzt: Krypto-Assets (Kraken-Spiegel, nicht trivial), die Inventar-Aktion prüft die Mitgliedschaft noch nicht selbst (RLS genügt).

## Schritte für Eric (Reihenfolge)

1. Review der Migration; Tests im Sicherheitsprotokoll sind gelaufen (siehe Bericht). Migration anwenden (`apply_migration`).
2. Optional `REPORT_USER_ID` setzen (Monatsreport, siehe `docs/haushalt-multiuser.md` W5), falls Malik keine Reports bekommen soll.
3. Code deployen (Route `/einladung/[token]`, Einstellungen > Haushalt, entferntes `signUp`).
4. **Erst danach** im Supabase-Dashboard die öffentliche Registrierung abschalten: Authentication > Sign In / Providers > „Allow new users to sign up" aus.
   (Die Admin-API `createUser` funktioniert auch bei deaktivierter Registrierung.)
5. Test mit dem Testaccount `eschuck58@gmail.com`: Der Account ist schon Mitglied. Zum Prüfen des Einladungsflusses zuerst im Reiter Haushalt entfernen,
   dann erneut einladen, Link in privatem Fenster öffnen, „Ich habe ein Konto", anmelden und beitreten. Danach Kategorien, Konten und Scope-Umschalter prüfen.
6. Malik: Einladung an **malik.semmler@gmail.com** erstellen, Link selbst schicken (oder per Mail-Knopf). Das ist hier nur dokumentiert, nichts
   wurde versendet oder angelegt.
7. Nach Maliks Beitritt: Bankverbindung in seinen Einstellungen eintragen. Teilen Eric und Malik dasselbe Bankkonto, synchronisiert nur der, bei dem die IBAN
   zuerst verknüpft wurde; das geteilte Konto bleibt geteilt.

## Offen / bewusst nicht gelöst

- Rate-Limit nur best effort (Instanzspeicher).
- Entfernen: Kategorien werden kopiert, nicht „fair" aufgeteilt; Steuerprofil/Overrides gehören ohnehin der Person.
- Datentypen `src/types/database.ts` wurden von Hand um `household_invites` und die Funktionen ergänzt (nach dem Anwenden neu generieren).
