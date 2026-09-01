# FinTS Python Sidecar

Bank connectivity for athena-finance runs through this small Python sidecar instead of a
Node library, because the target bank (**Atruvia / Frankfurter Volksbank Rhein-Main**, the
Raiffeisenbank/VR-Bank backend) requires two things `node-fints` cannot do:

1. **Decoupled SCA** — SecureGo plus "Direktfreigabe": the bank pushes an approval request to
   the banking app and the client must *poll* until the user confirms. python-fints handles the
   `HKTAN` process `S` status polling (response code `3956` = still pending) automatically.
2. **camt.052 statements (HKCAZ)** — this bank does **not** offer MT940 (HKKAZ). python-fints
   falls back to camt automatically.

Against this bank a read-only sync can return `3076 – Starke Kundenauthentifizierung
nicht notwendig`, i.e. the app approval is skipped for balance/transaction reads — but only
if the bank recognises the access. See "Client-State & die 90-Tage-Regel" below; without a
persisted state it does *not* recognise it and prompts every single time.

## Client-State & die 90-Tage-Regel

**Das war der Grund, warum früher jeder Sync eine SecureGo-plus-Freigabe verlangt hat.**

python-fints handelt beim ersten Dialog eine *Kundensystem-ID* aus
(`HKSYN3(SynchronizationMode.NEW_SYSTEM_ID)`, siehe `_ensure_system_id()` in
`fints/client.py`). Wird diese ID nicht über Läufe hinweg gespeichert, wiederholt jeder
Sync die Erstsynchronisierung: die Bank sieht einen ihr unbekannten Zugang und muss nach
PSD2 zwingend stark authentifizieren.

Mit gespeicherter System-ID greift dagegen die Ausnahme aus Art. 10 der PSD2-RTS:
Kontoinformationen der **letzten 90 Tage** sind nach **einer** starken Authentifizierung
**90 Tage lang** ohne weitere Freigabe abrufbar.

Umsetzung:

- `--state-file <pfad>` — der Sidecar liest beim Start eine JSON-Map
  `{bank_key: {"blob": <base64>, "label": …, "scaPerformed": …}}` und schreibt sie am Ende
  aktualisiert zurück. Der Node-Aufrufer (`src/lib/fints/sidecar.ts`) legt dafür eine
  temporäre Datei an und persistiert das Ergebnis über `src/lib/fints/state.ts` in die
  Supabase-Tabelle `fints_client_state`.
- `bank_key` = `sha256("<blz>:<username>")[:32]` — stabil pro Login, ohne den VR-NetKey im
  Klartext abzulegen, und unabhängig von der Position in `FINTS_BANK{N}_*`.
- Der Blob ist das Ergebnis von `client.deconstruct(including_private=True)`. Er enthält
  laut python-fints **weder PIN noch Verbindungsdaten** — nur System-ID, BPD/UPD, gewähltes
  TAN-Verfahren und TAN-Medium.
- Supabase statt Dateisystem, weil sich der lokale Sidecar und die Vercel-Python-Function
  (`api/bank-sync.py`) denselben Zustand teilen müssen. Beide berechnen `bank_key`
  identisch — driftet das auseinander, hat jeder Ausführungspfad seinen eigenen Zustand und
  jeder Wechsel kostet wieder eine Freigabe.

### Zeitfenster

| Aufruf | Zeitraum | Freigabe nötig? |
|--------|----------|-----------------|
| Cron (`/api/cron/bank-sync`) | 14 Tage | nein (innerhalb der Ausnahme) |
| Manueller Sync (Button) | 90 Tage | nein, solange die Frist läuft |
| „Komplette Historie" | ab 2000-01-01 | **ja, immer** — älter als 90 Tage ist nie ausgenommen |

### `--no-sca` (unbeaufsichtigte Läufe)

Der Cron setzt dieses Flag. Verlangt die Bank dann doch eine Freigabe (Frist abgelaufen
oder noch kein State vorhanden), bricht der Sidecar sofort mit Code `sca_required` ab,
statt fünf Minuten auf eine Bestätigung zu warten, die niemand gibt. Die Route vermerkt
das in `fints_client_state.sca_required_since`; die `/bank`-Seite zeigt daraufhin den
Hinweis, dass **ein** manueller Sync fällig ist.

**Das lässt sich nicht wegprogrammieren:** die 90-Tage-Wiederholung ist regulatorisch
vorgeschrieben. Realistisch ist also *eine* Freigabe pro Quartal statt einer pro Sync.
Depotabfragen (HKWPD) fallen ebenfalls nicht unter die Ausnahme.

## Depot (Union Investment) & Bausparvertrag (Schwäbisch Hall)

