# Deploy-Checkliste: Secret-Rotation der Edge Functions

**Samstag, 14.11.2026.** Hintergrund: `SECURITY-AUDIT.md`, Befund S1. Die drei Cron-Functions (`fetch-fund-price`, `execute-savings-plans`, `daily-snapshot`) lassen sich bisher mit dem öffentlichen anon-Key auslösen. Der Code dagegen ist committet (Commit „Edge Functions: anon-Key-Zugriff schliessen (Code)"). Das hier ist der manuelle Teil: Secret eintragen, deployen, Migration anwenden, prüfen.

**Empfohlenes Zeitfenster: 08:15 bis 09:45 Uhr MEZ.** Gesamtdauer etwa 30 Minuten. Fertig sein musst du vor 09:50 Uhr (Sparplan-Job um 10:00 Uhr). Begründung in Abschnitt 5.

**Migration:** `supabase/migrations/20261113100000_cron_jobs_vault_secret.sql` (und der Rollback in `supabase/rollbacks/`) sind bewusst noch **nicht committet**. Erst nach erfolgreicher Verifikation (Abschnitt 4) einchecken.

Alle Terminal-Befehle sind für Git Bash gedacht, im Projektordner.

---

## 1. Vorbereitung

Kann vorher erledigt werden, außerhalb des Zeitfensters. Ändert nichts am laufenden Betrieb.

- [ ] Neues Secret erzeugen:
  ```bash
  openssl rand -hex 32
  ```
  Falls kein `openssl` vorhanden:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Ergebnis (64 Hex-Zeichen) in den Passwortmanager legen, nicht in eine Datei im Projekt.
- [ ] **NICHT** das Secret aus einem früheren Chat oder Terminal-Verlauf wiederverwenden. Das gilt auch für den Wert, den ich dir im Chat angezeigt habe: Er steht in diesem Verlauf. Hast du ihn schon irgendwo eingetragen (Vercel, `.env.local`), wird er in Abschnitt 2 überschrieben.
- [ ] Neues Secret auch nirgends in einen Chat, einen Commit oder eine Issue einfügen.
- [ ] Supabase-CLI anmelden (einmalig):
  ```bash
  npx supabase login
  ```
- [ ] Das Projekt ist lokal **nicht verknüpft** (`supabase/.temp/project-ref` fehlt). Deshalb braucht jeder CLI-Befehl `--project-ref jefmszovqziiqxotncjm` (steht unten schon dabei), oder du verknüpfst einmal:
  ```bash
  npx supabase link --project-ref jefmszovqziiqxotncjm
  ```
- [ ] Prüfen, dass die vier Commits lokal da sind:
  ```bash
  git log --oneline -4
  ```
  Erwartet: „Edge Functions: anon-Key-Zugriff schliessen (Code)", „Bank-Sync: CRON_SECRET fail-closed", „CSV-Formel-Injection beheben", „Settings/Gitignore bereinigen".
- [ ] Im Supabase-Dashboard unter Edge Functions nachsehen, dass die drei Functions `fetch-fund-price`, `execute-savings-plans`, `daily-snapshot` mit „ACTIVE" aufgelistet sind (Ausgangszustand, `verify_jwt` steht aktuell an).

---

## 2. Secret an vier Stellen eintragen (überall derselbe Wert)

Im Zeitfenster. Reihenfolge einhalten. Die Schritte a und b ändern am laufenden Betrieb noch nichts: Der alte `daily-snapshot`-Code lässt JWTs weiter durch.

**a) Supabase Edge Function Secrets**
- [ ] Dashboard → Edge Functions → Secrets → Name `CRON_SECRET`, Wert = neues Secret → speichern. (Gibt es den Eintrag schon, überschreiben.)
- [ ] Prüfen, dass der Eintrag in der Liste steht (der Wert wird nur als Hash angezeigt).

