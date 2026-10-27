# FinTS-Verbindungen pro Nutzer

Stand 2026-10-30. Bezug: `docs/haushalt-multiuser.md` (Abschnitt 5 FinTS-Doppelsync, 8.4 Service-Role).
Ziel: Zugangsdaten (BLZ, Bank-URL, Benutzerkennung, PIN) liegen nicht mehr global in Env-Variablen, sondern pro Nutzer
verschlüsselt in der Datenbank und werden vom Nutzer selbst unter Einstellungen -> Integrationen -> Bankverbindungen gepflegt.

## 1. Architektur

```
Einstellungen (UI)  ->  Server Action (Zod)  ->  connections.ts  --encrypt-->  bank_connections (username_enc, pin_enc)
                                                                                   ^
Sync-Route /api/bank/sync ---- userHasBankAccess() --- Python-Function api/bank-sync.py ?user=<id>
Cron (vercel.json)  --------------------------------> api/bank-sync.py (ohne user: alle Nutzer mit Verbindung)
                                                       |  laedt bank_connections per REST (Service-Role),
                                                       |  entschluesselt im Speicher (AES-256-GCM, cryptography)
Lokaler Sidecar:  user-sync.ts -> resolveConnectionsForUser() -> sidecar.ts -> FINTS_PROFILES_JSON (Env des Kindprozesses)
```

Dateien:

| Datei | Aufgabe |
|---|---|
| `supabase/migrations/20261030100000_bank_connections.sql` (+ Rollback, Test) | Tabelle, RLS, Spaltenrechte |
| `src/lib/fints/connections-core.ts` | rein: bank_key, Maskierung, URL-Prüfung, Ver-/Entschlüsseln, Env-Fallback-Auflösung (getestet) |
| `src/lib/fints/connections.ts` | DB-Zugriff mit Service-Role: Liste, Anlegen, Ändern, Löschen, `resolveConnectionsForUser`, `userHasBankAccess`, `recordSyncResult` |
| `src/app/(dashboard)/settings/bank-connection-actions.ts`, `src/components/settings/bank-connections-form.tsx` | UI (eingebunden in `integrations-form.tsx`) |
| `api/bank-sync.py` | lädt/entschlüsselt Verbindungen selbst, Schleife über Nutzer/Verbindungen, Env-Fallback |
| `src/lib/fints/sidecar.ts`, `scripts/fints/fints_sync.py` | lokaler Pfad: Zugangsdaten per `FINTS_PROFILES_JSON` |

### Tabelle `bank_connections`
`id, user_id, label, bank_key, blz, fints_url, username_enc, username_hint, pin_enc, tan_medium, created_at, updated_at, last_sync_at, last_error`,
`unique(user_id, bank_key)`. `bank_key = sha256("<blz>:<username>")[:32]` (BLZ nur Ziffern, Kennung getrimmt) ist identisch zu
`fints_client_state.bank_key`; der vorhandene Client-State (Kundensystem-ID, 90-Tage-SCA-Ausnahme) passt daher weiter,
auch beim Wechsel von Env auf DB. `fints_client_state` bleibt unverändert (user_id, bank_key, owner-only).

### Maskierter Benutzername (Entscheidung)
Ein eigenes Feld `username_hint` ("***" plus letzte 3 Zeichen, bei Kennungen bis 6 Zeichen nur "***"). Begründung: Die UI darf
`username_enc` nie lesen (Spaltenrecht), also muss die Anzeige aus einem unkritischen Feld kommen, ohne dass für die Liste je entschlüsselt wird.
Preis: 3 Zeichen der Kennung liegen im Klartext in der DB (die alte Debug-Route zeigte ebenfalls 3 Zeichen).

### Rechte
- RLS owner-only (`user_id = (select auth.uid())`, Rolle `authenticated`).
- `revoke all ... from anon, authenticated`; `authenticated` darf nur die unkritischen Spalten SELECTen (nicht `username_enc`, nicht `pin_enc`;
  auch kein `select *`, kein Filter auf diese Spalten) sowie INSERT/UPDATE/DELETE (nur eigene Zeilen). `service_role` alles.
