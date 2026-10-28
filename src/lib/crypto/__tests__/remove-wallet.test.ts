import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Story 10 / AD-46: Remove, the App PIN discard and the vault-write guard, on an in-memory `idb`. */
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
      put: async (s: string, v: any) => {
        if (state.failNextPutOn === s) {
          state.failNextPutOn = null
          throw new Error('put failed')
        }
        state.stores[s].set(v[KEY_PATH[s]], clone(v))
      },
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

import { readFileSync } from 'node:fs'
import { exclusiveVaultWrite, putLockRecord, type LockRecord, type StoredWallet, type VaultMeta } from '../db'
import { appPinResidue, removeWallet, listWallets } from '../keystore'
import { discardAppPin } from '../lock'

const wrapped = { ivB64: 'iv', ciphertextB64: 'ct' }
const FULL_META: VaultMeta = {
  key: 'vault',
  pinSaltB64: 'salt',
  pinVerifier: { ...wrapped, hkdfInfo: 'v' },
  wrappedMasterKeyForPin: wrapped,
  wrappedMasterKeyForPasskey: wrapped,
  passkeyCredentialIdB64: 'cred',
  rpId: 'wallet.example',
  failedAttempts: 5,
  lockedUntil: 123,
}
const rec = (id: string, lockId: string | undefined, extra: Partial<StoredWallet> = {}): StoredWallet =>
  ({
    id,
    label: id,
    address: `r${id}`,
    createdAt: 1,
    ...(lockId ? { lockId } : {}),
    encryptedSeed: wrapped,
    views: [{ walletId: id, network: 'testnet' }],
    ...extra,
  }) as StoredWallet
const lock = (id: string): LockRecord =>
  ({ key: `lock:${id}`, id, hkdfInfo: 'h', pbkdf2: { iterations: 1, hash: 'SHA-256', keyBits: 256 }, autoLockMinutes: 5, createdAt: 1, wrappedOpenKeyForPin: wrapped }) as LockRecord
const putWallet = (r: StoredWallet) => h.state.stores.wallets.set(r.id, structuredClone(r))
const putVault = (r: VaultMeta | LockRecord) => h.state.stores.vault.set(r.key, structuredClone(r))
const meta = () => h.state.stores.vault.get('vault') as VaultMeta
const SIX = ['pinSaltB64', 'pinVerifier', 'wrappedMasterKeyForPin', 'wrappedMasterKeyForPasskey', 'passkeyCredentialIdB64', 'rpId'] as const

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  putVault(FULL_META)
})

describe('discardAppPin (AD-46, AD-25)', () => {
  it('clears the six fields and resets the count and the back-off, in one write', async () => {
    await discardAppPin()
    for (const field of SIX) expect(meta()[field], field).toBeUndefined()
    expect(meta().failedAttempts).toBe(0)
    expect(meta().lockedUntil).toBeUndefined()
  })
})

