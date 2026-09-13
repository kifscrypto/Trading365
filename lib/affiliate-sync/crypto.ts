import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// AES-256-GCM for affiliate API secrets at rest. Key = AFFILIATE_CRED_SECRET if
// set, else SHA-256 of ADMIN_SESSION_SECRET so no new env var is required.
// Stored format: base64(iv).base64(tag).base64(ciphertext).
function getKey(): Buffer {
  const secret = process.env.AFFILIATE_CRED_SECRET || process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('AFFILIATE_CRED_SECRET (or ADMIN_SESSION_SECRET) is not set')
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
}

export function decryptSecret(blob: string): string {
  const [iv, tag, ciphertext] = blob.split('.').map((p) => Buffer.from(p, 'base64'))
  if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted secret')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
