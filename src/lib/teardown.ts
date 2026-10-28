import type { QueryClient } from '@tanstack/react-query'
import { wipeVault } from '@/lib/crypto/auth'
import { LEGACY_LOCK_ID } from '@/lib/crypto/db'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { disconnectAllClients } from '@/lib/xrpl/client'
import { removeAccountScoped } from '@/lib/xrpl/query-keys'
import { clearPersistedAppState, useAppStore } from '@/store/app-store'

/**
 * The one owner of local teardown — AD-16, amended by AD-26. It has **three**
 * scopes, and a lock only ever uses the first (leaving a Wallet for the chooser,
 * `leaveWallet`, removes its query data and closes nothing — AD-38):
 *
 *  - **Per-lock** (`tearDownLock`): drop that lock's key and persisted session
 *    and remove the account-scoped query data of the Wallets on it — unless
 *    another OPEN lock holds a record for the same Account, whose data must stay
 *    readable. Nothing belonging to another lock is touched.
 *
 * A full reset (`tearDownAllLocalState`) clears **two** sets, never one:
 *
 *  - **Account data** never survives a teardown that claims to remove it. Its
 *    persisted owners are listed in `PERSISTED_ACCOUNT_DATA` below; its
 *    in-memory part is the TanStack Query cache, which is where balances,
 *    trust lines and history actually live.
 *  - **The shell** — the service-worker precache and the registration that
 *    owns it — survives every lock and every single-wallet removal. It holds
 *    no account data: `vite.config.ts` precaches the static build and declares
 *    no `runtimeCaching`, so no RPC response has ever been in Cache Storage.
 *    Deleting it on lock bought no privacy and cost offline start-up and the
 *    update flow's retained precache (G-14; `app-versioning-and-updates.md`
 *    US-8, US-9; PRD FR-52). Only a full reset clears it, and then the
 *    registration goes with the caches: an active worker never refills a
 *    deleted precache, so the reset's reload must install a fresh one
 *    (`docs/decisions.md` §13).
 *
 * A module that persists anything is incomplete until its clear is listed in
 * `PERSISTED_ACCOUNT_DATA`, and a new Cache Storage entry must say which set
 * it belongs to. `src/lib/__tests__/teardown.test.ts` scans `src/` for
 * persistence owners and fails on one that is not registered here.
 */

/** A persisted account-data owner, and how to clear it. */
export interface PersistedOwner {
  /** Source file that owns the persistence (repo-relative, `src/...`). */
  readonly module: string
  /** What it holds, for the reader. */
  readonly holds: string
  readonly clear: () => Promise<void>
}

/** Account data at rest. Every entry is cleared by `tearDownAllLocalState`. */
export const PERSISTED_ACCOUNT_DATA: readonly PersistedOwner[] = [
  {
    module: 'src/lib/crypto/db.ts',
    holds: 'the vault — encrypted seeds, unlock wrappers, the unlocked session',
    clear: wipeVault,
  },
  {
    module: 'src/store/app-store.ts',
    holds: "`xrpl-wallet-app-state` — wallet labels and addresses, the Address Book, network, auto-lock, declined updates",
    clear: clearPersistedAppState,
  },
]

/** What a reset screen shows when `tearDownAllLocalState` rejects, instead of
 * reloading as though the device were clean. A reload shows the device's true
 * state, and from there the reset can be run again. */
export const RESET_INCOMPLETE_MESSAGE =
  'The reset did not finish — some data on this device could not be removed. Reload the app and reset again before handing this device over.'

/**
 * "Remove everything" — the hard-lock reset on the Unlock screen and "Erase
 * everything" in Settings. Clears all of the account-data set AND the shell.
 *
 * Every account-data clear is attempted even if an earlier one fails, so one
 * broken layer cannot leave the others behind; any failure is then rethrown,
 * so a caller never reloads as though everything were gone when it is not.
 * The shell is cleared only once every account-data clear has succeeded.
 */
export async function tearDownAllLocalState(queryClient: QueryClient): Promise<void> {
  const failures: unknown[] = []
  for (const owner of PERSISTED_ACCOUNT_DATA) {
    try {
      await owner.clear()
    } catch (err) {
      failures.push(err)
    }
  }
  clearCachedAccountData(queryClient)
  await disconnectAllClients().catch(() => {})
  if (failures.length > 0) {
    // A partial teardown keeps the shell — worker and precache — so the
    // "reload and reset again" the caller shows reopens the version the user
    // already runs, not whatever the origin now serves. The retry clears it.
    throw new AggregateError(failures, 'Local data could not be fully removed.')
  }
  // The shell goes too on a full reset: nothing on a handed-over device should
  // outlive "remove everything". This is the ONLY path that clears it.
  await clearShell()
}

/**
 * Single-wallet removal. Clears the in-memory account data — the
 * TanStack Query cache, where balances, trust lines and history live — and
 * nothing else: the vault keeps the other wallets' seeds, the app store keeps
 * their labels, and the shell stays so the app still opens offline.
 *
 * Do not add Cache Storage here. It holds only the precached shell (see the
 * module comment), so clearing it on lock protects nothing and breaks offline
 * start-up — that was G-14.
 */
export function clearCachedAccountData(queryClient: QueryClient): void {
  queryClient.clear()
}

