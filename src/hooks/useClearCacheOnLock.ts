import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/app-store'
import { clearCachedAccountData } from '@/lib/teardown'

/**
 * On every lock, clear the TanStack Query cache: that is where balances, trust
 * lines and history live, and on a shared device they must not stay readable
 * behind the lock screen (guardrail #7). Clearing the in-memory key alone was
 * not enough.
 *
 * Locking does NOT touch Cache Storage, and must not. Those account reads were
 * never in Cache Storage: `vite.config.ts` precaches the static shell and
 * declares no `runtimeCaching`, so the only thing there is the shell. Deleting
 * it on lock (as this hook once did, G-14) protected nothing and stopped the
 * app opening offline and the update flow keeping its previous precache.
 * AD-16 — the shell survives every lock; see `lib/teardown.ts`.
 */
export function useClearCacheOnLock() {
  const unlocked = useAppStore((s) => s.unlocked)
  const queryClient = useQueryClient()
  const wasUnlocked = useRef(unlocked)

  useEffect(() => {
    if (wasUnlocked.current && !unlocked) {
      clearCachedAccountData(queryClient)
    }
    wasUnlocked.current = unlocked
  }, [unlocked, queryClient])
}
