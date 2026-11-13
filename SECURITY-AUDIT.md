# Sicherheits-Audit Athena Finance

Stand: 12.11.2026, Commit `d4461a0` (derselbe wie in `AUDIT.md`; seit dem ersten Audit gab es keine Code-Änderung). Baut auf `AUDIT.md` Abschnitt 1.6 auf und schließt die dort in Abschnitt 5 genannten Lücken.

## Das Wichtigste zuerst1

1. **Die Registrierung ist live offen** (S3 bestätigt). Der öffentliche Auth-Endpunkt meldet `disable_signup=false`. Jeder kann sich mit dem anon-Key direkt bei Supabase ein Konto anlegen, die Bestätigungsmail anklicken und ist in der App. Fremde Finanzdaten schützt die RLS, aber ein Fremder bekommt Athena auf deine Kosten, Bildgenerierung, Schreibrecht auf die globalen Fondskurse und kann den Bank-Cron ausbremsen. Stand heute gibt es genau einen Nutzer in `auth.users`, es hat sich also noch niemand Fremdes registriert. Abschalten dauert eine Minute im Supabase-Dashboard.
2. **Die Edge Functions sind mit dem öffentlichen anon-Key auslösbar** (S1 bestätigt, und schwerer als im ersten Audit eingeschätzt). `verify_jwt` ist an, aber der anon-Key ist ein gültiges JWT und steht im Browser-Bundle. Über `daily-snapshot?date=…` kann jeder historische Vermögens-Snapshots mit den heutigen Beständen überschreiben; `execute-savings-plans` lässt sich beliebig oft anstoßen.
3. **Next.js 16.3.0 hat laut `npm audit` kritische Lücken**, darunter mehrere als Remote Code Execution eingestufte. Nicht alle treffen diese App (Details in 3.3), ein Update ist trotzdem der Punkt mit dem besten Verhältnis von Aufwand zu Wirkung.
4. **Der EÜR-Export hat keinen Schutz gegen CSV-Formeln.** Die drei anderen Buchungs-Exporte haben ihn. Ausgerechnet die Datei, die ans Steuerbüro geht, gibt Verwendungszwecke von Dritten ungeschützt aus.
5. **Entwarnung an drei Stellen:** `CRON_SECRET` ist in Produktion gesetzt (S2 ist damit nicht ausnutzbar), die Git-Historie enthält keine Secrets, und `.mcp.json` sowie `.claude/settings*.json` enthalten keine Zugangsdaten.

## Methode und Grenzen

- **✔** heißt: selbst an der genannten Stelle im Code gelesen. **✔ live** heißt: gegen die laufende Umgebung bestätigt. Ohne Markierung: hergeleitet, nicht bestätigt. „Zu prüfen" heißt: ich weiß nicht, ob es ausnutzbar ist.
- **Live-Proben:** `scripts/security-probe.mjs` (neu, liegt im Repo, mit `node scripts/security-probe.mjs` wiederholbar). Es schickt nie ein Secret, ruft keine Edge Function auf und keinen Endpunkt, der bei fehlender Absicherung arbeiten würde. Die Begründung, was bewusst nicht geprobt wird, steht im Kopf der Datei.
- **Supabase-Metadaten:** über die verbundene Supabase-Schnittstelle nur lesend abgefragt: Liste der Edge Functions, Security-Advisor, und eine Katalog-Abfrage (Rechte, Policies, Cron-Jobnamen, Buckets, Anzahl Nutzer). Es wurden keine Finanzdaten gelesen und der Inhalt der Cron-Kommandos (enthält den Token) nicht ausgegeben.
- **`npm audit`** lief einmal gegen die npm-Registry.
- **Nicht gemacht:** kein Penetrationstest mit angemeldeter Sitzung, kein Test-Signup, keine Schreibzugriffe, kein Aufruf der Edge Functions, keine Prüfung der Vercel-Umgebungsvariablen außer indirekt über das Antwortverhalten, kein Audit der Python-Abhängigkeiten, keine Prüfung der Kraken-API-Key-Berechtigungen.

---

## 1. Validierung der Befunde S1 bis S8

| Befund                         | Aktuell? | Live-Stand                                                     | Schweregrad im ersten Audit → jetzt                  |
| ------------------------------ | -------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| S1 Edge Functions              | ja ✔    | `verify_jwt=true` bei allen vier ✔ live; anon-Key passiert  | ohne Einstufung → **hoch**                     |
| S2 `bank-sync.py` fail-open  | ja ✔    | `CRON_SECRET` gesetzt ✔ live                                | latent → **niedrig** (heute nicht ausnutzbar)  |
| S3 Registrierung               | ja       | **offen** ✔ live                                        | unklar → **hoch**, Türöffner für S4, S5, S7 |
| S4 `fund_prices` schreibbar  | ja       | INSERT/UPDATE für `authenticated` ✔ live                   | niedrig, mit S3 **mittel**                      |
| S5 Athena-Limit                | ja ✔    | `ai_settings` vom Nutzer änderbar ✔ live                   | mittel, mit S3 **hoch** (Fremdkosten)           |
| S6 Getter als Server Actions   | ja ✔    | RLS hält: anon sieht 0 Zeilen ✔ live                         | **niedrig**                                     |
| S7 `bank_connections`-Rechte | ja       | INSERT/UPDATE/DELETE inkl. `fints_url`, `pin_enc` ✔ live  | niedrig, mit S3 **mittel**                      |
| S8 Sammelpunkte                | ja       | Buckets ohne Limit ✔ live; Debug-Route ohne Login 401 ✔ live | niedrig, zwei Punkte hochgestuft (siehe 3.5)          |

### S1: Edge Functions mit dem anon-Key auslösbar → hoch