describe('removeWallet: the App PIN goes with the last Wallet', () => {
  it('removing one of several Wallets leaves the PIN, its fields and the failure count untouched', async () => {
    putWallet(rec('a', 'LA'))
    putWallet(rec('b', 'LB'))
    putVault(lock('LA'))
    putVault(lock('LB'))
    const result = await removeWallet('a')
    expect(result).toEqual({ emptied: false, appPin: 'kept' })
    expect(meta()).toEqual(FULL_META)
    expect(h.state.stores.vault.has('lock:LA')).toBe(false)
    expect(h.state.stores.vault.has('lock:LB')).toBe(true)
  })

  it('removing a sibling view keeps the Seed, the lock and the PIN', async () => {
    putWallet(rec('a', 'LA', { views: [{ walletId: 'a', network: 'testnet' }, { walletId: 'a2', network: 'devnet' }] }))
    putVault(lock('LA'))
    expect(await removeWallet('a2')).toEqual({ emptied: false, appPin: 'kept' })
    expect(h.state.stores.wallets.has('a')).toBe(true)
    expect(meta()).toEqual(FULL_META)
  })

  it('the last Wallet: the six fields go, the count and back-off reset, its lock goes', async () => {
    putWallet(rec('a', 'LA'))
    putVault(lock('LA'))
    h.state.stores.session.set('session:LA', { key: 'session:LA' })
    expect(await removeWallet('a')).toEqual({ emptied: true, appPin: 'discarded' })
    for (const field of SIX) expect(meta()[field], field).toBeUndefined()
    expect(meta().failedAttempts).toBe(0)
    expect(meta().lockedUntil).toBeUndefined()
    expect([...h.state.stores.vault.keys()]).toEqual(['vault'])
    expect(h.state.stores.session.size).toBe(0)
    expect(await appPinResidue()).toBe(false)
    expect(await listWallets()).toEqual([])
  })

  it('a migrated legacy vault whose only lock record is lock:legacy: the PIN is discarded and the legacy record deleted', async () => {
    putWallet(rec('a', undefined))
    putVault({ ...lock('legacy'), wrappedOpenKeyForPin: undefined })
    h.state.stores.session.set('session', { key: 'session' })
    expect(await removeWallet('a')).toEqual({ emptied: true, appPin: 'discarded' })
    expect([...h.state.stores.vault.keys()]).toEqual(['vault'])
    expect(meta().pinSaltB64).toBeUndefined()
    expect(h.state.stores.session.size).toBe(0)
  })

  it('removing a legacy Wallet never deletes the legacy lock while another Wallet remains', async () => {
    putWallet(rec('a', 'legacy'))
    putWallet(rec('b', 'legacy'))
    putVault(lock('legacy'))
    await removeWallet('a')
    expect(h.state.stores.vault.has('lock:legacy')).toBe(true)
  })

  it('an orphan created-lock record with no Wallet does not block the discard, and is removed', async () => {
    putWallet(rec('a', 'LA'))
    putVault(lock('LA'))
    putVault(lock('ORPHAN'))
    expect(await removeWallet('a')).toEqual({ emptied: true, appPin: 'discarded' })
    expect([...h.state.stores.vault.keys()]).toEqual(['vault'])
    expect(meta().pinSaltB64).toBeUndefined()
  })

  it('a discard that fails after the last Wallet is gone is reported, not thrown, and the PIN remains', async () => {
    putWallet(rec('a', 'LA'))
    putVault(lock('LA'))
    // The Wallet and its lock are removed with deletes; the first vault PUT is discardAppPin's transaction.
    h.state.failNextPutOn = 'vault'
    expect(await removeWallet('a')).toEqual({ emptied: true, appPin: 'failed' })
    expect(h.state.stores.wallets.size).toBe(0)
    expect(meta()).toEqual(FULL_META)
    expect(await appPinResidue()).toBe(true)
  })

  it('Remove all is offered while a PIN or a count remains, never otherwise', async () => {
    expect(await appPinResidue()).toBe(true)
    putVault({ key: 'vault', failedAttempts: 2 })
    expect(await appPinResidue()).toBe(true)
    putVault({ key: 'vault', failedAttempts: 0 })
    expect(await appPinResidue()).toBe(false)
  })

  it('only discardAppPin resets the failure count on this path', () => {
    for (const file of ['src/lib/crypto/keystore.ts', 'src/lib/teardown.ts', 'src/pages/Chooser.tsx', 'src/components/wallet/WalletCard.tsx', 'src/components/wallet/RemoveDialog.tsx']) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/resetFailures|failedAttempts\s*[:=]/)
    }
  })
})

