"""Vercel Python Function: scheduled FinTS bank sync, triggered by Vercel Cron (see
vercel.json). Runs natively on Vercel (no subprocess spawning needed here, unlike the local
Node sidecar under scripts/fints/) because Vercel's Python runtime can install `fints`
directly (see /requirements.txt).

Auth: shared secret via `Authorization: Bearer <CRON_SECRET>`, matching every other cron
route in this app. The target Supabase user is fixed via BANK_SYNC_USER_ID, since the FinTS
credentials (FINTS_URL/BLZ/USERNAME/PIN) are a single global bank login, not per-user.

Query flags (this endpoint serves both the cron and the UI's manual sync):
  ?sca=1   allow waiting for a SecureGo plus approval (manual sync only — the cron has
           nobody to approve, so it aborts with skippedReason "sca_required" instead).
  ?full=1  request the full history instead of the SCA-exempt 90-day window. Implies an
           approval, so only meaningful together with ?sca=1.

SCA: the python-fints client state (Kundensystem-ID) is persisted in `fints_client_state`,
shared with the local sidecar under scripts/fints/ via an identical bank_key(). That is what
makes PSD2's 90-day exemption apply — without it the bank treats every sync as a new access
and demands an app approval each time.

IMPORTANT — external_id parity: transactions are deduplicated in Postgres by
(user_id, external_id), built the same way as scripts/fints/index.ts's buildExternalId() /
the local sidecar path, so the same transaction synced from either place collapses to one
row. That hash embeds the amount using JS's Number-to-string rules (no trailing ".0" for
whole numbers) — see js_number_str() below. If this ever drifts from the TS implementation,
worst case is a harmless duplicate row, not data loss.

IMPORTANT — bank-side risk: this runs from Vercel's IP ranges instead of your home network.
Some banks' fraud heuristics react to a sudsen new source IP for PIN/TAN access. Watch the
first few scheduled runs (Vercel function logs) before trusting this unattended.
"""

import base64
import datetime as _dt
import hashlib
import json
import os
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import requests
from fints.client import FinTS3PinTanClient, NeedTANResponse
from fints.exceptions import FinTSClientPINError

# ── Config ───────────────────────────────────────────────────────────────────────

LOOKBACK_DAYS = 14  # wider than the schedule interval; dedup makes overlap harmless

# PSD2 (Art. 10 RTS) exempts account information for the last 90 days from a fresh strong
# authentication, provided the bank recognises the access — which requires the persisted
# client state below. A manual sync therefore defaults to this window too; only an explicit
# ?full=1 goes further back, and that always costs an app approval.
SCA_FREE_LOOKBACK_DAYS = 90
FULL_HISTORY_START = _dt.date(2000, 1, 1)

# Decoupled SCA polling budget, trimmed to comfortably fit Vercel's function timeout
# (see vercel.json's functions.maxDuration for this file).
WAIT_BEFORE_FIRST_POLL = 2.0
WAIT_BETWEEN_POLLS = 4.0
MAX_POLLS = 60  # ~4 minutes worst case