- **Code unverändert** ✔: `supabase/functions/execute-savings-plans/index.ts:8` und `fetch-fund-price/index.ts:48` prüfen nichts selbst; `daily-snapshot/index.ts:76-79` lässt jedes JWT durch (`const isJwt = auth.startsWith('Bearer eyJ')`).
- **Live** ✔: Alle vier Functions (`fetch-fund-price`, `execute-savings-plans`, `daily-snapshot`, `execute-contracts`) laufen mit `verify_jwt=true`. Ohne Token weist die Plattform also ab. Der anon-Key ist aber ein gültiges JWT, liegt in jedem Seitenaufruf im Browser-Bundle und reicht damit aus. Mit offener Registrierung (S3) reicht zusätzlich jedes Nutzer-Token.
- **Warum schwerer als gedacht** ✔: `daily-snapshot/index.ts:151-155` nimmt `?date=JJJJ-MM-TT` an und ruft `fn_take_snapshot(target_date)`. Diese Funktion löscht und überschreibt die Snapshots des Tages mit den **aktuellen** Beständen (`supabase/baseline/04b_fn_take_snapshot.sql:51` `delete from portfolio_snapshots`, `:73` und `:186` `on conflict … do update`). Wer den anon-Key hat, kann damit die Vermögenshistorie beliebiger Tage verfälschen, für alle Nutzer, ohne Anmeldung.
- `execute-savings-plans` beliebig oft anzustoßen ist zusammen mit dem fehlenden Doppelbuchungsschutz (`AUDIT.md` A1) ein direkter Weg zu falschen Depotbuchungen.
- Die pg_cron-Jobs tragen den Token im Kommando, nicht aus dem Vault ✔ live (alle drei Jobs: `token_im_befehl=true, vault=false`). Welcher Token es ist, habe ich nicht gelesen; laut Kommentar in `daily-snapshot/index.ts:73` der anon-Key.
- **Annahme:** Der ausgerollte Code entspricht dem Repo. Die Änderungszeitpunkte der Functions passen zu den im Code genannten Daten, verglichen habe ich den Inhalt nicht.
- **Fix:** In allen drei Functions als Erstes `Authorization` gegen ein eigenes Secret prüfen (`Deno.env.get('CRON_SECRET')`, bei leerem Secret ablehnen), die `isJwt`-Ausnahme streichen, den `?date=`-Parameter auf die letzten wenigen Tage begrenzen. Die pg_cron-Jobs auf dieses Secret umstellen und es aus `supabase_vault` lesen.
- **Nicht live getestet**, weil jeder Aufruf die Function tatsächlich ausführen würde.

### S2: `api/bank-sync.py` bei fehlendem Secret offen → niedrig (latent)

- **Code unverändert** ✔: `api/bank-sync.py:657-658`.
- **Live** ✔: Die Node-Cron-Route unterscheidet „Secret fehlt" (500) von „Secret falsch" (401) (`src/lib/api/auth.ts:16-25`). `/api/cron/reminders` ohne Header antwortet 401, das Secret ist in Produktion also gesetzt. `/api/bank-sync` ohne Header antwortet ebenfalls 401.
- Der Befund ist damit heute nicht ausnutzbar. Er bleibt ein Fallstrick: eine neue Umgebung (Preview-Deployment ohne die Variable) wäre offen.
- **Neu dazu:** Das lokale `CRON_SECRET` ist 11 Zeichen lang mit nur 9 verschiedenen Zeichen (nur Länge und Zeichenklasse geprüft, der Wert wurde nicht ausgegeben). Ob in Vercel derselbe Wert steht, weiß ich nicht. Dieses eine Secret schützt alle Cron-Routen **und** den manuellen Sync mit `?sca=1&full=1&user=…`, und auf diesen Endpunkten gibt es kein Rate-Limit. Zu prüfen; ich würde es auf mindestens 32 zufällige Bytes rotieren.
- **Fix:** bei leerem Secret 500, Vergleich mit `hmac.compare_digest`, Secret rotieren.

### S3: Registrierung offen → hoch

- **Live** ✔: `GET <supabase>/auth/v1/settings` liefert `disable_signup=false`, E-Mail-Anmeldung an, `mailer_autoconfirm=false`, anonyme Nutzer aus. Lokal steht dasselbe in `supabase/config.toml:169`.
- Der App-Code bietet keine Registrierung an (`src/app/login/actions.ts:10`). Das ist kein Schutz: `POST /auth/v1/signup` mit dem anon-Key legt ein Konto an, die Bestätigungsmail führt über `/auth/callback` (`src/app/auth/callback/route.ts`) direkt in eine Sitzung, und `src/lib/api/auth.ts:34-35` sowie das Dashboard-Layout akzeptieren jeden angemeldeten Nutzer.
- **Bestand** ✔ live: 1 Nutzer in `auth.users`, 0 unbestätigte, 0 ohne Haushalt. Es hat also bisher niemand die Lücke genutzt. (Das heißt auch: Malik hat noch kein Konto.)
- **Fix:** Supabase-Dashboard → Authentication → „Allow new users to sign up" aus. Die Einladung nutzt `admin.auth.admin.createUser` (`src/app/einladung/[token]/actions.ts:47`) und sollte davon unberührt bleiben; `docs/haushalt-einladung.md:84` geht davon aus. Nach dem Umschalten einmal mit einer Test-Einladung prüfen. Als zweite Schranke im Code: in `requireUser()` und im Dashboard-Layout eine Haushaltsmitgliedschaft verlangen.
- `scripts/security-probe.mjs` meldet diesen Punkt als `KRITISCH`, bis er zu ist.

### S4: `fund_prices` für jeden angemeldeten Nutzer schreibbar → niedrig, mit S3 mittel

- **Live** ✔: `authenticated` hat `INSERT, SELECT, UPDATE`; Policies `fund_prices_insert_auth` und `fund_prices_update_auth` bestehen. Die Tabelle ist global und fließt in Depotwert und Nettovermögen aller Nutzer. Solange S3 offen ist, kann ein Fremder deine Depotbewertung verfälschen.

### S5: Athena-Limit umgehbar → mittel, mit S3 hoch

- **Code unverändert** ✔ (`src/app/api/assistant/route.ts:77`, `:109-116`). **Live** ✔: `ai_settings` hat INSERT- und UPDATE-Policies für die eigene Zeile, der Nutzer kann `daily_message_cap` und `max_steps` selbst hochsetzen, auch direkt über PostgREST an jeder Validierung der App vorbei.
- Das ist die Stelle, an der S3 Geld kostet: ein Fremder mit Konto kann Opus-Läufe mit Websuche auf deinen API-Schlüssel fahren. Gleiches gilt für `/api/inventar/artwork` (OpenAI-Bildgenerierung); dort habe ich kein Mengenlimit gefunden.

### S6: Getter mit freier `userId` → niedrig

- **Code unverändert** ✔ (`src/app/(dashboard)/crypto/actions.ts:380`). Die RLS auf `user_settings` ist owner-only (`supabase/baseline/07_rls_policies.sql:141`), und anon liest dort 0 Zeilen ✔ live. Keine praktische Ausnutzung gefunden; bleibt eine Aufräumarbeit.

### S7: `bank_connections` direkt beschreibbar → niedrig, mit S3 mittel

