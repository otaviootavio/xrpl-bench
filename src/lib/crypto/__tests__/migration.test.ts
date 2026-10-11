import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { ECDSA, Wallet } from 'xrpl'

/**
 * Story 12.1 / AD-27. `idb` has no implementation outside a browser, so its
 * `openDB` is replaced by an in-memory database whose transactions commit or
 * roll back whole — the property the migration's crash safety rests on.
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

import { getDb, wipeVaultDatabase, putVaultMeta } from '../db'
import {
  addNetworkView,
  listWallets,
  migrateLegacyVault,
  removeWallet,
  revealSeed,
  setWalletNode,
  unlockWalletForSigning,
  generateAndStoreWallet,
} from '../keystore'
import { HKDF_INFO } from '../auth'
import { aesEncrypt } from '../aes'

async function masterKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** A Seed record exactly as the build before this story wrote it. */
async function legacyRecord(id: string, key: CryptoKey, wallet: Wallet) {
  const sealed = await aesEncrypt(key, wallet.seed!)
  return {
    id,
    label: `Wallet ${id}`,
    address: wallet.address,
    encryptedSeed: { ivB64: sealed.ivB64, ciphertextB64: sealed.ciphertextB64 },
    createdAt: 1,
  }
}

const INPUT = { network: 'mainnet' as const, autoLockMinutes: 10 }

let key: CryptoKey
beforeEach(async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  key = await masterKey()
})

async function seedLegacy(...wallets: Wallet[]) {
  const records = []
  for (const [i, w] of wallets.entries()) {
    const r = await legacyRecord(`w${i + 1}`, key, w)
    h.state.stores.wallets.set(r.id, r)
    records.push(r)
  }
  return records
}

describe('legacy vault migration', () => {
  it('relabels PIN-only Seeds onto lock:legacy, leaving ciphertext byte-identical', async () => {
    const [a, b] = [Wallet.generate(), Wallet.generate(ECDSA.secp256k1)]
    const before = await seedLegacy(a, b)
    await putVaultMeta({ key: 'vault', pinSaltB64: 's', wrappedMasterKeyForPin: { ivB64: 'i', ciphertextB64: 'c' }, failedAttempts: 0 })

    expect(await migrateLegacyVault(INPUT)).toBe(true)

    for (const r of before) {
      const after = h.state.stores.wallets.get(r.id)
      expect(after).toMatchObject({
        seedMethod: 'stored',
        algorithm: 'unresolved',
        lockId: 'legacy',
        openCheck: 'pin',
        signingCheck: 'standard',
        views: [{ walletId: r.id, network: 'mainnet' }],
      })
      expect(after.encryptedSeed).toEqual(r.encryptedSeed)
      expect(after.address).toBe(r.address)
    }
    const lock = h.state.stores.vault.get('lock:legacy')
    expect(lock).toMatchObject({ id: 'legacy', hkdfInfo: HKDF_INFO, autoLockMinutes: 10 })
    expect(lock.pbkdf2).toEqual({ iterations: 600_000, hash: 'SHA-256', keyBits: 256 })
    expect(atob(lock.prfSaltB64)).toBe('xrpl-wallet:vault-unlock:v1')
  })

  it('makes the Open Check `either` when a passkey is registered', async () => {
    await seedLegacy(Wallet.generate())
    await putVaultMeta({
      key: 'vault',
      passkeyCredentialIdB64: 'cred',
      wrappedMasterKeyForPasskey: { ivB64: 'i', ciphertextB64: 'c' },
      failedAttempts: 0,
    })
    await migrateLegacyVault(INPUT)
    expect(h.state.stores.wallets.get('w1').openCheck).toBe('either')
  })

  it('writes nothing on a re-run', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    const snapshot = structuredClone([...h.state.stores.wallets, ...h.state.stores.vault])
    expect(await migrateLegacyVault({ network: 'testnet', autoLockMinutes: 1 })).toBe(false)
    expect(structuredClone([...h.state.stores.wallets, ...h.state.stores.vault])).toEqual(snapshot)
  })

  it('writes nothing for an empty vault', async () => {
    expect(await migrateLegacyVault(INPUT)).toBe(false)
    expect(h.state.stores.vault.size).toBe(0)
    expect(h.state.stores.wallets.size).toBe(0)
  })

  it('a crash mid-migration writes no field and no lock record, and every Wallet still decrypts', async () => {
    const [a, b] = [Wallet.generate(), Wallet.generate()]
    const before = await seedLegacy(a, b)
    h.state.failNextPutOn = 'vault' // fails after both wallet puts, on the lock record
    await expect(migrateLegacyVault(INPUT)).rejects.toThrow()

    expect(h.state.stores.vault.has('lock:legacy')).toBe(false)
    for (const r of before) expect(h.state.stores.wallets.get(r.id)).toEqual(r)
    expect((await unlockWalletForSigning('w1', key)).address).toBe(a.address)
    expect((await unlockWalletForSigning('w2', key)).address).toBe(b.address)
  })

  it('does not bump the schema version and holds no Seed in anything it writes', async () => {
    const w = Wallet.generate()
    await seedLegacy(w)
    await getDb()
    await migrateLegacyVault(INPUT)
    expect(h.state.version).toBe(2)
    const lock = JSON.stringify(h.state.stores.vault.get('lock:legacy'))
    const record = JSON.stringify(h.state.stores.wallets.get('w1'))
    expect(lock).not.toContain(w.seed!)
    expect(record).not.toContain(w.seed!)
  })

  it('leaves a migrated record readable by a build that ignores the new fields', async () => {
    const w = Wallet.generate()
    await seedLegacy(w)
    await migrateLegacyVault(INPUT)
    const { id, address, encryptedSeed } = h.state.stores.wallets.get('w1')
    // What the previous build reads: id, address, encryptedSeed, nothing else.
    const { aesDecrypt } = await import('../aes')
    expect({ id, address }).toEqual({ id: 'w1', address: w.address })
    await expect(aesDecrypt(key, encryptedSeed.ivB64, encryptedSeed.ciphertextB64)).resolves.toBe(w.seed)
  })

  it('wipeVaultDatabase removes lock:legacy', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    await wipeVaultDatabase()
    expect(h.state.stores.vault.has('lock:legacy')).toBe(false)
  })
})