# ── Category rules — ported 1:1 from src/lib/fints/categorize.ts ─────────────────
_CATEGORY_RULES = [
    ("Lebensmittel", [
        r"\b(rewe|edeka|aldi|lidl|penny|netto|kaufland|norma|tegut|bio\s?company|denn?s|basic|dm\s?markt|rossmann|müller)\b",
        r"\b(supermarkt|lebensmittel|bäckerei|metzger|fleisch|obst|gemüse)\b",
    ]),
    ("Restaurant & Café", [
        r"\b(restaurant|bistro|café|cafe|imbiss|mcdonalds|mc\s?donalds|burger\s?king|subway|kfc|pizza|lieferando|lieferheld|just\s?eat|uber\s?eats|wolt|doordash)\b",
        r"\b(gaststätte|gasthof|wirtshaus|brauerei|kantine)\b",
    ]),
    ("Transport", [
        r"\b(db\s?bahn|deutsche\s?bahn|bvg|mvv|hvv|vvs|rnv|üstra|s-bahn|u-bahn|stadtbahn|nahverkehr|ticket|fahrkarte)\b",
        r"\b(uber|lyft|taxi|mietwagen|sixt|hertz|avis|europcar|flinkster|share\s?now|miles|cambio)\b",
        r"\b(lufthansa|eurowings|ryanair|easyjet|wizz\s?air|condor|tuifly|flug|airline|airport|flughafen)\b",
    ]),
    ("Tanken & Auto", [
        r"\b(shell|aral|bp|esso|total|jet\s?tankstelle|tankstelle|tanken|tank\s?&\s?rast)\b",
        r"\b(adac|tuev|kfz|werkstatt|autohaus|reifendienst|parkhaus|parkschein|parken)\b",
    ]),
    ("Streaming & Medien", [
        r"\b(netflix|amazon\s?prime|disney\+|disney\s?plus|spotify|apple\s?music|deezer|tidal|youtube\s?premium|sky\s?ticket|joyn|zdf|ard\s?mediathek|maxdome)\b",
        r"\b(kindle|audible|ebook|buch|zeitung|magazin|spiegel|zeit\s?abo|faz)\b",
    ]),
    ("Software & Tech", [
        r"\b(adobe|microsoft|google|apple|icloud|dropbox|github|slack|notion|figma|canva|1password|lastpass)\b",
        r"\b(hosting|domain|server|cloud|saas|software|app\s?store|play\s?store|steam)\b",
    ]),
    ("Miete & Wohnen", [
        r"\b(miete|warmmiete|kaltmiete|nebenkosten|hausgeld|mietkaution|wohnungsgeld)\b",
        r"\b(strom|gas|wasser|heizung|enercity|enbw|e\.on|rwe|vattenfall|stadtwerke|netze|fernwärme)\b",
        r"\b(internet|dsl|glasfaser|telekom|vodafone|o2|1&1|unitymedia|kabel\s?deutschland)\b",
    ]),
    ("Versicherung", [
        r"\b(versicherung|assurance|allianz|huk|axa|ergo|generali|zurich|debeka|signal\s?iduna|dak|aok|tkk|barmer|techniker\s?krankenkasse)\b",
        r"\b(krankenversicherung|haftpflicht|hausrat|kfz-versicherung|lebensversicherung|unfallversicherung|rechtsschutz)\b",
    ]),
    ("Gehalt & Einkommen", [
        r"\b(gehalt|lohn|entgelt|vergütung|honorar|rente|pension|arbeitslosengeld|kindergeld|elterngeld|bafög)\b",
        r"\b(gutschrift\s*gehalt|gehaltseingang|lohneingang)\b",
    ]),
    ("Gesundheit", [
        r"\b(apotheke|arzt|zahnarzt|krankenhaus|klinik|physiotherapie|optiker|hörakustik|medikament|rezept)\b",
        r"\b(fitnessstudio|mcfit|fitx|john\s?reed|clever\s?fit|sport\s?studio|gym)\b",
    ]),
    ("Shopping", [
        r"\b(amazon|zalando|about\s?you|otto|zara|h&m|primark|c&a|peek\s?&\s?cloppenburg|esprit|s\.oliver|bonprix|tchibo|ikea|obi|bauhaus|hornbach|mediamarkt|saturn|ebay|paypal)\b",
        r"\b(onlineshop|versandhandel|kleidung|schuhe|mode|haushalt|möbel|elektro)\b",
    ]),
    ("Bildung", [
        r"\b(schulgeld|studienbeitrag|seminargebühr|kurs|weiterbildung|udemy|coursera|duolingo|volkshochschule|vhs)\b",
        r"\b(bücher|bücherei|bibliothek|lehrmittel)\b",
    ]),
    ("Reisen & Urlaub", [
        r"\b(hotel|hostel|airbnb|booking\.com|trivago|expedia|holidaycheck|reisebüro|tui|alltours|neckermann|fti)\b",
        r"\b(urlaub|reise|ferien|sightseeing|museum|zoo|freizeitpark)\b",
    ]),
    ("Sparen & Anlegen", [
        r"\b(sparplan|sparrate|spareinlage|festgeld|tagesgeld|depot|fonds|etf|aktien|wertpapier|dividende|trade\s?republic|comdirect|ing\s?diba|dkb)\b",
    ]),
    ("Überweisung", [
        r"\b(überweisung|überweisu|sepa|gutschrift|lastschrift|dauerauftrag|standing\s?order)\b",
    ]),
]
_CATEGORY_RULES_COMPILED = [
    (name, [re.compile(p, re.IGNORECASE) for p in patterns])
    for name, patterns in _CATEGORY_RULES
]


def categorize(text):
    if not text:
        return None
    for name, patterns in _CATEGORY_RULES_COMPILED:
        for pattern in patterns:
            if pattern.search(text):
                return name
    return None


