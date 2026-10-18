import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AddWalletScreen } from '@/components/wallet/AddWalletScreen'
import { ControlWalletScreen } from '@/components/wallet/ControlWalletScreen'
import { EditChecksScreen, type EditedChecks } from '@/components/wallet/EditChecksScreen'
import { TwoDeviceScreen } from '@/components/wallet/TwoDeviceSign'
import { leaveScreen, resetToHome, type Route } from '@/lib/route'
import { listWallets } from '@/lib/crypto/keystore'
import { startLockSession } from '@/lib/crypto/lock'
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
export function WalletScreens({ route }: { route: Exclude<Route, { screen: 'home' }> }) {
  const activeNetwork = useActiveNetwork()
  const queryClient = useQueryClient()
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const openLocks = useAppStore((s) => s.openLocks)
  const openLock = useAppStore((s) => s.openLock)
  const closeLock = useAppStore((s) => s.closeLock)
  const setLockMinutes = useAppStore((s) => s.setLockMinutes)

  const target = route.screen === 'add-wallet' ? null : (wallets.find((w) => w.id === route.walletId) ?? null)
  const reachable = route.screen === 'add-wallet' || (target !== null && target.lockId in openLocks)
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
      } else if (edited.changed) {
        setLockMinutes(meta.lockId, edited.autoLockMinutes)
      }
      await refreshWallets()
      await queryClient.invalidateQueries({ queryKey: queryKeys.lockInfo(meta.lockId) })
      if (previousLockId !== meta.lockId) queryClient.removeQueries({ queryKey: queryKeys.lockInfo(previousLockId) })
      toast.success(edited.changed ? 'Checks updated.' : 'Nothing to change.')
    } finally {
      // The old lock record is already deleted: its session must close whatever failed above.
      if (edited.previousLockRemoved) closeLock(previousLockId)
    }
  }

  if (route.screen === 'add-wallet') return <AddWalletScreen onClose={leaveScreen} />
  if (!reachable || !target) return null
  switch (route.screen) {
    case 'edit-checks':
      return <EditChecksScreen wallet={target} onClose={leaveScreen} onEdited={handleEdited} />
    case 'two-device':
      return <TwoDeviceScreen wallet={target} onClose={leaveScreen} />
    case 'control':
      return (
        <ControlWalletScreen
          controller={target}
          wallets={wallets}
          onClose={leaveScreen}
          onControlled={async () => {
            await refreshWallets()
            toast.success('The other wallet now operates this account.')
          }}
        />
      )
  }
}
