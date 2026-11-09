import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ControlWalletScreen } from '@/components/wallet/ControlWalletScreen'
import { EditChecksScreen, type EditedChecks } from '@/components/wallet/EditChecksScreen'
import { TwoDeviceScreen } from '@/components/wallet/TwoDeviceSign'
import { leaveScreen, resetToHome, resetToWalletShell, type TaskRoute } from '@/lib/route'
import { listWallets } from '@/lib/crypto/keystore'
import { isKeyWallet } from '@/lib/wallet-meta'
import { startLockSession } from '@/lib/crypto/lock'
import { useLockMinutesChanged } from '@/hooks/useLockMinutesChanged'
import { toast } from '@/lib/notify'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { useAppStore } from '@/store/app-store'

const BACK_LABEL = 'Back to Wallet'

/**
 * The routed task screens (mobile dialogs S2). Mounted by `Main` only while the
 * active Wallet's lock is open (AD-26), in place of the tabs. A screen for a
 * Wallet that does not exist, or whose own lock is closed, is not shown: the
 * location is reset to the shell, so nothing account-scoped renders for a lock
 * that is not open.
 */
export function WalletScreens({ route }: { route: TaskRoute }) {
  const queryClient = useQueryClient()
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const openLocks = useAppStore((s) => s.openLocks)
  const openLock = useAppStore((s) => s.openLock)
  const closeLock = useAppStore((s) => s.closeLock)
  const lockMinutesChanged = useLockMinutesChanged()

  // A task screen is opened only from the Local settings tab and returns there; the label never carries a wallet name.
  const backLabel = BACK_LABEL

  const target = wallets.find((w) => w.id === route.walletId) ?? null
  const reachable = target !== null && target.lockId in openLocks
  // Two-device signing and operating another account are Online Wallet screens only, and
  // Edit checks needs a key, so a Transmitter has none of the three (OS-FR-1, OS-FR-3): the
  // location goes back to that Wallet's shell, and nothing of the screen renders meanwhile.
  const kindHasScreen =
    target === null || target.kind === 'online' || (route.screen === 'edit-checks' && target.kind === 'offline')
  useEffect(() => {
    if (!reachable) resetToHome()
    else if (!kindHasScreen) resetToWalletShell(route.walletId)
  }, [reachable, kindHasScreen, route.walletId])

  async function refreshWallets() {
    const fresh = await listWallets()
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
        // Same-lock edit: the minutes part is the shared handler the Local settings tab's control also uses.
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

  if (!reachable || !target || !kindHasScreen || !isKeyWallet(target)) return null
  switch (route.screen) {
    case 'edit-checks':
      return <EditChecksScreen wallet={target} onClose={leaveScreen} onEdited={handleEdited} backLabel={backLabel} />
    case 'two-device':
      return <TwoDeviceScreen wallet={target} onClose={leaveScreen} backLabel={backLabel} />
    case 'control':
      return (
        <ControlWalletScreen
          controller={target}
          wallets={wallets.filter(isKeyWallet)}
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
