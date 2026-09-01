#!/usr/bin/env python
"""Offline-Diagnose der FinTS-Bankparameter.

Rekonstruiert den python-fints-Client aus dem in Supabase gespeicherten Client-Zustand
(`fints_client_state.state_blob`) und gibt aus, was die Bank ueber sich selbst und ueber die
Konten mitgeteilt hat: BPD (Bankparameterdaten) und UPD (Userparameterdaten).

**Es wird KEINE Verbindung zur Bank aufgebaut.** Der Konstruktor von FinTS3PinTanClient
kontaktiert die Bank erst beim Betreten des `with`-Blocks; alles hier Ausgegebene stammt aus
dem Blob, den der letzte Sync abgelegt hat. Deshalb kostet dieses Skript keine
SecureGo-plus-Freigabe und laesst sich beliebig oft laufen.

Beantwortet vor allem:
  - Welche Auftragsarten (HKxxx) bietet die Bank ueberhaupt an, und in welcher Version?
    Relevant, weil python-fints jeweils die hoechste unterstuetzte Version waehlt und diese
    Wahl bestimmt, ob eine Kontonummer ueberhaupt uebertragen werden kann.
  - Welche Konten meldet die Bank fuer diesen Zugang (UPD/HIUPD), mit welchen erlaubten
    Operationen je Konto?

Aufruf:
    scripts/fints/.venv/Scripts/python.exe scripts/fints/fints_diagnose.py
"""

