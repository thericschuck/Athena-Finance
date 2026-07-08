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

export interface SidecarAccount {
  iban: string | null
  bic: string | null
  accountNumber: string | null
  blz: string | null
  accountName: string | null
}

export interface SidecarTransaction {
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
}

export interface SidecarBalance {
  iban: string | null
  bic: string | null
  bookedBalance: number | null
  availableBalance: number | null
  currency: string
  date: string | null
}

export interface SidecarSuccess {
  ok: true
  accounts: SidecarAccount[]
  transactions: SidecarTransaction[]
  balances: SidecarBalance[]
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

  const args = [script]
  if (opts.startDate) args.push('--start', opts.startDate.toISOString())
  if (opts.endDate) args.push('--end', opts.endDate.toISOString())
  if (opts.balances) args.push('--balances')
  if (opts.skipTransactions) args.push('--no-txns')

  return new Promise<SidecarSuccess>((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
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
      reject(new Error(`FinTS-Sidecar konnte nicht gestartet werden (${python}): ${err.message}`))
    })

    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      const payload = parsePayload(stdout)
      if (!payload) {
        reject(new Error(
          `FinTS-Sidecar lieferte keine gültige Antwort (exit ${code}).` +
          (stderr ? ` Log: ${stderr.trim().split('\n').slice(-3).join(' | ')}` : ''),
        ))
        return
      }
      if (!payload.ok) {
        reject(new Error(payload.error || 'Unbekannter FinTS-Fehler'))
        return
      }
      resolve(payload)
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
