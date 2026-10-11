import { Badge } from '@/components/ui/badge'
import { NETWORKS } from '@/lib/xrpl/networks'
import { useActiveNetwork, useActiveWallet, useWalletIsOpen } from '@/store/app-store'
import { cn } from '@/lib/utils'

/**
 * The active Wallet's network, in words (AD-19). Read-only: the network is a
 * property of the Wallet, set when it is created, not an app-wide switch. On
 * Mainnet the funds are real, and that is said beside the name — never by
 * colour alone. `warning`, not `destructive`: Mainnet is the normal production
 * network, not a dangerous one (docs/decisions.md §6.7). With no active Wallet
 * there is no network to name, and with a locked one it is withheld, so nothing
 * is shown.
 */
export function NetworkPlate({ className }: { className?: string }) {
  const wallet = useActiveWallet()
  const network = useActiveNetwork()
  const open = useWalletIsOpen(wallet?.id)
  // A locked Wallet shows no network-derived data (AD-26).
  if (!wallet || !open) return null
  return (
    <div className={cn('inline-flex shrink-0 items-center gap-2', className)}>
      <span className="font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-foreground">
        <span className="sr-only">Network: </span>
        {NETWORKS[network].label}
      </span>
      {network === 'mainnet' && <Badge variant="warning">Real funds</Badge>}
    </div>
  )
}
