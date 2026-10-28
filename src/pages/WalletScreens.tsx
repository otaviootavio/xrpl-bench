import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ControlWalletScreen } from '@/components/wallet/ControlWalletScreen'
import { EditChecksScreen, type EditedChecks } from '@/components/wallet/EditChecksScreen'
import { TwoDeviceScreen } from '@/components/wallet/TwoDeviceSign'
import { clearConfigureLaunch, peekConfigureLaunch } from '@/lib/configure-launch'
import { leaveScreen, resetToHome, type TaskRoute } from '@/lib/route'
import { listWallets } from '@/lib/crypto/keystore'
import { startLockSession } from '@/lib/crypto/lock'
import { useLockMinutesChanged } from '@/hooks/useLockMinutesChanged'
import { toast } from '@/lib/notify'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { useActiveNetwork, useAppStore } from '@/store/app-store'

/**
 * The routed task screens (mobile dialogs S2). Mounted by `Main` only while the
 * active Wallet's lock is open (AD-26), in place of the tabs. A screen for a
 * Wallet that does not exist, or whose own lock is closed, is not shown: the
 * location is reset to the shell, so nothing account-scoped renders for a lock
 * that is not open.
 */
export function WalletScreens({ route }: { route: TaskRoute }) {
  const activeNetwork = useActiveNetwork()
  const queryClient = useQueryClient()
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const openLocks = useAppStore((s) => s.openLocks)
  const openLock = useAppStore((s) => s.openLock)
  const closeLock = useAppStore((s) => s.closeLock)
  const lockMinutesChanged = useLockMinutesChanged()

  // Opened from Configure or from the Settings tab? Decided once, at mount, by the launch
  // marker the Configure keys set (never the URL or history state), so the Back label
  // and the return agree with where the user came from. The tab's launch leaves the
  // default label `Settings`; the label never carries a wallet name.
  const [fromConfigure] = useState(peekConfigureLaunch)
  useEffect(() => {
    clearConfigureLaunch()
  }, [])
  const backLabel = fromConfigure ? 'Back to Configure' : undefined

  const target = wallets.find((w) => w.id === route.walletId) ?? null
  const reachable = target !== null && target.lockId in openLocks
  useEffect(() => {
    if (!reachable) resetToHome()
  }, [reachable])

  async function refreshWallets() {
    const fresh = await listWallets(activeNetwork)
    setWallets(fresh)
    return fresh
  }

  /** An edit of a Wallet's checks was committed. When it moved to a new lock the
   * keystore handed back that lock's Open Key and touched no session: this is
   * where the old lock closes and the new one opens (FR-73, AD-21). The new lock
   * opens first, so no listed Wallet is ever shown with a closed lock. */
  async function handleEdited(edited: EditedChecks) {
    const { meta, previousLockId } = edited
    try {
      if (edited.openKey) {
        await startLockSession(meta.lockId, edited.openKey, edited.autoLockMinutes)
        openLock(meta.lockId, edited.openKey, edited.autoLockMinutes)
        await queryClient.invalidateQueries({ queryKey: queryKeys.lockInfo(meta.lockId) })
      } else if (edited.changed) {
        // Same-lock edit: the minutes part is the shared handler the Configure control also uses.
        await lockMinutesChanged(meta.lockId, edited.autoLockMinutes)
      } else {
        // Nothing changed: the read the screens show is still refreshed, as it always was.
        await queryClient.invalidateQueries({ queryKey: queryKeys.lockInfo(meta.lockId) })
      }
      await refreshWallets()
      if (previousLockId !== meta.lockId) queryClient.removeQueries({ queryKey: queryKeys.lockInfo(previousLockId) })
      toast.success(edited.changed ? 'Checks updated.' : 'Nothing to change.')
    } finally {
      // The old lock record is already deleted: its session must close whatever failed above.
      if (edited.previousLockRemoved) closeLock(previousLockId)
    }
  }

  if (!reachable || !target) return null
  switch (route.screen) {
    case 'edit-checks':
      return <EditChecksScreen wallet={target} onClose={leaveScreen} onEdited={handleEdited} backLabel={backLabel} />
    case 'two-device':
      return <TwoDeviceScreen wallet={target} onClose={leaveScreen} backLabel={backLabel} />
    case 'control':
      return (
        <ControlWalletScreen
          controller={target}
          wallets={wallets}
          onClose={leaveScreen}
          backLabel={backLabel}
          onControlled={async () => {
            await refreshWallets()
            toast.success('The other wallet now operates this account.')
          }}
        />
      )
  }
}