/**
 * Removes the account-scoped query data of every Wallet on the given locks —
 * which have ALREADY closed — except an Account that a still-open lock also
 * holds a Wallet for (AD-18: two records can share `(network, Account)`).
 * Idempotent, so the observer in `useClearCacheOnLock` and `tearDownLock` may
 * both run it.
 */
export function removeLockedAccountData(queryClient: QueryClient, lockIds: readonly string[]): void {
  const { wallets, openLocks } = useAppStore.getState()
  const closed = new Set(lockIds)
  const stillReadable = new Set(
    wallets.filter((w) => !closed.has(w.lockId) && w.lockId in openLocks).map((w) => `${w.network}:${w.address}`),
  )
  for (const w of wallets) {
    if (!closed.has(w.lockId) || w.lockId in openLocks) continue
    if (stillReadable.has(`${w.network}:${w.address}`)) continue
    removeAccountScoped(queryClient, w.network, w.address)
  }
  // The last open lock closing leaves nothing readable, so the ledger-wide and
  // counterparty-keyed entries (destination checks, reserves, fee) go too — the
  // old app-wide lock cleared everything, and so does the last one now.
  if (Object.keys(openLocks).length === 0) clearCachedAccountData(queryClient)
}

/**
 * Leave scope (AD-38): the user left a Wallet for the chooser. Removes that
 * Wallet's account-scoped query data — unless another Wallet on an OPEN lock
 * holds the same `(network, address)` — and never closes a lock.
 */
export function leaveWallet(queryClient: QueryClient, walletId: string): void {
  const { wallets, openLocks } = useAppStore.getState()
  const left = wallets.find((w) => w.id === walletId)
  if (!left) return
  const shared = wallets.some(
    (w) => w.id !== left.id && w.lockId in openLocks && w.network === left.network && w.address === left.address,
  )
  if (shared) return
  removeAccountScoped(queryClient, left.network, left.address)
}

/**
 * Remove scope (AD-46): one Wallet was removed from the vault. In memory only; the
 * vault was written by the keystore, and this never writes vault meta.
 *
 *  - Removes the removed Wallet's account-scoped query data, keeping a
 *    `(network, address)` that a remaining Wallet on an OPEN lock still holds.
 *  - Closes the removed Wallet's lock when no remaining Wallet is on it (the keystore
 *    deleted it with the Seed's last view). Never the legacy lock here: its record
 *    and wrappers are the vault's own.
 *  - When no Wallet remains, `tearDownAllLocks`: every lock, session and cached
 *    entry goes, the legacy lock's key included.
 *
 * `remaining` is what the vault holds now, not the store's `wallets`, and never
 * contains `removed` (a keystore step that threw may have left it in the vault; its
 * in-memory session and data are closed anyway, which fails closed). The caller
 * runs this from `finally`, so it must not throw on a half-finished removal.
 */
export function removeWalletData(queryClient: QueryClient, removed: WalletMeta, remaining: readonly WalletMeta[]): void {
  const others = remaining.filter((w) => w.id !== removed.id)
  const { openLocks } = useAppStore.getState()
  const stillHeld = others.some((w) => w.lockId in openLocks && w.network === removed.network && w.address === removed.address)
  if (!stillHeld) removeAccountScoped(queryClient, removed.network, removed.address)
  if (removed.lockId !== LEGACY_LOCK_ID && !others.some((w) => w.lockId === removed.lockId)) {
    useAppStore.getState().closeLock(removed.lockId)
  }
  if (others.length === 0) tearDownAllLocks(queryClient)
}

/** Per-lock scope: closes ONE lock and removes its Wallets' account data. */
export function tearDownLock(queryClient: QueryClient, lockId: string): void {
  useAppStore.getState().closeLock(lockId)
  removeLockedAccountData(queryClient, [lockId])
}

/** Closes every lock (backgrounding past the grace). The shell and the vault
 * stay; only the keys, sessions and account data of the Wallets go. */
export function tearDownAllLocks(queryClient: QueryClient): void {
  const ids = Object.keys(useAppStore.getState().openLocks)
  useAppStore.getState().closeAllLocks()
  removeLockedAccountData(queryClient, ids)
}

/**
 * The shell set: every service-worker registration for the origin, and the
 * precache. Cleared by a full teardown only, after every account-data clear
 * succeeded.
 *
 * Deleting the caches alone is not enough: the still-active worker never
 * refills a deleted precache (workbox repairs a miss only for entries that
 * carry `integrity`, which vite-plugin-pwa does not emit), so the app would not
 * open offline again until a new release installed. Unregistering makes the
 * reset's reload install a fresh worker that precaches the shell, as a first
 * install does. That reload is not an automatic update: it follows an explicit
 * reset that leaves no wallet on the device (`docs/decisions.md` §13).
 *
 * All registrations are unregistered, not only the one `lib/sw-register.ts`
 * holds, so a stale one cannot keep serving an empty precache. The two steps
 * are attempted independently and both fail quietly: the shell holds no
 * account data, so its failure is no reason to report the reset incomplete.
 */
async function clearShell(): Promise<void> {
  try {
    const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
    if (sw) {
      const registrations = await sw.getRegistrations()
      await Promise.allSettled(registrations.map((r) => r.unregister()))
    }
  } catch {
    // No service-worker API reachable (insecure context, blocked). Quiet: see above.
  }
  if (typeof caches === 'undefined') return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    // Cache API can be unavailable (private mode). Quiet: see above.
  }
}
