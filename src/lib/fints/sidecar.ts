/**
 * Spawns the Python FinTS sidecar (scripts/fints/fints_sync.py) and parses its JSON output.
 *
 * Why a Python sidecar? The Atruvia/Volksbank/Raiffeisenbank backend requires:
 *   - Decoupled SCA (SecureGo plus "Direktfreigabe") with server-side status polling, and
 *   - camt.052 (HKCAZ) statements — this bank does not offer MT940 (HKKAZ).
 * The Node `node-fints` library supports neither, whereas python-fints supports both.
 *
 * Config is read by the Python process from the same FINTS_* environment variables the
 * rest of the app uses (loaded by Next.js from .env.local into process.env).
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/**
 * Persisted python-fints client state for one bank login, keyed by a hash of
 * "<blz>:<username>" (computed inside the sidecar — see bank_key() there).
 *
 * `blob` carries the Kundensystem-ID: handing it back on the next run stops the bank
 * from treating the sync as a brand-new access, which is what makes PSD2's 90-day
 * SCA exemption apply instead of an app approval on every single sync.
 */
export interface BankClientState {
  blob: string
  label?: string
  /** True if this run actually performed an app approval — used to stamp last_sca_at. */
  scaPerformed?: boolean
}

export type BankClientStateMap = Record<string, BankClientState>

export interface SidecarAccount {
  bankLabel: string | null
  iban: string | null
  bic: string | null
  accountNumber: string | null
  blz: string | null
  accountName: string | null
}

export interface SidecarTransaction {
  bankLabel: string | null
  accountIban: string | null
  accountBic: string | null
  amount: number | null
  currency: string
  valueDate: string | null
  entryDate: string | null
  description: string | null
  counterpartName: string | null
  counterpartIban: string | null
  counterpartBic: string | null
  /** AcctSvcrRef (camt.052) / bank reference (MT940 tag 61) — stable across re-fetches. */
  bankReference: string | null
}

export interface SidecarBalance {
  bankLabel: string | null
  iban: string | null
  bic: string | null
  /** Set by the probe path for explicitly configured accounts (Bausparvertrag, Depot). */
  accountName?: string | null
  bookedBalance: number | null
  availableBalance: number | null
  currency: string
  date: string | null
}

/**
 * A single position from a securities depot (HKWPD "Depotaufstellung") — e.g. a
 * Union Investment "UnionDepot" fund reachable through the same FinTS login as the
 * Girokonto. Discovered via get_information() (HIUPD), not get_sepa_accounts().
 */
export interface SidecarHolding {
  bankLabel: string | null
  accountLabel: string | null
  accountNumber: string | null
  isin: string | null
  name: string | null
  pieces: number | null
  marketValue: number | null
  currency: string
  valuationDate: string | null
  totalValue: number | null
  acquisitionPrice: number | null
}

export interface SidecarSuccess {
  ok: true
  accounts: SidecarAccount[]
  transactions: SidecarTransaction[]
  balances: SidecarBalance[]
  holdings: SidecarHolding[]
  /** One message per bank profile that failed (e.g. wrong PIN) — others still succeed. */
  warnings: string[]
  /** Labels of bank profiles that aborted because they'd need an app approval (--no-sca). */
  scaRequired?: string[]
  /** Client state to persist; written by runSidecar() from the state file, not by Python. */
  state?: BankClientStateMap
}

interface SidecarError {
  ok: false
  error: string
  code: string
}

type SidecarPayload = SidecarSuccess | SidecarError

export interface SidecarOptions {
  startDate?: Date
  endDate?: Date
  balances?: boolean
  skipTransactions?: boolean
  /** Previously persisted client state, keyed by bank. Omit on a first-ever sync. */
  state?: BankClientStateMap
  /**
   * Unattended run (cron): abort instead of waiting for a SecureGo plus approval.
   * The sidecar then exits with code 'sca_required' rather than polling for minutes.
   */
  noSca?: boolean
}

// Decoupled SCA polling in the Python side can take several minutes while the user
// approves in their app; allow generous headroom before we give up.
const SIDECAR_TIMEOUT_MS = 6 * 60 * 1000

const PROJECT_ROOT = process.cwd()