def js_number_str(n):
    """Match JS's Number.prototype.toString(): no trailing '.0' for whole numbers."""
    f = float(n)
    if f == int(f):
        return str(int(f))
    return repr(f)


def build_external_id(iban, bank_reference, value_date, amount, description):
    # Mirrors src/lib/fints/index.ts's buildExternalId: prefer the bank's own reference
    # (stable across re-fetches) over hashing the free-text purpose (observed to change
    # between syncs of the same posting, which duplicated transactions downstream).
    if bank_reference:
        raw = f"{iban}|ref|{bank_reference}"
    else:
        raw = f"{iban}|{value_date}|{js_number_str(amount)}|{(description or '')[:100]}"
    return base64.b64encode(raw.encode("utf-8")).decode("ascii")


# ── Supabase REST helpers (no supabase-py dependency needed) ─────────────────────

def supabase_headers(prefer=None):
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def upsert_transactions(base_url, rows):
    if not rows:
        return 0, 0
    resp = requests.post(
        f"{base_url}/rest/v1/bank_transactions?on_conflict=user_id,external_id",
        headers=supabase_headers("resolution=ignore-duplicates,return=representation"),
        json=rows,
        timeout=60,
    )
    resp.raise_for_status()
    imported = len(resp.json())
    return imported, len(rows) - imported


def upsert_balances(base_url, rows):
    if not rows:
        return
    resp = requests.post(
        f"{base_url}/rest/v1/bank_balance?on_conflict=user_id,account_iban",
        headers=supabase_headers("resolution=merge-duplicates,return=minimal"),
        json=rows,
        timeout=60,
    )
    resp.raise_for_status()


def bank_key(blz, user):
    """Stable per-login key for fints_client_state.

    MUST stay identical to bank_key() in scripts/fints/fints_sync.py — the local sidecar and
    this function share one row per bank login. If the two ever drift apart, each execution
    path keeps its own state and every switch between them costs an extra app approval.
    """
    return hashlib.sha256(f"{blz}:{user}".encode("utf-8")).hexdigest()[:32]


def load_client_state(base_url, user_id, key):
    """Fetch the persisted python-fints state blob, or None. Best-effort: a failure here
    just means this run needs an app approval, which is better than not syncing at all."""
    try:
        resp = requests.get(
            f"{base_url}/rest/v1/fints_client_state",
            headers=supabase_headers(),
            params={"user_id": f"eq.{user_id}", "bank_key": f"eq.{key}", "select": "state_blob"},
            timeout=30,
        )
        resp.raise_for_status()
        rows = resp.json()
        if rows and rows[0].get("state_blob"):
            return base64.b64decode(rows[0]["state_blob"])
    except Exception as exc:  # noqa: BLE001
        print(f"[fints] Client-Zustand nicht ladbar: {exc}")
    return None


