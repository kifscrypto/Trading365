import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

// AES-256-GCM encryption for affiliate API credentials stored at rest.
// The master key comes from env AFFILIATE_CREDS_KEY (any string) — we hash it to
// a fixed 32 bytes so the passphrase length doesn't matter. Ciphertext is stored
// as base64 "iv.tag.data". Without the env key set, encryption/decryption throw
// with a clear message so the admin knows to configure it.

function masterKey(): Buffer {
  const raw = process.env.AFFILIATE_CREDS_KEY
  if (!raw || raw.length < 8) {
    throw new Error('AFFILIATE_CREDS_KEY env var is not set (needs a strong secret to encrypt affiliate API keys)')
  }
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted credential')
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

// True when a master key is configured — used by the UI/status route to warn
// the admin before they try to save credentials.
export function credsKeyConfigured(): boolean {
  const raw = process.env.AFFILIATE_CREDS_KEY
  return !!raw && raw.length >= 8
}
