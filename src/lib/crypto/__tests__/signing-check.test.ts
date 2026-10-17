import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { Wallet } from 'xrpl'

/**
 * Story 3 / AD-22, AD-23, AD-25: the Signing Check is structural, the Signer is
 * one-use, and one PIN counter serves unlock and signing. `idb` and WebAuthn are
 * the external resources replaced; the cryptography is real.
 */
const h = vi.hoisted(() => {
  type Stores = Record<string, Map<string, any>>
  const state = { stores: {} as Stores, failNextPutOn: null as string | null, version: 0 }
  const clone = (v: any) => (v === undefined ? v : structuredClone(v))
  const KEY_PATH: Record<string, string> = { wallets: 'id', vault: 'key', session: 'key' }
  function makeDb() {
    return {
      transaction(names: string | string[]) {
        const list = Array.isArray(names) ? names : [names]
        const staged: Stores = {}
        for (const n of list) staged[n] = new Map([...state.stores[n]].map(([k, v]) => [k, clone(v)]))
        let aborted = false
        let finished: (() => void) | undefined
        const done = new Promise<void>((resolve, reject) => {
          finished = () => (aborted ? reject(new Error('AbortError')) : resolve())
        })
        const store = (n: string) => ({
          get: async (k: string) => clone(staged[n].get(k)),
          getAll: async () => [...staged[n].values()].map(clone),
          put: async (v: any) => {
            if (state.failNextPutOn === n) {
              state.failNextPutOn = null
              aborted = true
              throw new Error('put failed')
            }
            staged[n].set(v[KEY_PATH[n]], clone(v))
          },
          delete: async (k: string) => void staged[n].delete(k),
        })
        // Awaiting `done` is what commits: staged writes replace the store
        // whole, or are dropped whole if the transaction aborted.
        const lazyDone = {
          then: (res: any, rej: any) => {
            if (!aborted) for (const n of list) state.stores[n] = staged[n]
            finished?.()
            return done.then(res, rej)
          },
          catch: (rej: any) => done.catch(rej),
        }
        return {
          store: store(list[0]),
          objectStore: store,
          abort() {
            aborted = true
            finished?.()
          },
          done: lazyDone,
        }
      },
      get: async (s: string, k: string) => clone(state.stores[s].get(k)),
      getAll: async (s: string) => [...state.stores[s].values()].map(clone),
      put: async (s: string, v: any) => void state.stores[s].set(v[KEY_PATH[s]], clone(v)),
      delete: async (s: string, k: string) => void state.stores[s].delete(k),
      clear: async (s: string) => void state.stores[s].clear(),
    }
  }
  return { state, makeDb }
})

vi.mock('idb', () => ({
  openDB: async (_name: string, version: number) => {
    h.state.version = version
    return h.makeDb()
  },
}))


// WebAuthn stand-in: the PRF output is a function of the salt, so a different
// salt (a different purpose) gives a different key, as on a real authenticator.
const w = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'cancel' | 'no-prf' | 'other-key',
  asserts: 0,
}))
vi.mock('../webauthn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../webauthn')>()
  return {
    ...actual,
    isWebAuthnSupported: () => true,
    registerPasskey: async () => {
      throw new Error('not used')
    },
    assertPasskeyAndDeriveBits: async (_id: string, salt: BufferSource = actual.PRF_SALT) => {
      w.asserts += 1
      if (w.mode === 'cancel') throw Object.assign(new Error('dismissed'), { name: 'NotAllowedError' })
      if (w.mode === 'no-prf') throw Object.assign(new Error('no prf'), { name: 'PrfUnsupportedError' })
      const tag = new TextEncoder().encode(w.mode === 'other-key' ? 'other' : 'same')
      const bytes = new Uint8Array(salt as ArrayBuffer)
      const joined = new Uint8Array(tag.length + bytes.length)
      joined.set(tag)
      joined.set(bytes, tag.length)
      return crypto.subtle.digest('SHA-256', joined)
    },
  }
})

