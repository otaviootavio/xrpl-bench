import type { QueryClient } from '@tanstack/react-query'
import { wipeVault } from '@/lib/crypto/auth'
import { disconnectAllClients } from '@/lib/xrpl/client'

/**
 * Full local teardown for wallet removal / "remove all wallets" — guardrail #7
 * in docs/decisions.md: "leaving a warm cache after logout is a documented
 * shared-device PWA vulnerability."
 *
 * Every layer that can hold account data has to go, not just the vault:
 *   - IndexedDB vault (encrypted seeds, unlock wrappers, session key)
 *   - TanStack Query cache (balances, trust lines, history)
 *   - Service worker caches (the app shell can be re-fetched; nothing here
 *     should survive a device handover)
 *   - Live XRPL sockets still subscribed to the removed account
 */
export async function tearDownAllLocalState(queryClient: QueryClient): Promise<void> {
  await wipeVault()
  queryClient.clear()
  await clearServiceWorkerCaches()
  await disconnectAllClients().catch(() => {})
}

/**
 * Clears Query + SW caches WITHOUT wiping the vault — for locking and for
 * removing a single wallet, where other wallets' seeds must survive but no
 * account data should stay readable.
 */
export async function clearCachedAccountData(queryClient: QueryClient): Promise<void> {
  queryClient.clear()
  await clearServiceWorkerCaches()
}

async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    // Cache API can be unavailable (private mode, no SW registered) — the
    // vault and query-cache teardown above are the parts that must not fail.
  }
}
