/**
 * Server-side only — AES-256-GCM encryption/decryption.
 * Never import this file in client components.
 *
 * ENCRYPTION_KEY can be any string; we derive a stable 32-byte key from it
 * via SHA-256 so there are no length requirements on the env value.
 *
 * Ciphertext format (base64 segments joined by ':'): iv:authTag:encrypted
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is not set')
  // SHA-256 of the raw value → always exactly 32 bytes regardless of input length
  return createHash('sha256').update(raw).digest()
}

export function encrypt(plaintext: string): string {
  const iv     = randomBytes(12) // 96-bit IV, recommended for GCM
  const key    = getMasterKey()
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag() // 16-byte GCM authentication tag

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')

  const [ivB64, tagB64, encB64] = parts
  const iv        = Buffer.from(ivB64,  'base64')
  const authTag   = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(encB64, 'base64')
  const key       = getMasterKey()

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8')
}
