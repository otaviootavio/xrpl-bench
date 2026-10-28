import { useCallback, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ControlledNote } from '@/components/wallet/ControlledNote'
import { TwoDeviceSign } from '@/components/wallet/TwoDeviceSign'
import { MasterKeyControl } from '@/components/wallet/MasterKeyControl'
import { holdsMasterKey } from '@/lib/control'
import { WalletNodeSection } from '@/components/wallet/WalletNodeSection'
import { DevnetNotice } from '@/components/wallet/DevnetNotice'
import { StatusLegend } from '@/components/ui/lamp'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { AddressLink } from '@/components/wallet/AddressLink'
import { AppSettings } from '@/pages/AppSettings'
import { usePrompts } from '@/hooks/usePrompts'
import { useAppStore, useActiveNetwork } from '@/store/app-store'
import { navigate, ADD_WALLET_PATH, walletScreenPath } from '@/lib/route'
import { NETWORKS, NETWORK_IDS, type NetworkId } from '@/lib/xrpl/networks'
import { addNetworkView, listWallets, removeWallet, revealSeed, setLockAutoLock, describeCheckFailure, type WalletMeta } from '@/lib/crypto/keystore'
import { getLockInfo } from '@/lib/crypto/lock'
import { LEGACY_LOCK_ID } from '@/lib/crypto/db'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { clearCachedAccountData, tearDownLock } from '@/lib/teardown'
import { toast } from '@/lib/notify'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/** Which check the reveal will ask next, in plain words (FR-69). Mirrors
 * `keystore.revealSeed`: a sealed Wallet its Signing Check, a Passkey-Derived one
 * its passkey, a Standard one its Open Check (none: nothing more). */
function revealCheckSentence(wallet: WalletMeta | undefined): string {
  if (!wallet) return ''
  if (wallet.seedMethod === 'passkey-derived') return 'After you confirm, your passkey will be asked.'
  // The legacy lock's real check is read from the lock at reveal time, not from this meta.
  const standard = !wallet.signingCheck || wallet.signingCheck === 'standard'
  if (wallet.lockId === LEGACY_LOCK_ID && standard) {
    return "After you confirm, your passkey or App PIN will be asked, whichever this wallet's lock uses."
  }
  if (wallet.signingCheck === 'pin') return 'After you confirm, your App PIN will be asked.'
  if (wallet.signingCheck === 'passkey') return 'After you confirm, your passkey will be asked.'
  switch (wallet.openCheck) {
    case 'pin':
      return 'After you confirm, your App PIN will be asked.'
    case 'passkey':
      return 'After you confirm, your passkey will be asked.'
    case 'either':
      return 'After you confirm, your passkey will be asked, or your App PIN if this device cannot use one.'
    default:
      return 'After you confirm, nothing more will be asked and the Seed is shown.'
  }
}

/** A wallet row keeps one primary key; every other action sits in a labelled
 * group whose keys may wrap their text rather than push the row wider than a
 * 320px screen. */
const PRIMARY_ACTION = 'h-auto min-h-8 max-w-full self-start whitespace-normal py-1 pointer-coarse:min-h-11'
const ROW_ACTION = 'h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11'