`fints_sync.py` now also calls `get_information()` (HIUPD) after fetching the giro
accounts. That call lists **every** account this FinTS login knows about, including
ones `get_sepa_accounts()` silently drops (anything without the "Kontoverwendung
SEPA" flag — commonly a Wertpapierdepot or Bausparvertrag). For each such account
the sync checks what it actually supports and dispatches accordingly:

- Supports `HKWPD` (Depotaufstellung) → fetched via `get_holdings()`, emitted as
  `holdings` in the JSON output (ISIN, name, Stück, Kurs, Bestandswert, ...).
- Supports `HKSAL`/`HKKAZ` (balance/transactions) → folded into the normal
  `balances`/`transactions` output.

This works **without any new credentials** if Union Investment's UnionDepot and/or
the Schwäbisch Hall Bausparvertrag are administered under the same Raiffeisenbank
FinTS login (common in the Volksbanken/Raiffeisenbanken Verbund, since both
companies are the group's cooperative fund/Bauspar partners).

**How to check:** run a sync locally (`npm run dev`, then trigger a sync from
`/bank`) and watch the sidecar's stderr log. A line like
`[fints] Zusätzliches Konto gefunden: <Name>` means it was found — its holdings
(if a depot) show up in the "Depot (automatisch synchronisiert)" card on `/bank`
and in the `depot_holdings` table.

**If they don't show up but you know the account/Depot number:** `get_information()`
only lists what the bank chooses to expose there — some banks simply omit a
Bausparvertrag from that overview even though it's reachable through the same login
for other purposes. Set `FINTS_EXTRA_ACCOUNTS` (a comma-separated list of known
account/Depot numbers — e.g. one Depotnummer and one or more Bausparvertrag-Nummern)
to probe those specific numbers directly, independently of what `get_information()`
reports:

```
FINTS_EXTRA_ACCOUNTS=1234567,7654321,7654322,7654323
```

(`FINTS_BANK2_EXTRA_ACCOUNTS` etc. for a second/third bank profile.) The sync then
tries `get_holdings()` / `get_balance()` / `get_transactions()` against each number
directly and logs exactly what the bank returns for it — success, an error message,
or "not supported". A Depot hit is stored normally (`depot_holdings`, no IBAN
needed); a Bausparvertrag balance/transaction hit is currently only logged, not
stored yet — `bank_balance`/`bank_transactions` both require an IBAN, which these
accounts don't have, so storing that needs a small schema addition once we know it's
actually retrievable this way.

**Confirmed result for this login (Raiffeisenbank, August 2026) probing 3 Bausparvertrag
numbers directly:** `get_transactions()` raises
`FinTSUnsupportedOperation: No supported HIKAZS version found. ... bank supports ()` —
the bank's own Bank Parameter Data reports **zero** supported Kontoumsätze versions for
these accounts, at all, regardless of account-number format. That's the bank's BPD
talking, not a client bug — Bausparvertrag-Umsätze/-Saldo are not retrievable through
this login, full stop. `get_holdings()` also failed, but that one *was* a client bug
(python-fints' `Account2/Account3.from_sepa_account()` derives a country code from
`acc.bic[4:6]` and crashes with a bare `TypeError` if `bic` is `None` — fixed by passing
the login's own BIC for probed accounts). Doesn't change the Bausparvertrag conclusion
above; only matters for a genuine Depotnummer, where `get_holdings()` is the relevant
call and might still succeed once it can actually reach the bank.

**If even direct probing fails for all three operations:** Union Investment and/or
Schwäbisch Hall need a *separate* FinTS login of their own. Research on this (August
2026, see sources below) came back different for each:

- **Union Investment (UnionDepot):** Union Investment Service Bank AG's own
  "Freischaltungsantrag zur Depotführung über einen Online-Zugang" (their
  official form for activating online access to a depot) does **not mention
  FinTS/HBCI at all** — it only covers their own proprietary "UnionDepotOnline"
  web portal, and explicitly routes personalised security credentials through
  the "Vertriebspartner" (the selling bank — i.e. the Raiffeisenbank). Their own
  FAQ on depot/customer numbers also tells users to ask "Ihren Bankberater" (their
  bank advisor at the Hausbank), not Union Investment support. That's a strong
  signal Union Investment does not run its own public FinTS/HBCI server for
  third-party software — the Raiffeisenbank login (already implemented, see
  above) is likely the *only* path in, and if `get_information()` doesn't surface
  it, the more likely fix is asking the Raiffeisenbank to enable Depot/HKWPD
  reporting on the existing FinTS access, not hunting for separate Union
  Investment credentials.
- **Schwäbisch Hall (Bausparvertrag):** genuinely unclear from public sources.
  A StarMoney community thread title ("Bausparkasse Schwäbisch Hall – Keine
  Umsatzabfrage mehr möglich") suggests third-party FinTS access existed at some
  point and later broke or changed — but the thread content itself sits behind a
  login wall, so the technical details (BLZ, current status) couldn't be
  confirmed here. Their public "Mein Konto" page only documents their own web
  login, no FinTS/HBCI. **To find out for certain:** log into "Mein Konto" at
  schwaebisch-hall.de and check Kontoeinstellungen for a "PIN/TAN-Verfahren" or
  "Homebanking-Zugang" option, or call their service line directly
  (+49 791 46-4444) and ask specifically for "FinTS/HBCI-Zugangsdaten für
  Homebanking-Software" for the Bausparvertrag.

If either turns out to need its own login, the sync already supports it —
**multi-bank is implemented**, not just planned:

### Multi-bank configuration

Add these to `.env.local` for a second bank (a third would be `FINTS_BANK3_*`,
and so on):

```
FINTS_BANK2_URL=https://...
FINTS_BANK2_BLZ=12345678
FINTS_BANK2_USERNAME=...
FINTS_BANK2_PIN=...
FINTS_BANK2_PRODUCT_ID=...      # optional — falls back to FINTS_PRODUCT_ID
FINTS_BANK2_LABEL=Union Investment   # optional — defaults to "Bank 2"
```

Each configured bank is synced independently in the same run (its own FinTS
dialog, its own decoupled-SCA approval if required). Every account, transaction,
balance, and holding in the JSON output carries a `bankLabel` saying which login
produced it (persisted as `bank_label` in `bank_transactions`, `bank_balance`,
and `depot_holdings`). If one bank fails (wrong PIN, unreachable, not yet
configured correctly) it's recorded in `warnings` — shown as an amber note under
the sync button — while the rest of the sync still completes.

Sources consulted:
- [Depotzugang | Union Investment](https://www.union-investment.de/einzelseiten/depotzugang)
- [Freischaltungsantrag zur Depotführung (PDF)](https://cdn.dam.union-investment.de/404381_Freischaltungsantrag_Online-Zugang_000402_01.22.pdf)
- [Woher erhalte ich meine Depot-, Zugangs- oder Kundennummer?](https://www.union-investment.de/unsere-services/haeufige-fragen/haeufige-fragen/frage/Woher-erhalte-ich-meine-Depot-,-Zugangs--oder-Kundennummer)
- [MEIN KONTO – Schwäbisch Hall](https://www.schwaebisch-hall.de/meinkonto/meinkonto-onlineservice.html)
- [Bausparkasse Schwäbisch Hall – Keine Umsatzabfrage mehr möglich (StarMoney Community)](https://www.starmoney.de/forum/viewtopic.php?t=35970)

## Volle Historie

`--start` now defaults to `2000-01-01` instead of a short rolling window — i.e.
"as much transaction history as the bank will give us". The bank itself decides
how far back it actually has data (commonly somewhere between 90 days and ~18-24
months for camt.052/Atruvia-backed accounts); requesting further back than that
is harmless since transactions are deduplicated downstream by `external_id`.

## Setup

```bash
# from the project root
npm run setup:fints
# equivalently:
python -m venv scripts/fints/.venv
scripts/fints/.venv/Scripts/pip install -r scripts/fints/requirements.txt   # Windows
scripts/fints/.venv/bin/pip     install -r scripts/fints/requirements.txt   # macOS/Linux
```

Requires Python 3.9+ (developed against 3.13).

## Configuration

Read from the same environment variables the Next.js app uses (loaded from `.env.local`):

| Var                | Required | Notes                                                    |
|--------------------|----------|----------------------------------------------------------|
| `FINTS_URL`        | yes      | HBCI/FinTS endpoint                                      |
| `FINTS_BLZ`        | yes      | 8-digit Bankleitzahl                                     |
| `FINTS_USERNAME`   | yes      | VR-NetKey / Alias                                        |
| `FINTS_PIN`        | yes      | Online-Banking PIN                                       |
| `FINTS_PRODUCT_ID` | strongly | ZKA/DK-registered product ID; this bank effectively needs one |
| `FINTS_LABEL`      | no       | Display label for this bank (defaults to "Raiffeisenbank") |
| `FINTS_PYTHON`     | no       | Override interpreter path (defaults to the venv above)   |
| `FINTS_BANK2_*` … `FINTS_BANK6_*` | no | Additional bank logins — see "Multi-bank configuration" above |
| `FINTS_EXTRA_ACCOUNTS` | no | Comma-separated known account/Depot numbers to probe directly — see "Depot & Bausparvertrag" above |
| `FINTS_BANK{N}_EXTRA_ACCOUNTS` | no | Same, scoped to bank profile N |

## Usage

```bash
python scripts/fints/fints_sync.py [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--balances]                                    [--no-txns] [--state-file PATH] [--no-sca]
```

- Emits **exactly one JSON object** on stdout; all logging/progress goes to stderr.
- Progress markers on stderr: `@@PUSH_SENT`, `@@POLL <n>`.
- Called from Node via [`src/lib/fints/sidecar.ts`](../../src/lib/fints/sidecar.ts).

## Deployment note

Because the sync can block while polling for an app approval, the API routes set
`maxDuration = 300`. Running on Vercel additionally requires a Python runtime for the sidecar
(or moving the sidecar to a separate always-on service). Locally (dev/self-host) it works out
of the box once the venv is set up.