import { putVaultMeta } from '../db'
import { setUpVaultAuth } from '../auth'
import { openLock } from '../lock'
import {
  generateAndStoreWallet,
  openSigner,
  revealSeed,
  sealSeedUnderSigningCheck,
  signingHandleFor,
  SigningCheckError,
  unavailablePrompts,
  type Prompts,
} from '../keystore'
import { aesDecrypt, aesEncrypt } from '../aes'
import { deriveAesKeyFromBits } from '../derive'
import { derivePinKeyBits } from '../pin'

const PIN = '123456'
const pinPrompt = (pin: string | null): Prompts & { calls: { triesRemaining: number }[] } => {
  const calls: { triesRemaining: number }[] = []
  return { calls, pin: async (info) => (calls.push(info), pin) }
}
const failedAttempts = () => h.state.stores.vault.get('vault')?.failedAttempts ?? 0

let key: CryptoKey
let seed: string
let walletId: string
let address: string

beforeEach(async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  w.mode = 'ok'
  w.asserts = 0
  // No passkey is registered by setup: the vault is PIN-only, as the mock's
  // registerPasskey throws.
  key = await setUpVaultAuth('tester', PIN)
  const created = await generateAndStoreWallet('W', key, 'testnet')
  seed = created.seed
  walletId = created.meta.id
  address = created.meta.address
})

/** The vault meta with a passkey registered, as setup does when PRF works. */
async function registerPasskeyOnVault() {
  const meta = h.state.stores.vault.get('vault')
  await putVaultMeta({ ...meta, passkeyCredentialIdB64: 'Y3JlZA==' })
}

const ctxWith = (prompts: Prompts, openKey: CryptoKey | null = key) => ({ openKey, prompts })

describe('Standard Wallet', () => {
  it('opens a Signer from the Open-key Seed, spent after one sign', async () => {
    const result = await openSigner(walletId, ctxWith(unavailablePrompts))
    if (result.status !== 'ok') throw new Error('expected ok')
    const tx = { TransactionType: 'Payment', Account: address, Destination: Wallet.generate().address, Amount: '1', Fee: '12', Sequence: 1 } as any
    expect(result.value.sign(tx).tx_blob).toMatch(/^[0-9A-F]+$/)
    expect(() => result.value.sign(tx)).toThrow(/already used/)
  })

  it('a disposed Signer cannot sign', async () => {
    const result = await openSigner(walletId, ctxWith(unavailablePrompts))
    if (result.status !== 'ok') throw new Error('expected ok')
    result.value.dispose()
    expect(() => result.value.sign({} as any)).toThrow(/already used/)
  })

  it('throws Wallet is locked without a session key, and signs nothing', async () => {
    await expect(openSigner(walletId, ctxWith(unavailablePrompts, null))).rejects.toThrow('Wallet is locked')
  })
})

describe('sealing a Seed under a PIN Signing Check', () => {
  it('writes sealedSeed and signing, deletes encryptedSeed, keeps the address, in one record write', async () => {
    const result = await sealSeedUnderSigningCheck(walletId, 'pin', ctxWith(pinPrompt(PIN)))
    expect(result.status).toBe('ok')
    const rec = h.state.stores.wallets.get(walletId)
    expect(rec.encryptedSeed).toBeUndefined()
    expect(rec.sealedSeed).toBeDefined()
    expect(rec.signing.kind).toBe('pin')
    expect(rec.signingCheck).toBe('pin')
    expect(rec.address).toBe(address)
    expect(JSON.stringify(rec)).not.toContain(seed)
    expect(rec.signing.hkdfInfo).toContain(walletId)
  })

  it('proves the App PIN from its verifier when there is no legacy wrapper (a PIN made by a non-legacy lock)', async () => {
    const meta = h.state.stores.vault.get('vault')
    const bits = await derivePinKeyBits(PIN, meta.pinSaltB64)
    const verifier = await aesEncrypt(await deriveAesKeyFromBits(bits, 'xrpl-bench:pin-verifier:v1'), 'xrpl-bench:app-pin')
    const { wrappedMasterKeyForPin: _legacy, ...rest } = meta
    await putVaultMeta({ ...rest, pinVerifier: { ...verifier, hkdfInfo: 'xrpl-bench:pin-verifier:v1' } })

    expect((await sealSeedUnderSigningCheck(walletId, 'pin', ctxWith(pinPrompt('000000')))).status).toBe('wrong-credential')
    expect((await sealSeedUnderSigningCheck(walletId, 'pin', ctxWith(pinPrompt(PIN)))).status).toBe('ok')
    expect(h.state.stores.wallets.get(walletId).signing.kind).toBe('pin')
  })

  it('a failed write leaves the old record untouched', async () => {
    const before = structuredClone(h.state.stores.wallets.get(walletId))
    h.state.failNextPutOn = 'wallets'
    await expect(sealSeedUnderSigningCheck(walletId, 'pin', ctxWith(pinPrompt(PIN)))).rejects.toThrow()
    expect(h.state.stores.wallets.get(walletId)).toEqual(before)
  })

  it('a wrong PIN or a cancelled prompt seals nothing; only the wrong PIN counts', async () => {
    const before = structuredClone(h.state.stores.wallets.get(walletId))
    expect((await sealSeedUnderSigningCheck(walletId, 'pin', ctxWith(pinPrompt('000000')))).status).toBe('wrong-credential')
    expect(failedAttempts()).toBe(1)
    expect((await sealSeedUnderSigningCheck(walletId, 'pin', ctxWith(pinPrompt(null)))).status).toBe('cancelled')
    expect(failedAttempts()).toBe(1)
    expect(h.state.stores.wallets.get(walletId)).toEqual(before)
  })
})

