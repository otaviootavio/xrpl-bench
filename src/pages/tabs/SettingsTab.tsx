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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ExternalLinkIcon } from 'lucide-react'
import { BUILD, shortSha, sourceUrl, formatBuiltAt } from '@/lib/build-info'
import { useAppUpdate } from '@/hooks/useAppUpdate'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { AddressLink } from '@/components/wallet/AddressLink'
import { usePrompts } from '@/hooks/usePrompts'
import { useAppStore, useActiveNetwork } from '@/store/app-store'
import { navigate, ADD_WALLET_PATH, walletScreenPath } from '@/lib/route'
import { counterpartyKey, tagNotRecorded } from '@/store/address-book'
import { NETWORKS, NETWORK_IDS, type NetworkId } from '@/lib/xrpl/networks'
import { addNetworkView, listWallets, removeWallet, revealSeed, setLockAutoLock, describeCheckFailure, type WalletMeta } from '@/lib/crypto/keystore'
import { getLockInfo } from '@/lib/crypto/lock'
import { LEGACY_LOCK_ID } from '@/lib/crypto/db'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { RESET_INCOMPLETE_MESSAGE, tearDownAllLocalState, clearCachedAccountData, tearDownLock } from '@/lib/teardown'
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
      return 'After you confirm, the Seed is shown with no further prompt.'
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
  const addressBook = useAppStore((s) => s.addressBook)
  const openLocks = useAppStore((s) => s.openLocks)
  const setLockMinutes = useAppStore((s) => s.setLockMinutes)
  const closeAllLocks = useAppStore((s) => s.closeAllLocks)
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
  const { updateReady, applying, applyUpdate, checking, checkError, checkForUpdate, pendingRelease, blockedReason, declined, declineCurrent } =
    useAppUpdate()
  const queryClient = useQueryClient()

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmResetAll, setConfirmResetAll] = useState(false)
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

  async function handleFullReset() {
    // `tearDownAllLocalState` owns the whole clear set (AD-16), including the
    // persisted app store — wallets, Address Book, auto-lock and declined
    // updates — so no field is cleared here.
    try {
      await tearDownAllLocalState(queryClient)
    } catch {
      // Do not reload as though the device were clean when it is not.
      toast.error(RESET_INCOMPLETE_MESSAGE)
      return
    } finally {
      closeAllLocks()
    }
    window.location.reload()
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
          <CardTitle>Address book</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {addressBook.length === 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">No saved addresses yet</p>
              <p className="text-sm text-muted-foreground">
                Addresses you send to are saved here automatically, so the wallet can warn you the first time you send
                somewhere new.
              </p>
            </div>
          )}
          {/* One row per counterparty — the (network, address, tag) triple,
              keyed by the same identity that decides it (AD-6). Every
              network's entries are listed, each under its own "Network"
              legend, and its explorer link goes to that network. The address
              renders once, in full, through AddressLink; a label only when a
              human gave one. The tag carries its own text legend, so it is
              told apart from the address by words, not colour (NFR-6). An
              entry saved before networks were recorded says so in words for
              both its network and its tag: it may stand for a payment made
              with a tag that was never stored. */}
          {addressBook.map((e) => (
            <dl key={counterpartyKey(e)} className="panel-plate flex min-w-0 flex-col gap-1.5 rounded-md p-2">
              {e.label !== undefined && (
                <div className="min-w-0">
                  <dt className="panel-legend">Label</dt>
                  <dd className="mt-0.5 text-sm break-words">{e.label}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dt className="panel-legend">Network</dt>
                <dd className="mt-0.5 text-sm">{e.network !== undefined ? NETWORKS[e.network].label : 'Not recorded'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="panel-legend">Address</dt>
                <dd className="mt-0.5 min-w-0">
                  <AddressLink address={e.address} network={e.network} truncate={false} />
                </dd>
              </div>
              {e.destinationTag !== undefined && (
                <div className="min-w-0">
                  <dt className="panel-legend">Destination tag</dt>
                  <dd className="mt-0.5 font-data text-sm tracking-tight break-all">{e.destinationTag}</dd>
                </div>
              )}
              {tagNotRecorded(e) && (
                <div className="min-w-0">
                  <dt className="panel-legend">Destination tag</dt>
                  <dd className="mt-0.5 text-sm">Not recorded</dd>
                </div>
              )}
            </dl>
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
          <Separator />
          {/* An action, not a setting — a Switch that never changes state is a
              broken affordance for keyboard and screen-reader users (#9). A lock
              with no Open Check opens itself again at once, so closing it does
              nothing: no button, as the header has none (AD-26). */}
          {activeWallet?.openCheck !== 'none' && (
            <>
              <Button variant="outline" className="w-fit" onClick={() => activeLockId && tearDownLock(queryClient, activeLockId)}>
                Lock now
              </Button>
              <Separator />
            </>
          )}
          <Button variant="danger" className="h-auto min-h-9 w-fit max-w-full whitespace-normal py-2 text-left pointer-coarse:min-h-11" onClick={() => setConfirmResetAll(true)}>
            Remove all wallets from this device
          </Button>
        </CardContent>
      </Card>

      {/* Which build is running, and the only control that changes it.
          app-versioning-and-updates.md US-1 / US-2 / US-3 / US-4 / US-5 / US-6 / US-8. */}
      <Card>
        <CardHeader>
          <CardTitle>Version</CardTitle>
          <CardDescription>
            This wallet never updates itself. A new version waits until you install it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="panel-legend">Version</dt>
              <dd className="font-data text-sm tracking-tight">{BUILD.version}</dd>
            </div>
            <div className="min-w-0">
              <dt className="panel-legend">Commit</dt>
              <dd className="mt-0.5">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-data text-sm tracking-tight hover:underline"
                >
                  {shortSha}
                  <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                </a>
              </dd>
            </div>
            <div>
              <dt className="panel-legend">Built</dt>
              <dd className="font-data text-sm tracking-tight">{formatBuiltAt()}</dd>
            </div>
          </dl>

          {/* US-2: an explicit on-demand check, distinct from the automatic
              one the service worker already runs on registration. */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void checkForUpdate()} disabled={checking}>
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
            {checkError && (
              <span className="text-xs text-text-warning">Could not check — you may be offline.</span>
            )}
          </div>

          {updateReady && !declined ? (
            /* V4: a major or security-marked release warns harder; minor/patch
               stay quiet. Unknown (manifest unreachable) falls back to the
               louder treatment, since understating a security fix is worse
               than overstating an ordinary one. */
            <Alert variant={pendingRelease && !pendingRelease.security && pendingRelease.bump !== 'major' ? 'default' : 'warning'}>
              <AlertTitle>{pendingRelease?.security ? 'Security update available' : 'Update available'}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>
                  A new version has downloaded and is waiting
                  {pendingRelease ? ` (v${pendingRelease.version}, released ${new Date(pendingRelease.releasedAt).toLocaleDateString()})` : ''}.
                  Installing it reloads the app onto the new version; anything you have typed and not
                  submitted is lost. Your wallets and keys are untouched.
                </span>
                {pendingRelease && (
                  <div className="flex flex-wrap gap-3">
                    <a href={pendingRelease.notes} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm hover:underline">
                      What changed <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                    </a>
                    {/* US-7: the wallet never claims to verify itself — this
                        only links to instructions a third party can follow. */}
                    <a href={pendingRelease.verify} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm hover:underline">
                      How to verify this build <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                    </a>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void applyUpdate()}
                    disabled={applying || !!blockedReason}
                    aria-disabled={!!blockedReason}
                  >
                    {applying ? 'Installing…' : 'Install update'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={declineCurrent} disabled={applying}>
                    Not now
                  </Button>
                </div>
                {/* Never hidden — a disabled control states its reason in
                    visible text (docs/decisions.md §6.4). */}
                {blockedReason && <span className="text-xs text-text-warning">{blockedReason}</span>}
              </AlertDescription>
            </Alert>
          ) : updateReady && declined ? (
            // US-4: declined, so it stops nagging with a full alert — but
            // stays reachable, not hidden.
            <p className="text-xs leading-snug text-muted-foreground">
              An update is available but was dismissed.{' '}
              <button type="button" onClick={() => void applyUpdate()} disabled={applying || !!blockedReason} className="underline hover:no-underline">
                Install it
              </button>
              {blockedReason ? ` (${blockedReason})` : ''}
            </p>
          ) : (
            <p className="text-xs leading-snug text-muted-foreground">
              You are on the newest version this device has downloaded.
            </p>
          )}

          {/* US-8: recovery never mentions clearing site data — that destroys
              the encrypted vault. */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-legend uppercase tracking-[0.08em]">
              Trouble after an update?
            </summary>
            <p className="mt-1.5 leading-snug">
              Reload the page first. If the app still won't start, reinstall it from your home screen or
              browser. As a last resort, you can re-import this wallet from your seed on a clean install —
              your wallets and keys are never affected by an update. Never clear this site's storage or
              browsing data to fix an update problem: that erases the encrypted seed stored on this device
              and cannot be undone without your own backup.
            </p>
          </details>
        </CardContent>
      </Card>

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

      <Dialog open={confirmResetAll} onOpenChange={setConfirmResetAll}>
        <DialogContent dismissOnOutsidePress>
          <DialogHeader>
            <DialogTitle>Remove all wallets from this device?</DialogTitle>
            <DialogDescription>
              This erases every wallet stored here, including their encrypted seeds, along with the address book and settings,
              and clears all cached balance and history data. Any wallet you have not backed up elsewhere will be permanently
              lost — this cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResetAll(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleFullReset}>
              Erase everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