describe('the vault-write guard (AD-46)', () => {
  it('a last removal waits for a create that has written the PIN but not yet its lock or Wallet', async () => {
    // A device whose one Wallet has no App PIN yet; a create writes the PIN first, its lock and Wallet after.
    h.state.stores.vault.clear()
    putVault({ key: 'vault', failedAttempts: 0 })
    putWallet(rec('old', 'LO'))
    putVault(lock('LO'))
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let entered!: () => void
    const inFlight = new Promise<void>((resolve) => (entered = resolve))
    const create = exclusiveVaultWrite(async () => {
      h.state.stores.vault.set('vault', { key: 'vault', failedAttempts: 0, pinSaltB64: 'fresh', pinVerifier: { ...wrapped, hkdfInfo: 'v' } })
      entered()
      await gate
      await putLockRecord(lock('LN'))
      putWallet(rec('new', 'LN'))
    })
    await inFlight
    let settled = false
    const removal = removeWallet('old').then((r) => {
      settled = true
      return r
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(settled).toBe(false)
    expect(h.state.stores.wallets.has('old')).toBe(true)
    expect(meta().pinSaltB64).toBe('fresh')
    release()
    await create
    expect(await removal).toEqual({ emptied: false, appPin: 'kept' })
    expect(meta().pinSaltB64).toBe('fresh')
    expect(h.state.stores.wallets.has('new')).toBe(true)
    expect(h.state.stores.wallets.has('old')).toBe(false)
  })

  it('with Web Locks it requests the one named lock, returns the result and passes a rejection through', async () => {
    const request = vi.fn(async (_name: string, work: () => Promise<unknown>) => work())
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
    try {
      await expect(exclusiveVaultWrite(async () => 7)).resolves.toBe(7)
      expect(request).toHaveBeenCalledWith('xrpl-vault-write', expect.any(Function))
      await expect(exclusiveVaultWrite(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('serialises writers and one failure does not poison the next', async () => {
    const order: string[] = []
    const first = exclusiveVaultWrite(async () => {
      order.push('a:start')
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push('a:end')
      throw new Error('boom')
    })
    const second = exclusiveVaultWrite(async () => {
      order.push('b')
      return 'ok'
    })
    await expect(first).rejects.toThrow('boom')
    await expect(second).resolves.toBe('ok')
    expect(order).toEqual(['a:start', 'a:end', 'b'])
  })

  it('every function the guard comment names is wrapped in it, and none of the unwrapped ones is', () => {
    const keystore = readFileSync('src/lib/crypto/keystore.ts', 'utf8')
    const auth = readFileSync('src/lib/crypto/auth.ts', 'utf8')
    const db = readFileSync('src/lib/crypto/db.ts', 'utf8')
    const body = (text: string, name: string) => {
      const start = text.indexOf(`export function ${name}(`)
      expect(start, `${name} is an exported one-line wrapper`).toBeGreaterThan(-1)
      return text.slice(start, text.indexOf('\n}\n', start))
    }
    for (const name of ['createStoredWallet', 'createDerivedWallet', 'importAndStoreWallet', 'generateAndStoreWallet', 'editChecks', 'removeWallet']) {
      expect(body(keystore, name), name).toMatch(/exclusiveVaultWrite\(\(\) => \w+Unguarded\(/)
      expect(db, `${name} is listed in the guard comment`).toContain(name)
    }
    expect(body(auth, 'setUpVaultAuth')).toMatch(/exclusiveVaultWrite\(\(\) => setUpVaultAuthUnguarded\(/)
    expect(db).toContain('setUpVaultAuth')
    // Not re-entrant: these reach a wrapped function and must not be wrapped themselves.
    for (const name of ['restorePasskeyWallet', 'setLockAutoLock']) {
      const start = keystore.indexOf(`export async function ${name}(`)
      expect(start).toBeGreaterThan(-1)
      expect(keystore.slice(start, keystore.indexOf('\n}\n', start))).not.toMatch(/exclusiveVaultWrite/)
    }
  })

  it('a removal that throws while the vault is read does not leave the guard held', async () => {
    putWallet(rec('a', 'LA'))
    const original = h.state.stores.wallets
    h.state.stores.wallets = undefined as never
    await expect(removeWallet('a')).rejects.toBeTruthy()
    h.state.stores.wallets = original
    await expect(removeWallet('a')).resolves.toBeTruthy()
  })
})
