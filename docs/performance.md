# Performance und Caching

Stand: 2026-10-22. Ergebnis einer Analyse der ganzen App und der Umsetzung der Befunde.

## Was bewusst so ist

- **Alle App-Seiten sind dynamisch** (pro Nutzer, Cookies). Es gibt kein `use cache` und `cacheComponents` ist aus: Der Umbau lohnt für
  eine Ein-Personen-App mit frischen Zahlen nicht. Dedupliziert wird per React `cache()` (`getAuthUser`, `getSettings`).
- **Layout-Einstellungen werden nicht geteilt gecacht.** Profil, Einstellungen und Athena-Einstellungen laufen schon parallel zur Seite;
  ein geteilter Cache bräuchte den Service-Role-Client (Steuerprofil, Bruttolohn), Tags in 16 Schreibstellen und brächte kaum Wartezeit.

## Umgesetzt

| Maßnahme | Wirkung |
|---|---|
| **Region** `fra1` in `vercel.json` (Datenbank: eu-central-1) | Ohne Angabe laufen Funktionen in `iad1`: jede Abfrage ~90–110 ms Atlantik statt ~10 ms |
| **Auth lokal prüfen** (`getClaims()` in Proxy und `getAuthUser`) | Zwei Auth-Server-Aufrufe pro Seitenwechsel entfallen (Projekt signiert mit ES256). Widerrufene Token gelten bis Ablauf (1 h); Rebalancing, Reports, Passwort fragen weiter per `getUser()` |
| **Startseite statisch**, Weiterleitung im Proxy | `/` wird vorgerendert statt pro Besuch gerechnet |
| **Kontostand-Historie als Funktion** `balance_series` | 18.324 Zeilen / 4–20 Anfragen → 386 Läufe / 1 Anfrage, parallel zur ersten Abfragewelle; sichtbare Zahlen identisch |
| **Prognose**: Modelle einmal lernen und im Prozess merken, Backtest per Index statt Datums-String | Rechenzeit je Lauf -43 %, Basis+Szenario teilen die Modelle (vorher viermal gelernt), Wiederholung/Annahmen ändern: Lernen entfällt. Ergebnis byte-identisch |
| **Steuer-Laden**: Abfragen gleichzeitig statt nacheinander, drei Jahre teilen Buchungen und Kraken-Historie (`SteuerLadeCache`) | Steuerseite lokal 2,8 → 1,1 s; Prognose lädt die Daten je einmal statt dreimal |
| **Kurs-Abfragen 30 s gecacht** (`preis-cache.ts`), Sync/Rebalancing/Orders immer frisch | Schont CoinGecko-Limits |
| **Athena-Chat**: beweglicher Cache-Haltepunkt je Schritt | Wochenlauf gemessen ca. -55 % Kosten; gleiche Technik im Chat |
| **Ladezustände**: 12 neue `loading.tsx` | Kein leerer Bildschirm bis zur letzten Abfrage |
| **Fremdschlüssel-Indizes** (9) | `categories.parent_id`, `contracts.*`, `transactions.*`, … |
| **RLS** `(select auth.uid())` in 119 Policies | Advisor `auth_rls_initplan` 119 → 0; heute kein messbarer Gewinn, zahlt sich bei wachsenden Tabellen aus |

## Gemessen und korrigiert

- Die frühere Aussage „RLS kostet bei `account_balances` 300 ms" war Kaltstart und Messrauschen; sauber gemessen sind es ~8 ms. Der Gewinn der
  Historie-Funktion steckt in der Zahl der Anfragen, nicht in der RLS.
- **Seitenzeiten aus der Entwicklungsumgebung sind nicht aussagekräftig**: die Rundlaufzeit zu Supabase schwankt dort zwischen 150 und
  1.600 ms pro Abfrage. Verlässlich sind Rechenzeit-Phasen (Profiler) und die Zahl der Abfragen. Reale Zeiten zeigt Vercel (Speed Insights / Logs).

## Offen

- **Vercel-Region im Dashboard prüfen** (Settings → Functions): `vercel.json` setzt `fra1`, ein dort abweichender Eintrag würde greifen.
- Advisor: 25 FKs ohne Index auf kleinen Tabellen, 16 ungenutzte Indizes, 24 Mehrfach-Policies (`asset_audit_log`, `fund_price_*`),
  Backup-Tabelle ohne Primärschlüssel, **Auth-Verbindungen auf Prozent umstellen** (nur im Supabase-Dashboard).
- `public._rls_policy_backup_20261023` hält die alten Policies für den Rollback (gesperrt für anon/authenticated); nach ein paar Wochen löschen.
- Kein Bundle-Report: Next 16 zeigt keine Größe je Route; gemessen: 3,3 MB JS unkomprimiert in 101 Chunks, Charts sind lazy, gsap/lenis nur Startseite.
- `public/athena-logo.png` (1,5 MB) wird in `src` nicht referenziert.
- Steuerseite/Prognose: ein Streaming-Umbau (Suspense um den Krypto-Teil) ändert die Datenlogik und steht aus.