export function SettingsTab() {
  // Only the fallback for a record the vault migration has not reached
  // (`listWallets`); every ledger read takes its network from its own Wallet.
  const activeNetwork = useActiveNetwork()
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const openLocks = useAppStore((s) => s.openLocks)
  const setLockMinutes = useAppStore((s) => s.setLockMinutes)
  const closeLock = useAppStore((s) => s.closeLock)
  // Settings is mounted only for an open Wallet. Its lock is the one whose
  // auto-lock this card edits (AD-21).
  const activeWallet = wallets.find((w) => w.id === activeWalletId) ?? null
  const activeLockId = activeWallet?.lockId ?? null
  const prompts = usePrompts()
  const lockInfoQuery = useQuery({
    queryKey: queryKeys.lockInfo(activeLockId ?? ''),
    queryFn: () => getLockInfo(activeLockId as string),
    enabled: activeLockId !== null,
  })
  const autoLockMinutes = lockInfoQuery.data?.autoLockMinutes ?? null
  const queryClient = useQueryClient()

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmRevealFor, setConfirmRevealFor] = useState<string | null>(null)
  // Mainnet only: adding a view of this Seed there is a step toward real funds, so it is asked once.
  // After Confirm the opener unmounts (its view now exists), so focus returns to the row's Reveal seed key instead.
  // On Cancel, Escape and Back it is null, and the Dialog recalls the opener itself.
  const networkFallbackFor = useRef<string | null>(null)
  const [confirmNetworkFor, setConfirmNetworkFor] = useState<{ walletId: string; target: NetworkId } | null>(null)

  // Guardrail #3: a decrypted seed must NEVER enter React state (state is
  // serializable and reachable from devtools). It lives in a ref for exactly
  // as long as the dialog is open; `seedVisibleFor` is only an id used to
  // drive rendering.
  const revealedSeedRef = useRef<string | null>(null)
  const [seedVisibleFor, setSeedVisibleFor] = useState<string | null>(null)
  const getRevealedSeed = useCallback(() => revealedSeedRef.current, [])

  async function refreshWallets() {
    const fresh = await listWallets(activeNetwork)
    setWallets(fresh)
    return fresh
  }

  async function handleConfirmReveal(id: string) {
    // The key of THAT Wallet's lock: opening one lock never reveals another's Seed.
    const lockId = wallets.find((w) => w.id === id)?.lockId
    const openKey = lockId ? (useAppStore.getState().openLocks[lockId]?.key ?? null) : null
    if (!openKey) {
      toast.error('Open this wallet first: its lock is closed.')
      return
    }
    try {
      const result = await revealSeed(id, { openKey, prompts })
      if (result.status !== 'ok') {
        toast.error(result.status === 'cancelled' ? 'Cancelled. The seed was not revealed.' : describeCheckFailure(result))
        return
      }
      revealedSeedRef.current = result.value
      lastRevealedFor.current = id
      setSeedVisibleFor(id)
      setConfirmRevealFor(null)
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not reveal seed.')
    }
  }

  const lastRevealedFor = useRef<string | null>(null)
  function closeSeedDialog() {
    revealedSeedRef.current = null
    setSeedVisibleFor(null)
  }

  /** "Use on another network": a second Wallet over the same Seed record, so a
   * funded address is never lost from view. Nothing new is encrypted. */
  async function handleUseOnOtherNetwork(walletId: string, target: NetworkId) {
    try {
      await addNetworkView(walletId, target)
      await refreshWallets()
      toast.success(`Wallet added on ${NETWORKS[target].label}.`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add the wallet on that network.')
    }
  }

  async function handleRemove(id: string) {
    const removedLockId = wallets.find((w) => w.id === id)?.lockId
    await removeWallet(id)
    const remaining = await refreshWallets()
    // `removeWallet` deleted a created lock with its last Wallet: close it here too.
    if (removedLockId && removedLockId !== LEGACY_LOCK_ID && !remaining.some((w) => w.lockId === removedLockId)) {
      closeLock(removedLockId)
    }
    if (activeWalletId === id) setActiveWalletId(remaining[0]?.id ?? null)
    // AD-16: the removed wallet's balances/history leave the query cache. The
    // shell (service-worker precache) stays — it never held account data.
    clearCachedAccountData(queryClient)
    setConfirmRemove(null)
    toast.success('Wallet removed from this device.')
  }

  /** Changes THIS Wallet's lock only. The policy refuses a Mainnet value under
   * the floor, and its plain reason is shown (AD-28). */
  async function handleAutoLock(minutes: number) {
    if (!activeLockId) return
    try {
      // The lock's Open Check is passed again first (FR-73): `prompts` asks for it.
      const verdict = await setLockAutoLock(activeLockId, minutes, { prompts })
      if (!verdict.ok) {
        toast.error(verdict.reason)
        return
      }
      setLockMinutes(activeLockId, minutes)
      await lockInfoQuery.refetch()
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not change the auto-lock.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <CardTitle>Wallets</CardTitle>
            <CardDescription>Switch, add, or remove wallets on this device.</CardDescription>
          </div>
          <Button onClick={() => navigate(ADD_WALLET_PATH)}>Add wallet</Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {wallets.map((w) => (
            <div key={w.id} className="panel-plate flex min-w-0 flex-col gap-2 rounded-md p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-legend text-sm font-semibold">{w.label}</span>
                  {w.id === activeWalletId && (
                    <StatusLegend tone="live">Active</StatusLegend>
                  )}
                </div>
                {/* A locked Wallet is its name and nothing else (AD-26): no
                    address, network or Node until its own lock is open. */}
                {w.lockId in openLocks ? (
                  <>
                    <AddressLink address={w.address} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Network: {NETWORKS[w.network].label}
                      {w.network === 'mainnet' && ' — real funds'}
                    </p>
                    {w.network === 'devnet' && <DevnetNotice network={w.network} />}
                    <ControlledNote wallet={w} />
                    <MasterKeyControl wallet={w} />
                    <TwoDeviceSign wallet={w} />
                    <WalletNodeSection wallet={w} />
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Locked. Switch to this wallet to unlock it.</p>
                )}
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2">
                {w.id !== activeWalletId && (
                  <Button size="sm" className={PRIMARY_ACTION} aria-label={`Use this wallet: ${w.label}`} onClick={() => setActiveWalletId(w.id)}>
                    Use this wallet
                  </Button>
                )}
                {w.lockId in openLocks && (
                  <div role="group" aria-label={`More actions for ${w.label}`} className="flex min-w-0 flex-wrap gap-2">
                    {NETWORK_IDS.filter((n) => !wallets.some((o) => o.seedId === w.seedId && o.network === n)).map((n) => (
                      <Button
                        key={n}
                        variant="outline"
                        size="sm"
                        className={ROW_ACTION}
                        aria-label={`Use ${w.label} on ${NETWORKS[n].label}`}
                        onClick={() => (n === 'mainnet' ? (networkFallbackFor.current = null, setConfirmNetworkFor({ walletId: w.id, target: n })) : void handleUseOnOtherNetwork(w.id, n))}
                      >
                        Use on {NETWORKS[n].label}
                      </Button>
                    ))}
                    <Button variant="outline" size="sm" className={ROW_ACTION} aria-label={`Edit checks for ${w.label}`} onClick={() => navigate(walletScreenPath('edit-checks', w.id))}>
                      Edit checks
                    </Button>
                    {holdsMasterKey(w) && (
                      <Button variant="outline" size="sm" className={ROW_ACTION} aria-label={`Let another wallet sign for ${w.label}`} onClick={() => navigate(walletScreenPath('control', w.id))}>
                        Let another wallet sign
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className={ROW_ACTION} aria-label={`Reveal seed of ${w.label}`} data-reveal-seed={w.id} onClick={() => setConfirmRevealFor(w.id)}>
                      Reveal seed
                    </Button>
                    {/* Removing destroys the Seed, so it needs the Wallet's own lock open. */}
                    <Button variant="danger" size="sm" className={ROW_ACTION} aria-label={`Remove ${w.label}`} onClick={() => setConfirmRemove(w.id)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="autolock">Auto-lock after inactivity</Label>
            <Select value={autoLockMinutes === null ? undefined : String(autoLockMinutes)} onValueChange={(v) => void handleAutoLock(Number(v))} disabled={autoLockMinutes === null}>
              <SelectTrigger className="w-32" id="autolock">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 minute</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* An action, not a setting — a Switch that never changes state is a
              broken affordance for keyboard and screen-reader users (#9). A lock
              with no Open Check opens itself again at once, so closing it does
              nothing: no button, as the header has none (AD-26). */}
          {activeWallet?.openCheck !== 'none' && (
            <>
              <Separator />
              <Button variant="outline" className="w-fit" onClick={() => activeLockId && tearDownLock(queryClient, activeLockId)}>
                Lock now
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <AppSettings />

      <Dialog open={!!confirmRevealFor} onOpenChange={(o) => !o && setConfirmRevealFor(null)}>
        <DialogContent dismissOnOutsidePress>
          <DialogHeader>
            <DialogTitle>Reveal this wallet's seed?</DialogTitle>
            <DialogDescription>
              Your seed grants full control of this wallet's funds to anyone who sees it. Make sure nobody can see your screen and
              that you are not being recorded before continuing.{' '}
              {revealCheckSentence(wallets.find((w) => w.id === confirmRevealFor))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevealFor(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirmRevealFor && handleConfirmReveal(confirmRevealFor)}>
              Show my seed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!seedVisibleFor} onOpenChange={(o) => !o && closeSeedDialog()}>
        <DialogContent
          dismissOnOutsidePress
          returnFocusTo={() => document.querySelector<HTMLElement>(`[data-reveal-seed="${lastRevealedFor.current}"]`)}
        >
          <DialogHeader>
            <DialogTitle>Wallet seed</DialogTitle>
          </DialogHeader>
          {seedVisibleFor && <SeedReveal getSeed={getRevealedSeed} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmNetworkFor} onOpenChange={(o) => !o && setConfirmNetworkFor(null)}>
        <DialogContent
          dismissOnOutsidePress
          returnFocusTo={() =>
            networkFallbackFor.current ? document.querySelector<HTMLElement>(`[data-reveal-seed="${networkFallbackFor.current}"]`) : null
          }
        >
          <DialogHeader>
            <DialogTitle>
              Use {wallets.find((w) => w.id === confirmNetworkFor?.walletId)?.label ?? 'this wallet'} on Mainnet?
            </DialogTitle>
            <DialogDescription>
              Mainnet moves real funds. This adds the same key as a wallet on Mainnet; nothing is sent. Anything sent to this address
              there is real XRP.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmNetworkFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pending = confirmNetworkFor
                networkFallbackFor.current = pending?.walletId ?? null
                setConfirmNetworkFor(null)
                if (pending) void handleUseOnOtherNetwork(pending.walletId, pending.target)
              }}
            >
              Use on Mainnet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent dismissOnOutsidePress>
          <DialogHeader>
            <DialogTitle>Remove this wallet?</DialogTitle>
            <DialogDescription>
              {confirmRemove && wallets.filter((o) => o.seedId === wallets.find((x) => x.id === confirmRemove)?.seedId).length > 1
                ? 'This removes only this one wallet. The encrypted seed stays, because the same key is still set up as another wallet on this device. '
                : 'This app will no longer hold the encrypted seed for this wallet. '}
              Make sure you have your own backup — this cannot be
              undone from within the app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirmRemove && handleRemove(confirmRemove)}>
              Remove wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
