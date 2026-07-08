# FinTS Python Sidecar

Bank connectivity for athena-finance runs through this small Python sidecar instead of a
Node library, because the target bank (**Atruvia / Frankfurter Volksbank Rhein-Main**, the
Raiffeisenbank/VR-Bank backend) requires two things `node-fints` cannot do:

1. **Decoupled SCA** — SecureGo plus "Direktfreigabe": the bank pushes an approval request to
   the banking app and the client must *poll* until the user confirms. python-fints handles the
   `HKTAN` process `S` status polling (response code `3956` = still pending) automatically.
2. **camt.052 statements (HKCAZ)** — this bank does **not** offer MT940 (HKKAZ). python-fints
   falls back to camt automatically.

Against this bank a read-only sync currently returns `3076 – Starke Kundenauthentifizierung
nicht notwendig`, i.e. the app approval is usually not even prompted for balance/transaction
reads with a registered product ID. The polling path is in place for when it is.

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
| `FINTS_PYTHON`     | no       | Override interpreter path (defaults to the venv above)   |

## Usage

```bash
python scripts/fints/fints_sync.py [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--balances] [--no-txns]
```

- Emits **exactly one JSON object** on stdout; all logging/progress goes to stderr.
- Progress markers on stderr: `@@PUSH_SENT`, `@@POLL <n>`.
- Called from Node via [`src/lib/fints/sidecar.ts`](../../src/lib/fints/sidecar.ts).

## Deployment note

Because the sync can block while polling for an app approval, the API routes set
`maxDuration = 300`. Running on Vercel additionally requires a Python runtime for the sidecar
(or moving the sidecar to a separate always-on service). Locally (dev/self-host) it works out
of the box once the venv is set up.