function resolvePythonExecutable(): string {
  if (process.env.FINTS_PYTHON?.trim()) return process.env.FINTS_PYTHON.trim()

  const venvWin = path.join(PROJECT_ROOT, 'scripts', 'fints', '.venv', 'Scripts', 'python.exe')
  const venvNix = path.join(PROJECT_ROOT, 'scripts', 'fints', '.venv', 'bin', 'python')
  if (fs.existsSync(venvWin)) return venvWin
  if (fs.existsSync(venvNix)) return venvNix

  // Fall back to a system Python; the process env must then have python-fints available.
  return process.platform === 'win32' ? 'python' : 'python3'
}

function scriptPath(): string {
  return path.join(PROJECT_ROOT, 'scripts', 'fints', 'fints_sync.py')
}

/**
 * Runs the sidecar and returns the parsed success payload, or throws with a helpful message.
 */
export async function runSidecar(opts: SidecarOptions = {}): Promise<SidecarSuccess> {
  const python = resolvePythonExecutable()
  const script = scriptPath()

  if (!fs.existsSync(script)) {
    throw new Error(`FinTS-Sidecar-Skript nicht gefunden: ${script}`)
  }

  // The client state travels through a temp file rather than argv/env: the blob is a
  // few KB of binary (base64'd) and both platforms cap those. The sidecar reads it at
  // startup and rewrites it before exiting; we persist whatever it wrote.
  const stateFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'athena-fints-')),
    'state.json',
  )
  try {
    fs.writeFileSync(stateFile, JSON.stringify(opts.state ?? {}), { mode: 0o600 })
  } catch (err) {
    // Not fatal: without state the sync still works, it just costs an app approval.
    console.warn('[fints] State-Datei konnte nicht geschrieben werden:', err)
  }

  const args = [script]
  if (opts.startDate) args.push('--start', opts.startDate.toISOString())
  if (opts.endDate) args.push('--end', opts.endDate.toISOString())
  if (opts.balances) args.push('--balances')
  if (opts.skipTransactions) args.push('--no-txns')
  if (opts.noSca) args.push('--no-sca')
  args.push('--state-file', stateFile)

  /** Read back what the sidecar wrote, then remove the temp dir either way. */
  const readAndCleanupState = (): BankClientStateMap | undefined => {
    let parsed: BankClientStateMap | undefined
    try {
      const raw = fs.readFileSync(stateFile, 'utf8')
      const data = JSON.parse(raw) as BankClientStateMap
      if (data && typeof data === 'object') parsed = data
    } catch {
      // Sidecar crashed before writing, or wrote garbage — nothing to persist.
    }
    try {
      fs.rmSync(path.dirname(stateFile), { recursive: true, force: true })
    } catch { /* temp dir cleanup is best-effort */ }
    return parsed
  }

  return new Promise<SidecarSuccess>((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: PROJECT_ROOT,
      // UTF-8 erzwingen: unter Windows loggt Python sonst in cp1252 (Umlaute → �).
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      readAndCleanupState()
      reject(new Error('FinTS-Zeitüberschreitung: keine Antwort vom Bank-Sidecar.'))
    }, SIDECAR_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderr += text
      // Surface sidecar progress/logging in the server console for debugging.
      process.stderr.write(text)
    })

    child.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      readAndCleanupState()
      reject(new Error(`FinTS-Sidecar konnte nicht gestartet werden (${python}): ${err.message}`))
    })

    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      // Read the state before inspecting the payload: even a run that ultimately failed
      // (one bank down out of two) may have produced a usable state for the others.
      const state = readAndCleanupState()
      const payload = parsePayload(stdout)
      if (!payload) {
        reject(new Error(
          `FinTS-Sidecar lieferte keine gültige Antwort (exit ${code}).` +
          (stderr ? ` Log: ${stderr.trim().split('\n').slice(-3).join(' | ')}` : ''),
        ))
        return
      }
      if (!payload.ok) {
        const error = new Error(payload.error || 'Unbekannter FinTS-Fehler') as Error & {
          code?: string
          state?: BankClientStateMap
        }
        error.code = payload.code
        error.state = state
        reject(error)
        return
      }
      resolve({ ...payload, state })
    })
  })
}

/**
 * Extract the single JSON object the sidecar prints to stdout. python-fints logging goes to
 * stderr, so stdout should be clean, but we defensively scan for the last JSON line.
 */
function parsePayload(stdout: string): SidecarPayload | null {
  const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line.startsWith('{')) continue
    try {
      return JSON.parse(line) as SidecarPayload
    } catch {
      // keep scanning older lines
    }
  }
  return null
}
