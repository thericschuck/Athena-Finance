#!/usr/bin/env python
"""FinTS sidecar for athena-finance.

Fetches SEPA accounts and their booked transactions via FinTS/HBCI (PIN/TAN),
fully supporting:
  * Decoupled SCA (e.g. SecureGo plus "Direktfreigabe"): pushes an approval
    request to the banking app, then polls the bank until the user confirms.
  * Banks that only offer camt.052 (HKCAZ) instead of MT940 (HKKAZ):
    python-fints falls back automatically.
  * Additional accounts under the SAME FinTS login that aren't plain SEPA
    Girokonten — e.g. a securities depot (Wertpapierdepot / HKWPD, such as a
    "UnionDepot" sold through the Volksbanken/Raiffeisenbanken Verbund) or a
    Bausparvertrag (e.g. Schwäbisch Hall). These are discovered via
    get_information() (HIUPD), which lists every account the login knows about
    regardless of SEPA capability, and are dispatched to get_holdings() /
    get_balance() / get_transactions() depending on what each account supports.
  * Multiple independent bank logins in one run (see "Multi-bank" below) — for
    the case where a depot or Bausparvertrag turns out to need its own separate
    FinTS access instead of being reachable through the primary bank.

Configuration is read from environment variables (same names the Next.js app uses):
  FINTS_URL, FINTS_BLZ, FINTS_USERNAME, FINTS_PIN, FINTS_PRODUCT_ID (optional)

Multi-bank: additional logins are picked up automatically as FINTS_BANK2_*,
FINTS_BANK3_*, ... (see scripts/fints/README.md for the full variable list and
how to obtain access data for Union Investment / Schwäbisch Hall specifically).
Each configured bank is synced independently in the same run; every output item
(account/transaction/balance/holding) carries a "bankLabel" saying which login
it came from. A bank that isn't configured is simply skipped; a bank that fails
(wrong PIN, unreachable, ...) is recorded in "warnings" without aborting the
others.

Usage:
  python fints_sync.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]

  If --start is omitted, the sync defaults to FULL_HISTORY_START (2000-01-01)
  instead of a short rolling window — i.e. "as much history as the bank will
  give us". This is safe because transactions are deduplicated downstream by
  external_id, so requesting more than the bank actually retains is harmless;
  the bank simply returns whatever it still has.

Output contract:
  * A single JSON object is written to STDOUT (and nothing else).
  * All human-readable / progress logging goes to STDERR.
  * Progress markers on STDERR (one per line, prefixed "@@"):
      @@PUSH_SENT   – an SCA approval request was pushed to the app; user must confirm
      @@POLL n      – polling attempt n while waiting for the decoupled confirmation
  * Exit code 0 on success (at least one bank succeeded), 1 on handled error
    (JSON error body still printed; e.g. every configured bank failed), 2 on crash.

STDOUT JSON shape:
  success: { "ok": true, "accounts": [Account], "transactions": [Transaction],
             "balances": [Balance], "holdings": [Holding], "warnings": [str] }
  error:   { "ok": false, "error": "<message>", "code": "<short-code>" }

  Account:     { "bankLabel", "iban", "bic", "accountNumber", "blz", "accountName" }
  Transaction: { "bankLabel", "accountIban", "accountBic", "amount", "currency",
                 "valueDate", "entryDate", "description",
                 "counterpartName", "counterpartIban", "counterpartBic" }
  Holding:     { "bankLabel", "accountLabel", "accountNumber", "isin", "name",
                 "pieces", "marketValue", "currency", "valuationDate",
                 "totalValue", "acquisitionPrice" }
"""

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import traceback
from decimal import Decimal

# ── Polling configuration for decoupled (app-confirmation) SCA ──────────────────
WAIT_BEFORE_FIRST_POLL = 2.0     # seconds to wait before the first status query
WAIT_BETWEEN_POLLS = 4.0         # seconds between subsequent status queries
MAX_POLLS = 75                   # ~5 minutes total (2 + 75*4s) before giving up

# Default start date when --start is omitted: "as far back as possible" rather than
# a short rolling window. The bank caps this to whatever it actually retains
# (commonly somewhere between 90 days and ~18-24 months for camt.052/Atruvia-backed
# accounts), so this just asks for the maximum and lets the bank's response define
# the real limit. Harmless to request further back than the bank has — dedup by
# external_id means no duplicate rows even on repeated full-history syncs.
FULL_HISTORY_START = dt.date(2000, 1, 1)

# Sanity cap on how many FINTS_BANK{N}_* profiles to scan for. Raise if genuinely needed.
MAX_BANK_PROFILES = 6

# Whether this run may wait for an interactive SecureGo-plus approval. Set from --no-sca
# in main(). An unattended run (cron) sets this to False: nobody is looking at their phone,
# so blocking for five minutes on an approval that will never come is worse than failing
# fast with a clear reason. Module-level rather than threaded through every settle() call
# site — this script is a single-run process.
ALLOW_SCA = True

# Set by resolve_decoupled() when an app approval was actually carried out. main() reads
# and resets it per bank profile, so the caller can stamp last_sca_at (and thus know when
# the 90-day exemption window started) only for the banks that really re-authenticated.
SCA_PERFORMED = False


class ScaRequired(RuntimeError):
    """The bank demanded a strong customer authentication, but this run may not wait for one.

    Raised only when ALLOW_SCA is False. Signals to the caller that the persisted client
    state has expired (PSD2's 90-day exemption window is over) or never existed, and that a
    manual, interactive sync is needed to re-establish it.
    """


def bank_key(profile):
    """Stable identifier for one bank login, used as the client-state key.

    Hashed rather than stored as plain "<blz>:<username>" so the VR-NetKey never lands in
    the database. Independent of the profile's position in FINTS_BANK{N}_*, so renumbering
    the env vars doesn't orphan a stored state (and thereby trigger a fresh SCA).
    """
    raw = f"{profile['blz']}:{profile['user']}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def load_state_file(path):
    """Read the client-state map the Node side handed us:
    {bank_key: {"blob": <base64>, "label": <str>, "scaPerformed": <bool>}}.

    Missing/corrupt is not an error — it just means "no state yet", i.e. this run will
    need an SCA."""
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError) as exc:
        log(f"[fints] State-Datei nicht lesbar ({exc}) — Sync läuft ohne gespeicherten Zustand.")
        return {}