**b) Supabase Vault**
- [ ] Dashboard → SQL Editor, in einem neuen, leeren Tab:
  ```sql
  select vault.create_secret('<WERT>', 'cron_secret', 'Bearer-Secret der pg_cron-Jobs für die Edge Functions');
  ```
  (`<WERT>` durch das neue Secret ersetzen, Anführungszeichen stehen lassen.)
- [ ] Danach prüfen, dass es angelegt und 64 Zeichen lang ist (gibt das Secret nicht aus):
  ```sql
  select name, length(decrypted_secret) as laenge from vault.decrypted_secrets where name = 'cron_secret';
  ```
  Erwartet: eine Zeile, `laenge = 64`. Kommt „duplicate key", gibt es den Namen schon: dann stattdessen `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<WERT>');`.
- [ ] Den Tab leeren und die Abfrage aus dem Verlauf des SQL-Editors löschen, damit das Secret dort nicht stehen bleibt.

**c) Vercel Environment Variables**
- [ ] Vercel → Projekt → Settings → Environment Variables → `CRON_SECRET` für **Production** auf das neue Secret setzen.
- [ ] Zusätzlich für **Preview**, falls dort schon eine Variable `CRON_SECRET` gesetzt ist (sonst nicht anlegen).
- [ ] **Sofort danach neu deployen** (Deployments → letztes Deployment → Redeploy). Änderungen an Umgebungsvariablen gelten nur für neue Deployments. Zwischen Env-Änderung und fertigem Redeploy können Vercel-Cron-Läufe mit 401 scheitern; deshalb im Fenster 08:15 bis 09:45 Uhr, nicht zu den Uhrzeiten aus Abschnitt 5.
- [ ] Beachten: Ein Redeploy des **aktuellen** Stands bringt `api/bank-sync.py` (fail-closed) noch nicht live. Die lokalen Commits sind nicht gepusht. Wenn du pushst, gehen alle vier Commits mit raus (Settings, CSV-Schutz, Bank-Sync, Edge-Function-Code). Das ist deine Entscheidung, hier nichts pushen, solange du es nicht willst.
- [ ] Nach dem Redeploy: `node scripts/security-probe.mjs` später in Abschnitt 4 zeigt `CRON_SECRET … OK`.