describe('a record that claims a Signing Check without its seal', () => {
  it('fails closed instead of opening with the session key', async () => {
    const rec = h.state.stores.wallets.get(walletId)
    h.state.stores.wallets.set(walletId, { ...rec, signingCheck: 'pin' })
    const prompt = pinPrompt(PIN)
    await expect(openSigner(walletId, ctxWith(prompt))).rejects.toThrow(/incomplete/)
    await expect(revealSeed(walletId, ctxWith(prompt))).rejects.toThrow(/incomplete/)
    expect(prompt.calls).toEqual([])
  })
})

describe('a PIN Signing Check', () => {
  beforeEach(async () => {
    await sealSeedUnderSigningCheck(walletId, 'pin', ctxWith(pinPrompt(PIN)))
  })

  it('AD-23: with the session key and prompts that cancel, no Signer and no Seed comes out of any export', async () => {
    const cancel = ctxWith(pinPrompt(null))
    const results = [
      await openSigner(walletId, cancel),
      await revealSeed(walletId, cancel),
      await sealSeedUnderSigningCheck(walletId, 'pin', cancel).catch((e) => ({ threw: String(e.message) })),
    ]
    await expect((await signingHandleFor(walletId, cancel)).open()).rejects.toBeInstanceOf(SigningCheckError)
    expect(results[0]).toEqual({ status: 'cancelled' })
    expect(results[1]).toEqual({ status: 'cancelled' })
    expect(JSON.stringify(results)).not.toContain(seed)
    // And the Open key itself cannot open the sealed ciphertext.
    const rec = h.state.stores.wallets.get(walletId)
    await expect(aesDecrypt(key, rec.sealedSeed.ivB64, rec.sealedSeed.ciphertextB64)).rejects.toThrow()
    // Nor does a missing session key matter: the check does not use it.
    expect((await openSigner(walletId, cancel)).status).toBe('cancelled')
  })

  it('opens a Signer with the right PIN and resets the counter', async () => {
    expect((await openSigner(walletId, ctxWith(pinPrompt('000000')))).status).toBe('wrong-credential')
    expect(failedAttempts()).toBe(1)
    const prompt = pinPrompt(PIN)
    const ok = await openSigner(walletId, ctxWith(prompt, null))
    expect(ok.status).toBe('ok')
    expect(prompt.calls[0].triesRemaining).toBe(7)
    expect(failedAttempts()).toBe(0)
  })

  it('a wrong PIN says how many tries remain, and counts once', async () => {
    const result = await openSigner(walletId, ctxWith(pinPrompt('000000')))
    expect(result).toEqual({ status: 'wrong-credential', kind: 'pin', triesRemaining: 7 })
    expect(failedAttempts()).toBe(1)
  })

  it('reveal returns the Seed from revealSeed only, and a wrong PIN returns no Seed', async () => {
    expect(await revealSeed(walletId, ctxWith(pinPrompt(PIN)))).toEqual({ status: 'ok', value: seed })
    const wrong = await revealSeed(walletId, ctxWith(pinPrompt('000000')))
    expect(JSON.stringify(wrong)).not.toContain(seed)
  })

  it('shares one counter with unlock: wrong PINs across sign and unlock add up, and the hard lock blocks both', async () => {
    for (let i = 0; i < 4; i++) {
      await openSigner(walletId, ctxWith(pinPrompt('000000')))
      h.state.stores.vault.set('vault', { ...h.state.stores.vault.get('vault'), lockedUntil: undefined })
      expect(await openLock('legacy', 'pin', { pin: '000000' })).toMatchObject({ status: 'wrong-credential', kind: 'pin' })
      h.state.stores.vault.set('vault', { ...h.state.stores.vault.get('vault'), lockedUntil: undefined })
    }
    expect(failedAttempts()).toBe(8)
    const prompt = pinPrompt(PIN)
    expect(await openSigner(walletId, ctxWith(prompt))).toMatchObject({ status: 'locked-out', hard: true })
    expect(prompt.calls).toEqual([]) // never asked
    expect(await openLock('legacy', 'pin', { pin: PIN })).toMatchObject({ status: 'locked-out', hard: true })
  })

  it('a backoff in force also answers locked-out without prompting', async () => {
    h.state.stores.vault.set('vault', { ...h.state.stores.vault.get('vault'), failedAttempts: 3, lockedUntil: Date.now() + 60_000 })
    const prompt = pinPrompt(PIN)
    expect((await openSigner(walletId, ctxWith(prompt))).status).toBe('locked-out')
    expect(prompt.calls).toEqual([])
  })
})