- Check-Constraints: `fints_url` beginnt mit `https://`, `blz` genau 8 Ziffern, Label 1-80 Zeichen.
- Schreiben aus der App läuft trotzdem über Server Actions mit Service-Role (Verschlüsselung gehört auf den Server).

### Sync-Architektur (Entscheidung)
**Python-Function entschlüsselt selbst** (Variante A der Aufgabe), statt dass Node entschlüsselt und die Zugangsdaten per Request-Body an Python schickt.
Gründe:
1. Zugangsdaten reisen nie über HTTP (auch nicht intern, nicht in Vercel-Request-Logs, nicht im Request-Body-Cache); sie existieren nur im Speicher der Function.
2. Der Cron (`vercel.json`, tabu) ruft die Function ohne Nutzer auf. Variante B bräuchte eine zusätzliche Node-Route als Vermittler und eine Änderung am Cron-Pfad.
3. AES-256-GCM ist trivial kompatibel: Schlüssel = `sha256(ENCRYPTION_KEY)`, Format `base64(iv):base64(tag):base64(ct)`; `cryptography.AESGCM` erwartet `ct||tag`.
   Kompatibilität ist getestet (Node verschlüsselt, Python entschlüsselt; falscher Schlüssel wird abgelehnt).
Preis: `ENCRYPTION_KEY` muss auch der Python-Function zur Verfügung stehen (gleiche Vercel-Projekt-Env, kein Zusatzaufwand) und neue Abhängigkeit `cryptography==43.0.3` in `requirements.txt`.

Ablauf in `api/bank-sync.py`:
- `?user=<uuid>` (manueller Sync aus der App; die Node-Route hat den Nutzer authentifiziert und `userHasBankAccess` geprüft, die Function selbst ist per `CRON_SECRET` geschützt):
  eigene Verbindungen, sonst Env-Verbindung wenn `user == BANK_SYNC_USER_ID` und Env vollständig, sonst HTTP 403.
- ohne `user` (Cron): alle Nutzer mit Verbindung, plus der Env-Nutzer, falls er keine eigene Verbindung hat.
- Genau ein Ziel (heute: Eric über Env): Verhalten und Fehlerpfade unverändert. Mehrere Ziele: ein Fehler stoppt die anderen nicht (Warnung + `last_error`).
- Je Verbindung werden `last_sync_at`/`last_error` gesetzt (Fehlertexte gekürzt auf 300 Zeichen, PIN maskiert).
- Fehlt die Tabelle (Migration noch nicht angewendet, PostgREST 404), gilt "keine Verbindungen" -> reiner Env-Betrieb. Jeder andere DB-Fehler wird NICHT stillschweigend durch den Env-Fallback ersetzt.
- SCA/TAN-Strecke (Client-State, `sca_required_since`, decoupled Polling) ist unverändert.

Lokaler Sidecar: `syncBankForUser` löst die Verbindungen auf und übergibt sie über die Umgebung des Kindprozesses (`FINTS_PROFILES_JSON`, nie argv/Datei).
Ohne eigene Verbindung läuft er wie bisher mit den `FINTS_*`-Variablen. Gehört die Env-Bank zu derselben Kennung (gleicher `bank_key`), bleiben
`FINTS_EXTRA_ACCOUNTS` (Bausparvertrag/Depot-Proben) erhalten. `FINTS_BANK2_*` werden nur ohne eigene Verbindungen gelesen (siehe "Nicht abgedeckt").

### Guards
`userId === BANK_SYNC_USER_ID` wurde ersetzt durch `userHasBankAccess(userId)` (Verbindung vorhanden oder Env-Nutzer mit vollständiger Env) in
`user-sync.ts`, `api/bank/sync`, `api/bank/balance`. `api/bank/debug` hatte keinen Guard und lief mit den Env-Zugangsdaten für jeden eingeloggten Nutzer;
sie nutzt jetzt `resolveConnectionsForUser` (ohne Verbindung und ohne Env-Nutzer: nichts).
Nicht angefasst (anderer Agent / separat): `src/lib/assistant/actions/bank.ts:25` (Paket D), `src/lib/waitlist.ts`, verwaiste Route `src/app/api/cron/bank-sync/route.ts`
(läuft weiter als Single-Tenant mit `BANK_SYNC_USER_ID`; sie wird von `vercel.json` nicht aufgerufen).

