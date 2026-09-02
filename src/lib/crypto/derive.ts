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
