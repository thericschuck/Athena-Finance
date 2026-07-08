#!/usr/bin/env python
"""FinTS sidecar for athena-finance.

Fetches SEPA accounts and their booked transactions via FinTS/HBCI (PIN/TAN),
fully supporting:
  * Decoupled SCA (e.g. SecureGo plus "Direktfreigabe"): pushes an approval
    request to the banking app, then polls the bank until the user confirms.
  * Banks that only offer camt.052 (HKCAZ) instead of MT940 (HKKAZ):
    python-fints falls back automatically.

Configuration is read from environment variables (same names the Next.js app uses):
  FINTS_URL, FINTS_BLZ, FINTS_USERNAME, FINTS_PIN, FINTS_PRODUCT_ID (optional)

Usage:
  python fints_sync.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]

Output contract:
  * A single JSON object is written to STDOUT (and nothing else).
  * All human-readable / progress logging goes to STDERR.
  * Progress markers on STDERR (one per line, prefixed "@@"):
      @@PUSH_SENT   – an SCA approval request was pushed to the app; user must confirm
      @@POLL n      – polling attempt n while waiting for the decoupled confirmation
  * Exit code 0 on success, 1 on handled error (JSON error body still printed), 2 on crash.

STDOUT JSON shape:
  success: { "ok": true, "accounts": [Account], "transactions": [Transaction] }
  error:   { "ok": false, "error": "<message>", "code": "<short-code>" }

  Account:     { "iban", "bic", "accountNumber", "blz", "accountName" }
  Transaction: { "accountIban", "accountBic", "amount", "currency",
                 "valueDate", "entryDate", "description",
                 "counterpartName", "counterpartIban", "counterpartBic" }
"""

import argparse
import datetime as dt
import json
import os
import sys
import time
from decimal import Decimal

# ── Polling configuration for decoupled (app-confirmation) SCA ──────────────────
WAIT_BEFORE_FIRST_POLL = 2.0     # seconds to wait before the first status query
WAIT_BETWEEN_POLLS = 4.0         # seconds between subsequent status queries
MAX_POLLS = 75                   # ~5 minutes total (2 + 75*4s) before giving up


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
    prompt for a typed TAN in this non-interactive sidecar).
    """
    if not getattr(response, "decoupled", False):
        raise RuntimeError(
            "Die Bank verlangt eine getippte TAN, aber dieser Dienst unterstützt nur "
            "die App-Direktfreigabe (SecureGo plus decoupled). Bitte in der VR-Banking / "
            "SecureGo plus App die Direktfreigabe (decoupled) aktivieren."
        )

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


def serialize_account(acc, name=None):
    return {
        "iban": getattr(acc, "iban", None),
        "bic": getattr(acc, "bic", None),
        "accountNumber": getattr(acc, "accountnumber", None),
        "blz": getattr(acc, "blz", None),
        "accountName": name,
    }


def serialize_balance(acc, balance):
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
        "iban": getattr(acc, "iban", None),
        "bic": getattr(acc, "bic", None),
        # python-fints returns a single (booked) balance; we expose it as both.
        "bookedBalance": value,
        "availableBalance": value,
        "currency": currency,
        "date": jsonify(getattr(balance, "date", None)),
    }


def serialize_transaction(acc, txn):
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
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--balances", action="store_true",
                        help="Also fetch current balances per account.")
    parser.add_argument("--no-txns", dest="no_txns", action="store_true",
                        help="Skip transaction retrieval (e.g. when only balances are needed).")
    args = parser.parse_args()

    try:
        from fints.client import FinTS3PinTanClient, NeedTANResponse
        from fints.exceptions import FinTSClientPINError
    except Exception as exc:  # pragma: no cover
        fail("import", f"python-fints konnte nicht geladen werden: {exc}")

    url, blz, user, pin, product_id = get_config()

    start_date = parse_date(args.start)
    end_date = parse_date(args.end)
    if start_date is None:
        start_date = dt.date.today() - dt.timedelta(days=90)
    log(f"[fints] Zeitraum: {start_date} bis {end_date or 'heute'} | BLZ {blz} | "
        f"Produkt-ID {'gesetzt' if product_id else 'NICHT gesetzt'}")

    client = FinTS3PinTanClient(
        blz, user, pin, url,
        product_id=product_id,
    )

    accounts_out = []
    transactions_out = []
    balances_out = []

    try:
        with client:
            # 1) Strong customer authentication at dialog init (this is where Atruvia /
            #    Volksbank / Raiffeisenbank demands the app confirmation).
            init_resp = getattr(client, "init_tan_response", None)
            while init_resp is not None and isinstance(init_resp, NeedTANResponse):
                resolved = resolve_decoupled(client, init_resp, NeedTANResponse)
                # After confirmation python-fints clears/refreshes init_tan_response.
                client.init_tan_response = (
                    resolved if isinstance(resolved, NeedTANResponse) else None
                )
                init_resp = client.init_tan_response

            # 2) Account list.
            accounts = settle(client, client.get_sepa_accounts(), NeedTANResponse)
            accounts = list(accounts)
            if not accounts:
                fail("no-accounts", "Keine SEPA-Konten gefunden.")

            # Try to enrich with human-readable account names (best effort).
            names = {}
            try:
                info = client.get_information()
                for a in info.get("accounts", []):
                    iban = a.get("iban")
                    if iban:
                        names[iban] = a.get("product_name") or a.get("name")
            except Exception as exc:  # noqa: BLE001
                log(f"[fints] Konto-Namen konnten nicht geladen werden: {exc}")

            for acc in accounts:
                accounts_out.append(serialize_account(acc, names.get(getattr(acc, "iban", None))))

            # 3) Balances per account (optional).
            if args.balances:
                for acc in accounts:
                    iban = getattr(acc, "iban", "?")
                    log(f"[fints] Lade Saldo für {iban} …")
                    try:
                        bal = settle(client, client.get_balance(acc), NeedTANResponse)
                        balances_out.append(serialize_balance(acc, bal))
                    except Exception as exc:  # noqa: BLE001
                        log(f"[fints] Saldo für {iban} fehlgeschlagen: {exc}")

            # 4) Transactions per account.
            for acc in accounts if not args.no_txns else []:
                iban = getattr(acc, "iban", "?")
                log(f"[fints] Lade Umsätze für {iban} …")
                try:
                    txns = settle(
                        client,
                        client.get_transactions(acc, start_date, end_date),
                        NeedTANResponse,
                    )
                except Exception as exc:  # noqa: BLE001
                    log(f"[fints] Umsätze für {iban} fehlgeschlagen: {exc}")
                    continue
                for txn in txns:
                    transactions_out.append(serialize_transaction(acc, txn))

    except FinTSClientPINError:
        fail("pin", "PIN/Zugangsdaten wurden von der Bank abgelehnt.")
    except RuntimeError as exc:
        fail("sca", str(exc))
    except Exception as exc:  # noqa: BLE001
        fail("fints", f"{type(exc).__name__}: {exc}")

    print(json.dumps({
        "ok": True,
        "accounts": accounts_out,
        "transactions": transactions_out,
        "balances": balances_out,
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
