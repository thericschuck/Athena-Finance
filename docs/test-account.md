# Test-Account für die Entwicklung

Ein dauerhafter, klar markierter Test-Nutzer mit **rein synthetischen** Daten, mit dem sich die App automatisiert (Playwright) oder von Hand bedienen lässt, ohne Erics echte Daten zu berühren.

Stand: 14.11.2026. Angelegt mit `scripts/test-account.mjs`, nicht versioniert sind nur Passwort, Sitzung und Screenshots (`.claude/test-account.local`, `.claude/test-account.state.json`, `.claude/test-account-screens/`, siehe `.gitignore`).

## Was der Account ist

| | |
|---|---|
| E-Mail | `test-claude@athena-finance.local` (Domain `.local`, nicht zustellbar, nicht zu verwechseln mit `athena-finance.de`) |
| Anzeigename | `TEST Claude (synthetisch, kein echter Nutzer)` (steht in der Seitenleiste, Kürzel „TE") |
| Passwort | zufällig (24 Zeichen), nur in `.claude/test-account.local` |
| Projekt | **dasselbe Supabase-Projekt wie die echte App** (es gibt keine zweite Umgebung), siehe „Grenzen" |
| Haushalt | **keiner.** Keine Zeile in `household_members`, also kein gemeinsamer Scope mit Eric |

**Nie hinterlegen:** echte Zugangsdaten, FinTS/Bankverbindungen, Kraken-Schlüssel, Athena-API-Schlüssel. Der Nutzer ist nicht `BANK_SYNC_USER_ID`, deshalb greift auch der Env-Fallback (`FINTS_*`) nicht für ihn.

## Wie er angelegt wurde

1. `node scripts/test-account.mjs create` legt den Nutzer über die Supabase-Admin-API an (`auth.admin.createUser`, `email_confirm: true`, Service-Role-Schlüssel aus `.env.local`). Das Passwort wird zufällig erzeugt und **nur** in `.claude/test-account.local` geschrieben (Rechte 600), nie ausgegeben.
   Der Signup-Trigger `handle_new_user` legt dabei nur eine Zeile in `user_profiles` an; das Skript setzt Anzeigename und Währung.
2. `node scripts/test-account.mjs seed` legt synthetische Daten an: 3 Konten (Test-Girokonto, Test-Tagesgeld, Test-Bargeld), 7 Kategorien (Gehalt, Nebeneinkommen, Wohnen, Lebensmittel, Mobilität, Freizeit, Abos), 28 Buchungen über etwa vier Monate (Gehalt, Miete, Streaming, Einkäufe, Fahrkarten, Freizeit, zwei Nebeneinnahmen), 1 Sparziel, 1 Vertrag. Beträge kommen aus einem festen Zufallsgenerator: gleiche Zahlen bei jedem Lauf, nur das Datum wandert mit dem Heute.
3. Die Playwright-Anbindung (`scripts/test-account-browser.mjs`, `playwright-core` als devDependency) nutzt das lokal installierte Chrome oder Edge, meldet sich über die Login-Seite an und speichert die Sitzung zwischen.

## Isolation (geprüft am 14.11.2026)

- Der Test-Nutzer ist in keinem Haushalt (`household_members`: 0 Zeilen).
- Als Test-Nutzer angemeldet sichtbar: 3 Konten, 7 Kategorien, 28 Buchungen, 1 Vertrag, 1 Sparziel; **0** Bankbuchungen (Eric: 773), 0 Haushalte, 0 Depots, 0 Assets, **0 Zeilen mit fremder `user_id`** in jeder geprüften Tabelle.
- Das Skript bricht vor jedem Schreiben ab, wenn der Nutzer nicht die Test-E-Mail trägt, nicht auf `.local` endet, Mitglied eines Haushalts ist oder `BANK_SYNC_USER_ID` entspricht. Alle Löschungen sind auf die `user_id` des Test-Nutzers begrenzt.

## Benutzung

```bash
# Dev-Server muss laufen (npm run dev), sonst BASE_URL setzen
node scripts/test-account-browser.mjs                       # Login + Tour (Dashboard, Analyse, Buchungen, Konten, Berichte, Depot, Einstellungen)
node scripts/test-account-browser.mjs /analyse /depot       # nur diese Seiten
BASE_URL=http://localhost:3001 node scripts/test-account-browser.mjs
```

Ausgabe: je Seite Ziel-Pfad, Status, Dauer, Zahl der JS-Fehler; dazu die Zahl der CSP-Meldungen. Screenshots liegen in `.claude/test-account-screens/`.

Eigene Abläufe: `import { mitTestAccount } from './test-account-browser.mjs'` und `await mitTestAccount(async ({ page }) => { ... })`. Die Funktion meldet an (oder nimmt die gespeicherte Sitzung) und gibt eine angemeldete Seite zurück.

Von Hand einloggen: E-Mail steht oben, das Passwort steht in `.claude/test-account.local` (JSON-Feld `password`).

## Testdaten zurücksetzen und verwalten

```bash
node scripts/test-account.mjs status    # Zustand, ohne Passwort
node scripts/test-account.mjs seed      # Daten neu anlegen (setzt vorher zurück)
node scripts/test-account.mjs reset     # alle Daten löschen, Nutzer bleibt
node scripts/test-account.mjs rotate    # neues Passwort (Datei wird überschrieben)
node scripts/test-account.mjs delete    # Daten UND Nutzer löschen
```

`reset` räumt `transactions`, `contracts`, `savings_goals`, `net_worth_snapshots`, `insights`, `accounts`, `categories` und zuletzt `audit_log` (Trigger protokollieren jedes Einfügen und Löschen) für diesen einen Nutzer. Nach `delete` zusätzlich die lokale Zugangsdatei und `.claude/test-account.state.json` entfernen.

Nach einem Passwortwechsel die gespeicherte Sitzung (`.claude/test-account.state.json`) löschen, sonst kann der nächste Lauf mit einer abgelaufenen Sitzung starten.

## Grenzen und Nebenwirkungen

- **Produktionsprojekt:** Der Account existiert im selben Supabase-Projekt wie die echten Daten. Er taucht in `auth.users` auf (Nutzerzahlen, Admin-Ansichten). Crons und Jobs, die über alle Nutzer laufen (zum Beispiel Snapshots), können Zeilen für ihn anlegen; `reset` räumt `net_worth_snapshots` und `insights` mit ab.
- **Nicht abgedeckt:** alles, was Bank, Kraken oder Athena-Modelle braucht (Bank-Sync, Krypto-Kurse über Kraken, Assistent). Dafür gibt es bewusst keine Zugangsdaten. Seiten wie Depot und Krypto zeigen Leerzustände.
- **Der Service-Role-Schlüssel** steht in `.env.local` und wird vom Skript benutzt (Anlegen, Seeden, Zurücksetzen). Er wird nicht ausgegeben und ist nicht Teil des Browser-Codes.
- Die Seiten lassen sich mit `PERF_LOG=1` messen: Dashboard, Analyse und Co. rendern mit dem Test-Datenbestand (28 Buchungen), das ist nicht die Größenordnung der echten Daten (777).
