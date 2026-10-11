/** The legacy lock's HKDF `info`. A constant only for the lock that predates
 * stored derivation inputs: it is copied into `lock:legacy` at migration, and
 * every other lock stores its own (AD-21). */
export const HKDF_INFO = 'xrpl-wallet:unlock-method-key:v1'

/** HKDF-derives a stable AES-GCM-256 key from raw key material (either the
 * WebAuthn PRF output or the PBKDF2 output of a PIN). */
export async function deriveAesKeyFromBits(bits: ArrayBuffer, info: string): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
