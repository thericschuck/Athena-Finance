# Kategorisierung von Bankbuchungen

Stand: 2026-10-22. Code: `src/lib/fints/` (`categorize.ts`, `merchant-key.ts`, `ai-categorize*.ts`), Cron `/api/cron/categorize`.

## Warum es vorher nicht ging

1. **Der Cloud-Sync kategorisierte nie.** `api/bank-sync.py` (der Vercel-Cron) speichert Buchungen und setzt nur
   ein altes Textfeld, nie `category_id`. Die Kategorisierung im Node-Teil lief dort nicht; jede neue Buchung blieb offen.
   Jetzt läuft `/api/cron/categorize` zwanzig Minuten nach jedem Bank-Sync.
2. **Zahlungsabwickler.** Bei Kartenzahlungen ist die Gegenpartei „DZ BANK AG" (63 Buchungen in 15 Kategorien),
   bei PayPal „PayPal Europe" (101 in 11). Die gelernte Zuordnung „Gegenpartei → häufigste Kategorie" lernte dort
   Zufall; so landeten Alipay-Käufe in „Claude / Anthropic". Außerdem machte die Regel `paypal` jede PayPal-Zahlung zum Einkauf.
3. **Richtung und Betrag blieben ungenutzt.** Ein- und Auszahlung beim selben Institut und Abo-Preis gegen Einkauf waren nicht
   zu unterscheiden.

## Drei Stufen (je Buchung ohne Kategorie, in dieser Reihenfolge)

| Stufe | Quelle | `category_source` | Wann |
|---|---|---|---|
| 1 | gelernte Zuordnung aus deinen eigenen Entscheidungen | `auto` | bekannter Händler/Betrag |
| 1 | feste Regeln (Stichworte) | `auto` | sonst |
| 2 | KI (Claude Haiku 4.5) | `ai` | nur was Stufe 1 offen lässt; nur bei Sicherheit „hoch" |

**Gelernt** wird unter mehreren Schlüsseln, vom Besonderen zum Allgemeinen: fester Betrag (mind. 2 einheitliche Fälle) →
Richtung (Ein-/Ausgang) → Gegenpartei. Steht der Händler im Verwendungszweck (PayPal „Ihr Einkauf bei …", Karte
„Alipay.Starbucks/… Ortszeit"), lernt die Buchung unter dem Händler (`h:…`), nicht unter dem Abwickler. Ein Abwickler
(PayPal, DZ BANK, Klarna, Stripe, Adyen, SumUp, …) lernt auf Gegenparteiebene nichts. Eine Gegenpartei mit ≥ 3
Kategorien ohne 60-%-Mehrheit wird ebenfalls nicht gelernt. Regeln feuern nie auf den Namen eines Abwicklers.

**Nie gelernt** werden `auto`- und `ai`-Zeilen: sonst bestätigte sich das System an seinen eigenen Fehlern. Nur deine Entscheidungen zählen.

## Die KI und wie sie schlauer wird

Pro Stapel von bis zu 15 Buchungen bekommt das Modell: deine Kategorien (mit Kurzkennung `k1…`), die **ähnlichsten früheren
Entscheidungen** von dir (Wortähnlichkeit mit IDF-Gewichtung, Richtung als Bonus) und die **letzten Fälle, in denen du
eine KI-Zuordnung korrigiert hast**. Es gibt kein Training: jede Korrektur von heute ist ein Beispiel für morgen.

`bank_transactions.ai_category_id` merkt sich den KI-Vorschlag, auch nachdem du die Kategorie geändert hast
(dann `category_source = 'manual'`). Daraus entstehen Trefferquote (`bilanz` im Cron-Ergebnis) und die Korrektur-Beispiele.

**Leitplanken:** Die KI antwortet nur über ein erzwungenes Werkzeug mit Kurzkennungen; unbekannte Kennungen, Doppelte und
Einnahme-Kategorien für Belastungen (und umgekehrt) werden verworfen. Buchungstexte gelten als Fremdtext (Prompt-Injection kann
höchstens eine falsche Kategorie bewirken). „Mittel" und „niedrig" werden nicht automatisch gesetzt. Nur Buchungen ohne
Kategorie werden angefasst, nie eigene Umbuchungen.

## Gemessen (Leave-One-Out gegen 653 deiner Entscheidungen, 2026-10-22)

| | richtig | falsch zugeordnet | offen |
|---|---|---|---|
| alt (Gegenpartei + Regeln) | 67 % | 164 | 50 |
| neu: Regeln + Gelerntes | 65 % | 90 | 136 |
| neu + KI bei „hoch" | **78 %** | 121 | 24 |

KI-Stufe allein auf den 226 Fällen, die Stufe 1 offen ließ oder falsch hatte: „hoch" 112 Zuordnungen, 72 % richtig;
„mittel" 89 Zuordnungen, nur 48 % richtig (deshalb nicht automatisch). Haiku 4.5 und Sonnet 5 lagen gleichauf, Sonnet kostet
etwa das Vierfache. Kosten: rund 0,12 $ für 226 Buchungen, im Betrieb ein paar Cent im Monat. Die verbleibenden Fehler sind
meist echte Mehrdeutigkeiten (PayPal ohne Händler: „marbis" oder „Freizeit"?).

## Einstellen und prüfen

`user_settings.ai_categorization` (JSON, alles optional): `{ "enabled": true, "model": "claude-haiku-4-5", "mindestens": "hoch", "maxProLauf": 60, "stapel": 15 }`.
Ausschalten: `{ "enabled": false }`. Probelauf ohne Schreiben: `GET /api/cron/categorize?dry=1` mit `Authorization: Bearer <CRON_SECRET>`.

## KI-Marke und Vorschläge in der Oberfläche

- **Transaktionsliste** (und Konto-Detail): neben der Kategorie steht **„KI"** (von der KI gesetzt) bzw. **„Regel"** (automatisch,
  Regel oder Gelerntes). Ändert du die Kategorie, verschwindet die Marke: es ist jetzt deine Entscheidung.
- **KI-Vorschläge** (Sicherheit „mittel", trifft nur etwa jede zweite Buchung) werden NICHT gesetzt, sondern gemerkt
  (`ai_category_id`, Buchung bleibt offen). Sie erscheinen als gestrichelter Knopf **„KI: Kategorie ✓"** direkt in der Zeile (ein Klick
  übernimmt) und im Vorschlags-Panel mit „KI"-Marke. Der Sammelknopf „Alle übernehmen" nimmt sie bewusst nicht mit.
- Unsichere Buchungen werden nicht alle sechs Stunden neu abgefragt: `ai_checked_at` sperrt sie drei Tage lang.

**Fehler dabei gefunden und behoben:** Die Kategorie-Auswahl in der Transaktionsliste (und Athenas bestätigte Kategorisierung) setzte nur
`category_id`, nicht `category_source`. Korrekturen dort wären nie als deine Entscheidung gezählt worden (und bei KI/Regel-Zeilen auch nicht als
Korrektur erkannt). Jetzt setzen beide `category_source = 'manual'`.

## Offen

- Der Python-Cloud-Sync setzt weiterhin kein `category_id`; die Zuordnung geschieht erst im Cron danach.
- Alipay-Käufe in China ordnet nur ein Mensch zu (die Kategorie „OtherRetail" sagt nichts); einmal je Händler zuordnen, dann lernt es das System.
- Die Trefferquote der KI (bestätigt vs. korrigiert) steht nur im Cron-Ergebnis (`bilanz`), nicht in der Oberfläche.
