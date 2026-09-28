import { describe, expect, it, vi } from 'vitest'
import { ECDSA, Wallet } from 'xrpl'

// `keystore.ts` imports `./db` at module scope, which pulls in `idb` — it has
// no implementation outside a browser. `addressFromSeed` touches neither the
// database nor the vault key, so the store is stubbed out entirely, following
// the shape used by vault.test.ts.
vi.mock('../db', () => ({
  listStoredWallets: async () => [],
  putStoredWallet: async () => {},
  deleteStoredWallet: async () => {},
}))

import { addressFromSeed, isValidSeed } from '../keystore'

/**
 * AD-3: only `lib/crypto` turns a seed into a signer, so the screens ask the
 * keystore for the pre-flight probe address instead of importing `Wallet`.
 * These tests pin that the derivation is the same one the screens used to do
 * inline, including how it fails.
 */
describe('addressFromSeed', () => {
  it('derives the classic address a seed belongs to', () => {
    const generated = Wallet.generate()
    expect(addressFromSeed(generated.seed!)).toBe(generated.address)
  })

  it('is stable and offline — the same seed always gives the same address', () => {
    const seed = Wallet.generate().seed!
    expect(addressFromSeed(seed)).toBe(addressFromSeed(seed))
  })

  it('derives a secp256k1 seed, not only the ed25519 default', () => {
    const generated = Wallet.generate(ECDSA.secp256k1)
    expect(addressFromSeed(generated.seed!)).toBe(generated.address)
  })

  it('derives two different seeds to two different addresses', () => {
    const a = Wallet.generate()
    const b = Wallet.generate()
    expect(addressFromSeed(a.seed!)).not.toBe(addressFromSeed(b.seed!))
  })

  it('throws on a malformed seed, exactly as Wallet.fromSeed does', () => {
    expect(() => addressFromSeed('not-a-seed')).toThrow()
    expect(() => addressFromSeed('')).toThrow()
  })
})

/**
 * The screens' "is this typed seed usable" check. It answers the question the
 * import step actually asks, rather than deriving an address purely to see
 * whether the derivation throws.
 */
describe('isValidSeed', () => {
  it('accepts a seed the keystore can derive from', () => {
    expect(isValidSeed(Wallet.generate().seed!)).toBe(true)
    expect(isValidSeed(Wallet.generate(ECDSA.secp256k1).seed!)).toBe(true)
  })

  it('rejects a malformed seed instead of throwing', () => {
    expect(isValidSeed('not-a-seed')).toBe(false)
    expect(isValidSeed('')).toBe(false)
    // A classic address is not a seed, however valid it looks.
    expect(isValidSeed('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')).toBe(false)
  })
})