def write_state_file(path, state):
    """Write the updated map back for the Node side to persist to Supabase. Best-effort:
    a failure here costs the next run an extra app approval, but must not fail the sync
    whose data has already been fetched."""
    if not path:
        return
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
    except OSError as exc:
        log(f"[fints] State konnte nicht gespeichert werden ({exc}) — "
            f"der nächste Sync verlangt erneut eine App-Freigabe.")


def get_balance_national(client, acc):
    """get_balance() for an account addressed by Kontonummer instead of by IBAN.

    python-fints' get_balance() always picks the HIGHEST HKSAL the bank offers. HKSAL7
    addresses the account through KTI1, and its from_sepa_account() only fills the IBAN/BIC
    pair — so an account that has no IBAN loses its identity entirely:

        HKSAL7 -> KTI1(bic='FFVBDEFFXXX')                      # no account number at all
        HKSAL6 -> Account3(account_number='21499214', subaccount_number='V01', ...)

    The bank then answers "9380 Verarbeitung nicht möglich. Unerwarteter Aufbau der
    Auftragsdaten", which reads like a permission problem but is a malformed request.

    Two ways out, in order of preference:
      1. HKSAL5/6, whose Account2/Account3 are national by construction.
      2. HKSAL7 with a hand-built KTI1. KTI1 *does* have account_number, subaccount_number
         and bank_identifier fields — from_sepa_account() simply never populates them. Filling
         them directly serialises to  HKSAL::7+::21499214:V01:280:50190000+N'  which is a
         well-formed national Kontoverbindung.

    Raiffeisenbank (BLZ 50190000) offers HISALS 4 and 7 only, and python-fints implements no
    HKSAL4 — so route 2 is the one that actually applies there.
    """
    from fints.exceptions import FinTSUnsupportedOperation
    from fints.formals import KTI1, BankIdentifier
    from fints.segments.saldo import HKSAL5, HKSAL6, HKSAL7

    try:
        hksal = client._find_highest_supported_command(HKSAL5, HKSAL6)
        account_field = hksal._fields['account'].type.from_sepa_account(acc)
    except FinTSUnsupportedOperation:
        hksal = client._find_highest_supported_command(HKSAL7)
        account_field = KTI1(
            account_number=getattr(acc, "accountnumber", None),
            subaccount_number=getattr(acc, "subaccount", None),
            bank_identifier=BankIdentifier(
                country_identifier='280',           # 280 = Germany, per FinTS Kreditinstitutskennung
                bank_code=getattr(acc, "blz", None),
            ),
        )

    with client._get_dialog() as dialog:
        seg = hksal(account=account_field, all_accounts=False)
        return client._send_with_possible_retry(dialog, seg, client._get_balance)


def balance_amount(balance):
    """The numeric value of a python-fints balance, or None if there isn't one.

    A rejected HKSAL still yields a truthy object whose .amount is None — without this check
    a hard bank refusal was logged as "Saldo erfolgreich abgerufen (None EUR)".
    """
    if balance is None:
        return None
    amount_obj = getattr(balance, "amount", None)
    if amount_obj is None:
        return None
    raw = getattr(amount_obj, "amount", amount_obj)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def marker(msg):
    print(f"@@{msg}", file=sys.stderr, flush=True)


def fail(code, message):
    """Print a JSON error body to stdout and exit 1."""
    print(json.dumps({"ok": False, "error": message, "code": code}))
    sys.stdout.flush()
    sys.exit(1)


def get_config():
    url = (os.environ.get("FINTS_URL") or "").strip()
    blz = "".join(ch for ch in (os.environ.get("FINTS_BLZ") or "") if ch.isdigit())
    user = (os.environ.get("FINTS_USERNAME") or "").strip()
    pin = (os.environ.get("FINTS_PIN") or "").strip()
    product_id = (os.environ.get("FINTS_PRODUCT_ID") or "").strip() or None

    missing = [n for n, v in
               (("FINTS_URL", url), ("FINTS_BLZ", blz),
                ("FINTS_USERNAME", user), ("FINTS_PIN", pin)) if not v]
    if missing:
        fail("config", f"Fehlende Umgebungsvariablen: {', '.join(missing)}")
    if len(blz) != 8:
        fail("config", f"FINTS_BLZ muss genau 8 Ziffern haben, hat aber {len(blz)}")
    return url, blz, user, pin, product_id