**d) `.env.local` (lokal)**
- [ ] Die Zeile `CRON_SECRET=...` auf das neue Secret setzen.
- [ ] Falls die geplante Windows-Aufgabe `AthenaFinance-BankSync` noch eingerichtet ist: einmal neu registrieren, weil sie das Secret beim Einrichten fest in den `curl`-Aufruf schreibt:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-bank-sync-schedule.ps1 -IntervalHours 6
  ```
- [ ] Prüfen, dass `.env.local` nicht versioniert ist: `git status` darf sie nicht anzeigen.

---

## 3. Deploy-Reihenfolge (wichtig, nicht vertauschen)

**Warum diese Reihenfolge:** Wird die Migration zuerst angewendet, schicken die Jobs das Secret (kein JWT) an Functions, bei denen `verify_jwt` noch aktiv ist. Die Plattform weist die Aufrufe dann ab, bevor der Code läuft. Werden zuerst die Functions deployt, ist die Lücke sofort zu: Der anon-Key bekommt ab dem Deploy 401. Die Lücke zwischen den beiden Schritten (alte Jobs schicken noch den anon-Key und bekommen 401) ist dann nur so lang, wie du für Schritt 2 brauchst.

**Schritt 1: Die drei Edge Functions deployen**
- [ ] Im Projektordner:
  ```bash
  npx supabase functions deploy fetch-fund-price execute-savings-plans daily-snapshot --project-ref jefmszovqziiqxotncjm
  ```
  `verify_jwt = false` kommt aus `supabase/config.toml` (Abschnitt `[functions.*]`).
- [ ] Falls die CLI mehrere Namen nicht akzeptiert, einzeln:
  ```bash
  npx supabase functions deploy fetch-fund-price --project-ref jefmszovqziiqxotncjm
  npx supabase functions deploy execute-savings-plans --project-ref jefmszovqziiqxotncjm
  npx supabase functions deploy daily-snapshot --project-ref jefmszovqziiqxotncjm
  ```
- [ ] Falls ein Docker-Fehler kommt (die CLI will lokal bündeln): `--use-api` an den Befehl hängen.
- [ ] Nicht ohne Funktionsnamen deployen: Das würde auch `execute-contracts` (stillgelegter 410-Stub) mit neu ausrollen.
- [ ] **Beachten:** `functions deploy` nimmt die Dateien aus dem Arbeitsbaum, nicht aus den Commits. `execute-savings-plans` geht daher mit dem noch **uncommitteten** Sparplan-Fix (Bereichsabfrage, Kursalter-Prüfung, siehe Abschnitt 6) live. Das ist gewollt und bei leerer `savings_plans`-Tabelle risikoarm. Willst du nur den Secret-Stand deployen, vorher `git stash -u -- supabase/functions/execute-savings-plans` ausführen und nach dem Deploy `git stash pop`.
- [ ] Im Dashboard unter Edge Functions prüfen: alle drei haben eine neue Version, und „Verify JWT" ist **aus**.

**Schritt 2: Sofort danach (innerhalb von 1 bis 2 Minuten) die Migration anwenden**
- [ ] SQL Editor: den Inhalt von `supabase/migrations/20261113100000_cron_jobs_vault_secret.sql` einfügen und ausführen. Alternativ `npx supabase db push`; das würde allerdings auch andere noch nicht angewendete Migrationen mitnehmen, deshalb der SQL Editor.
- [ ] Erwartet: keine Fehlermeldung. Die Migration bricht ab, ohne etwas zu ändern, wenn das Vault-Secret fehlt oder kürzer als 32 Zeichen ist oder ein Job nicht gefunden wird. Die Fehlermeldung nennt dann die Ursache.
- [ ] Gegenprüfung (gibt keinen Token aus):
  ```sql
  select jobid, jobname, active,
         command like '%vault.decrypted_secrets%' as liest_vault,
         command ~ 'eyJ' as enthaelt_jwt
  from cron.job
  where jobname in ('fetch-fund-price', 'execute-savings-plans', 'Daily-Snapshot')
  order by jobid;
  ```
  Erwartet: drei Zeilen (24, 26, 1287), `active = true`, `liest_vault = true`, `enthaelt_jwt = false`.

---

## 4. Verifikation (in dieser Reihenfolge)

Die Tests mit `curl` brauchst du, bevor der nächste Job läuft. Das Secret in die Shell-Variable legen, ohne es auszugeben:

```bash
read -rs CRON_SECRET     # Secret einfügen, Enter (es wird nicht angezeigt)
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
BASIS=https://jefmszovqziiqxotncjm.supabase.co/functions/v1
```

- [ ] **`daily-snapshot` mit richtigem Secret und `?date=2020-01-01` aufrufen:**
  ```bash
  curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Authorization: Bearer $CRON_SECRET" "$BASIS/daily-snapshot?date=2020-01-01"
  ```
  **Erwartet: HTTP 400**, Body `{"ok":false,"error":"date darf höchstens 7 Tage zurückliegen"}`. Das ist ein sicherer Test: Das Datum wird abgelehnt, bevor irgendetwas geschrieben wird. Siehst du 401, stimmt das Secret nicht überein (Edge-Secret prüfen). Siehst du 500 „CRON_SECRET nicht konfiguriert", fehlt das Edge-Secret.
- [ ] **`daily-snapshot` mit dem alten anon-Key aufrufen:**
  ```bash
  curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Authorization: Bearer $ANON" "$BASIS/daily-snapshot?date=2020-01-01"
  ```
  **Erwartet: HTTP 401**, Body `{"error":"Unauthorized"}`. Das ist der Beweis, dass die Lücke zu ist. (Ein 200 hieße: alter Code ist noch aktiv, Schritt 1 wiederholen.)
- [ ] Zusätzlich ohne Header:
  ```bash
  curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASIS/fetch-fund-price"
  ```
  Erwartet: HTTP 401. (`fetch-fund-price` ohne Secret nicht aufrufen, siehe Warnhinweis: dieser Aufruf trägt keinen Header und wird abgewiesen, ist also harmlos.)

> ## ⚠️ ACHTUNG: `execute-savings-plans` NICHT mit gültigem Secret aufrufen
> Das würde **echte Sparpläne buchen** (Depot-Transaktionen in der Produktionsdatenbank). Es gibt keinen Trockenlauf. Diese Function wird ausschließlich über den Cron-Job um 10:00 Uhr MEZ geprüft, siehe nächster Punkt. Auch `fetch-fund-price` nicht unnötig mit gültigem Secret aufrufen (schreibt Kurse).

- [ ] **SQL: Antworten der Job-Läufe ansehen**, **nach** dem nächsten Job-Lauf:
  ```sql
  select id, status_code, left(content, 80) from net._http_response order by created desc limit 20;
  ```
  **Erwartet: 200 oder 422, nicht mehr 401.** Wann welcher Job läuft:
  - **Samstag 10:00 Uhr MEZ: `execute-savings-plans`**, der erste Lauf nach dem Deployment. Erwartet 200, Inhalt beginnt mit `{"date":"2026-11-14","results":…`.
  - **Sonntag 00:59 Uhr MEZ (die Nacht auf Sonntag): `daily-snapshot`**. Erwartet 200, Inhalt `{"ok":true,"log":…`.
  - **Montag ab 09:00 Uhr MEZ: `fetch-fund-price`** (läuft nur Mo bis Fr, 9 bis 21 Uhr MEZ alle 15 Minuten). Erwartet 200 (422 nur, wenn die Tabelle `fund_sources` leer ist).
  - Zeilen von **vor** der Migration (also aus der Lücke zwischen Schritt 1 und 2) dürfen 401 zeigen. Entscheidend sind die Zeilen **danach**.
  - pg_net hebt Antworten nur wenige Stunden auf: den Lauf von 10:00 Uhr also zeitnah ansehen.
- [ ] **Sicherheitsprobe laufen lassen:**
  ```bash
  node scripts/security-probe.mjs
  ```
  Unauffällig heißt hier: `CRON_SECRET` meldet `OK`, die fünf API-Routen ohne Login `OK` (HTTP 401), alle „anon liest …"-Zeilen `OK`. Bekannt und **noch offen** sind: `Registrierung` (`KRITISCH`, solange sie nicht abgeschaltet ist, Abschnitt 6), die fehlenden Security-Header (`OFFEN`), `fund_prices` (`HINWEIS`, Stammdaten) und `Bucket avatars auflisten` (`PRUEFEN`). Das Skript beendet sich deshalb zurzeit mit Exit-Code 1. Die Edge Functions prüft es **nicht**; das sind die `curl`-Tests oben.

**Falls ein Test nicht wie erwartet ausgeht:**
- [ ] Zuerst Vault-Wert und Edge-Secret vergleichen: Beide müssen exakt dasselbe Secret sein (Länge 64, keine Leerzeichen am Ende).
- [ ] Nach dem Setzen eines Secrets kurz warten und den Test wiederholen.
- [ ] Notfall (stellt den **unsicheren** Zustand wieder her): Migration zurück mit `supabase/rollbacks/20261113100000_cron_jobs_vault_secret.down.sql` (anon-Key bei `v_anon` eintragen) und den alten Function-Stand deployen: `git checkout d4461a0 -- supabase/functions supabase/config.toml`, dann Schritt 1 wiederholen.

**Wenn alles stimmt:**
- [ ] Migration und Rollback committen (erst jetzt):
  ```bash
  git add supabase/migrations/20261113100000_cron_jobs_vault_secret.sql supabase/rollbacks/20261113100000_cron_jobs_vault_secret.down.sql
  git commit
  ```
- [ ] `supabase/baseline/10_cron_jobs_DOKUMENTATION.sql` beschreibt noch den alten Zustand (Klartext-Token). Bei Gelegenheit nachziehen.

---

## 5. Zeitfenster, die vermieden werden müssen

Alle Zeiten MEZ (UTC+1). Der Kern, den du genannt hast:

- [ ] **Nicht um 00:59 Uhr** (Snapshot-Job `Daily-Snapshot`) und kurz danach deployen. Ein verpasster Lauf wird zwar am nächsten Tag über die letzten drei Tage nachgeholt, soll aber gar nicht erst ausfallen.
- [ ] **Nicht um 10:00 Uhr** (Sparplan-Job `execute-savings-plans`) und kurz danach deployen. Ein verpasster Lauf bucht erst am nächsten Tag (der Ausführungstag zählt als „erreicht oder überschritten"), also einen Tag später.

Dazu die Vercel-Crons, relevant für die Env-Änderung und den Redeploy in Abschnitt 2c (UTC in MEZ umgerechnet):

- [ ] **08:00 Uhr** (`/api/cron/reminders`, täglich): nicht während Env-Änderung oder Redeploy.
- [ ] **01:00 / 07:00 / 13:00 / 19:00 Uhr** (`/api/bank-sync`), jeweils plus 20 und 30 Minuten (`categorize`, `kraken-sync`): ebenfalls meiden. Samstags ist sonst nichts geplant: `fetch-fund-price` läuft nur Mo bis Fr, der Monatsreport nur am 1., der Athena-Wochenlauf nur montags.

**Empfohlenes Zeitfenster für das gesamte Deployment: Samstag 08:15 bis 09:45 Uhr MEZ.**
- [ ] Beginn nicht vor 08:15 Uhr (nach dem Erinnerungs-Cron um 08:00 Uhr).
- [ ] Spätestens um 09:45 Uhr mit Abschnitt 3 fertig sein, 15 Minuten Reserve vor dem Sparplan-Job um 10:00 Uhr.
- [ ] Die Verifikation aus Abschnitt 4 (SQL-Abfrage zum 10:00-Uhr-Lauf) folgt danach, also ab etwa 10:05 Uhr.

---

## 6. Danach noch offen (nicht Teil dieses Deployments)

- [ ] **Registrierung im Supabase-Dashboard abschalten** (Authentication → Sign In / Providers → „Allow new users to sign up" aus). Maßnahme 1 aus `SECURITY-AUDIT.md`, weiterhin offen und das größte verbliebene Loch. Danach die Einladung mit einer Test-Einladung einmal prüfen. `node scripts/security-probe.mjs` meldet `Registrierung` dann `OK`.
- [ ] **Doppelbuchungs-Bug im Sparplan** (A1 aus `AUDIT.md`): Der Code-Fix liegt im Arbeitsbaum (`supabase/functions/execute-savings-plans/index.ts` und `regeln.ts`), ist aber noch **nicht committet**. Bestand live: 8 überzählige Buchungen aus dem September 2026 (200,00 EUR). Es gibt aktuell keinen Sparplan mehr (`savings_plans` ist leer), der 10:00-Uhr-Lauf bucht also nichts. Offen sind noch: Bereinigung (`supabase/data/20261113_sparplan_duplikate_bereinigen.sql`, erst Trockenlauf) und danach die Migration `20261113110000_savings_plan_unique_per_month.sql`.
- [ ] Die Commits sind **lokal und nicht gepusht**. Bank-Sync (`api/bank-sync.py` fail-closed) und CSV-Schutz sind erst in Produktion, wenn du pushst und Vercel deployt.