def save_client_state(base_url, user_id, key, blob, label, sca_performed):
    """Persist the state for the next run. `last_sca_at` is only stamped when an approval
    actually happened, so the 90-day countdown reflects reality rather than the last sync."""
    if not blob:
        return
    row = {
        "user_id": user_id,
        "bank_key": key,
        "bank_label": label,
        "state_blob": base64.b64encode(blob).decode("ascii"),
        "sca_required_since": None,
        "updated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
    }
    if sca_performed:
        row["last_sca_at"] = row["updated_at"]
    try:
        resp = requests.post(
            f"{base_url}/rest/v1/fints_client_state?on_conflict=user_id,bank_key",
            headers=supabase_headers("resolution=merge-duplicates,return=minimal"),
            json=[row],
            timeout=30,
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        # Non-fatal: transactions are already stored; this only costs the next run an approval.
        print(f"[fints] Client-Zustand nicht speicherbar: {exc}")


def mark_sca_required(base_url, user_id, key):
    """Record that an unattended run stopped because the bank wants an approval, so the
    /bank page can prompt for one manual sync."""
    try:
        requests.patch(
            f"{base_url}/rest/v1/fints_client_state",
            headers=supabase_headers("return=minimal"),
            params={"user_id": f"eq.{user_id}", "bank_key": f"eq.{key}"},
            json={"sca_required_since": _dt.datetime.now(_dt.timezone.utc).isoformat()},
            timeout=30,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[fints] sca_required_since nicht setzbar: {exc}")


# ── FinTS ──────────────────────────────────────────────────────────────────────

class ScaRequired(RuntimeError):
    """The bank wants a strong authentication, but this run may not wait for one."""


def resolve_decoupled(client, response, allow_sca, state):
    """Poll a decoupled (app-approval) SCA challenge to completion, or raise on timeout.

    `allow_sca` is False for the cron trigger: nobody is looking at their phone, so waiting
    minutes for an approval that will never come is worse than aborting with a clear reason.
    `state` is a dict used to report back that an approval actually happened, so the caller
    can stamp last_sca_at.
    """
    import time

    if not allow_sca:
        raise ScaRequired(
            "Die Bank verlangt eine Freigabe in der SecureGo plus App. Dieser Lauf ist "
            "unbeaufsichtigt und wartet nicht darauf — bitte einmal manuell synchronisieren."
        )

    if not getattr(response, "decoupled", False):
        raise RuntimeError(
            "Bank verlangt eine getippte TAN — dieser Dienst "
            "unterstützt nur App-Direktfreigabe (SecureGo plus decoupled)."
        )

    state["sca_performed"] = True

    time.sleep(WAIT_BEFORE_FIRST_POLL)
    for _ in range(MAX_POLLS):
        result = client.send_tan(response, "")
        if not isinstance(result, NeedTANResponse):
            return result
        response = result
        time.sleep(WAIT_BETWEEN_POLLS)

    raise RuntimeError("Zeitüberschreitung: Freigabe nicht rechtzeitig in der App bestätigt.")


def settle(client, result, allow_sca, state):
    if isinstance(result, NeedTANResponse):
        return resolve_decoupled(client, result, allow_sca, state)
    return result


def run_sync(allow_sca=False, full_history=False):
    """Run one FinTS sync and upsert the result.

    allow_sca:    may this run wait for a SecureGo plus approval? True only for a manual
                  sync triggered from the UI (a person is watching); False for the cron.
    full_history: request everything the bank still has instead of the SCA-exempt window.
                  Always needs an approval, so it implies allow_sca on the caller's side.
    """
    import datetime as dt

    url = os.environ["FINTS_URL"]
    blz = re.sub(r"\D", "", os.environ["FINTS_BLZ"])
    user = os.environ["FINTS_USERNAME"]
    pin = os.environ["FINTS_PIN"]
    product_id = os.environ.get("FINTS_PRODUCT_ID") or None
    label = os.environ.get("FINTS_LABEL") or "Raiffeisenbank"
    supabase_user_id = os.environ["BANK_SYNC_USER_ID"]
    supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]

    if full_history:
        start_date = FULL_HISTORY_START
    else:
        # Cron uses the tighter window; a manual sync takes the full SCA-exempt 90 days.
        days = SCA_FREE_LOOKBACK_DAYS if allow_sca else LOOKBACK_DAYS
        start_date = dt.date.today() - dt.timedelta(days=days)

    key = bank_key(blz, user)
    # Restoring the state carries the Kundensystem-ID across runs. Without it python-fints
    # re-runs HKSYN3(NEW_SYSTEM_ID) every time, the bank sees an unknown access, and PSD2
    # forces a fresh approval on every single sync.
    from_data = load_client_state(supabase_url, supabase_user_id, key)
    sca_state = {"sca_performed": False}
    sca_aborted = False

    client = FinTS3PinTanClient(blz, user, pin, url, product_id=product_id, from_data=from_data)

    txn_rows = []
    bal_rows = []
    warnings = []

    try:
        with client:
            init_resp = getattr(client, "init_tan_response", None)
            while isinstance(init_resp, NeedTANResponse):
                resolved = resolve_decoupled(client, init_resp, allow_sca, sca_state)
                client.init_tan_response = resolved if isinstance(resolved, NeedTANResponse) else None
                init_resp = client.init_tan_response

            accounts = list(settle(client, client.get_sepa_accounts(), allow_sca, sca_state))

            for acc in accounts:
                try:
                    bal = settle(client, client.get_balance(acc), allow_sca, sca_state)
                    amount_obj = getattr(bal, "amount", None)
                    value = float(getattr(amount_obj, "amount", amount_obj)) if amount_obj is not None else 0.0
                    currency = getattr(amount_obj, "currency", None) or "EUR"
                    bal_rows.append({
                        "user_id": supabase_user_id,
                        "account_iban": acc.iban,
                        "account_bic": acc.bic,
                        "account_name": None,
                        "booked_balance": value,
                        "available_balance": value,
                        "currency": currency,
                        "fetched_at": dt.datetime.utcnow().isoformat() + "Z",
                    })
                except Exception:
                    pass  # balance is best-effort; transactions matter more

                try:
                    txns = settle(client, client.get_transactions(acc, start_date, None), allow_sca, sca_state)
                except ScaRequired:
                    raise
                except Exception as exc:  # noqa: BLE001
                    # Nicht still überspringen: sonst meldet der Lauf "ok, 0 neu" und ein kaputter
                    # Umsatzabruf sieht aus wie ein ruhiges Wochenende.
                    warning = f"Umsatzabruf für {acc.iban} fehlgeschlagen: {type(exc).__name__}: {exc}"
                    print(f"[fints] {warning}")
                    warnings.append(warning)
                    continue

                for txn in txns:
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
                    if amount is None:
                        continue

                    value_date = data.get("date")
                    value_date_str = value_date.isoformat() if value_date else None
                    if not value_date_str or not acc.iban:
                        # bank_transactions.value_date/account_iban are NOT NULL, and a batch
                        # POST here fails (and drops) the *whole* request on one bad row —
                        # skip rather than let one unparseable line take the rest down.
                        continue
                    entry_date = data.get("entry_date") or data.get("guessed_entry_date")
                    entry_date_str = entry_date.isoformat() if entry_date else None
                    description = data.get("purpose") or None
                    # AcctSvcrRef (camt.052) / tag-61 bank reference (MT940) — stable across
                    # re-fetches, unlike `purpose` (the bank has been observed to rewrite it
                    # between syncs of the same posting). See build_external_id.
                    bank_reference = data.get("bank_reference")

                    txn_rows.append({
                        "user_id": supabase_user_id,
                        "account_iban": acc.iban,
                        "account_bic": acc.bic,
                        "amount": amount,
                        "currency": currency,
                        "value_date": value_date_str,
                        "entry_date": entry_date_str,
                        "description": description,
                        "counterpart_name": data.get("applicant_name"),
                        "counterpart_iban": data.get("applicant_iban"),
                        "counterpart_bic": data.get("applicant_bin"),
                        "category": categorize(data.get("applicant_name")) or categorize(description),
                        "raw_description": description,
                        "bank_reference": bank_reference,
                        "external_id": build_external_id(acc.iban, bank_reference, value_date_str, amount, description),
                    })

    except ScaRequired:
        sca_aborted = True
        raise
    finally:
        if sca_aborted:
            # Don't touch the stored state: it's stale, not wrong, and the next manual sync
            # refreshes it. Writing it here would also clear sca_required_since again and
            # the /bank page would never show that an approval is due.
            mark_sca_required(supabase_url, supabase_user_id, key)
        else:
            # deconstruct() only after the dialog is closed — python-fints documents the
            # client as unusable afterwards. Runs even on failure: a run that got past the
            # handshake produced a state worth keeping.
            try:
                save_client_state(
                    supabase_url, supabase_user_id, key,
                    client.deconstruct(including_private=True),
                    label, sca_state["sca_performed"],
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[fints] Client-Zustand nicht serialisierbar: {exc}")

    imported, skipped = upsert_transactions(supabase_url, txn_rows)
    upsert_balances(supabase_url, bal_rows)
    return {
        "ok": True, "imported": imported, "skipped": skipped, "balances": len(bal_rows),
        "scaPerformed": sca_state["sca_performed"],
        "warnings": warnings,
    }


# ── Vercel entrypoint ────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def _handle(self):
        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {os.environ.get('CRON_SECRET', '')}":
            self._json(401, {"error": "Unauthorized"})
            return

        # Query flags — this function serves BOTH the Vercel cron and the manual sync from
        # the UI (src/lib/fints triggerCloudBankSync). Only the manual one has a person
        # around to approve in the app, so SCA is opt-in rather than the default.
        query = parse_qs(urlparse(self.path).query)
        allow_sca = query.get("sca", ["0"])[0] == "1"
        full_history = query.get("full", ["0"])[0] == "1"

        try:
            body = run_sync(allow_sca=allow_sca, full_history=full_history)
            self._json(200, body)
        except ScaRequired as exc:
            # Not a malfunction — PSD2's 90-day exemption has run out. Answer 200 so the
            # cron run isn't logged as failed and doesn't trigger retry noise; the fix is
            # one manual sync, not a redeploy.
            self._json(200, {
                "ok": True,
                "skippedReason": "sca_required",
                "imported": 0,
                "skipped": 0,
                "message": str(exc),
            })
        except FinTSClientPINError:
            self._json(500, {"ok": False, "error": "PIN/Zugangsdaten wurden von der Bank abgelehnt."})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})

    def _json(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)
