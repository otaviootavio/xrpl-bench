import { ArrowLeftIcon, LockIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Lamp } from '@/components/ui/lamp'
import { useActiveWallet, useWalletIsOpen } from '@/store/app-store'
import { NetworkPlate } from '@/components/wallet/NetworkPlate'
import { useLeaveBlocked } from '@/hooks/useRoute'
import { useUpdateMarker } from '@/hooks/useUpdateMarker'
import { leaveToChooser } from '@/lib/route'
import { tearDownLock } from '@/lib/teardown'

/**
 * The wallet header (AD-45): the chassis nameplate, the Wallets key back to the
 * chooser (marked when an update waits, never an Install control), and — only for an open lock — the network and the Lock key. A locked
 * wallet's header is the nameplate and the Wallets key alone. There is no wallet
 * picker: switching is the Wallets key, then Open (docs/decisions.md §6.12).
 *
 * Below `sm` the controls take their own row rather than compressing (§6.12).
 * The Wallets key never closes a lock; Lock goes through the teardown owner and
 * then leaves, so Back does not return to a wallet just locked.
 */
export function AppHeader() {
  const queryClient = useQueryClient()
  const wallet = useActiveWallet()
  const open = useWalletIsOpen(wallet?.id)
  const blocked = useLeaveBlocked()
  const marked = useUpdateMarker()

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-background px-4 py-2.5">
      {/* Global cluster: the product and the way out to every wallet. It is the same on every screen. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-none sm:justify-start sm:gap-x-4">
        {/* The maker's mark, not the document heading: it never changes, so as
            an <h1> it made all six tabs report the same outline (§6.4). The
            screen's own <h1> lives in the active panel. */}
        <span className="panel-legend text-[0.75rem] tracking-[0.22em] text-foreground">XRPL Bench</span>
        <div className="flex flex-col items-start gap-1">
          {/* aria-disabled, not disabled: the key stays focusable so the reason is reachable. */}
          <Button
            variant="outline"
            aria-disabled={blocked || undefined}
            aria-describedby={blocked ? 'wallets-key-reason' : undefined}
            className="h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            onClick={() => {
              if (blocked) return
              leaveToChooser()
            }}
          >
            <ArrowLeftIcon aria-hidden="true" />
            {marked ? 'Wallets, update available' : 'Wallets'}
            {marked && <Lamp tone="caution" className="ml-1" />}
          </Button>
          {blocked && (
            <p id="wallets-key-reason" className="text-xs leading-snug text-muted-foreground">
              Finish or cancel what is running first.
            </p>
          )}
        </div>
      </div>
      {wallet && open && (
        // This wallet's cluster: its Network and its Lock. A hairline sets it apart from the global cluster
        // (a rule above it below `sm`, a rule beside it from `sm`), and it reads as the wallet's, not the app's.
        <div className="flex w-full min-w-0 items-center justify-between gap-2 border-t border-border pt-2 sm:w-auto sm:justify-end sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <NetworkPlate />
          {/* Closes THIS Wallet's lock only (AD-26). A lock with no Open Check
              has nothing to lock. */}
          {wallet.openCheck !== 'none' && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Lock wallet"
              // While a screen blocks leaving (a write or a Seed backup is running) Lock waits too:
              // closing the lock here would strand the user on the Unlock view mid-task. The reason
              // is the one shown beside the Wallets key.
              aria-disabled={blocked || undefined}
              aria-describedby={blocked ? 'wallets-key-reason' : undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              onClick={() => {
                if (blocked) return
                tearDownLock(queryClient, wallet.lockId)
                leaveToChooser()
              }}
            >
              <LockIcon className="size-4" />
            </Button>
          )}
        </div>
      )}
    </header>
  )
}
