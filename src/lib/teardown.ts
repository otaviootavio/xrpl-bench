import type { QueryClient } from '@tanstack/react-query'
import { wipeVault } from '@/lib/crypto/auth'
import { disconnectAllClients } from '@/lib/xrpl/client'
import { clearPersistedAppState } from '@/store/app-store'

/**
 * The one owner of local teardown — AD-16. It clears **two** sets, never one:
 *
 *  - **Account data** never survives a teardown that claims to remove it. Its
 *    persisted owners are listed in `PERSISTED_ACCOUNT_DATA` below; its
 *    in-memory part is the TanStack Query cache, which is where balances,
 *    trust lines and history actually live.
 *  - **The shell** — the service-worker precache — survives every lock and
 *    every single-wallet removal. It holds no account data: `vite.config.ts`
 *    precaches the static build and declares no `runtimeCaching`, so no RPC
 *    response has ever been in Cache Storage. Deleting it on lock bought no
 *    privacy and cost offline start-up and the update flow's retained precache
 *    (G-14; `app-versioning-and-updates.md` US-8, US-9; PRD FR-52).
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
 * Every clear is attempted even if an earlier one fails, so one broken layer
 * cannot leave the others behind; any failure is then rethrown, so a caller
 * never reloads as though everything were gone when it is not.
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
  // The shell goes too on a full reset: nothing on a handed-over device should
  // outlive "remove everything", and the reload re-fetches it. This is the
  // ONLY path that clears it (Story 6.1 adds to this set and removes nothing).
  await clearShell()
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Local data could not be fully removed.')
  }
}

/**
 * Lock and single-wallet removal. Clears the in-memory account data — the
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

/** The shell set: the service-worker precache. Cleared by full teardown only. */
async function clearShell(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    // Cache API can be unavailable (private mode, no SW registered). The shell
    // holds no account data, so this is the one clear allowed to fail quietly.
  }
}