describe('a passkey Signing Check', () => {
  beforeEach(async () => {
    await registerPasskeyOnVault()
    expect((await sealSeedUnderSigningCheck(walletId, 'passkey', ctxWith(unavailablePrompts))).status).toBe('ok')
  })

  it('opens a Signer on a good assertion', async () => {
    const rec = h.state.stores.wallets.get(walletId)
    expect(rec.signing).toMatchObject({ kind: 'passkey', credentialIdB64: 'Y3JlZA==' })
    expect(rec.encryptedSeed).toBeUndefined()
    expect((await openSigner(walletId, ctxWith(unavailablePrompts))).status).toBe('ok')
    expect(await revealSeed(walletId, ctxWith(unavailablePrompts, null))).toEqual({ status: 'ok', value: seed })
  })

  it('a dismissed prompt is cancelled and does not count', async () => {
    w.mode = 'cancel'
    expect(await openSigner(walletId, ctxWith(unavailablePrompts))).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(0)
  })

  it('an assertion that cannot unwrap is wrong-credential and counts', async () => {
    w.mode = 'other-key'
    expect((await openSigner(walletId, ctxWith(unavailablePrompts))).status).toBe('wrong-credential')
    expect(failedAttempts()).toBe(1)
  })

  it('a hard lock never blocks a passkey-only check', async () => {
    h.state.stores.vault.set('vault', { ...h.state.stores.vault.get('vault'), failedAttempts: 8 })
    expect((await openSigner(walletId, ctxWith(unavailablePrompts))).status).toBe('ok')
  })
})

describe('sealing under a passkey', () => {
  it('reports unsupported when the authenticator gives no PRF, leaving the record untouched', async () => {
    await registerPasskeyOnVault()
    const before = structuredClone(h.state.stores.wallets.get(walletId))
    w.mode = 'no-prf'
    expect((await sealSeedUnderSigningCheck(walletId, 'passkey', ctxWith(unavailablePrompts))).status).toBe('unsupported')
    expect(h.state.stores.wallets.get(walletId)).toEqual(before)
  })

  it('reports unsupported when no passkey is registered, and cancelled when dismissed', async () => {
    expect((await sealSeedUnderSigningCheck(walletId, 'passkey', ctxWith(unavailablePrompts))).status).toBe('unsupported')
    await registerPasskeyOnVault()
    w.mode = 'cancel'
    expect((await sealSeedUnderSigningCheck(walletId, 'passkey', ctxWith(unavailablePrompts))).status).toBe('cancelled')
    expect(failedAttempts()).toBe(0)
  })
})
