import { bufToB64, b64ToBuf } from './encoding'

// OWASP's current guidance for PBKDF2-HMAC-SHA256 is 600,000 iterations.
const PBKDF2_ITERATIONS = 600_000

export function generateSalt(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

/** Mandatory fallback unlock method alongside the passkey (wallet-security.md
 * US-1 / docs/decisions.md resolved decision) — required for environments
 * with no platform authenticator. */
export async function derivePinKeyBits(pin: string, saltB64: string): Promise<ArrayBuffer> {
  const salt = b64ToBuf(saltB64)
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
}
