"""Vercel Python Function: scheduled FinTS bank sync, triggered by Vercel Cron (see
vercel.json). Runs natively on Vercel (no subprocess spawning needed here, unlike the local
Node sidecar under scripts/fints/) because Vercel's Python runtime can install `fints`
directly (see /requirements.txt).

Auth: shared secret via `Authorization: Bearer <CRON_SECRET>`, matching every other cron
route in this app. The target Supabase user is fixed via BANK_SYNC_USER_ID, since the FinTS
credentials (FINTS_URL/BLZ/USERNAME/PIN) are a single global bank login, not per-user.

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
import json
import os
import re
from http.server import BaseHTTPRequestHandler

import requests
from fints.client import FinTS3PinTanClient, NeedTANResponse
from fints.exceptions import FinTSClientPINError

# ── Config ───────────────────────────────────────────────────────────────────────

LOOKBACK_DAYS = 14  # wider than the schedule interval; dedup makes overlap harmless

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


# ── FinTS ──────────────────────────────────────────────────────────────────────

def resolve_decoupled(client, response):
    """Poll a decoupled (app-approval) SCA challenge to completion, or raise on timeout."""
    import time

    if not getattr(response, "decoupled", False):
        raise RuntimeError(
            "Bank verlangt eine getippte TAN — dieser unbeaufsichtigte Cron-Job "
            "unterstützt nur App-Direktfreigabe (SecureGo plus decoupled)."
        )

    time.sleep(WAIT_BEFORE_FIRST_POLL)
    for _ in range(MAX_POLLS):
        result = client.send_tan(response, "")
        if not isinstance(result, NeedTANResponse):
            return result
        response = result
        time.sleep(WAIT_BETWEEN_POLLS)

    raise RuntimeError("Zeitüberschreitung: Freigabe nicht rechtzeitig in der App bestätigt.")


def settle(client, result):
    if isinstance(result, NeedTANResponse):
        return resolve_decoupled(client, result)
    return result


def run_sync():
    import datetime as dt

    url = os.environ["FINTS_URL"]
    blz = re.sub(r"\D", "", os.environ["FINTS_BLZ"])
    user = os.environ["FINTS_USERNAME"]
    pin = os.environ["FINTS_PIN"]
    product_id = os.environ.get("FINTS_PRODUCT_ID") or None
    supabase_user_id = os.environ["BANK_SYNC_USER_ID"]
    supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]

    start_date = dt.date.today() - dt.timedelta(days=LOOKBACK_DAYS)

    client = FinTS3PinTanClient(blz, user, pin, url, product_id=product_id)

    txn_rows = []
    bal_rows = []

    with client:
        init_resp = getattr(client, "init_tan_response", None)
        while isinstance(init_resp, NeedTANResponse):
            resolved = resolve_decoupled(client, init_resp)
            client.init_tan_response = resolved if isinstance(resolved, NeedTANResponse) else None
            init_resp = client.init_tan_response

        accounts = list(settle(client, client.get_sepa_accounts()))

        for acc in accounts:
            try:
                bal = settle(client, client.get_balance(acc))
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
                txns = settle(client, client.get_transactions(acc, start_date, None))
            except Exception:
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

    imported, skipped = upsert_transactions(supabase_url, txn_rows)
    upsert_balances(supabase_url, bal_rows)
    return {"ok": True, "imported": imported, "skipped": skipped, "balances": len(bal_rows)}


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

        try:
            body = run_sync()
            self._json(200, body)
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