## 2. Threat Model

| Bedrohung | Maßnahme / Restrisiko |
|---|---|
| Fremder Nutzer liest PIN/Kennung | RLS owner-only plus Spaltenrecht: `authenticated` kann `*_enc` nicht lesen (Test `supabase/tests/bank_connections.sql` prüft `permission denied`, auch bei Filter; Stand: Test geschrieben, noch nicht live gelaufen). |
| Datenbank-Dump / Backup / Supabase-Leak | Nur Chiffretext (AES-256-GCM, zufälliger IV je Wert, Auth-Tag). Ohne `ENCRYPTION_KEY` wertlos. |
| Leak von `ENCRYPTION_KEY` UND DB | Totalschaden für alle Verbindungen (ebenso für `exchange_keys`). Schlüssel nur in Vercel-Env, nie im Repo, nie loggen. |
| Service-Role-Key-Leak | Liest Chiffretext; ohne `ENCRYPTION_KEY` nutzlos, aber mit beiden alles. Kein Schutz gegen kompromittierten Server-Code. |
| Geheimnisse in Logs/Fehlern/Antworten | Fehlertexte enthalten nie Klartext/Chiffretext; UI bekommt nur `BankConnectionPublic`; Fehlertexte in `last_error` auf 300 Zeichen gekürzt, PIN maskiert. |
| SSRF über die Bank-URL | Constraint (nur https) in der DB, `validateFintsUrl` in der App (kein localhost, keine IP-Literale, keine internen Namen, nur Port 443). Restrisiko: DNS-Rebinding / öffentlicher Name, der intern auflöst; Vercel-Funktionen haben kein internes Netz, daher gering. |
| Nutzer fremder Verbindung schreibt per Client direkt | RLS-Check `user_id = auth.uid()`; fremde Zeilen: 0 betroffen (im SQL-Test vorgesehen, noch nicht live gelaufen). Client könnte beliebigen Chiffretext einfügen, der nur beim Entschlüsseln fehlschlägt (eigene Verbindung, Fehlermeldung). |
| Doppelsync / falsche Zuordnung | Zeilen werden immer mit `user_id` der Verbindung geschrieben; IBAN-Dedupe im Haushalt ist Phase 4 (offen). |
| Replay/Manipulation des Chiffretexts | GCM-Tag: Manipulation führt zu `InvalidTag`. |

Bekannte Altlast (nicht Teil dieser Arbeit): `exchange_keys` hat Tabellenrechte für `anon`/`authenticated` inkl. SELECT auf Chiffretext und eine Policy für Rolle `public`. Gleiche Spaltenrechte-Härtung wie hier wäre dort sinnvoll.

### Schlüssel, Rotation, Verlust
- Schlüssel: Env `ENCRYPTION_KEY` (beliebiger String; effektiver Schlüssel `sha256(ENCRYPTION_KEY)`), derselbe wie für `exchange_keys`. Er muss in Vercel für die Next-Funktionen UND die Python-Function gelten (ein Projekt, eine Env) und lokal in `.env.local`.
- Rotation (nicht automatisiert): neuen Schlüssel setzen heißt, alle Chiffretexte neu zu verschlüsseln. Ablauf: Skript mit altem und neuem Schlüssel, `decrypt` mit alt, `encrypt` mit neu für `bank_connections` UND `exchange_keys` in einer Transaktion, dann Env umstellen und neu deployen. Ohne solches Skript: Verbindungen und Kraken-Keys neu eintragen.
- Schlüsselverlust/-wechsel ohne Neuverschlüsselung: Entschlüsselung scheitert (`InvalidTag`). Der Sync meldet "Bankverbindung ... konnte nicht entschlüsselt werden (ENCRYPTION_KEY geändert?)" und fällt NICHT auf Env zurück. Es gehen nur die Zugangsdaten verloren: Verbindung löschen und neu eintragen. Buchungen und Client-State bleiben (der State enthält weder PIN noch Verbindungsdaten); der `bank_key` ist deterministisch, die SCA-Ausnahme bleibt erhalten.