def get_bank_profiles():
    """Discover all configured FinTS bank logins.

    Bank 1 (required — the existing Raiffeisenbank login): FINTS_URL / FINTS_BLZ /
    FINTS_USERNAME / FINTS_PIN / FINTS_PRODUCT_ID (optional), same as before this
    multi-bank support was added — nothing changes for a setup that only ever had
    these four variables.

    Additional, OPTIONAL banks — e.g. a separate Union Investment or Schwäbisch
    Hall login, if either turns out to need one instead of being reachable
    through Bank 1's get_information() (see README) — are picked up automatically
    as FINTS_BANK2_*, FINTS_BANK3_*, ...:
      FINTS_BANK{N}_URL, FINTS_BANK{N}_BLZ, FINTS_BANK{N}_USERNAME, FINTS_BANK{N}_PIN
        (all four required for that profile to be used)
      FINTS_BANK{N}_PRODUCT_ID   (optional; falls back to FINTS_PRODUCT_ID)
      FINTS_BANK{N}_LABEL        (optional; defaults to "Bank {N}")
    Numbering must be contiguous starting at 2; scanning stops at the first gap
    or at MAX_BANK_PROFILES.

    EXTRA_ACCOUNTS (optional, per profile): a comma-separated list of known account/Depot
    numbers OR IBANs (e.g. a Depotnummer, an IBAN found under the bank's own "Bankverbindungen"
    for that Depot, or one or more Bausparvertrag-Nummern) to probe directly — for the case
    where get_information() (HIUPD) doesn't list them at all under this login (some banks
    simply don't expose a Bausparvertrag/Depot-Verrechnungskonto there, even though it's
    reachable through the same Verbund login for other purposes). An entry that looks like an
    IBAN is addressed the same SEPA way as a regular Girokonto (and its balance/transactions
    get stored normally); a plain account number is probed but balance/transaction results
    can't be persisted (bank_balance/bank_transactions both require an IBAN) — only a Depot
    hit via get_holdings() can (depot_holdings needs none). Set FINTS_EXTRA_ACCOUNTS for
    Bank 1, FINTS_BANK{N}_EXTRA_ACCOUNTS for Bank N.
    """
    url, blz, user, pin, product_id = get_config()
    profiles = [{
        "label": os.environ.get("FINTS_LABEL") or "Raiffeisenbank",
        "url": url, "blz": blz, "user": user, "pin": pin, "product_id": product_id,
        "extra_accounts": parse_extra_accounts(os.environ.get("FINTS_EXTRA_ACCOUNTS")),
    }]

    for n in range(2, MAX_BANK_PROFILES + 1):
        prefix = f"FINTS_BANK{n}_"
        b_url = (os.environ.get(prefix + "URL") or "").strip()
        b_blz = "".join(ch for ch in (os.environ.get(prefix + "BLZ") or "") if ch.isdigit())
        b_user = (os.environ.get(prefix + "USERNAME") or "").strip()
        b_pin = (os.environ.get(prefix + "PIN") or "").strip()
        if not (b_url and b_blz and b_user and b_pin):
            break  # contiguous numbering assumed; stop at the first missing profile
        profiles.append({
            "label": os.environ.get(prefix + "LABEL") or f"Bank {n}",
            "url": b_url, "blz": b_blz, "user": b_user, "pin": b_pin,
            "product_id": (os.environ.get(prefix + "PRODUCT_ID") or "").strip() or product_id,
            "extra_accounts": parse_extra_accounts(os.environ.get(prefix + "EXTRA_ACCOUNTS")),
        })

    return profiles


def parse_extra_accounts(raw):
    if not raw:
        return []
    return [n.strip() for n in raw.split(",") if n.strip()]


def split_account_number(num):
    """Splits e.g. "21499214V01" into ("21499214", "V01") — a numeric base account number
    plus a Unterkontomerkmal (subaccount marker). Returns (num, None) unchanged if it doesn't
    match that pattern (e.g. a plain numeric Depotnummer)."""
    m = re.match(r"^(\d+)([A-Za-z]\w*)$", num)
    if m:
        return m.group(1), m.group(2)
    return num, None


def parse_date(value):
    if not value:
        return None
    # Accept both plain dates and ISO datetimes (the Next.js side sends ISO strings)
    value = value.strip()
    try:
        if "T" in value:
            return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        return dt.date.fromisoformat(value)
    except ValueError:
        return None