import base64
import json
import os
import re
import sys
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_env():
    """Liest .env.local ein. Bewusst ein eigener Mini-Parser statt python-dotenv, damit das
    Skript keine zusaetzliche Abhaengigkeit ins venv zieht."""
    path = os.path.join(PROJECT_ROOT, ".env.local")
    env = {}
    if not os.path.exists(path):
        sys.exit(f"FEHLER: {path} nicht gefunden.")
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def fetch_state_blob(env):
    """Holt den gespeicherten Client-Zustand ueber die Supabase-REST-API."""
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    user_id = env["BANK_SYNC_USER_ID"]

    req = urllib.request.Request(
        f"{url}/rest/v1/fints_client_state?user_id=eq.{user_id}&select=bank_label,state_blob,updated_at",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.load(resp)

    if not rows:
        sys.exit("FEHLER: Kein gespeicherter Client-Zustand. Bitte zuerst einmal synchronisieren.")
    return rows[0]


def describe_segment_versions(bpd):
    """Gruppiert die Parametersegmente (HIxxxS) nach Auftragsart und sammelt die Versionen.

    Die Parametersegmente sind die verlaessliche Quelle dafuer, was die Bank kann:
    _find_highest_supported_command() in python-fints sucht exakt hier.
    """
    versions = {}
    for seg in bpd.find_segments():
        name = seg.header.type
        # HIxxxS = Parameter zu Auftragsart HKxxx
        if not (name.startswith("HI") and name.endswith("S") and len(name) == 6):
            continue
        versions.setdefault(name, set()).add(seg.header.version)
    return versions


# Auftragsarten, die fuer Depot/Bausparvertrag relevant sind, mit Klartext.
INTERESTING = {
    "HIWPDS": "HKWPD  Depotaufstellung (Bestand)",
    "HISALS": "HKSAL  Saldenabfrage",
    "HIKAZS": "HKKAZ  Kontoumsaetze (MT940)",
    "HICAZS": "HKCAZ  Kontoumsaetze (camt)",
    "HIWPOS": "HKWPO  Wertpapier-Order",
    "HIWDUS": "HKWDU  Depotumsaetze",
    "HISPAS": "HKSPA  SEPA-Kontoverbindungen",
    "HITANS": "HKTAN  TAN-Verfahren",
    "HIKIFS": "HKKIF  Kreditinstitutsinfo",
}


def main():
    env = load_env()
    row = fetch_state_blob(env)
    print(f"Gespeicherter Zustand: {row.get('bank_label')} | Stand {row.get('updated_at')}")
    print("(Offline-Auswertung — es wird keine Verbindung zur Bank aufgebaut.)\n")

    try:
        from fints.client import FinTS3PinTanClient, FinTSOperations
    except ImportError:
        sys.exit("FEHLER: python-fints fehlt. scripts/fints/.venv aktivieren bzw. requirements.txt installieren.")

    blz = re.sub(r"\D", "", env["FINTS_BLZ"])
    client = FinTS3PinTanClient(
        blz, env["FINTS_USERNAME"], env["FINTS_PIN"], env["FINTS_URL"],
        product_id=env.get("FINTS_PRODUCT_ID") or None,
        from_data=base64.b64decode(row["state_blob"]),
    )

    # ── BPD: was kann die Bank? ────────────────────────────────────────────────
    versions = describe_segment_versions(client.bpd)

    print("=" * 78)
    print("BANKPARAMETER (BPD) — relevante Auftragsarten")
    print("=" * 78)
    for name, label in INTERESTING.items():
        found = sorted(versions.get(name, []))
        status = f"Version(en) {found}" if found else "NICHT angeboten"
        print(f"  {label:<42} {status}")

    print("\n  Alle angebotenen Auftragsarten:")
    for name in sorted(versions):
        print(f"    {name}: {sorted(versions[name])}")

    # ── UPD: welche Konten kennt der Zugang? ───────────────────────────────────
    print("\n" + "=" * 78)
    print("KONTENLISTE (UPD/HIUPD) — was die Bank fuer diesen Zugang meldet")
    print("=" * 78)

    upd_segments = list(client.upd.find_segments("HIUPD"))
    if not upd_segments:
        print("  (keine HIUPD-Segmente im gespeicherten Zustand)")
    for seg in upd_segments:
        acc = getattr(seg, "account_information", None)
        number = getattr(acc, "account_number", None) if acc else None
        subacc = getattr(acc, "subaccount_number", None) if acc else None
        print(f"\n  Konto {number}{'/' + str(subacc) if subacc else ''}"
              f" | IBAN {getattr(seg, 'iban', None) or '—'}"
              f" | Typ {getattr(seg, 'account_type', None)}"
              f" | {getattr(seg, 'account_product_name', None) or '(ohne Bezeichnung)'}")
        allowed = getattr(seg, "allowed_transactions", None) or []
        codes = sorted({getattr(t, "transaction", None) for t in allowed if getattr(t, "transaction", None)})
        print(f"    erlaubte Auftragsarten ({len(codes)}): {', '.join(codes) if codes else '(keine)'}")
        # HKWPD hier zu sehen waere der Beweis, dass ein Depotabruf grundsaetzlich erlaubt ist.
        for marker in ("HKWPD", "HKSAL", "HKCAZ", "HKKAZ"):
            print(f"      {marker}: {'JA' if marker in codes else 'nein'}")

    # ── Was python-fints daraus ableitet ───────────────────────────────────────
    print("\n" + "=" * 78)
    print("ABGELEITETE OPERATIONEN je Konto (client.get_information())")
    print("=" * 78)
    info = client.get_information()
    for a in info.get("accounts", []):
        ops = a.get("supported_operations") or {}
        yes = sorted(k.name for k, v in ops.items() if v)
        print(f"\n  {a.get('product_name') or '(ohne Bezeichnung)'}"
              f" | Kontonr. {a.get('account_number')} | IBAN {a.get('iban') or '—'}"
              f" | Typ {a.get('type')}")
        print(f"    {', '.join(yes) if yes else '(nichts gemeldet)'}")
    print(f"\n  GET_HOLDINGS wird fuer {sum(1 for a in info.get('accounts', []) if (a.get('supported_operations') or {}).get(FinTSOperations.GET_HOLDINGS))} "
          f"von {len(info.get('accounts', []))} Konten gemeldet.")


if __name__ == "__main__":
    main()
