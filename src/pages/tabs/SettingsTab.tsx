import { useCallback, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NetworkSelector } from '@/components/wallet/NetworkSelector'
import { StatusLegend } from '@/components/ui/lamp'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ExternalLinkIcon } from 'lucide-react'
import { BUILD, shortSha, sourceUrl, formatBuiltAt } from '@/lib/build-info'
import { useAppUpdate } from '@/hooks/useAppUpdate'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { AddressLink } from '@/components/wallet/AddressLink'
import { useAppStore } from '@/store/app-store'
import { counterpartyKey, tagNotRecorded } from '@/store/address-book'
import { NETWORKS } from '@/lib/xrpl/networks'
import { addressFromSeed, generateAndStoreWallet, importAndStoreWallet, listWallets, parseSeedInput, removeWallet, revealSeed } from '@/lib/crypto/keystore'
import { RESET_INCOMPLETE_MESSAGE, tearDownAllLocalState, clearCachedAccountData } from '@/lib/teardown'
import { checkBeforeImport, IMPORT_WARNING_COPY, INVALID_SEED_MESSAGE, type ImportWarning } from '@/lib/seed-import'
import { toast } from '@/lib/notify'
import { useQueryClient } from '@tanstack/react-query'

export function SettingsTab() {
  const network = useAppStore((s) => s.network)
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const autoLockMinutes = useAppStore((s) => s.autoLockMinutes)
  const setAutoLockMinutes = useAppStore((s) => s.setAutoLockMinutes)
  const addressBook = useAppStore((s) => s.addressBook)
  const vaultKey = useAppStore((s) => s.vaultKey)
  const lock = useAppStore((s) => s.lock)
  const { updateReady, applying, applyUpdate, checking, checkError, checkForUpdate, pendingRelease, blockedReason, declined, declineCurrent } =
    useAppUpdate()
  const queryClient = useQueryClient()

  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'generate' | 'import'>('generate')
  const [label, setLabel] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const [confirmRevealFor, setConfirmRevealFor] = useState<string | null>(null)
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null)
  const [busy, setBusy] = useState(false)

  // Guardrail #3: a decrypted seed must NEVER enter React state (state is
  // serializable and reachable from devtools). It lives in a ref for exactly
  // as long as the dialog is open; `seedVisibleFor` is only an id used to
  // drive rendering.
  const revealedSeedRef = useRef<string | null>(null)
  const [seedVisibleFor, setSeedVisibleFor] = useState<string | null>(null)
  // Uncontrolled: a controlled input would put the typed seed into React
  // state on every keystroke (guardrail #3).
  const seedInputRef = useRef<HTMLInputElement | null>(null)
  // The parsed Seed while the master-key warning is open. The Add dialog — and
  // the input inside it — closes when the warning opens, so the value has to
  // be held somewhere that outlives the input: a ref, never state.
  const pendingImportSeedRef = useRef<string | null>(null)
  const getRevealedSeed = useCallback(() => revealedSeedRef.current, [])

  async function refreshWallets() {
    setWallets(await listWallets())
  }

  /** The vault write for an import, and everything that follows a completed
   * add. Reached only after the pre-flight check: directly when it found
   * nothing to warn about, or from "Import anyway". */
  async function storeImported(seed: string, key: CryptoKey) {
    const meta = await importAndStoreWallet(label || 'Wallet', seed, key)
    await refreshWallets()
    setActiveWalletId(meta.id)
    finishAdd()
  }

  function finishAdd() {
    pendingImportSeedRef.current = null
    toast.success('Wallet added.')
    setAddOpen(false)
    setLabel('')
    if (seedInputRef.current) seedInputRef.current.value = ''
  }

  async function handleAddWallet() {
    if (!vaultKey || busy) return
    if (addMode === 'generate') {
      setBusy(true)
      try {
        const { meta } = await generateAndStoreWallet(label || 'Wallet', vaultKey)
        await refreshWallets()
        setActiveWalletId(meta.id)
        finishAdd()
      } catch (err: any) {
        toast.error(err?.message ?? 'Could not add wallet.')
      } finally {
        setBusy(false)
      }
      return
    }

    // Import. The same operation as Onboarding's (lib/seed-import.ts): parse,
    // check, and only then write — docs/decisions.md §2 states the
    // disabled-master-key check for import unconditionally, so it must not be
    // limited to the onboarding path, and it must come before the vault write
    // here too, not after it.
    const seed = parseSeedInput(seedInputRef.current?.value ?? '')
    if (!seed) {
      toast.error(INVALID_SEED_MESSAGE)
      return
    }
    setBusy(true)
    try {
      const warning = await checkBeforeImport(queryClient, network, addressFromSeed(seed))
      if (warning) {
        pendingImportSeedRef.current = seed
        setAddOpen(false)
        setImportWarning(warning)
        return
      }
      await storeImported(seed, vaultKey)
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add wallet.')
    } finally {
      setBusy(false)
    }
  }

  /** "Import anyway": the operator has read the warning and chosen to go on. */
  async function acceptImportWarning() {
    const seed = pendingImportSeedRef.current
    if (!vaultKey || !seed || busy) return
    setBusy(true)
    try {
      await storeImported(seed, vaultKey)
      setImportWarning(null)
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add wallet.')
    } finally {
      setBusy(false)
    }
  }

  /** Cancel, Escape, the overlay and the close button all land here: the
   * import is abandoned and nothing is written. */
  function cancelImportWarning() {
    pendingImportSeedRef.current = null
    setImportWarning(null)
    setLabel('')
  }

  async function handleConfirmReveal(id: string) {
    if (!vaultKey) return
    try {
      revealedSeedRef.current = await revealSeed(id, vaultKey)
      setSeedVisibleFor(id)
      setConfirmRevealFor(null)
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not reveal seed.')
    }
  }

  function closeSeedDialog() {
    revealedSeedRef.current = null
    setSeedVisibleFor(null)
  }

  async function handleRemove(id: string) {
    await removeWallet(id)
    await refreshWallets()
    if (activeWalletId === id) {
      const remaining = await listWallets()
      setActiveWalletId(remaining[0]?.id ?? null)
    }
    // AD-16: the removed wallet's balances/history leave the query cache. The
    // shell (service-worker precache) stays — it never held account data.
    clearCachedAccountData(queryClient)
    setConfirmRemove(null)
    toast.success('Wallet removed from this device.')
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
      lock()
    }
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Network</CardTitle>
          <CardDescription>Mainnet uses real funds. Testnet is for trying the wallet safely.</CardDescription>
        </CardHeader>
        <CardContent>
          <NetworkSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <CardTitle>Wallets</CardTitle>
            <CardDescription>Switch, add, or remove wallets on this device.</CardDescription>
          </div>
          {/* Not closable while a check or a write is running: closing reads as
              "stop", and the write would still land behind it. */}
          <Dialog open={addOpen} onOpenChange={(o) => !busy && setAddOpen(o)}>
            <DialogTrigger asChild>
              <Button>Add wallet</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add another wallet</DialogTitle>
                <DialogDescription>Generate a new wallet or import one with a seed.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="wlabel">Label</Label>
                  <Input id="wlabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Savings" disabled={busy} />
                </div>
                {/* Frozen with the dialog while a check or a write runs: switching
                    to Generate mid-import would show one path while the other lands. */}
                <div className="flex gap-2">
                  <Button variant={addMode === 'generate' ? 'default' : 'outline'} onClick={() => setAddMode('generate')} type="button" disabled={busy}>
                    Generate
                  </Button>
                  <Button variant={addMode === 'import' ? 'default' : 'outline'} onClick={() => setAddMode('import')} type="button" disabled={busy}>
                    Import
                  </Button>
                </div>
                {addMode === 'import' && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="wseed">Seed</Label>
                    <Input id="wseed" type="password" autoComplete="off" spellCheck={false} ref={seedInputRef} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleAddWallet} disabled={busy}>
                  {busy ? (addMode === 'import' ? 'Checking…' : 'Adding…') : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {wallets.map((w) => (
            <div key={w.id} className="panel-plate flex flex-wrap items-center justify-between gap-2 rounded-md p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-legend text-sm font-semibold">{w.label}</span>
                  {w.id === activeWalletId && (
                    <StatusLegend tone="live">Active</StatusLegend>
                  )}
                </div>
                <AddressLink address={w.address} />
              </div>
              <div className="flex flex-wrap gap-2">
                {w.id !== activeWalletId && (
                  <Button variant="outline" size="sm" onClick={() => setActiveWalletId(w.id)}>
                    Use this wallet
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setConfirmRevealFor(w.id)}>
                  Reveal seed
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmRemove(w.id)}>
                  Remove
                </Button>
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
            <Select value={String(autoLockMinutes)} onValueChange={(v) => setAutoLockMinutes(Number(v))}>
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
              broken affordance for keyboard and screen-reader users (#9). */}
          <Button variant="outline" className="w-fit" onClick={() => lock()}>
            Lock now
          </Button>
          <Separator />
          <Button variant="danger" className="w-fit" onClick={() => setConfirmResetAll(true)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reveal this wallet's seed?</DialogTitle>
            <DialogDescription>
              Your seed grants full control of this wallet's funds to anyone who sees it. Make sure nobody can see your screen and
              that you are not being recorded before continuing.
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet seed</DialogTitle>
          </DialogHeader>
          {seedVisibleFor && <SeedReveal getSeed={getRevealedSeed} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!importWarning} onOpenChange={(o) => !o && !busy && cancelImportWarning()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Heads up</DialogTitle>
            <DialogDescription>Check this before the seed is saved to this device.</DialogDescription>
          </DialogHeader>
          {importWarning && (
            <Alert variant="warning">
              <AlertTitle>{IMPORT_WARNING_COPY[importWarning].title}</AlertTitle>
              <AlertDescription>{IMPORT_WARNING_COPY[importWarning].body}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancelImportWarning} disabled={busy}>
              Cancel import
            </Button>
            <Button onClick={acceptImportWarning} disabled={busy}>
              {busy ? 'Importing…' : 'Import anyway'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this wallet?</DialogTitle>
            <DialogDescription>
              This app will no longer hold the encrypted seed for this wallet. Make sure you have your own backup — this cannot be
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
        <DialogContent>
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
