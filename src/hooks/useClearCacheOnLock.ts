import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/app-store'
import { removeLockedAccountData } from '@/lib/teardown'

/**
 * Whenever a lock leaves the open set, remove the account-scoped query data of
 * the Wallets on it: that is where balances, trust lines and history live, and
 * on a shared device they must not stay readable behind a locked Wallet
 * (guardrail #7). Clearing the in-memory key alone was not enough.
 *
 * This is the backstop for every close path (a header button, Settings, the
 * auto-lock timer, backgrounding): `lib/teardown.ts` owns the rule — per lock,
 * and an Account another open lock also holds stays — and this observer applies
 * it to any lock that vanished, so a path that only closed the key still cannot
 * leave data behind. Idempotent with `tearDownLock`.
 *
 * Locking does NOT touch Cache Storage, and must not. Those account reads were
 * never in Cache Storage: `vite.config.ts` precaches the static shell and
 * declares no `runtimeCaching`, so the only thing there is the shell. Deleting
 * it on lock protects nothing and stops the app opening offline. AD-16 — the
 * shell survives every lock; see `lib/teardown.ts`.
 */
export function useClearCacheOnLock() {
  const openLocks = useAppStore((s) => s.openLocks)
  const queryClient = useQueryClient()
  const previous = useRef<string[]>(Object.keys(openLocks))

  useEffect(() => {
    const now = Object.keys(openLocks)
    const closed = previous.current.filter((id) => !now.includes(id))
    previous.current = now
    if (closed.length > 0) removeLockedAccountData(queryClient, closed)
  }, [openLocks, queryClient])
}