## 3. Migration von Env auf DB für Eric (Schritte)

Bis dahin ändert sich nichts: Eric hat keine Zeile in `bank_connections`, der Env-Fallback bedient ihn (UI zeigt den Hinweis "läuft derzeit noch über die serverseitig hinterlegte Verbindung").

1. Vercel prüfen: `ENCRYPTION_KEY` ist gesetzt (wird für Kraken-Keys ohnehin gebraucht) und gilt auch für Production.
2. Migration anwenden (nach Freigabe): `20261030100000_bank_connections.sql`. Danach Test `supabase/tests/bank_connections.sql` (rollend) laufen lassen; danach Typen regenerieren (`bank_connections` in `src/types/database.ts`), dann kann der untyped Client in `connections.ts` entfallen.
3. Deploy (enthält `cryptography` in `requirements.txt`). Prüfen, dass der nächste Cron-Lauf weiter durchläuft (Env-Fallback).
4. In der App: Einstellungen -> Integrationen -> Bankverbindungen -> Hinzufügen. Dieselben Werte wie in den Env-Variablen: BLZ, Bank-URL (FINTS_URL), Kennung (FINTS_USERNAME), PIN. Gleiche BLZ + Kennung ergibt denselben `bank_key`, der Client-State passt weiter, also keine neue App-Freigabe.
5. "Bankdaten synchronisieren" manuell auslösen; in der Liste muss "Letzter Abruf" gesetzt sein. Die Function-Logs zeigen weiterhin keine PIN.
6. Erst danach Env-Variablen `FINTS_URL`, `FINTS_BLZ`, `FINTS_USERNAME`, `FINTS_PIN` (und `BANK_SYNC_USER_ID`, falls nicht mehr gebraucht) entfernen. Nicht entfernen: `FINTS_PRODUCT_ID` (Produktregistrierung der App, gilt für alle Verbindungen), `CRON_SECRET`, `ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Hinweis: `BANK_SYNC_USER_ID` dient auch `src/lib/waitlist.ts` (Fallback hinter `WAITLIST_OWNER_ID`) und `src/lib/assistant/actions/bank.ts`; vor dem Entfernen diese Stellen klären.
7. Rückweg: Verbindung in der App löschen und Env-Variablen wieder setzen, oder Rollback-Skript.

## 4. Hinweise für den Betrieb
- Cron ohne Nutzer synct alle Verbindungen nacheinander in EINER Function-Ausführung (maxDuration 300 s). Bei vielen Verbindungen müsste später pro Nutzer getrennt aufgerufen werden (Cron fächert auf).
- Banken: viele Verbindungen von Vercel-IPs können Betrugserkennung auslösen (siehe Kommentar in `api/bank-sync.py`).
- Fehler je Verbindung stehen in `last_error` (Einstellungen) und in den Function-Logs (ohne Zugangsdaten).
- `fints_client_state` ist weiter owner-only; ein Nutzer, der eine Verbindung löscht, behält seinen State (harmlos, kein Geheimnis).

## 5. Nicht abgedeckt / offen
- `tan_medium` wird gespeichert und angezeigt, aber noch nicht an python-fints durchgereicht (heutiges Verhalten: Standard-TAN-Verfahren der Bank, Direktfreigabe).
- Zusätzliche Env-Banken `FINTS_BANK2_*` und deren `EXTRA_ACCOUNTS` werden nur ohne eigene Verbindungen gelesen (lokaler Sidecar); die Python-Function kannte sie nie.
- Benutzerkennung ist nicht änderbar (bestimmt den `bank_key`); dafür löschen und neu anlegen.
- Keine automatische Schlüsselrotation (siehe oben).
- Haushalt Phase 4 (IBAN-Dedupe, `sync_owner`) ist unabhängig davon und weiter offen.