- **Live** ✔: `authenticated` hat `INSERT, UPDATE, DELETE`, die Spaltenrechte schließen `fints_url`, `pin_enc` und `username_enc` ein. Lesen kann der Client die Chiffrate nicht (SELECT-Spaltenrecht ohne `pin_enc`/`username_enc`), das ist gut gelöst.
- Praktischer Angriff: Ein Nutzer legt über die normale Maske eine Verbindung an (gültige Chiffrate) und setzt danach per PostgREST `fints_url` auf einen eigenen HTTPS-Host. Der Cron in `api/bank-sync.py` arbeitet alle Nutzer nacheinander in einer 300-Sekunden-Funktion ab; ein Host, der die Verbindung offen hält, verbraucht das Zeitbudget und verhindert den Sync der anderen (siehe Szenario 3). Abgreifen kann der Angreifer dabei nur seine eigenen Zugangsdaten.
- **Fix:** `revoke insert, update, delete on public.bank_connections from authenticated`. Der Code schreibt ohnehin nur per Service-Role.

### S8: Sammelpunkte

- **`/api/bank/debug`** ✔: unverändert; ohne Login 401 ✔ live. Bleibt niedrig, siehe aber 3.1 (GET mit Seiteneffekt).
- **Storage** ✔ live: `avatars` ist öffentlich, ohne Größen- und MIME-Grenze; `belege` und `reports` ohne Grenzen; `valuables`, `valuable-documents`, `athena-uploads` haben beides.
  - Neu ✔ live: Der Inhalt von `avatars` lässt sich mit dem anon-Key **auflisten**. Die Ordnernamen sind Nutzer-UUIDs (`supabase/baseline/09_storage.sql:16-17`). Die UUID allein öffnet nichts, ist aber genau der Parameter, den `api/bank-sync.py` als `?user=` nimmt.
  - Jeder angemeldete Nutzer kann beliebige Dateien jeder Art in den öffentlichen Bucket legen. Mit S3 ist das kostenloses öffentliches Hosting unter deiner Supabase-Adresse.
- **Verschlüsselung:** zwei Punkte als eigene Befunde in 3.5.
- **Fehlertexte, Import-Route, Klartext-Beträge in SQL-Kommentaren:** unverändert, Einstufung niedrig bleibt.

---

## 2. Offene Punkte aus `AUDIT.md` Abschnitt 5

### 2.1 CSV-Formel-Injection → mittel (ein Export ungeschützt)

