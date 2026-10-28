import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfigPlate } from '@/components/wallet/ConfigPlate'
import { addNetworkView, listWallets, type WalletMeta } from '@/lib/crypto/keystore'
import { toast } from '@/lib/notify'
import { NETWORKS, NETWORK_IDS, type NetworkId } from '@/lib/xrpl/networks'
import { useActiveNetwork, useAppStore } from '@/store/app-store'

const KEY = 'h-auto min-h-8 w-fit max-w-full whitespace-normal py-1 pointer-coarse:min-h-11'
const PLATE_ID = 'other-networks'
const MAINNET_KEY = 'use-on-mainnet'

/**
 * "Use on another network" for one Wallet (FR-61): a second Wallet over the same Seed
 * record, so nothing new is encrypted. One key per network the Seed has no view on;
 * Mainnet asks first because it is a step toward real funds. The new view is a
 * sibling: the store's `wallets` is refreshed and the selection does not change.
 */
export function OtherNetworksPlate({ wallet }: { wallet: WalletMeta }) {
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const activeNetwork = useActiveNetwork()
  const [confirming, setConfirming] = useState(false)
  // One add at a time: a second press while the first is in flight would add the view twice.
  const [busy, setBusy] = useState(false)
  // After Confirm the opener unmounts (its view now exists): focus then falls to the plate.
  const confirmedRef = useRef(false)

  const missing = NETWORK_IDS.filter((n) => !wallets.some((o) => o.seedId === wallet.seedId && o.network === n))

  async function add(target: NetworkId) {
    if (busy) return
    setBusy(true)
    let added = false
    try {
      await addNetworkView(wallet.id, target)
      added = true
      setWallets(await listWallets(activeNetwork))
      toast.success(`Wallet added on ${NETWORKS[target].label}.`)
    } catch (err: unknown) {
      // A view that was added but could not be listed is not an add that failed.
      toast.error(
        added
          ? `The wallet was added on ${NETWORKS[target].label}, but the list could not be refreshed. Reopen this screen to see it.`
          : err instanceof Error && err.message
            ? err.message
            : 'Could not add the wallet on that network.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfigPlate title="Other networks" focusId={PLATE_ID}>
      {missing.length === 0 ? (
        <p className="text-sm text-muted-foreground">This key is already set up on every network.</p>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-2">
          {missing.map((n) => (
            <Button
              key={n}
              variant="outline"
              size="sm"
              className={KEY}
              data-configure-key={n === 'mainnet' ? MAINNET_KEY : undefined}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (busy) return
                if (n === 'mainnet') {
                  confirmedRef.current = false
                  setConfirming(true)
                } else void add(n)
              }}
            >
              Use on {NETWORKS[n].label}
            </Button>
          ))}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(o) => !o && !busy && setConfirming(false)}>
        <DialogContent
          dismissOnOutsidePress
          returnFocusTo={() => {
            if (!confirmedRef.current) return null
            return (
              document.querySelector<HTMLElement>(`[data-configure-key="${MAINNET_KEY}"]`) ??
              document.querySelector<HTMLElement>(`[data-configure-plate="${PLATE_ID}"]`)
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Use {wallet.label} on Mainnet?</DialogTitle>
            <DialogDescription>
              Mainnet moves real funds. This adds the same key as a wallet on Mainnet; nothing is sent. Anything sent to this address
              there is real XRP.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                // The dialog closes once the add has settled, so focus is placed knowing whether the opener still exists.
                await add('mainnet')
                confirmedRef.current = true
                setConfirming(false)
              }}
            >
              Use on Mainnet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfigPlate>
  )
}