def jsonify(value):
    """Best-effort conversion of python-fints/mt940 values to JSON-safe primitives."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return str(value)


def resolve_decoupled(client, response, NeedTANResponse):
    """Given a NeedTANResponse, drive the decoupled (app) confirmation to completion.

    Returns the real operation result once the user approves in their app.
    Raises RuntimeError on timeout or if the method is not decoupled (we cannot
    prompt for a typed TAN in this non-interactive sidecar), and ScaRequired if this
    run isn't allowed to wait for an approval at all (--no-sca).
    """
    if not ALLOW_SCA:
        raise ScaRequired(
            "Die Bank verlangt eine Freigabe in der SecureGo plus App. Dieser Lauf ist "
            "unbeaufsichtigt (--no-sca) und wartet deshalb nicht darauf. Bitte einmal "
            "manuell synchronisieren — danach ist der Zugang wieder ca. 90 Tage "
            "freigabefrei."
        )

    if not getattr(response, "decoupled", False):
        raise RuntimeError(
            "Die Bank verlangt eine getippte TAN, aber dieser Dienst unterstützt nur "
            "die App-Direktfreigabe (SecureGo plus decoupled). Bitte in der VR-Banking / "
            "SecureGo plus App die Direktfreigabe (decoupled) aktivieren."
        )

    global SCA_PERFORMED
    SCA_PERFORMED = True

    challenge = (getattr(response, "challenge", "") or "").strip()
    marker("PUSH_SENT")
    log(f"[fints] Freigabe-Anfrage an App gesendet. {challenge}")

    time.sleep(WAIT_BEFORE_FIRST_POLL)
    for attempt in range(1, MAX_POLLS + 1):
        marker(f"POLL {attempt}")
        log(f"[fints] Warte auf Bestätigung in der App … (Versuch {attempt}/{MAX_POLLS})")
        result = client.send_tan(response, "")
        if not isinstance(result, NeedTANResponse):
            log("[fints] Freigabe bestätigt.")
            return result
        # Still pending (bank returns code 3956) — keep the latest response and poll again.
        response = result
        time.sleep(WAIT_BETWEEN_POLLS)

    raise RuntimeError(
        "Zeitüberschreitung: Die Freigabe wurde nicht rechtzeitig in der App bestätigt."
    )


def settle(client, result, NeedTANResponse):
    """If a result is a pending TAN response, resolve it; otherwise pass through."""
    if isinstance(result, NeedTANResponse):
        return resolve_decoupled(client, result, NeedTANResponse)
    return result


def settle_transactions(client, result, NeedTANResponse):
    """settle() for get_transactions(), which needs one more step after an app approval.

    python-fints parses the camt XML *outside* the fetch, in get_transactions() itself:

        response = self._get_transactions_xml(...)
        if isinstance(response, NeedTANResponse):
            return response                      # <-- early exit, parsing skipped
        booked_streams, pending_streams = response
        transactions = [Transaction(t) for s in booked_streams for t in camt053_to_dict(s)]

    When the bank interrupts that fetch with an SCA, the early exit is taken and the parsing
    never happens. Resuming through send_tan() lands in _continue_fetch_with_touchdowns,
    whose response processor returns the RAW (booked_streams, pending_streams) tuple of camt
    XML byte strings — not transactions.

    Iterating that tuple yields two lists, so every SCA-protected account silently imported
    NOTHING while logging "N Transaktion(en) ohne Datum/IBAN/Betrag verworfen" (two bogus
    entries per affected account). That is why a full-history sync kept coming back empty:
    both Girokonten need an approval, and both lost their entire result.

    So: detect the raw tuple and run the parsing step python-fints skipped.
    """
    settled = settle(client, result, NeedTANResponse)

    # A parsed result is a list of Transaction objects; the unparsed one is exactly the
    # 2-tuple that _response_handler_get_transactions_xml builds. Matching on that shape
    # (rather than on "not a list") lets an MT940 bank, whose resume path DOES return parsed
    # data, pass straight through.
    if isinstance(settled, tuple) and len(settled) == 2:
        from fints.camt_parser import camt053_to_dict
        from fints.models import Transaction

        booked_streams, _pending_streams = settled
        parsed = []
        for stream in booked_streams or []:
            try:
                parsed.extend(Transaction(t) for t in camt053_to_dict(stream))
            except Exception as exc:  # noqa: BLE001
                log(f"[fints] camt-Auszug nach App-Freigabe nicht lesbar ({exc}) — "
                    f"dieser Teil der Umsätze fehlt.")
        log(f"[fints] Umsätze nach App-Freigabe nachträglich geparst: {len(parsed)} "
            f"Buchung(en) aus {len(booked_streams or [])} camt-Auszug/-Auszügen.")
        return parsed

    return settled


def settle_holdings(client, result, NeedTANResponse):
    """settle() for get_holdings(), which has the same post-approval gap as
    settle_transactions(): get_holdings() parses MT535 only after _fetch_with_touchdowns()
    returns, so a run resumed through send_tan() hands back raw HIWPD segments instead of
    Holding objects. Parse them the same way get_holdings() would.
    """
    settled = settle(client, result, NeedTANResponse)
    if not settled:
        return []

    # Raw segments carry `.holdings`; already-parsed Holding objects do not.
    if not any(hasattr(item, "holdings") for item in settled):
        return settled

    from fints.utils import MT535_Miniparser

    holdings = []
    for resp in settled:
        raw = getattr(resp, "holdings", None)
        if raw is None:
            continue
        text = raw.decode() if isinstance(raw, bytes) else raw
        lines = str.splitlines(text)
        if lines and not lines[0].strip():
            del lines[0]  # get_holdings() drops the same leading empty line
        try:
            holdings.extend(MT535_Miniparser().parse(lines))
        except Exception as exc:  # noqa: BLE001
            log(f"[fints] Depotaufstellung nach App-Freigabe nicht lesbar ({exc}).")
    return holdings


def serialize_account(bank_label, acc, name=None):
    return {
        "bankLabel": bank_label,
        "iban": getattr(acc, "iban", None),
        "bic": getattr(acc, "bic", None),
        "accountNumber": getattr(acc, "accountnumber", None),
        "blz": getattr(acc, "blz", None),
        "accountName": name,
    }


def account_key(iban, account_number, blz):
    """Identity key for an account regardless of whether it exposes an IBAN."""
    return (iban or "", account_number or "", blz or "")


def build_extra_account(acc_info):
    """Construct a SEPAAccount-like tuple from a get_information() (HIUPD) entry,
    even when it lacks a usable IBAN — e.g. some Depot or Bausparvertrag accounts.

    get_sepa_accounts() silently drops any account whose 'Kontoverwendung SEPA'
    flag is off, which can include exactly these account types. get_information()
    has no such filter, so this is how depot/Bauspar accounts get discovered.
    """
    from fints.models import SEPAAccount

    bank_ident = acc_info.get("bank_identifier")
    blz = getattr(bank_ident, "bank_code", None) if bank_ident is not None else None
    return SEPAAccount(
        iban=acc_info.get("iban") or None,
        bic=None,
        accountnumber=acc_info.get("account_number"),
        subaccount=acc_info.get("subaccount_number"),
        blz=blz,
    )


def serialize_holding(bank_label, label, account_number, holding):
    return {
        "bankLabel": bank_label,
        "accountLabel": label,
        "accountNumber": account_number,
        "isin": holding.ISIN,
        "name": holding.name,
        "pieces": holding.pieces,
        "marketValue": holding.market_value,
        "currency": holding.value_symbol or "EUR",
        "valuationDate": jsonify(holding.valuation_date),
        "totalValue": holding.total_value,
        "acquisitionPrice": holding.acquisitionprice,
    }


def serialize_balance(bank_label, acc, balance):
    amount_obj = getattr(balance, "amount", None)
    value = None
    currency = "EUR"
    if amount_obj is not None:
        raw = getattr(amount_obj, "amount", amount_obj)
        try:
            value = float(raw)
        except (TypeError, ValueError):
            value = None
        currency = getattr(amount_obj, "currency", None) or "EUR"
    return {
        "bankLabel": bank_label,
        "iban": getattr(acc, "iban", None),
        "bic": getattr(acc, "bic", None),
        # python-fints returns a single (booked) balance; we expose it as both.
        "bookedBalance": value,
        "availableBalance": value,
        "currency": currency,
        "date": jsonify(getattr(balance, "date", None)),
    }


def serialize_transaction(bank_label, acc, txn):
    data = getattr(txn, "data", None) or {}

    amount_obj = data.get("amount")
    amount = None
    currency = "EUR"
    if amount_obj is not None:
        raw = getattr(amount_obj, "amount", amount_obj)
        try:
            amount = float(raw)
        except (TypeError, ValueError):
            amount = None
        currency = getattr(amount_obj, "currency", None) or "EUR"

    value_date = data.get("date")
    entry_date = data.get("entry_date") or data.get("guessed_entry_date")

    purpose = data.get("purpose")
    if not purpose:
        # camt / some MT940 dialects split the remittance info differently
        parts = [data.get("purpose"), data.get("additional_purpose")]
        purpose = " ".join(p for p in parts if p) or None

    return {
        "bankLabel": bank_label,
        "accountIban": getattr(acc, "iban", None),
        "accountBic": getattr(acc, "bic", None),
        "amount": amount,
        "currency": currency,
        "valueDate": jsonify(value_date),
        "entryDate": jsonify(entry_date),
        "description": purpose,
        "counterpartName": data.get("applicant_name"),
        "counterpartIban": data.get("applicant_iban"),
        "counterpartBic": data.get("applicant_bin"),
        # AcctSvcrRef (camt.052) / the tag-61 bank reference (MT940) — assigned once per
        # posting by the bank and never changes on a later re-fetch, unlike `purpose`
        # (observed to gain e.g. an appended "SecureGo plus IBAN: ..." suffix between
        # syncs of the very same transaction). Used downstream to build a stable dedup
        # key instead of hashing the mutable purpose text.
        "bankReference": data.get("bank_reference"),
    }


def sync_one_bank(profile, start_date, end_date, args, client_classes, prev_state=None):
    """Runs the full FinTS dialog for a single bank profile and returns
    (accounts, transactions, balances, holdings, state_blob) — the four lists each
    tagged with this profile's bankLabel, plus the client state to persist for the
    next run. Raises on failure — caller decides how to handle a single bank failing
    (see main()).

    `prev_state` is the base64 blob stored after the previous run, or None on a first
    sync. Handing it back to the client is what keeps the bank from demanding a fresh
    SCA every time: it carries the Kundensystem-ID, so python-fints skips the
    HKSYN3(NEW_SYSTEM_ID) handshake and the bank recognises this as the same access it
    already authenticated — which is the precondition for PSD2's 90-day exemption on
    account-information requests.
    """
    FinTS3PinTanClient, NeedTANResponse, FinTSOperations = client_classes
    label = profile["label"]

    accounts_out, transactions_out, balances_out, holdings_out = [], [], [], []

    from_data = None
    if prev_state:
        try:
            from_data = base64.b64decode(prev_state)
            log(f"[fints] [{label}] Gespeicherter Client-Zustand geladen "
                f"— App-Freigabe wird nur verlangt, wenn die 90-Tage-Frist abgelaufen ist.")
        except (ValueError, TypeError) as exc:
            # A corrupt blob must not brick the sync — fall back to a fresh handshake,
            # which costs one app approval and then rewrites a good state.
            log(f"[fints] [{label}] Gespeicherter Client-Zustand unlesbar ({exc}) — "
                f"starte mit frischem Zustand.")
            from_data = None
    else:
        log(f"[fints] [{label}] Kein gespeicherter Client-Zustand — "
            f"dieser Lauf benötigt eine einmalige App-Freigabe.")

    client = FinTS3PinTanClient(
        profile["blz"], profile["user"], profile["pin"], profile["url"],
        product_id=profile["product_id"],
        from_data=from_data,
    )

    with client:
        # 1) Strong customer authentication at dialog init (this is where Atruvia /
        #    Volksbank / Raiffeisenbank demands the app confirmation).
        init_resp = getattr(client, "init_tan_response", None)
        while init_resp is not None and isinstance(init_resp, NeedTANResponse):
            resolved = resolve_decoupled(client, init_resp, NeedTANResponse)
            client.init_tan_response = (
                resolved if isinstance(resolved, NeedTANResponse) else None
            )
            init_resp = client.init_tan_response

        # 2) Account list.
        accounts = settle(client, client.get_sepa_accounts(), NeedTANResponse)
        accounts = list(accounts)

        # Full account overview (HIUPD) — used both to enrich the SEPA accounts
        # with human-readable names, and to discover accounts that
        # get_sepa_accounts() doesn't return (it drops anything without the
        # 'Kontoverwendung SEPA' flag, which can include a Wertpapierdepot or
        # Bausparvertrag under the same login).
        names = {}
        info = {"accounts": []}
        try:
            info = client.get_information()
            for a in info.get("accounts", []):
                iban = a.get("iban")
                if iban:
                    names[iban] = a.get("product_name") or a.get("name")

            # Dump the bank's OWN account list verbatim. This is the UPD (HIUPD) the
            # Rechenzentrum sends for this VR-NetKey, and it is the authoritative answer to
            # "does FinTS know about my Depot / Bausparvertrag at all?". An account that is
            # missing here cannot be fixed from our side — it has to become visible in the
            # regular online banking first, after which the Verbund delivers it here too.
            upd_accounts = info.get("accounts", [])
            log(f"[fints] [{label}] Die Bank meldet {len(upd_accounts)} Konto/Konten "
                f"(HIUPD — das ist die vollständige Liste für diesen VR-NetKey):")
            for a in upd_accounts:
                ops = a.get("supported_operations") or {}
                allowed = sorted(k.name for k, v in ops.items() if v)
                log(f"[fints] [{label}]   • {a.get('product_name') or a.get('name') or '(ohne Bezeichnung)'} "
                    f"| Kontonr. {a.get('account_number')}"
                    f"{'/' + str(a.get('subaccount_number')) if a.get('subaccount_number') else ''} "
                    f"| IBAN {a.get('iban') or '—'} "
                    f"| Typ {a.get('type')} "
                    f"| kann: {', '.join(allowed) if allowed else '(nichts gemeldet)'}")
        except Exception as exc:  # noqa: BLE001
            log(f"[fints] [{label}] Konto-Übersicht (get_information) konnte nicht geladen werden: {exc}")

        if not accounts and not info.get("accounts"):
            raise RuntimeError("Keine Konten gefunden.")

        for acc in accounts:
            accounts_out.append(serialize_account(label, acc, names.get(getattr(acc, "iban", None))))

        # 3) Balances per account (optional).
        if args.balances:
            for acc in accounts:
                iban = getattr(acc, "iban", "?")
                log(f"[fints] [{label}] Lade Saldo für {iban} …")
                try:
                    bal = settle(client, client.get_balance(acc), NeedTANResponse)
                    balances_out.append(serialize_balance(label, acc, bal))
                except Exception as exc:  # noqa: BLE001
                    log(f"[fints] [{label}] Saldo für {iban} fehlgeschlagen: {exc}")

        # 4) Transactions per account.
        for acc in accounts if not args.no_txns else []:
            iban = getattr(acc, "iban", "?")
            log(f"[fints] [{label}] Lade Umsätze für {iban} …")
            try:
                txns = settle_transactions(
                    client,
                    client.get_transactions(acc, start_date, end_date),
                    NeedTANResponse,
                )
            except Exception as exc:  # noqa: BLE001
                log(f"[fints] [{label}] Umsätze für {iban} fehlgeschlagen: {exc}")
                continue
            for txn in txns:
                transactions_out.append(serialize_transaction(label, acc, txn))

        # 5) Additional accounts not covered above — e.g. a Wertpapierdepot
        #    (Union Investment "UnionDepot") or a Bausparvertrag (Schwäbisch
        #    Hall) reachable through this same login. Dispatched per account
        #    based on what FinTS reports it actually supports.
        known_keys = {
            account_key(getattr(a, "iban", None), getattr(a, "accountnumber", None), getattr(a, "blz", None))
            for a in accounts
        }
        for acc_info in info.get("accounts", []):
            extra_acc = build_extra_account(acc_info)
            key = account_key(extra_acc.iban, extra_acc.accountnumber, extra_acc.blz)
            if key in known_keys:
                continue  # already handled via get_sepa_accounts() above
            known_keys.add(key)

            extra_label = (
                acc_info.get("product_name")
                or extra_acc.iban
                or extra_acc.accountnumber
                or "Unbekanntes Konto"
            )
            supported = acc_info.get("supported_operations") or {}
            log(f"[fints] [{label}] Zusätzliches Konto gefunden: {extra_label}")

            if supported.get(FinTSOperations.GET_HOLDINGS):
                log(f"[fints] [{label}] Lade Depot-Bestand für {extra_label} …")
                try:
                    raw_holdings = settle_holdings(client, client.get_holdings(extra_acc), NeedTANResponse)
                    for h in raw_holdings:
                        holdings_out.append(serialize_holding(label, extra_label, extra_acc.accountnumber, h))
                except Exception as exc:  # noqa: BLE001
                    log(f"[fints] [{label}] Depot-Bestand für {extra_label} fehlgeschlagen: {exc}")

            if args.balances and supported.get(FinTSOperations.GET_BALANCE):
                if not extra_acc.iban:
                    log(f"[fints] [{label}] Saldo für {extra_label} übersprungen (keine IBAN, bank_balance benötigt eine).")
                else:
                    try:
                        bal = settle(client, client.get_balance(extra_acc), NeedTANResponse)
                        entry = serialize_balance(label, extra_acc, bal)
                        entry["accountName"] = extra_label
                        balances_out.append(entry)
                    except Exception as exc:  # noqa: BLE001
                        log(f"[fints] [{label}] Saldo für {extra_label} fehlgeschlagen: {exc}")

            if not args.no_txns and supported.get(FinTSOperations.GET_TRANSACTIONS):
                if not extra_acc.iban:
                    # bank_transactions.account_iban is NOT NULL and is the join key every
                    # chart/filter on the Banking page relies on — a Bausparvertrag/Depot
                    # entry has no IBAN, so writing it here would either violate the
                    # constraint or (with a coalesced fallback) silently corrupt account
                    # grouping. Same reasoning as the balance guard above.
                    log(f"[fints] [{label}] Umsätze für {extra_label} übersprungen (keine IBAN, bank_transactions benötigt eine).")
                else:
                    log(f"[fints] [{label}] Lade Umsätze für {extra_label} …")
                    try:
                        txns = settle_transactions(
                            client,
                            client.get_transactions(extra_acc, start_date, end_date),
                            NeedTANResponse,
                        )
                        for txn in txns:
                            transactions_out.append(serialize_transaction(label, extra_acc, txn))
                    except Exception as exc:  # noqa: BLE001
                        log(f"[fints] [{label}] Umsätze für {extra_label} fehlgeschlagen: {exc}")

        # 6) Explicitly probed accounts — known account/Depot numbers (or, if found in the
        #    bank's own "Bankverbindungen"/account overview, an IBAN) the user supplied
        #    directly (FINTS_EXTRA_ACCOUNTS), for when get_information() (step 5) doesn't
        #    list the account at all — some banks simply don't surface a Bausparvertrag or
        #    Depot-Verrechnungskonto there even though it's reachable through the same
        #    Verbund login for other purposes. Every one of get_holdings/get_balance/
        #    get_transactions is tried independently and logged clearly, since we don't know
        #    upfront which (if any) the bank actually supports for this account — that IS the
        #    point of probing. get_holdings results always get stored (depot_holdings needs
        #    no IBAN); get_balance/get_transactions results only get stored when the entry is
        #    an IBAN (bank_balance/bank_transactions both require one) — otherwise they're
        #    logged with the fetched value so it's visible without new storage.
        from fints.models import SEPAAccount as _SEPAAccount

        for num in profile.get("extra_accounts", []):
            is_iban = bool(re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$", num))
            key = account_key(num if is_iban else None, None if is_iban else num, profile["blz"])
            if key in known_keys:
                continue
            known_keys.add(key)

            info_entry = next(
                (a for a in info.get("accounts", [])
                 if a.get("account_number") == num or a.get("iban") == num), None,
            )
            probe_label = (info_entry.get("product_name") if info_entry else None) or f"Konto {num}"
            if info_entry:
                supported_names = sorted(k.name for k, v in (info_entry.get("supported_operations") or {}).items() if v)
                log(f"[fints] [{label}] {probe_label} ({num}): von get_information() gelistet, "
                    f"Bank meldet Unterstützung für: {supported_names or '(keine)'}")
            else:
                log(f"[fints] [{label}] {probe_label} ({num}): nicht von get_information() gelistet — probiere trotzdem direkt.")

            # get_holdings() derives a country code from the account's BIC internally
            # (formals.py: BankIdentifier.COUNTRY_ALPHA_TO_NUMERIC[acc.bic[4:6]]) and crashes
            # client-side with a bare TypeError if bic is None — before anything is even sent
            # to the bank. Reuse the institution's own BIC (same for every account under this
            # login) instead of leaving it unset.
            probe_bic = next((getattr(a, "bic", None) for a in accounts if getattr(a, "bic", None)), None)

            if is_iban:
                # A real IBAN addresses the account the same SEPA way as the regular Girokonten
                # above — no Kontonummer-format pitfalls, and results CAN be stored normally.
                probe_acc = _SEPAAccount(iban=num, bic=probe_bic, accountnumber=None, subaccount=None, blz=profile["blz"])
            else:
                # The classic Kontonummer field (used by HKWPD/HKKAZ5/6) is numeric-only — the
                # bank rejects e.g. "21499214V01" outright with "9010: Die Kontonummer ... ist
                # nicht numerisch". A trailing letter+digits suffix like "V01" is very likely a
                # Unterkontomerkmal (subaccount marker) that belongs in its own field, not
                # concatenated into the account number — split it off if present.
                base_num, sep_num = split_account_number(num)
                probe_acc = _SEPAAccount(iban=None, bic=probe_bic, accountnumber=base_num, subaccount=sep_num, blz=profile["blz"])

            # ORDER MATTERS. Saldo (HKSAL) first, Depotaufstellung (HKWPD) second.
            #
            # A Bausparvertrag reaches us through the Verbund login as a plain Spar-/
            # Darlehenskonto, never as a Wertpapierdepot — HKWPD is simply the wrong segment
            # for it, and the bank answers "9380 Berechtigung für das Konto nicht ausreichend"
            # no matter how the access is set up. A Saldo is the ONE thing FinTS returns for
            # such a contract, so it must not be gated on --balances (it used to be, which
            # meant the only call that could have worked was never sent) and must not sit
            # behind a call that just aborted a TAN challenge: the observed follow-up errors
            # ("9260 Challenge abgebrochen", "3070 Ungültige Challenge-Anforderung") come
            # from the dialog still carrying the failed HKWPD challenge.
            try:
                if is_iban:
                    bal = settle(client, client.get_balance(probe_acc), NeedTANResponse)
                else:
                    # Kontonummer-only account — build the HKSAL segment ourselves so the
                    # account number actually survives into the request (see
                    # get_balance_national; the library default silently drops it).
                    bal = settle(client, get_balance_national(client, probe_acc), NeedTANResponse)

                value = balance_amount(bal)
                if value is None:
                    # A refused HKSAL still returns an object; only .amount tells us apart.
                    log(f"[fints] [{label}] {probe_label}: Saldo abgelehnt — die Bank hat keinen "
                        f"Betrag geliefert (siehe die 9xxx-Meldung oben). Nichts gespeichert.")
                else:
                    entry = serialize_balance(label, probe_acc, bal)
                    entry["accountName"] = probe_label
                    if not is_iban:
                        # bank_balance is keyed by (user_id, account_iban), but that column is
                        # plain text — the bare Kontonummer is just as stable a key, and the
                        # fn_ensure_linked_account trigger matches it against the accounts row's
                        # free-text `iban`, which holds exactly this number for the Bausparverträge.
                        entry["iban"] = num
                    balances_out.append(entry)
                    log(f"[fints] [{label}] {probe_label}: Saldo erfolgreich abgerufen "
                        f"({entry.get('bookedBalance')} {entry.get('currency')}) — wird gespeichert.")
            except Exception as exc:  # noqa: BLE001
                log(f"[fints] [{label}] {probe_label}: get_balance() fehlgeschlagen: {exc}")
                log(f"[fints] [{label}] {probe_label}: Traceback:\n{traceback.format_exc()}")

            # Only worth asking for a Depotaufstellung where the bank itself reports support.
            # Firing HKWPD blindly at a Bausparvertrag produces the 9380 above and, worse,
            # leaves a dead challenge in the dialog that breaks the following call. When
            # get_information() doesn't list the account at all we still try — that is
            # exactly the "bank doesn't surface the Depot" case probing exists for.
            supports_holdings = True
            if info_entry:
                ops = info_entry.get("supported_operations") or {}
                supports_holdings = bool(ops.get(FinTSOperations.GET_HOLDINGS))

            if supports_holdings:
                try:
                    raw_holdings = list(settle_holdings(client, client.get_holdings(probe_acc), NeedTANResponse))
                    if raw_holdings:
                        for h in raw_holdings:
                            holdings_out.append(serialize_holding(label, probe_label, num, h))
                        log(f"[fints] [{label}] {probe_label}: Depot-Bestand erfolgreich "
                            f"({len(raw_holdings)} Position(en)) — wird gespeichert.")
                    else:
                        log(f"[fints] [{label}] {probe_label}: get_holdings() lief durch, aber keine Positionen zurückgegeben.")
                except Exception as exc:  # noqa: BLE001
                    log(f"[fints] [{label}] {probe_label}: get_holdings() fehlgeschlagen: {exc}")
                    log(f"[fints] [{label}] {probe_label}: Traceback:\n{traceback.format_exc()}")
            else:
                log(f"[fints] [{label}] {probe_label}: get_holdings() übersprungen "
                    f"(Bank meldet keine Depot-Unterstützung für dieses Konto).")

            if not args.no_txns:
                try:
                    txns = list(settle_transactions(
                        client, client.get_transactions(probe_acc, start_date, end_date), NeedTANResponse,
                    ))
                    if is_iban:
                        for txn in txns:
                            transactions_out.append(serialize_transaction(label, probe_acc, txn))
                        log(f"[fints] [{label}] {probe_label}: Umsätze erfolgreich abgerufen "
                            f"({len(txns)} Buchung(en)) — wird gespeichert.")
                    else:
                        log(f"[fints] [{label}] {probe_label}: Umsätze erfolgreich abgerufen "
                            f"({len(txns)} Buchung(en)) — NICHT gespeichert (bank_transactions braucht eine IBAN).")
                except Exception as exc:  # noqa: BLE001
                    log(f"[fints] [{label}] {probe_label}: get_transactions() fehlgeschlagen: {exc}")
                    log(f"[fints] [{label}] {probe_label}: Traceback:\n{traceback.format_exc()}")

    # deconstruct() must run after the dialog is closed — python-fints documents the
    # client as unusable afterwards. including_private=True keeps UPD/UPA (account list
    # and the allowed security functions); without it the next run re-fetches them, which
    # works but throws away part of the point of persisting at all.
    state_blob = None
    try:
        state_blob = base64.b64encode(client.deconstruct(including_private=True)).decode("ascii")
    except Exception as exc:  # noqa: BLE001
        log(f"[fints] [{label}] Client-Zustand konnte nicht serialisiert werden ({exc}) — "
            f"der nächste Sync verlangt erneut eine App-Freigabe.")

    return accounts_out, transactions_out, balances_out, holdings_out, state_blob


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--balances", action="store_true",
                        help="Also fetch current balances per account.")
    parser.add_argument("--no-txns", dest="no_txns", action="store_true",
                        help="Skip transaction retrieval (e.g. when only balances are needed).")
    parser.add_argument("--state-file",
                        help="Path to a JSON file holding the persisted FinTS client state "
                             "per bank login. Read at startup and rewritten at the end; the "
                             "Node caller persists it to Supabase. Omitting it means every "
                             "run re-authenticates from scratch (i.e. needs an app approval).")
    parser.add_argument("--no-sca", dest="no_sca", action="store_true",
                        help="Unattended mode: never wait for a SecureGo plus approval. If the "
                             "bank demands one, abort with code 'sca_required' instead of "
                             "polling for minutes on an approval nobody will give.")
    args = parser.parse_args()

    global ALLOW_SCA, SCA_PERFORMED
    ALLOW_SCA = not args.no_sca

    try:
        from fints.client import FinTS3PinTanClient, NeedTANResponse, FinTSOperations
        from fints.exceptions import FinTSClientPINError
    except Exception as exc:  # pragma: no cover
        fail("import", f"python-fints konnte nicht geladen werden: {exc}")

    profiles = get_bank_profiles()

    start_date = parse_date(args.start)
    end_date = parse_date(args.end)
    if start_date is None:
        start_date = FULL_HISTORY_START
    log(f"[fints] Zeitraum: {start_date} bis {end_date or 'heute'} | "
        f"{len(profiles)} Bank-Profil(e): {', '.join(p['label'] for p in profiles)}")

    accounts_out = []
    transactions_out = []
    balances_out = []
    holdings_out = []
    warnings = []

    state = load_state_file(args.state_file)
    # Banks that aborted because they'd need an app approval this run isn't allowed to
    # wait for. Reported separately from `warnings` so the caller can tell "needs your
    # phone once" apart from "something is broken".
    sca_required = []

    for profile in profiles:
        label = profile["label"]
        key = bank_key(profile)
        log(f"[fints] === {label} (BLZ {profile['blz']}) ===")
        prev = state.get(key) or {}
        SCA_PERFORMED = False
        try:
            accs, txns, bals, holds, state_blob = sync_one_bank(
                profile, start_date, end_date, args,
                (FinTS3PinTanClient, NeedTANResponse, FinTSOperations),
                prev_state=prev.get("blob"),
            )
            accounts_out.extend(accs)
            transactions_out.extend(txns)
            balances_out.extend(bals)
            holdings_out.extend(holds)
            if state_blob:
                state[key] = {
                    "blob": state_blob,
                    "label": label,
                    "scaPerformed": SCA_PERFORMED,
                }
        except ScaRequired as exc:
            # Keep the existing stored state untouched: it's stale, not wrong, and the
            # next interactive sync will refresh it. Dropping it here would guarantee an
            # extra approval even if the bank would still have accepted it.
            msg = f"{label}: {exc}"
            log(f"[fints] {msg}")
            sca_required.append(label)
            warnings.append(msg)
        except FinTSClientPINError:
            msg = f"{label}: PIN/Zugangsdaten wurden von der Bank abgelehnt."
            log(f"[fints] {msg}")
            warnings.append(msg)
        except RuntimeError as exc:
            msg = f"{label}: {exc}"
            log(f"[fints] {msg}")
            warnings.append(msg)
        except Exception as exc:  # noqa: BLE001
            msg = f"{label}: {type(exc).__name__}: {exc}"
            log(f"[fints] {msg}")
            warnings.append(msg)

    write_state_file(args.state_file, state)

    # Only hard-fail if EVERY configured bank failed — one bad profile (e.g. a
    # not-yet-working Union Investment login) shouldn't take down the rest.
    if not accounts_out and warnings:
        # A pure "needs an approval" abort gets its own code so the caller can surface
        # "bitte einmal manuell synchronisieren" instead of a generic bank error.
        code = "sca_required" if len(sca_required) == len(profiles) else "fints"
        fail(code, "; ".join(warnings))

    print(json.dumps({
        "ok": True,
        "accounts": accounts_out,
        "transactions": transactions_out,
        "balances": balances_out,
        "holdings": holdings_out,
        "warnings": warnings,
        "scaRequired": sca_required,
    }))
    sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001  # pragma: no cover
        print(json.dumps({"ok": False, "error": f"Unerwarteter Fehler: {exc}", "code": "crash"}))
        sys.stdout.flush()
        sys.exit(2)
