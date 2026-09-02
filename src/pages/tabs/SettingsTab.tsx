import { useCallback, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NetworkSelector } from '@/components/wallet/NetworkSelector'
import { Lamp } from '@/components/ui/lamp'
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
import { generateAndStoreWallet, importAndStoreWallet, listWallets, removeWallet, revealSeed } from '@/lib/crypto/keystore'
import { tearDownAllLocalState, clearCachedAccountData } from '@/lib/teardown'
import { fetchAccountStateOnce } from '@/lib/xrpl/query-reads'
import { Wallet } from 'xrpl'
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
  const { updateReady, applying, applyUpdate } = useAppUpdate()
  const queryClient = useQueryClient()

  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'generate' | 'import'>('generate')
  const [label, setLabel] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const [confirmRevealFor, setConfirmRevealFor] = useState<string | null>(null)
  const [importWarning, setImportWarning] = useState<string | null>(null)

  // Guardrail #3: a decrypted seed must NEVER enter React state (state is
  // serializable and reachable from devtools). It lives in a ref for exactly
  // as long as the dialog is open; `seedVisibleFor` is only an id used to
  // drive rendering.
  const revealedSeedRef = useRef<string | null>(null)
  const [seedVisibleFor, setSeedVisibleFor] = useState<string | null>(null)
  // Uncontrolled: a controlled input would put the typed seed into React
  // state on every keystroke (guardrail #3).
  const seedInputRef = useRef<HTMLInputElement | null>(null)
  const getRevealedSeed = useCallback(() => revealedSeedRef.current, [])

  async function refreshWallets() {
    setWallets(await listWallets())
  }

  async function handleAddWallet() {
    if (!vaultKey) return
    try {
      if (addMode === 'generate') {
        const { meta } = await generateAndStoreWallet(label || 'Wallet', vaultKey)
        await refreshWallets()
        setActiveWalletId(meta.id)
      } else {
        // docs/decisions.md §2 states the disabled-master-key check for import
        // unconditionally — it must not be limited to the onboarding path.
        const seedInput = seedInputRef.current?.value ?? ''
        const probe = Wallet.fromSeed(seedInput)
        const state = await fetchAccountStateOnce(queryClient, network, probe.address)
        const meta = await importAndStoreWallet(label || 'Wallet', seedInput, vaultKey)
        await refreshWallets()
        setActiveWalletId(meta.id)
        if (state.exists && state.disableMasterKey) {
          setImportWarning(
            "This account's master key is disabled (a Regular Key has been set elsewhere). Signing with this seed alone may not work.",
          )
        }
      }
      toast.success('Wallet added.')
      setAddOpen(false)
      setLabel('')
      if (seedInputRef.current) seedInputRef.current.value = ''
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add wallet.')
    }
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
    // Guardrail #7: the removed wallet's balances/history must not stay warm
    // in the query or service-worker caches.
    await clearCachedAccountData(queryClient)
    setConfirmRemove(null)
    toast.success('Wallet removed from this device.')
  }

  async function handleFullReset() {
    await tearDownAllLocalState(queryClient)
    lock()
    setWallets([])
    setActiveWalletId(null)
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
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
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
                  <Input id="wlabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Savings" />
                </div>
                <div className="flex gap-2">
                  <Button variant={addMode === 'generate' ? 'default' : 'outline'} onClick={() => setAddMode('generate')} type="button">
                    Generate
                  </Button>
                  <Button variant={addMode === 'import' ? 'default' : 'outline'} onClick={() => setAddMode('import')} type="button">
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
                <Button onClick={handleAddWallet}>Add</Button>
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
                    <span className="inline-flex items-center gap-1.5 font-legend text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-success">
                      <Lamp tone="live" />
                      Active
                    </span>
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
          {addressBook.map((e) => (
            <div key={e.address} className="panel-plate flex items-center justify-between gap-2 rounded-md p-2">
              <span>{e.label}</span>
              <AddressLink address={e.address} />
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
          app-versioning-and-updates.md US-1 / US-3. */}
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

          {updateReady ? (
            <Alert variant="warning">
              <AlertTitle>Update available</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>
                  A new version has downloaded and is waiting. Installing it reloads the app onto the new
                  version; anything you have typed and not submitted is lost. Your wallets and keys are
                  untouched.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void applyUpdate()}
                  disabled={applying}
                >
                  {applying ? 'Installing…' : 'Install update'}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-xs leading-snug text-muted-foreground">
              You are on the newest version this device has downloaded.
            </p>
          )}
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

      <Dialog open={!!importWarning} onOpenChange={(o) => !o && setImportWarning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Heads up</DialogTitle>
          </DialogHeader>
          <Alert variant="warning">
            <AlertTitle>Master key disabled</AlertTitle>
            <AlertDescription>{importWarning}</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button onClick={() => setImportWarning(null)}>Got it</Button>
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
              This erases every wallet stored here, including their encrypted seeds, and clears all cached balance and history
              data. Any wallet you have not backed up elsewhere will be permanently lost — this cannot be undone.
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
