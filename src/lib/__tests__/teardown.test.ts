import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QueryClient } from '@tanstack/react-query'

/**
 * AD-16 — `lib/teardown.ts` owns the clear set, and it is two sets.
 *
 *  - G-13: "remove everything" must clear the persisted app store, and a
 *    setter called after it (every reset path calls `lock()`) must not write
 *    the old wallets / Address Book back.
 *  - G-14: a lock or single-wallet removal clears the query cache and leaves
 *    the service-worker precache alone.
 *
 * The app store is REAL; only its persistence sink (`idb-keyval`), the vault
 * module and the socket pool are faked.
 */

const h = vi.hoisted(() => ({
  idb: new Map<string, string>(),
  wipeVault: vi.fn(async () => {}),
  disconnectAllClients: vi.fn(async () => {}),
}))

vi.mock('idb-keyval', () => ({
  get: async (k: string) => h.idb.get(k),
  set: async (k: string, v: string) => void h.idb.set(k, v),
  del: async (k: string) => void h.idb.delete(k),
}))
vi.mock('@/lib/crypto/auth', () => ({
  wipeVault: () => h.wipeVault(),
  endSession: async () => {},
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: () => h.disconnectAllClients() }))

import { clearCachedAccountData, PERSISTED_ACCOUNT_DATA, tearDownAllLocalState } from '../teardown'
import { APP_STATE_STORAGE_KEY, useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'

const PRECACHE = 'workbox-precache-v2-https://wallet.example/'

/** A minimal Cache Storage that records what was deleted. */
function installCaches(names: string[]) {
  const live = new Set(names)
  const api = {
    keys: vi.fn(async () => [...live]),
    delete: vi.fn(async (k: string) => live.delete(k)),
  }
  vi.stubGlobal('caches', api)
  return { api, live }
}

/**
 * A minimal `navigator.serviceWorker` holding `count` registrations. Defined on
 * the existing `navigator` (not a replacement object) and removed in
 * `afterEach`, so the "no SW API" case is simply the default.
 */
function installServiceWorker(count = 1) {
  const registrations = Array.from({ length: count }, () => ({ unregister: vi.fn(async () => true) }))
  const sw = { getRegistrations: vi.fn(async () => registrations) }
  Object.defineProperty(globalThis.navigator, 'serviceWorker', { value: sw, configurable: true })
  return { sw, registrations }
}

function removeServiceWorker() {
  if (typeof navigator !== 'undefined' && Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')) {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker
  }
}

/** Let the persist middleware's async writes land. */
const flush = () => new Promise((r) => setTimeout(r, 0))

function seededQueryClient() {
  const qc = new QueryClient()
  qc.setQueryData(queryKeys.accountState('testnet', 'rAlice'), { balanceDrops: '25000000' })
  return qc
}

async function seedStore() {
  const s = useAppStore.getState()
  s.setNetwork('mainnet')
  s.setWallets([{ id: 'w1', label: 'Savings', address: 'rAliceAddressLabelThatMustNotSurvive' } as never])
  s.setActiveWalletId('w1')
  s.addAddressBookEntry({ address: 'rBobCounterpartyThatMustNotSurvive', label: 'Bob — landlord' })
  s.setAutoLockMinutes(30)
  s.declineUpdateVersion('deadbeef')
  await flush()
  // Precondition: the residue really is on disk before the teardown runs.
  expect(h.idb.get(APP_STATE_STORAGE_KEY)).toContain('Bob — landlord')
}

beforeEach(() => {
  h.idb.clear()
  h.wipeVault.mockReset().mockResolvedValue(undefined)
  h.disconnectAllClients.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  removeServiceWorker()
})

describe('tearDownAllLocalState — "remove everything" (G-13)', () => {
  it('leaves no wallet label, address, Address Book entry, auto-lock or declined update on disk — even after the lock every reset path calls', async () => {
    installCaches([PRECACHE])
    await seedStore()

    await tearDownAllLocalState(seededQueryClient())
    // Both reset paths lock after teardown (Settings explicitly; the Unlock
    // screen is already locked, and any later setter behaves the same). The
    // persist middleware re-serializes the whole slice on that `set()`.
    useAppStore.getState().lock()
    await flush()

    const onDisk = h.idb.get(APP_STATE_STORAGE_KEY)
    for (const residue of ['rAliceAddressLabelThatMustNotSurvive', 'Savings', 'rBobCounterpartyThatMustNotSurvive', 'Bob — landlord', 'deadbeef']) {
      expect(onDisk ?? '').not.toContain(residue)
    }
    if (onDisk !== undefined) {
      const { state } = JSON.parse(onDisk)
      expect(state).toMatchObject({ wallets: [], activeWalletId: null, addressBook: [], autoLockMinutes: 5, declinedUpdateVersions: [] })
    }

    const s = useAppStore.getState()
    expect(s.wallets).toEqual([])
    expect(s.addressBook).toEqual([])
    expect(s.autoLockMinutes).toBe(5)
    expect(s.declinedUpdateVersions).toEqual([])
  })

  it('removes the persisted key itself, not only its contents', async () => {
    installCaches([])
    await seedStore()
    await tearDownAllLocalState(new QueryClient())
    expect(h.idb.has(APP_STATE_STORAGE_KEY)).toBe(false)
  })

  it('still wipes the vault, the query cache, the sockets and the shell — Story 6.1 adds to this set and removes nothing', async () => {
    const { live } = installCaches([PRECACHE])
    const qc = seededQueryClient()
    await tearDownAllLocalState(qc)
    expect(h.wipeVault).toHaveBeenCalledTimes(1)
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
    expect(h.disconnectAllClients).toHaveBeenCalledTimes(1)
    expect(live.size).toBe(0)
  })

  it('a vault that fails to wipe does not stop the app store being cleared, and the teardown still rejects', async () => {
    installCaches([])
    await seedStore()
    h.wipeVault.mockRejectedValueOnce(new Error('IDB blocked'))

    await expect(tearDownAllLocalState(new QueryClient())).rejects.toThrow('could not be fully removed')
    expect(h.idb.has(APP_STATE_STORAGE_KEY)).toBe(false)
  })

  it('a vault that fails to wipe leaves the shell — no unregister, no cache deletion — so the retry reloads the version already running', async () => {
    const { api, live } = installCaches([PRECACHE])
    const { sw } = installServiceWorker()
    h.wipeVault.mockRejectedValueOnce(new Error('IDB blocked'))

    await expect(tearDownAllLocalState(new QueryClient())).rejects.toThrow('could not be fully removed')
    expect(sw.getRegistrations).not.toHaveBeenCalled()
    expect(api.keys).not.toHaveBeenCalled()
    expect(live.has(PRECACHE)).toBe(true)
  })

  it('registers both IndexedDB owners in the account-data set', () => {
    expect(PERSISTED_ACCOUNT_DATA.map((o) => o.module).sort()).toEqual(['src/lib/crypto/db.ts', 'src/store/app-store.ts'])
  })
})

/**
 * Epic 6 retro F1: an active worker never refills a deleted precache, so a
 * full reset must unregister every registration — then the reload installs a
 * fresh worker that precaches the shell, and the app opens offline again.
 */
describe('tearDownAllLocalState — the shell goes with its worker', () => {
  it('unregisters every service-worker registration and deletes every cache key', async () => {
    const { live } = installCaches([PRECACHE, 'workbox-runtime-stale'])
    const { sw, registrations } = installServiceWorker(2)

    await tearDownAllLocalState(new QueryClient())

    expect(sw.getRegistrations).toHaveBeenCalledTimes(1)
    for (const r of registrations) expect(r.unregister).toHaveBeenCalledTimes(1)
    expect(live.size).toBe(0)
  })

  it('still clears the caches, without throwing, when there is no service-worker API', async () => {
    removeServiceWorker()
    const { live } = installCaches([PRECACHE])
    await expect(tearDownAllLocalState(new QueryClient())).resolves.toBeUndefined()
    expect(live.size).toBe(0)
  })

  it('still unregisters, and resolves, when there is no Cache API', async () => {
    vi.stubGlobal('caches', undefined)
    const { registrations } = installServiceWorker()
    await expect(tearDownAllLocalState(new QueryClient())).resolves.toBeUndefined()
    expect(registrations[0].unregister).toHaveBeenCalledTimes(1)
  })

  it('still clears the caches and resolves when getRegistrations rejects', async () => {
    const { live } = installCaches([PRECACHE])
    const { sw } = installServiceWorker()
    sw.getRegistrations.mockRejectedValueOnce(new Error('SecurityError'))

    await expect(tearDownAllLocalState(new QueryClient())).resolves.toBeUndefined()
    expect(live.size).toBe(0)
  })

  it('unregisters the others and still clears the caches when one unregister rejects', async () => {
    const { live } = installCaches([PRECACHE])
    const { registrations } = installServiceWorker(2)
    registrations[0].unregister.mockRejectedValueOnce(new Error('InvalidStateError'))

    await expect(tearDownAllLocalState(new QueryClient())).resolves.toBeUndefined()
    expect(registrations[1].unregister).toHaveBeenCalledTimes(1)
    expect(live.size).toBe(0)
  })

  it('still unregisters when the Cache API throws', async () => {
    vi.stubGlobal('caches', { keys: vi.fn(async () => { throw new Error('private mode') }), delete: vi.fn() })
    const { registrations } = installServiceWorker()

    await expect(tearDownAllLocalState(new QueryClient())).resolves.toBeUndefined()
    expect(registrations[0].unregister).toHaveBeenCalledTimes(1)
  })
})

describe('clearCachedAccountData — lock and single-wallet removal (G-14)', () => {
  it('clears the query cache, where account data actually lives', () => {
    installCaches([PRECACHE])
    const qc = seededQueryClient()
    clearCachedAccountData(qc)
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
  })

  it('leaves the service-worker precache and its registration untouched', async () => {
    const { api, live } = installCaches([PRECACHE])
    const { sw, registrations } = installServiceWorker()
    clearCachedAccountData(seededQueryClient())
    await flush()
    expect(api.delete).not.toHaveBeenCalled()
    expect(live.has(PRECACHE)).toBe(true)
    expect(sw.getRegistrations).not.toHaveBeenCalled()
    expect(registrations[0].unregister).not.toHaveBeenCalled()
  })

  it('leaves the vault, the persisted app store and the sockets alone', async () => {
    installCaches([])
    await seedStore()
    clearCachedAccountData(new QueryClient())
    await flush()
    expect(h.wipeVault).not.toHaveBeenCalled()
    expect(h.disconnectAllClients).not.toHaveBeenCalled()
    expect(h.idb.get(APP_STATE_STORAGE_KEY)).toContain('Bob — landlord')
  })
})

/**
 * AD-16: "a module that persists anything is incomplete until its clear is
 * registered" with the teardown owner, and "a new Cache Storage entry must
 * declare which of the two sets it belongs to". This scan is that rule as a
 * gate: a new persistence owner anywhere in `src/` fails here until it is
 * listed in `PERSISTED_ACCOUNT_DATA`.
 */
describe('AD-16 registration guard', () => {
  const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
  const SRC = join(ROOT, 'src')

  /** Code that persists to the device, by API. */
  const PERSISTS = [
    /\bpersist\s*\(/,
    /\bopenDB\s*[<(]/,
    /from\s+['"]idb-keyval['"]/,
    /\bindexedDB\.open\s*\(/,
    /\b(localStorage|sessionStorage)\.setItem\s*\(/,
  ]
  /** Cache Storage writes. The only declared one is the Workbox precache (the
   * shell set), which lives in the generated worker, not in `src/`. */
  const CACHE_WRITE = /\bcaches\.open\s*\(/

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__') continue
        yield* walk(full)
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full
    }
  }

  const files = [...walk(SRC)].map((f) => ({ path: relative(ROOT, f).split(sep).join('/'), text: readFileSync(f, 'utf8') }))

  it('every module that persists anything has its clear registered with the teardown owner', () => {
    const owners = files.filter((f) => PERSISTS.some((re) => re.test(f.text))).map((f) => f.path)
    expect(owners.length).toBeGreaterThan(0)
    const registered = new Set(PERSISTED_ACCOUNT_DATA.map((o) => o.module))
    expect(owners.filter((p) => !registered.has(p))).toEqual([])
  })

  it('every registered owner still exists and still persists (no stale registration)', () => {
    for (const { module } of PERSISTED_ACCOUNT_DATA) {
      const file = files.find((f) => f.path === module)
      expect(file, module).toBeDefined()
      expect(PERSISTS.some((re) => re.test(file!.text)), module).toBe(true)
    }
  })

  it('no source module opens its own Cache Storage entry without declaring its set in lib/teardown.ts', () => {
    expect(files.filter((f) => CACHE_WRITE.test(f.text)).map((f) => f.path)).toEqual([])
  })
})
