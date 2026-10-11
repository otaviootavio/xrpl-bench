import { ECDSA, Wallet } from 'xrpl'

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

// ---------------------------------------------------------------------------
// Passkey-Derived Seed (AD-24). FROZEN: a refactor must not change any constant
// below or the byte layout it feeds — a different value is a different Seed, and
// a Wallet's funds are stranded. `derive.test.ts` pins a known vector.
// ---------------------------------------------------------------------------

/** The `seed` PRF salt is SHA-256 of this label followed directly by the ordinal's UTF-8 digits. */
export const SEED_SALT_LABEL = 'xrpl-bench:seed:v1'
/** HKDF `info` for turning PRF output into the 16 bytes of Seed entropy. */
export const SEED_ENTROPY_INFO = 'xrpl-bench:seed-entropy:v1'
/** `Wallet.fromEntropy` uses 16 bytes; a longer value would suggest entropy that is discarded. */
export const SEED_ENTROPY_BYTES = 16
const ORDINAL_DIGITS = 6

/** A short public number, shown once and written down by the person so a lost
 * phone can rebuild the Wallet. Not a secret. Uniform over 000000..999999. */
export function generateOrdinal(): string {
  const limit = Math.floor(0x1_0000_0000 / 10 ** ORDINAL_DIGITS) * 10 ** ORDINAL_DIGITS
  const word = new Uint32Array(1)
  do crypto.getRandomValues(word)
  while (word[0] >= limit)
  return String(word[0] % 10 ** ORDINAL_DIGITS).padStart(ORDINAL_DIGITS, '0')
}

export function isOrdinal(value: string): boolean {
  return /^\d{6}$/.test(value)
}

/** The PRF salt for the Seed of the Wallet numbered `ordinal`: reconstructible
 * from the ordinal alone, never stored as a salt. */
export async function seedSalt(ordinal: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SEED_SALT_LABEL + ordinal)))
}

/** HKDF-SHA256 (empty salt, `SEED_ENTROPY_INFO`) of the PRF output, exactly 16 bytes. */
export async function seedEntropyFromPrf(prfBits: ArrayBuffer): Promise<Uint8Array> {
  const hkdfKey = await crypto.subtle.importKey('raw', prfBits, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(SEED_ENTROPY_INFO) },
    hkdfKey,
    SEED_ENTROPY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

/** The Wallet a passkey's PRF output (for the `seed` salt) derives. The caller
 * holds it for one use and drops it; nothing here keeps it. */
export async function walletFromSeedPrf(prfBits: ArrayBuffer, algorithm: 'ed25519' | 'secp256k1'): Promise<Wallet> {
  return Wallet.fromEntropy(await seedEntropyFromPrf(prfBits), {
    algorithm: algorithm === 'ed25519' ? ECDSA.ed25519 : ECDSA.secp256k1,
  })
}
