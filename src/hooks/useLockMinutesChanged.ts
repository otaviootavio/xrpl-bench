import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { useAppStore } from '@/store/app-store'

/**
 * The ONE success handler for a lock's auto-lock minutes changing without the lock
 * moving (AD-44): the Configure Auto-lock control and an Edit checks commit that only
 * changed the minutes both call it. It updates the open lock's session window and
 * refreshes the `lockInfo` read every screen shows the minutes from.
 */
export function useLockMinutesChanged(): (lockId: string, minutes: number) => Promise<void> {
  const queryClient = useQueryClient()
  const setLockMinutes = useAppStore((s) => s.setLockMinutes)
  return useCallback(
    async (lockId, minutes) => {
      // A lock that closed while the Open Check was being asked has no session window to move.
      if (lockId in useAppStore.getState().openLocks) setLockMinutes(lockId, minutes)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lockInfo(lockId) })
    },
    [queryClient, setLockMinutes],
  )
}
