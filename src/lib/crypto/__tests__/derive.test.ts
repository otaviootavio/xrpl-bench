import { describe, expect, it } from 'vitest'
import { generateOrdinal, isOrdinal, SEED_ENTROPY_BYTES, seedEntropyFromPrf, seedSalt, walletFromSeedPrf } from '../derive'

/**
 * AD-24: the Passkey-Derived derivation is FROZEN. These vectors were computed
 * once and cross-checked outside this code base (SHA-256 and HKDF-SHA256 in
 * Python). A refactor that changes any of them strands funds: it must fail here.
 */
const PRF = new Uint8Array(32).map((_, i) => i).buffer
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

describe('the frozen Passkey-Derived derivation', () => {
  it('the seed salt is SHA-256 of the label and the ordinal', async () => {
    expect(hex(await seedSalt('012345'))).toBe('7a7dd6e91624333ea0badf4da224da2e43c89c488206a368ce2bf5ff9199df50')
  })
  it('a different ordinal gives a different salt', async () => {
    expect(hex(await seedSalt('012346'))).not.toBe(hex(await seedSalt('012345')))
  })
  it('the entropy is exactly 16 bytes of HKDF-SHA256 over the PRF output', async () => {
    const entropy = await seedEntropyFromPrf(PRF)
    expect(entropy.length).toBe(SEED_ENTROPY_BYTES)
    expect(hex(entropy)).toBe('8ba91973a9d459118a5ac4b4f2c4ee4d')
  })
  it('pins the Wallet for each algorithm', async () => {
    const ed = await walletFromSeedPrf(PRF, 'ed25519')
    expect([ed.address, ed.seed]).toEqual(['rf7Ntv6Tn8xwHzum4xAWhwupoVv6KqbBy5', 'sEd7E38zPPCMeZfx5asBKWAGPTDVXur'])
    const k1 = await walletFromSeedPrf(PRF, 'secp256k1')
    expect([k1.address, k1.seed]).toEqual(['rGnUjeoaqZQRf2ZJp1NQy7JgTTt3646hdi', 'she9on6QnuZEmvx13psHzj1aUtpem'])
  })
})

describe('ordinals', () => {
  it('are six digits, zero padded', () => {
    for (let i = 0; i < 50; i++) expect(isOrdinal(generateOrdinal())).toBe(true)
    expect(isOrdinal('12345')).toBe(false)
    expect(isOrdinal('12345a')).toBe(false)
  })
})