Drei der fünf CSV-Exporte schützen Textspalten ✔, mit Kommentar, der den Angriff korrekt beschreibt („jeder kann dir eine Ueberweisung mit `=HYPERLINK(...)` als Zweck schicken"):

| Route                                                                   | Schutz                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| `src/app/api/export/transactions/route.ts:38-40` (`schuetzeFormel`) | ✔ für Beschreibung, Händler, Kategorie, Konto |
| `src/app/api/export/analyse/route.ts:64-68` (`textZelle`)           | ✔                                               |
| `src/app/api/export/bank/route.ts:47-51` (`textZelle`)              | ✔                                               |
| `src/app/api/export/monthly/route.ts:54-66`                           | nur Zahlen und Monat, kein Risiko ✔             |
| **`src/app/api/export/euer/route.ts:35-39`**                    | **kein Schutz** ✔                         |

- **Die Lücke** ✔: `zeile()` im EÜR-Export ruft nur `escapeCsvValue`, und `src/lib/csv.ts` (`escapeCsvValue`) maskiert ausdrücklich nur Trennzeichen und Anführungszeichen. Ungeschützt ausgegeben werden `b.beschreibung` (`euer/route.ts:128`, der Verwendungszweck der Buchung, also Text von Dritten), `b.kategorie` (`:113`, `:128`), `beleg.aussteller` und `beleg.dateiname` (`:143-145`).
- **Warum mittel:** Der Angreifer braucht nur deine IBAN. Eine Überweisung über einen Cent mit einem Verwendungszweck, der mit `=` beginnt, landet als betriebliche Einnahme in genau der Datei, die du oder dein Steuerbüro in Excel öffnet. Aktuelle Excel-Versionen warnen vor Formeln, die Programme starten, zeigen ein `=HYPERLINK` aber ohne Rückfrage als anklickbaren Link mit frei wählbarem Text an.
- **Fix:** Den Schutz aus den drei Routen nach `src/lib/csv.ts` ziehen (`escapeCsvText`) und in `zeile()` für alle Nicht-Zahlen verwenden. Dabei gleich zwei Schwächen des bestehenden Musters schließen: Es prüft nur das erste Zeichen (`/^[=+\-@\t\r]/`), ein führendes Leerzeichen oder Zeilenumbruch vor dem `=` rutscht durch; Excel wertet das nicht als Formel, LibreOffice je nach Importeinstellung schon.
- **`api/import/indicators`** (in Abschnitt 5 mitgenannt): Das ist JSON, kein CSV; Formel-Injection ist dort kein Thema. Der Export `api/export/indicators` gibt ebenfalls JSON aus ✔. Der bestehende Befund (beliebige Spalten, 2.000 parallele Inserts) bleibt.

### 2.2 Security-Header → mittel (fehlen fast vollständig)

- **Live** ✔ (`/` und `/login`): vorhanden ist nur `strict-transport-security: max-age=63072000` (kommt von Vercel, ohne `includeSubDomains`). Es fehlen `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. `X-Powered-By: Next.js` wird gesendet.
- **Code** ✔: `next.config.ts` enthält nur `redirects()`, `vercel.json` keine `headers`, `src/proxy.ts` setzt keine.
- **Einordnung nach Ausnutzbarkeit:**
  - **Fehlende CSP** ist der relevante Punkt. Das Sitzungs-Cookie ist für JavaScript lesbar (`httpOnly: false`, siehe 3.4). Jede XSS-Lücke, auch in einer Abhängigkeit, bedeutet damit vollständige Kontoübernahme inklusive Refresh-Token. Eine CSP wäre die zweite Verteidigungslinie. Eine konkrete XSS-Stelle habe ich nicht gefunden: Es gibt nur zwei `dangerouslySetInnerHTML` (`src/app/layout.tsx:123` mit festem Script, `src/components/seo/json-ld.tsx:18` mit maskiertem `<`) ✔, Athenas Ausgabe läuft durch einen eigenen Renderer ohne HTML-Pfad, der nur `https?://`-Links zulässt (`src/components/assistant/markdown-lite.tsx:16`) ✔.
  - **Clickjacking** ist trotz fehlendem `X-Frame-Options` kaum ausnutzbar: Das Sitzungs-Cookie ist `SameSite=Lax` und wird in einem fremden Frame nicht mitgeschickt, die eingebettete App wäre also ausgeloggt. Betroffen ist nur die Login-Seite.
- **Fix:** `headers()` in `next.config.ts` mit `X-Frame-Options: DENY` bzw. `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, einer restriktiven `Permissions-Policy`, und `poweredByHeader: false`. Die CSP zuerst als `Content-Security-Policy-Report-Only` ausrollen; wegen des Inline-Scripts im Layout braucht sie einen Nonce oder Hash, und `connect-src` muss die Supabase-Adresse enthalten.

### 2.3 Git-Historie → unauffällig

- **Geprüft** ✔: alle 211 Commits aller Branches und Remotes (`git log --all -p`), ohne Lockfile und generierte Dateien. Muster: JWTs, Anthropic-, OpenAI-, Stripe-, Resend-, Supabase- und GitHub-Token, private Schlüssel, `Bearer`-Token, Zuweisungen an `CRON_SECRET`, `ENCRYPTION_KEY`, `SERVICE_ROLE_KEY`, `FINTS_PIN` und Verwandte, 64-stellige Hex-Werte, deutsche IBANs.
- **Treffer:** nur Testwerte. `ENCRYPTION_KEY = 'test-key-nur-fuer-tests'` (`src/lib/fints/connections-core.test.ts`), ein SHA-256-Testvektor (`einladung.test.ts`), Beispiel-IBANs in `src/lib/aenderungen/format.test.ts`.
- **Nie eingecheckt** ✔: `.env*`, `*.pem`, `*.key` (`.gitignore:73` schließt `.env.*` aus).
- **Einschränkung:** Zwischen 08.07. und 20.10. lag eine kompilierte `api/__pycache__/bank-sync.cpython-313.pyc` im Repo. Binärdateien erfasst der Muster-Scan nicht, und das Werkzeug zum Auslesen fehlte. Die Quelldatei derselben Zeit ist im Scan enthalten und ohne Treffer, ein Secret im Bytecode ist damit unwahrscheinlich.
- **Nicht geprüft:** die Sichtbarkeit der beiden GitHub-Remotes (`origin` und ein zweites unter anderem Konto). Die Projekt-Referenz des Supabase-Projekts steht im Repo (`supabase/baseline/README.md:3`); sie ist kein Secret, sollte aber nicht öffentlich neben realen Beträgen in SQL-Kommentaren stehen.

### 2.4 `.mcp.json` und `.claude/settings*.json` → keine Secrets, ein anderer Befund

- **Geprüft** ✔ (mit maskierter Ausgabe): keine Token, keine Schlüssel, keine Passwörter. `.mcp.json` startet zwei lokale Programme ohne Zugangsdaten. Enthalten sind lokale absolute Pfade mit dem Windows-Benutzernamen; harmlos.
- **Befund, Schweregrad mittel:** `.claude/settings.local.json` ist versioniert (üblicherweise eine lokale Datei) und erlaubt ohne Rückfrage unter anderem `mcp__claude_ai_Supabase__execute_sql` und `mcp__claude_ai_Supabase__apply_migration` gegen die Produktionsdatenbank, dazu `Bash(node -e ' *)`, `Bash(python -c ' *)`, `Bash(npx supabase *)`, `Bash(npx vercel *)` und `Read(//c/Users/eschu/**)`.
  - Das ist ein Angriffsweg über den Entwicklungsrechner: Ein KI-Agent, der in diesem Repo arbeitet und dabei fremden Text liest (einen Verwendungszweck aus der Datenbank, eine Webseite, die README eines npm-Pakets), kann durch eingeschleuste Anweisungen beliebigen Code ausführen, das Home-Verzeichnis lesen oder Migrationen auf die Live-Datenbank anwenden, ohne dass eine Bestätigung erscheint.
  - **Fix:** `apply_migration` und die generischen Interpreter-Freigaben entfernen, `execute_sql` nur noch auf Nachfrage, die Datei aus der Versionierung nehmen. Ich habe an diesen Dateien nichts geändert.

### 2.5 SQL-Funktionen und Rollbacks

**`fn_accept_household_invite`** ✔ (`supabase/migrations/20261031100000_household_invites.sql:296-340`): solide.

- `security definer`, `search_path = ''`, EXECUTE nur für `service_role` (`:428-431`).
- Sperrt die Einladungszeile (`for update`), prüft benutzt, abgelaufen und die E-Mail dreifach (Auth-Nutzer, übergebener Wert, Einladung). Verhindert den Beitritt bei Mitgliedschaft in einem anderen Haushalt und bei IBAN-Überschneidung.
- Der Token ist zufällig und wird nur als SHA-256 gespeichert (`src/lib/haushalt/einladung.ts:14-19`) ✔.
- Kleinigkeit: `if not found` bezieht sich auf die zweite Abfrage, nicht auf die Einladung; die Prüfung `v_inv.id is null` fängt das ab. Kein Fehler.

**`fn_take_snapshot`** ✔ (`supabase/baseline/04b_fn_take_snapshot.sql`, 208 Zeilen):

- `security definer`, `search_path = 'public'` (nicht leer wie bei den neueren Funktionen), kein dynamisches SQL, EXECUTE nur für `service_role` (`20261020140000_revoke_definer_execute.sql:23, 30`).
- Läuft über alle Nutzer und überschreibt den Zieltag. Für sich in Ordnung; die Schwäche ist der ungeschützte Aufrufer (S1).

**Weitere `security definer`-Funktionen** ✔ live (Supabase-Advisor, einziger Sicherheitshinweis des Projekts): fünf sind für `authenticated` ausführbar. `household_peer_ids`, `is_household_member`, `is_household_owner` braucht die RLS. `fn_iban_peer_owned(p_user, p_iban)` nimmt eine fremde Nutzer-ID an, bricht aber ab, wenn sie nicht die eigene ist (`20261031100000_household_invites.sql`, erste Zeile des Rumpfs) ✔; als IBAN-Orakel taugt sie nur im eigenen Haushalt. Alle fünf haben `search_path = ""`. Kein Handlungsbedarf, [Erläuterung des Advisors](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

**Tabellen ohne RLS, Views ohne `security_invoker`** ✔ live: keine.

**Rollbacks** ✔ (36 Dateien, nach rechteöffnenden Anweisungen durchsucht): Mehrere stellen bewusst einen schwächeren Zustand wieder her.

- `supabase/rollbacks/20261031090000_harden_table_grants.down.sql:3`: `grant all on table public.exchange_keys to anon, authenticated`.
- `20261021170000_unified_transactions_read_only_grants.down.sql:2`: `grant all on public.unified_transactions to authenticated`.
- `20261028100000_household_rls.down.sql`: ersetzt die Haushalts-Policies durch owner-only (das ist eine Verschärfung, sperrt aber den Partner aus).
- Das sind korrekte Umkehrungen, kein Fehler. Das Risiko entsteht nur, wenn jemand (oder ein Agent mit `apply_migration`, siehe 2.4) eine davon ausführt. Schweregrad niedrig. Empfehlung: die sicherheitsrelevanten Rollbacks im Dateikopf als solche kennzeichnen.

---

## 3. Was im ersten Audit fehlte

### 3.1 CSRF

- **Server Actions:** Next.js lässt nur POST zu und vergleicht `Origin` mit `Host` (`node_modules/next/dist/docs/01-app/02-guides/data-security.md:544-552`). `serverActions.allowedOrigins` ist nicht gesetzt ✔, es gilt also die strenge Voreinstellung. Nicht live getestet.
- **Route Handler haben diesen Schutz nicht.** Kein Handler prüft `Origin`, `Sec-Fetch-Site` oder einen Token ✔ (Suche über `src/app/api` und `src/lib/api`). Sie verlassen sich allein darauf, dass das Sitzungs-Cookie `SameSite=Lax` ist (`node_modules/@supabase/ssr/dist/main/utils/constants.js`: `sameSite: "lax"`) ✔.
  - Für POST und PATCH reicht das in aktuellen Browsern: Bei einer fremden Seite wird das Cookie nicht mitgeschickt. Betroffen wären `api/assistant`, `api/bank/sync`, `api/bank/balance`, `api/bank/transactions/*`, `api/import/*`, `api/inventar/artwork`.
  - `Lax` schützt **nicht** bei GET über eine Navigation. Genau eine GET-Route hat einen Seiteneffekt: **`/api/bank/debug`** ✔ startet einen echten FinTS-Dialog (`src/app/api/bank/debug/route.ts:48`). Ein Link genügt, um ihn beim angemeldeten Nutzer auszulösen, eventuell mit Push-Freigabe aufs Handy. Auf Vercel scheitert der Sidecar; relevant ist das für die lokale Instanz. Schweregrad niedrig.
  - Alle anderen GET-Routen lesen nur ✔ (`api/kraken/status` wirkte in der automatischen Zählung schreibend, liest aber nur).
- **Fix:** Debug-Route auf POST umstellen oder in Produktion abschalten. Für die Route Handler eine gemeinsame Prüfung in `requireUser()`: bei Methoden außer GET `Sec-Fetch-Site` auf `same-origin` prüfen. Das ist eine Zeile und macht den Schutz unabhängig vom Cookie-Attribut.

### 3.2 Rate-Limiting

Es gibt genau ein Limit in der App ✔: 15 Versuche pro 15 Minuten je Client-Adresse im Einladungsfluss (`src/lib/haushalt/einladung-server.ts:31-37`), im Arbeitsspeicher je Instanz, also bei mehreren Serverless-Instanzen nur näherungsweise.

| Endpunkt                                        | Limit                             | Bewertung                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login (`src/app/login/actions.ts:17`)         | keins in der App ✔               | Verlässt sich auf Supabase. Weil die Server Action von Vercel aus anfragt, sieht Supabase die Adresse von Vercel, nicht die des Angreifers. Wer direkt gegen `<supabase>/auth/v1/token` geht, unterliegt den Supabase-Limits je Adresse. Keine Kontosperre, kein Captcha, kein zweiter Faktor. |
| Passwort-Reset                                  | nicht implementiert               | entfällt                                                                                                                                                                                                                                                                                         |
| Warteliste (`src/app/actions/waitlist.ts:22`) | keins ✔                          | Öffentliches INSERT ohne Captcha. Die Tabelle lässt sich mit dem anon-Key auch direkt füllen. Niedrig (Spam, Speicher).                                                                                                                                                                        |
| Edge Functions                                  | keins                             | Mit dem anon-Key beliebig oft aufrufbar (S1). `fetch-fund-price` fragt bei jedem Aufruf Yahoo ab; häufige Aufrufe können den inoffiziellen Zugang sperren.                                                                                                                                    |
| `/api/assistant`                              | Nachrichtenzähler, umgehbar (S5) | siehe S5                                                                                                                                                                                                                                                                                          |
| `/api/inventar/artwork`                       | keins gefunden                    | OpenAI-Bildkosten je Aufruf; mit S3 Fremdkosten.                                                                                                                                                                                                                                                  |
| `/api/bank/sync`, `/api/bank/debug`         | keins                             | Nur für angemeldete Nutzer mit eigener Verbindung. Wiederholte Anmeldeversuche bei der Bank mit falscher PIN können den Online-Zugang sperren; das kann der Nutzer aber nur sich selbst antun.                                                                                                  |
| Cron-Routen, `api/bank-sync.py`               | keins                             | Schutz allein durch das Secret, siehe S2 zur Stärke.                                                                                                                                                                                                                                             |

**Fix:** Für eine App mit zwei Nutzern lohnt kein eigenes Limit-System. Wirksam und billig sind: S3 schließen, S1 schließen, ein serverseitiges Tagesbudget für Athena und Bildgenerierung, und im Supabase-Dashboard Captcha für Auth aktivieren.

### 3.3 Abhängigkeiten

`npm audit --omit=dev` ✔: **7 Schwachstellen in Produktions-Abhängigkeiten: 1 kritisch, 5 hoch, 1 mittel.** Für alle gibt es laut Audit einen Fix. Mit Entwicklungs-Abhängigkeiten sind es 37 (3 kritisch, 16 hoch).

| Paket                        | Stufe              | Direkt? | Was                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next` 16.3.0              | **kritisch** | ja      | 13 Meldungen, davon fünf als Remote Code Execution: Image-Optimization-API (AVIF, SVG), `next/og`, `use cache` mit Typed Arrays, Windows-gehostete Server. Dazu Denial of Service über Server Actions (hoch), SSRF in der Bildoptimierung (hoch), mehrere Cache-Vergiftungen (mittel). Betroffen laut Audit bis einschließlich 16.4.0. |
| `zod`                      | hoch               | ja      | Speichererschöpfung bei übergroßen Sammlungen, behoben ab 4.6.6                                                                                                                                                                                                                                                                            |
| `undici`                   | hoch               | nein    | 18 Meldungen, u. a. TLS-Zertifikatsprüfung umgehbar, Denial of Service                                                                                                                                                                                                                                                                       |
| `sharp`                    | hoch               | nein    | Lücken in libheif und librsvg                                                                                                                                                                                                                                                                                                                |
| `ws`                       | hoch               | nein    | Speichererschöpfung                                                                                                                                                                                                                                                                                                                          |
| `source-map-js`            | hoch               | nein    | Denial of Service                                                                                                                                                                                                                                                                                                                             |
| `baseline-browser-mapping` | mittel             | nein    | Denial of Service                                                                                                                                                                                                                                                                                                                             |

**Was davon diese App trifft (meine Einschätzung, nicht geprüft):**

- `next/og` und `use cache` werden nicht verwendet ✔ (keine Treffer in `src`), diese beiden RCE-Meldungen treffen nicht.
- Server Actions werden intensiv genutzt (36 Dateien), die DoS-Meldung trifft.
- `next/image` wird in 9 Dateien verwendet. Auf Vercel übernimmt die Plattform die Bildoptimierung; ob die Meldungen zur Image-Optimization-API dort greifen, habe ich nicht geprüft. Für eine lokale Instanz (`next start`, `next dev`) gelten sie.
- Die Meldung zu Windows-Servern betrifft den Entwicklungsrechner, wenn der Dev-Server im Netzwerk erreichbar ist.
- `sharp` verarbeitet hochgeladene Bilder (Inventar erlaubt HEIC/HEIF und AVIF im Bucket). Ob `sharp` auf dem Weg eines Uploads tatsächlich läuft, habe ich nicht verfolgt.

**Fix:** `npm audit fix`, `next` auf die aktuelle 16er-Version oberhalb von 16.4.0, `eslint-config-next` (steht auf 16.1.6) mitziehen, danach `npm test` und einen Build. `package.json` erlaubt mit `^16.2.6` bereits neuere Versionen, nur das Lockfile hält 16.3.0 fest.

**Nicht geprüft:** die Python-Abhängigkeiten (`requirements.txt`: `fints==5.0.0`, `requests==2.32.3`, `cryptography==43.0.3`). Dafür fehlt lokal ein Werkzeug wie `pip-audit`. `cryptography` 43 ist nicht die aktuelle Hauptversion; ob es bekannte Lücken gibt, ist offen.

### 3.4 Sitzungen

- **Token-Ablauf:** lokal `jwt_expiry = 3600` und Rotation der Refresh-Token mit 10 Sekunden Wiederverwendungsfenster (`supabase/config.toml`). Die Live-Werte stehen nicht im öffentlichen Settings-Endpunkt, also nicht bestätigt.
- **Refresh** ✔: Die Proxy-Funktion erneuert abgelaufene Token bei jeder Seitenanfrage über `getClaims()` (`src/proxy.ts:57-66`) und meldet bei ungültigem Refresh-Token ab (`:76-82`). `/api` ist vom Matcher ausgenommen (`:101`), Route Handler erneuern über `getAuthUser()` selbst.
- **Logout** ✔: `supabase.auth.signOut()` ohne Angabe (`src/app/login/actions.ts:39`) widerruft serverseitig alle Sitzungen des Nutzers und löscht die Cookies. Ein bereits ausgestelltes Zugriffstoken bleibt bis zu seinem Ablauf gültig, weil `getClaims()` nur Signatur und Ablauf lokal prüft (`src/lib/supabase/server.ts:35-47`, dort ausdrücklich so dokumentiert). Ein gestohlenes Zugriffstoken funktioniert nach dem Logout also noch bis zu einer Stunde, auch direkt gegen PostgREST. Geldbewegende Pfade fragen mit `getUser()` beim Server nach (Rebalancing, Kraken-Sync, Reports) ✔.
- **Cookie** ✔: `httpOnly: false`, `sameSite: lax`, Lebensdauer 400 Tage (Voreinstellung von `@supabase/ssr`, in `src/lib/supabase/server.ts:19-27` nicht überschrieben). `Secure` setzt die Bibliothek nicht ausdrücklich; HSTS ist live aktiv, das fängt es ab.
  - **Bewertung, mittel:** `httpOnly: false` ist nötig, solange ein Browser-Client die Sitzung liest (`src/lib/supabase/client.ts`, benutzt u. a. für Uploads in `ValuableMedia.tsx`, `useAnhaenge.ts`). Der Preis: Jedes eingeschleuste Script liest Zugriffs- und Refresh-Token und hat damit dauerhaften Zugang, auch am Server vorbei direkt auf die Datenbank im Umfang der RLS, also auf alle Haushaltsdaten mit Schreibrecht. Zusammen mit der fehlenden CSP (2.2) gibt es dagegen keine zweite Linie.
- **Passwortwechsel** ✔ (`src/app/(dashboard)/settings/actions.ts:244-268`): prüft das aktuelle Passwort, Mindestlänge 8. Ob andere Sitzungen dabei beendet werden, hängt von Supabase ab; zu prüfen. Die Mindestlänge der Plattform ist lokal 6 (`config.toml:175`), die Einladung verlangt 10, der Wechsel 8: drei verschiedene Werte.
- **Kein zweiter Faktor.** Für eine App mit Bank-PIN und Börsen-Schlüsseln ist das die größte fehlende Schutzmaßnahme auf Kontoebene (in `AUDIT.md` als Feature 11 geführt).

### 3.5 Verschlüsselung

**E1. `exchange_keys`: Chiffrate für den Browser-Client lesbar und schreibbar → niedrig**

- **Live** ✔: `authenticated` hat `SELECT, INSERT, UPDATE, DELETE` auf `api_key` und `api_secret`; die Policy ist owner-only. Anders als bei `bank_connections` gibt es keine Spaltensperre.
- **Was ein Angreifer davon hat:** Mit einer gestohlenen Sitzung (3.4) bekommt er die Chiffrate von Kraken-Schlüssel und -Secret. Ohne `ENCRYPTION_KEY` sind sie wertlos. Der Schlüssel wird als einfacher SHA-256 aus der Variable abgeleitet, ohne Streckung (`src/lib/encryption.ts:14-19`) ✔; wäre die Variable ein merkbares Passwort, ließe sie sich offline durchprobieren, weil der GCM-Tag jeden Versuch bestätigt. Der lokale Wert ist 64 Hex-Zeichen, also 256 Bit Zufall (nur Länge und Zeichenklasse geprüft); damit ist das praktisch ausgeschlossen. Ob in Vercel derselbe Wert steht, ist nicht geprüft.
- Schreiben ist unkritisch: Der Nutzer kann nur die eigene Zeile ändern. Es fehlen gebundene Zusatzdaten (AAD), ein Chiffrat ließe sich also zwischen Zeilen verschieben, aber dafür braucht man bereits Schreibzugriff auf beide.
- **Warum trotzdem beheben:** Es kostet eine Migration und entfernt die Chiffrate aus der Reichweite jeder Browser-Lücke. Die App liest die Schlüssel ohnehin nur serverseitig.
- **Fix:** Spaltenrechte wie bei `bank_connections` (SELECT nur auf `id, exchange, created_at`), Lesen und Schreiben der Chiffrate über den Admin-Client. Mittelfristig Schlüsselversion im Chiffrat (`v1:`), getrennte abgeleitete Schlüssel für Bank und Börse, AAD aus Nutzer und Tabelle.
- **Der wichtigere Punkt liegt außerhalb des Codes:** Welche Rechte der Kraken-API-Schlüssel hat. Ist „Withdraw" aktiv, ist jede Kompromittierung des Servers oder der Vercel-Umgebung ein direkter Geldabfluss. Nicht prüfbar aus dem Repo; bitte bei Kraken nachsehen und Auszahlungen deaktivieren.

**E2. `fints_client_state.state_blob`: unverschlüsselt, vom Client les- und schreibbar → niedrig**

- **Live** ✔: Policy `fints_client_state_own` für alle Operationen an `authenticated`; die Tabellenrechte sind die Supabase-Voreinstellung (auch `anon` hat alle Rechte, die RLS lässt anon aber nichts sehen: 0 Zeilen ✔ live). Die Aussage aus dem ersten Audit, die Tabelle habe „bewusst keine Policy", stimmt nicht mehr: `supabase/migrations/20260906160000_cron_aufraeumen_und_rls.sql:52-55` hat eine angelegt.
- **Inhalt:** der Zustand des FinTS-Clients einschließlich privater Teile (`api/bank-sync.py:580`, `client.deconstruct(including_private=True)`): Kundensystem-ID und Bankparameter. Die PIN ist nicht enthalten.
- **Vertraulichkeit:** Die Kundensystem-ID ist der Grund, warum die Bank 90 Tage keine Freigabe verlangt. Wer sie stiehlt, braucht für einen Bankzugriff weiterhin Kennung und PIN. Niedrig.
- **Integrität (zu prüfen):** Der Client kann den Blob ändern, und der Server lädt ihn anschließend in python-fints. Das ist eine Eingabe aus Nutzerhand in einen Parser, der mit Bankzugangsdaten im selben Prozess läuft. Ob sich daraus mehr machen lässt als ein kaputter Sync oder eine erzwungene neue Freigabe, habe ich nicht untersucht.
- **Fix:** Policy entfernen und `revoke all on public.fints_client_state from anon, authenticated`; der Code greift nur per Service-Role zu (`src/lib/fints/state.ts`). Den Blob zusätzlich mit `encrypt()` ablegen.

**Gut gelöst:** AES-256-GCM mit frischem 96-Bit-IV je Wert ✔, Entschlüsselung nur serverseitig, `bank_connections` mit Spaltensperre, kein Klartext-Secret in Logs gefunden, Zugangsdaten gehen nie über Kommandozeilenargumente.

---

## 4. Angriffsszenarien

Bewusst keine Wiederholung von S1 bis S8, sondern Wege, die sich aus den Abschnitten 2 und 3 ergeben.

### Szenario 1: Verfälschen der Vermögenshistorie von außen → hoch

- **Weg:** anon-Key aus dem Browser-Bundle der öffentlichen Landing-Page lesen. `POST <supabase>/functions/v1/daily-snapshot?date=2026-01-15` mit diesem Key als Bearer. Die Function läuft mit Service-Role, `fn_take_snapshot` überschreibt den Snapshot dieses Tages für alle Nutzer mit den heutigen Beständen. In einer Schleife über alle Tage ist die Historie in Minuten wertlos.
- **Voraussetzung:** keine. Kein Konto, keine Interaktion des Opfers.
- **Schaden:** Datenintegrität. Verlauf, Sparquote und alle darauf aufbauenden Auswertungen stimmen nicht mehr; ob sich die alten Werte aus `account_balances` und Buchungen zurückrechnen lassen, ist offen.
- **Fix:** eigenes Secret in den Edge Functions (S1), `?date=` auf wenige Tage begrenzen, regelmäßiges Backup der Snapshot-Tabellen.

### Szenario 2: Ein Cent als Trägerrakete → mittel

- **Weg:** Der Angreifer kennt deine IBAN (steht auf jeder Rechnung) und überweist einen Cent. Der Verwendungszweck ist frei wählbar und landet über den Bank-Sync in `bank_transactions.description`. Von dort gibt es drei Wirkungen:
  1. **EÜR-Export** (2.1): Beginnt der Zweck mit `=`, steht eine Formel in der Datei fürs Steuerbüro.
  2. **Athena:** Der Text wird als `untrusted_description` markiert und der System-Prompt verbietet, ihm zu folgen (`src/lib/assistant/prompts.ts:435-441`) ✔. Das ist eine gute Vorkehrung, aber keine Garantie. Schreibaktionen brauchen eine Bestätigung. Was ohne Bestätigung bleibt, sind Websuche und Web-Abruf (`src/app/api/assistant/route.ts:53-62`, ohne Domain-Einschränkung) und Links in der Antwort (`markdown-lite.tsx` rendert `https`-Links). Ein erfolgreicher Anweisungsversuch könnte Athena dazu bringen, Kontodaten in eine Adresse zu schreiben, die du anklickst oder die abgerufen wird. Ob der Web-Abruf frei zusammengesetzte Adressen überhaupt zulässt, habe ich nicht geprüft: zu prüfen.
  3. **Kategorisierung:** Der Text fließt in die automatische Zuordnung; harmlos, aber vom Absender steuerbar.
- **Fix:** CSV-Schutz zentralisieren (2.1). Für Athena `allowedDomains` am Web-Abruf setzen oder ihn abschalten, wenn der Lauf zuvor Bankdaten gelesen hat. Bilder weiterhin nicht rendern.

### Szenario 3: Fremder mit Konto legt den Bank-Sync lahm und fährt Kosten → hoch, solange S3 offen ist

- **Weg:** Registrieren über die Supabase-API, Mail bestätigen, anmelden. Dann:
  1. `ai_settings` der eigenen Zeile per PostgREST auf hohe Limits setzen und Athena mit Opus und Websuche in Schleife laufen lassen. Die Kosten trägt dein Anthropic-Schlüssel. Gleiches mit `/api/inventar/artwork` gegen den OpenAI-Schlüssel.
  2. Über die Maske eine Bankverbindung anlegen, danach `fints_url` per PostgREST auf einen eigenen Host setzen, der Verbindungen offen hält. Der Cron in `api/bank-sync.py` arbeitet alle Nutzer nacheinander ab und läuft ins Zeitlimit; je nach Reihenfolge kommt dein Sync nicht mehr dran.
  3. `fund_prices` für deine ISINs überschreiben: dein Depotwert und Nettovermögen sind falsch.
  4. Dateien in den öffentlichen `avatars`-Bucket legen.
- **Voraussetzung:** nur eine E-Mail-Adresse.
- **Fix:** S3 schließen (das beendet das ganze Szenario), dann S7, S4 und ein serverseitiges Kostenbudget.

### Szenario 4: Eine XSS-Lücke wird zur dauerhaften Kontoübernahme → hoch bei Eintritt, Eintritt derzeit nicht belegt

- **Weg:** Eine Script-Einschleusung irgendwo in der App, etwa über eine verwundbare Abhängigkeit (3.3) oder eine künftige Komponente, die fremden Text als HTML ausgibt. Das Script liest `document.cookie`, bekommt Zugriffs- und Refresh-Token (3.4) und schickt sie weg; ohne CSP hindert es nichts (2.2). Der Angreifer hat danach vom eigenen Rechner aus direkten Datenbankzugriff im Umfang der RLS: alle Haushaltsdaten lesen und schreiben, Konten löschen (und mit ihnen per `ON DELETE CASCADE` die Buchungen), die Chiffrate der Kraken-Schlüssel (E1), und er kann über die App Athena-Aktionen bestätigen, einschließlich Rebalancing.
- **Einordnung:** Ich habe keine XSS-Stelle gefunden; die App ist an den üblichen Stellen sauber. Das Szenario beschreibt, wie wenig zwischen einer solchen Lücke und dem Totalschaden steht.
- **Fix:** CSP (2.2), Abhängigkeiten aktualisieren (3.3), zweiter Faktor, Kraken-Schlüssel ohne Auszahlungsrecht, `exchange_keys` für den Client sperren (E1).

### Szenario 5: Angriff über den Entwicklungsrechner → mittel

- **Weg:** Ein KI-Agent arbeitet in diesem Repo und liest dabei Text aus fremder Hand (Verwendungszweck aus der Datenbank, Webseite, Paket-Dokumentation). Wegen der vorab erteilten Freigaben in `.claude/settings.local.json` (2.4) kann eine eingeschleuste Anweisung ohne Rückfrage SQL und Migrationen gegen die Produktionsdatenbank ausführen, beliebigen Node- oder Python-Code starten und das Home-Verzeichnis lesen. Dort liegt `.env.local` mit `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `FINTS_PIN`, `ANTHROPIC_API_KEY` und `OPENAI_API_KEY` im Klartext.
- **Schaden:** vollständig, einschließlich Bank-PIN.
- **Fix:** die breiten Freigaben entfernen (2.4). `FINTS_PIN` und `FINTS_USERNAME` aus `.env.local` nehmen, sobald die Verbindung in `bank_connections` liegt. Prüfen, ob der OneDrive-Ordner, in dem das Projekt liegt, `.env.local` in die Cloud synchronisiert.

---

## 5. Maßnahmen nach Priorität

| #  | Maßnahme                                                                                                                 | Aufwand      | Schließt                              |
| -- | ------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------- |
| 1  | Registrierung im Supabase-Dashboard abschalten, Einladung danach einmal testen                                            | Minuten      | S3, Szenario 3, entschärft S4, S5, S7 |
| 2  | Edge Functions: eigenes Secret erzwingen, `?date=` begrenzen, pg_cron-Jobs umstellen                                    | 1 bis 2 h    | S1, Szenario 1                         |
| 3  | `next` und übrige Abhängigkeiten aktualisieren (`npm audit fix`), Tests und Build                                   | 1 h          | 3.3                                    |
| 4  | CSV-Schutz nach `src/lib/csv.ts`, im EÜR-Export anwenden                                                               | 30 min       | 2.1, Szenario 2 Teil 1                 |
| 5  | Breite Agenten-Freigaben entfernen, `settings.local.json` aus der Versionierung                                         | 15 min       | 2.4, Szenario 5                        |
| 6  | Kraken-Schlüssel auf Auszahlungsrecht prüfen                                                                            | Minuten      | begrenzt den Schaden von Szenario 4    |
| 7  | Security-Header in `next.config.ts`, CSP zunächst im Report-Only-Modus                                                 | 2 bis 4 h    | 2.2, Szenario 4                        |
| 8  | Eine Migration: Rechte auf `bank_connections`, `exchange_keys`, `fints_client_state`, `fund_prices` einschränken | 1 bis 2 h    | S4, S7, E1, E2                         |
| 9  | `CRON_SECRET` rotieren (32 zufällige Bytes), `api/bank-sync.py` fail-closed                                          | 30 min       | S2                                     |
| 10 | Serverseitiges Tagesbudget für Athena und Bildgenerierung                                                                | 1 bis 2 h    | S5, 3.2                                |
| 11 | `/api/bank/debug` auf POST oder in Produktion aus; `Sec-Fetch-Site`-Prüfung in `requireUser()`                     | 30 min       | 3.1                                    |
| 12 | Buckets: Limits und MIME-Listen für `avatars`, `belege`, `reports`; Auflisten von `avatars` unterbinden          | 30 min       | S8                                     |
| 13 | Zweiter Faktor (TOTP)                                                                                                     | 1 bis 3 Tage | 3.4                                    |

`scripts/security-probe.mjs` prüft die Punkte 1, 7 und 9 (indirekt) sowie die Erreichbarkeit der API ohne Login und kann nach jeder Änderung erneut laufen.

## 6. Offen geblieben

- **Nicht live geprüft:** Vercel-Umgebungsvariablen (nur indirekt über das Antwortverhalten), ob in Vercel dieselben Werte für `ENCRYPTION_KEY` und `CRON_SECRET` stehen wie lokal, die Live-Werte für Token-Ablauf und Mindestpasswortlänge, ob der ausgerollte Edge-Function-Code dem Repo entspricht, die Sichtbarkeit der GitHub-Remotes.
- **Nicht untersucht:** Python-Abhängigkeiten, die Berechtigungen des Kraken-API-Schlüssels, ob ein manipulierter `state_blob` python-fints angreifbar macht, ob Athenas Web-Abruf frei zusammengesetzte Adressen zulässt, ob der Passwortwechsel andere Sitzungen beendet, ob `sharp` auf dem Upload-Weg läuft.
- **Kein Test mit angemeldeter Sitzung:** Alle Aussagen dazu, was ein angemeldeter Nutzer über PostgREST darf, stammen aus den Rechten und Policies im Katalog, nicht aus einem Versuch.
- **Annahme:** Die Aussage „Server Actions sind gegen CSRF geschützt" stützt sich auf die Next.js-Dokumentation in `node_modules`, nicht auf einen eigenen Test.
