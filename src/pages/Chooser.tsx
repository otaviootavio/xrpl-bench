import { useMemo } from 'react'
import { WalletCard } from '@/components/wallet/WalletCard'
import { useAppStore } from '@/store/app-store'
import { groupWalletsBySeed } from '@/store/wallet-groups'

/**
 * The chooser (FR-79, FR-81, AD-36): one card per Seed, read from `wallets` and
 * `openLocks` through the one grouping selector and nothing else. It mounts no
 * ledger hook, no `useActiveWallet`/`useActiveNetwork`/`useActiveNode`, no
 * `NetworkPlate` and no `lockInfo` read, and shows no balance. Do not add one:
 * a locked card is typed to hold a name only.
 */
export function Chooser() {
  const wallets = useAppStore((s) => s.wallets)
  const openLocks = useAppStore((s) => s.openLocks)
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const groups = useMemo(() => groupWalletsBySeed(wallets, openLocks, activeWalletId), [wallets, openLocks, activeWalletId])
  return (
    <section aria-labelledby="chooser-heading" className="mx-auto flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 id="chooser-heading" tabIndex={-1} className="font-legend text-base font-semibold uppercase leading-tight tracking-[0.08em]">
          Wallets
        </h1>
        <p className="text-sm leading-snug text-muted-foreground">Choose a wallet to open. Each one has its own lock.</p>
      </div>
      <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <WalletCard key={group.seedId} group={group} activeWalletId={activeWalletId} />
        ))}
      </ul>
    </section>
  )
}