describe('first decrypt resolves the algorithm', () => {
  it.each([
    ['ed25519', Wallet.generate()],
    ['secp256k1', Wallet.generate(ECDSA.secp256k1)],
  ])('stores %s once the derived address matches', async (algorithm, w) => {
    const [r] = await seedLegacy(w)
    await migrateLegacyVault(INPUT)
    expect(h.state.stores.wallets.get('w1').algorithm).toBe('unresolved')
    expect((await unlockWalletForSigning('w1', key)).address).toBe(w.address)
    const after = h.state.stores.wallets.get('w1')
    expect(after.algorithm).toBe(algorithm)
    expect(after.encryptedSeed).toEqual(r.encryptedSeed)
  })

  it('throws and stores nothing when the derived address differs from the stored one', async () => {
    const [r] = await seedLegacy(Wallet.generate())
    h.state.stores.wallets.set('w1', { ...r, address: Wallet.generate().address })
    await migrateLegacyVault(INPUT)
    await expect(unlockWalletForSigning('w1', key)).rejects.toThrow(/does not match/)
    expect(h.state.stores.wallets.get('w1').algorithm).toBe('unresolved')
  })
})

describe('Wallets as views over a Seed record', () => {
  it('lists one Wallet per view, and "use on another network" adds a view with no new ciphertext', async () => {
    const w = Wallet.generate()
    const [r] = await seedLegacy(w)
    await migrateLegacyVault(INPUT)

    const added = await addNetworkView('w1', 'testnet')
    expect(added).toMatchObject({ seedId: 'w1', network: 'testnet', address: w.address })
    expect(added.id).not.toBe('w1')
    expect(h.state.stores.wallets.size).toBe(1)
    expect(h.state.stores.wallets.get('w1').encryptedSeed).toEqual(r.encryptedSeed)

    const metas = await listWallets()
    expect(metas.map((m) => [m.id, m.network])).toEqual([['w1', 'mainnet'], [added.id, 'testnet']])
    // The new view unlocks the same Seed.
    expect(await revealSeed(added.id, key)).toBe(w.seed)
  })

  it('rejects a network the Seed already has a view on', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    await expect(addNetworkView('w1', 'mainnet')).rejects.toThrow(/already/)
    expect((await listWallets()).length).toBe(1)
  })

  it('removing one view keeps the Seed; removing the last deletes it', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    const added = await addNetworkView('w1', 'testnet')

    await removeWallet(added.id)
    expect(h.state.stores.wallets.has('w1')).toBe(true)
    expect((await listWallets()).map((m) => m.id)).toEqual(['w1'])

    await removeWallet('w1')
    expect(h.state.stores.wallets.has('w1')).toBe(false)
  })

  it('a Seed created by this build carries the same fields, resolved at creation', async () => {
    const { meta } = await generateAndStoreWallet('New', key, 'testnet')
    const stored = h.state.stores.wallets.get(meta.id)
    expect(stored).toMatchObject({
      seedMethod: 'stored',
      algorithm: 'ed25519',
      lockId: 'legacy',
      openCheck: 'pin',
      signingCheck: 'standard',
      views: [{ walletId: meta.id, network: 'testnet' }],
    })
    // And the next app start does not relabel it a second time.
    await migrateLegacyVault(INPUT)
    expect(h.state.stores.wallets.get(meta.id).views).toEqual([{ walletId: meta.id, network: 'testnet' }])
  })
})

