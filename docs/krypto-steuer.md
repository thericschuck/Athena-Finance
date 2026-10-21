# Krypto-Steuer (Kraken, § 23 EStG)

Stand: 2026-10-22. Gilt nur für Kraken; weitere Wallets (Trezor, MetaMask) sind nicht angebunden.

## Datenfluss

```
Kraken API ──► syncKrakenHistorie (src/lib/kraken/history.ts)
                 ├─ kraken_trades   jeder Kauf/Verkauf, idempotent über txid
                 └─ kraken_ledger   Ein-/Auszahlungen, Staking, Buy-Crypto, idempotent über ledger_id
                          │
                          ▼
ladeKrakenSteuer (src/lib/tax/krypto-laden.ts, seitenweise, RLS)
                          │
                          ▼
berechneKrakenSteuer (src/lib/tax/krypto-kraken.ts, rein)  ──►  berechneKryptoFifo (krypto-fifo.ts)
                          │
                          ▼
ladeSteuerdaten ──► SteuerEingaben.kryptoZuVersteuern ──► berechneSteuerposition ──► Steuer-Seite, Athena
```

Der Sync läuft über den Cron `/api/cron/kraken-sync` (alle 6 h) und den Button im Krypto-Tab.

## Fortsetzbarer Abruf

Kraken drosselt TradesHistory/Ledgers stark. Darum lädt jeder Sync zuerst das Neue (ab dem letzten gespeicherten
Zeitpunkt) und danach ein Stück des Rückstands (rückwärts, bis nichts Älteres mehr kommt). Bei Drosselung bricht er
sauber ab und macht beim nächsten Lauf weiter. `user_settings.kraken_history_state` (`trades_fertig`,
`ledger_fertig`) merkt sich den Stand; solange er nicht komplett ist, steht auf der Steuer-Seite ein Hinweis.

## Rechenregeln

- **Kauf:** Kosten = Betrag + Gebühr (in EUR). **Verkauf:** Erlös = Betrag − Gebühr.
- **EUR-Paare** exakt; **USD-Paare** mit dem Kurs zum Sync-Zeitpunkt (`eur_kurs_geschaetzt = true`, Hinweis auf der
  Seite). Für die Erklärung braucht es den Tageskurs.
- **Krypto gegen Krypto** ist nicht bewertet (kein EUR-Wert); steht als Warnung mit den betroffenen Assets da.
- **Buy Crypto / Convert** (Ledger `spend` + `receive` gleicher `refid`) gegen EUR zählt als Anschaffung bzw.
  Veräußerung; nicht eindeutig zusammensetzbare Fälle werden gemeldet statt geraten.
- **Auszahlung** an eine eigene Wallet ist keine Veräußerung: die Lose wandern mit Datum und Kosten nach „extern",
  eine Einzahlung holt sie zurück. Was von außerhalb kommt und nie von Kraken ausgezahlt wurde, hat keine
  Anschaffung → Fehlmenge beim Verkauf.
- **Haltefrist:** mehr als ein Jahr (§§ 187, 188 BGB), Datum in deutscher Ortszeit.
- **Freigrenze:** 1.000 € ab 2024, davor 600 € (§ 23 Abs. 3 EStG). Freigrenze, kein Freibetrag: ab dem ersten Euro
  darüber ist der ganze Saldo steuerpflichtig. Vor Verwendung gegen die aktuelle Rechtslage prüfen.
- **Staking/Earn** sind sonstige Einkünfte (§ 22 Nr. 3 EStG, Freigrenze 256 €) und NICHT bewertet.
- Verlustvorträge über Jahre sind nicht abgebildet.

## In der Steuerposition

`kryptoZuVersteuern` fließt ins zu versteuernde Einkommen. Die Rücklage führt die Krypto-Steuer mit. Beide
Mehrsteuern sind geschichtet (erst Gewinn Schuck Webdesign, Krypto obenauf), damit sich nichts doppelt zählt.

## Offen

- Steuerberater: je Wallet oder Gesamtverfahren (BMF-Schreiben vom 06.03.2025 aus dem Gedächtnis, nicht geprüft).
  Mit Kraken allein egal.
- Tageskurse für USD-Paare und Krypto-Tauschgeschäfte (historische Kurse fehlen).
- Staking-Erträge bewerten (Kurs zum Zuflusszeitpunkt).
- Weitere Wallets als Quelle.
- API-Key-Berechtigungen: „Query Closed Orders & Trades" und „Query Ledger Entries" werden gebraucht.
