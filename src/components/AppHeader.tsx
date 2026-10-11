import { LockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import { NetworkPlate } from '@/components/wallet/NetworkPlate'
import { NETWORKS } from '@/lib/xrpl/networks'

/**
 * The chassis nameplate, the Wallet picker and the active Wallet's network.
 *
 * Below `sm` the controls take their own row rather than compressing: with a
 * second wallet present the row is title + 160px + 112px + 36px, which does not
 * fit 320px, and the selects were previously crushed together with the lock key
 * clipped off the right edge (docs/decisions.md §6.12).
 */
export function AppHeader() {
  const wallets = useAppStore((s) => s.wallets)
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const wallet = useActiveWallet()
  const lock = useAppStore((s) => s.lock)

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-background px-4 py-2.5">
      <div className="flex shrink-0 items-center gap-2.5">
        {/* The nameplate: engraved into the chassis, not set as a display
            heading. On a panel the maker's mark is the smallest thing on it. */}
        {/* The maker's mark, not the document heading: it never changes, so as
            an <h1> it made all six tabs report the same outline (§6.4). The
            screen's own <h1> lives in the active panel. */}
        <span className="panel-legend text-[0.75rem] tracking-[0.22em] text-foreground">XRPL Bench</span>
      </div>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        {wallets.length > 1 && (
          <Select value={activeWalletId ?? undefined} onValueChange={setActiveWalletId}>
            <SelectTrigger className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="Active wallet">
              <SelectValue placeholder="Wallet" />
            </SelectTrigger>
            <SelectContent>
              {wallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.label} · {NETWORKS[w.network].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <NetworkPlate />
        {wallet && (
          <Button variant="outline" size="icon" onClick={lock} aria-label="Lock wallet">
            <LockIcon className="size-4" />
          </Button>
        )}
      </div>
    </header>
  )
}