describe('review follow-ups', () => {
  it('a Seed created while a passkey is registered gets openCheck `either`', async () => {
    await putVaultMeta({
      key: 'vault',
      passkeyCredentialIdB64: 'cred',
      wrappedMasterKeyForPasskey: { ivB64: 'i', ciphertextB64: 'c' },
      failedAttempts: 0,
    })
    const { meta } = await generateAndStoreWallet('New', key, 'mainnet')
    expect(h.state.stores.wallets.get(meta.id).openCheck).toBe('either')
  })

  it('migrates a record that lacks views even though lock:legacy already exists, leaving the lock alone', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    const lockBefore = structuredClone(h.state.stores.vault.get('lock:legacy'))
    // A build rolled back to before this story adds a Wallet.
    const late = await legacyRecord('w9', key, Wallet.generate())
    h.state.stores.wallets.set('w9', late)

    expect(await migrateLegacyVault({ network: 'testnet', autoLockMinutes: 1 })).toBe(true)

    expect(h.state.stores.wallets.get('w9')).toMatchObject({
      lockId: 'legacy',
      views: [{ walletId: 'w9', network: 'testnet' }],
      encryptedSeed: late.encryptedSeed,
    })
    expect(h.state.stores.wallets.get('w1').views).toEqual([{ walletId: 'w1', network: 'mainnet' }])
    expect(h.state.stores.vault.get('lock:legacy')).toEqual(lockBefore)
  })

  it('keeps an already-resolved algorithm on a record it migrates', async () => {
    const [r] = await seedLegacy(Wallet.generate())
    h.state.stores.wallets.set('w1', { ...r, algorithm: 'secp256k1' })
    await migrateLegacyVault(INPUT)
    expect(h.state.stores.wallets.get('w1').algorithm).toBe('secp256k1')
  })

  it('writes only the lock when every record already has views but the lock is missing', async () => {
    const { meta } = await generateAndStoreWallet('New', key, 'testnet')
    const before = structuredClone(h.state.stores.wallets.get(meta.id))
    expect(await migrateLegacyVault(INPUT)).toBe(true)
    expect(h.state.stores.vault.has('lock:legacy')).toBe(true)
    expect(h.state.stores.wallets.get(meta.id)).toEqual(before)
  })

  it('shows an unmigrated record on the fallback network without persisting it, and addNetworkView refuses it', async () => {
    const [r] = await seedLegacy(Wallet.generate())
    expect((await listWallets()).map((m) => m.network)).toEqual(['testnet'])
    expect((await listWallets('mainnet')).map((m) => m.network)).toEqual(['mainnet'])
    await expect(addNetworkView('w1', 'testnet')).rejects.toThrow(/not migrated yet/)
    expect(h.state.stores.wallets.get('w1')).toEqual(r)
  })

  it('still signs and reveals when persisting the resolved algorithm fails', async () => {
    const w = Wallet.generate()
    await seedLegacy(w)
    await migrateLegacyVault(INPUT)
    h.state.failNextPutOn = 'wallets'
    expect(await revealSeed('w1', key)).toBe(w.seed)
    expect(h.state.stores.wallets.get('w1').algorithm).toBe('unresolved')
  })
})

describe('a Node is a field of one Wallet view (story 2)', () => {
  it('migrated Wallets carry no node, so they use the built-in Nodes', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    expect((await listWallets())[0].node).toBeUndefined()
  })

  it('stores a node on that view only, touching no ciphertext, and clears it', async () => {
    const [r] = await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    const added = await addNetworkView('w1', 'testnet')

    const meta = await setWalletNode(added.id, 'wss://node.example.com')
    expect(meta.node).toBe('wss://node.example.com')
    const metas = await listWallets()
    expect(metas.find((m) => m.id === 'w1')?.node).toBeUndefined()
    expect(metas.find((m) => m.id === added.id)?.node).toBe('wss://node.example.com')
    expect(h.state.stores.wallets.get('w1').encryptedSeed).toEqual(r.encryptedSeed)

    expect((await setWalletNode(added.id, undefined)).node).toBeUndefined()
    expect(h.state.stores.wallets.get('w1').views.find((v: { walletId: string }) => v.walletId === added.id)).not.toHaveProperty('node')
  })

  it('canonicalises a node, and throws on one that could carry a secret or is not wss', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    expect((await setWalletNode('w1', 'WSS://Node.Example.com/')).node).toBe('wss://node.example.com')
    for (const bad of ['wss://u:p@x.example.com', 'wss://x.example.com/?k=v', 'wss://x.example.com/#f', 'ws://x.example.com']) {
      await expect(setWalletNode('w1', bad)).rejects.toThrow(/wss:\/\//)
    }
    expect((await listWallets())[0].node).toBe('wss://node.example.com')
  })

  it('adds a Devnet view like any other network', async () => {
    await seedLegacy(Wallet.generate())
    await migrateLegacyVault(INPUT)
    expect((await addNetworkView('w1', 'devnet')).network).toBe('devnet')
  })
})
