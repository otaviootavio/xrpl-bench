import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/app-store'
import { clearCachedAccountData } from '@/lib/teardown'

/**
 * Guardrail #7: locking must not leave balances, trust lines and history
 * sitting warm in the caches behind the lock screen — on a shared device that
 * data stays readable to whoever picks the app up next. Clearing the in-memory
 * key alone was not enough.
 */
export function useClearCacheOnLock() {
  const unlocked = useAppStore((s) => s.unlocked)
  const queryClient = useQueryClient()
  const wasUnlocked = useRef(unlocked)

  useEffect(() => {
    if (wasUnlocked.current && !unlocked) {
      void clearCachedAccountData(queryClient)
    }
    wasUnlocked.current = unlocked
  }, [unlocked, queryClient])
}
