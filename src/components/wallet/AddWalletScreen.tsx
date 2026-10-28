import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreateWalletFlow } from '@/components/wallet/CreateWalletFlow'
import { NetworkChoice } from '@/components/wallet/NetworkChoice'
import { ScreenFooter, TaskScreen } from '@/components/wallet/TaskScreen'
import { useLeaveBlocker } from '@/hooks/useRoute'
import { addressFromSeed, importAndStoreWallet, listWallets, parseSeedInput } from '@/lib/crypto/keystore'
import { announceAdded } from '@/lib/chooser-signals'
import { toast } from '@/lib/notify'
import { checkBeforeImport, IMPORT_WARNING_COPY, INVALID_SEED_MESSAGE, type ImportWarning } from '@/lib/seed-import'
import type { NetworkId } from '@/lib/xrpl/networks'
import { useAppStore, useWalletOpenKey } from '@/store/app-store'

/**
 * Add wallet (`/wallets/new`), a chooser-side screen the app shell renders (AD-32,
 * AD-40): it needs no open wallet. Generate is `CreateWalletFlow`, the very
 * component onboarding renders: it makes the Wallet its own lock and commits
 * itself after the Seed backup, and it never selects or enters the wallet. On
 * success this returns to where the user came from and announces the new card so
 * the Chooser can focus it.
 *
 * Import is unchanged (Stories 12 and 13 move it): it still writes under an open
 * wallet's lock, so it is offered only while one is open. It keeps the same order
 * as onboarding (lib/seed-import.ts): parse, check, warn, and only then write.
 *
 * Guardrail #3: the typed Seed is in an uncontrolled input; the parsed one waits
 * in a ref while the master-key warning is open, never in state, the path or the
 * history entry.
 */
export function AddWalletScreen({ onClose }: { onClose: () => void }) {
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  // Only the fallback for a record the vault migration has not reached (`listWallets`); no ledger read (AD-36).
  const fallbackNetwork = useAppStore((s) => s.wallets.find((w) => w.id === s.activeWalletId)?.network ?? 'testnet')
  const activeLockId = useAppStore((s) => s.wallets.find((w) => w.id === s.activeWalletId)?.lockId ?? null)
  const setWallets = useAppStore((s) => s.setWallets)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const vaultKey = useWalletOpenKey(activeWalletId)
  const queryClient = useQueryClient()

  // The network a Wallet added here will live on — fixed at creation (AD-19).
  const [addNetwork, setAddNetwork] = useState<NetworkId>('testnet')
  const [requestedMode, setAddMode] = useState<'generate' | 'import'>('generate')
  // Import still needs an open wallet's key: with none open it is not offered, and says nothing about it.
  const importOffered = vaultKey !== null
  const addMode = importOffered ? requestedMode : 'generate'
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  const [label, setLabel] = useState('')
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null)
  const [busy, setBusy] = useState(false)
  // A new Wallet is being written or backed up inside the flow.
  const [creating, setCreating] = useState(false)
  // Not leavable while a check or a write is running: leaving reads as "stop",
  // and the write would still land behind it.
  const locked = busy || creating
  useLeaveBlocker(locked)

  // Uncontrolled: a controlled input would put the typed seed into React state
  // on every keystroke (guardrail #3).
  const seedInputRef = useRef<HTMLInputElement | null>(null)
  // Add is disabled while the pre-import check runs, so the warning sheet cannot
  // record it as its opener; focus returns to it by this ref instead.
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  // The parsed Seed while the master-key warning is open.
  const pendingImportSeedRef = useRef<string | null>(null)
  // The network the pre-check ran against: the store uses this one, never the
  // current radio, so check and write cannot disagree.
  const pendingImportNetworkRef = useRef<NetworkId>('testnet')

  async function storeImported(seed: string, key: CryptoKey, net: NetworkId) {
    const meta = await importAndStoreWallet(label || 'Wallet', seed, key, net, activeLockId ?? undefined)
    setWallets(await listWallets(fallbackNetwork))
    setActiveWalletId(meta.id)
    pendingImportSeedRef.current = null
    if (seedInputRef.current) seedInputRef.current.value = ''
    toast.success('Wallet added.')
    onClose()
  }

  async function handleAddImport() {
    if (!vaultKey || busy) return
    // docs/decisions.md §2 states the disabled-master-key check for import
    // unconditionally: it comes before the vault write here too.
    const seed = parseSeedInput(seedInputRef.current?.value ?? '')
    if (!seed) {
      toast.error(INVALID_SEED_MESSAGE)
      return
    }
    const net = addNetwork
    setBusy(true)
    try {
      const warning = await checkBeforeImport(queryClient, net, addressFromSeed(seed))
      if (warning) {
        pendingImportSeedRef.current = seed
        pendingImportNetworkRef.current = net
        setImportWarning(warning)
        return
      }
      await storeImported(seed, vaultKey, net)
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not add wallet.')
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
      await storeImported(seed, vaultKey, pendingImportNetworkRef.current)
      setImportWarning(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not add wallet.')
    } finally {
      setBusy(false)
    }
  }

  /** Cancel, Escape, the overlay and the close button all land here: the
   * import is abandoned, nothing is written, and the typed Seed is cleared. */
  function cancelImportWarning() {
    pendingImportSeedRef.current = null
    if (seedInputRef.current) seedInputRef.current.value = ''
    setImportWarning(null)
  }

  return (
    <TaskScreen
      title="Add another wallet"
      description={importOffered ? 'Generate a new wallet or import one with a seed.' : 'Generate a new wallet.'}
      backLabel="Wallets"
      onBack={onClose}
      locked={locked}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {importOffered && (
          <div className="flex flex-wrap gap-2">
            <Button variant={addMode === 'generate' ? 'default' : 'outline'} onClick={() => setAddMode('generate')} type="button" disabled={locked}>
              Generate
            </Button>
            <Button variant={addMode === 'import' ? 'default' : 'outline'} onClick={() => setAddMode('import')} type="button" disabled={locked}>
              Import
            </Button>
          </div>
        )}
        {addMode === 'generate' ? (
          // Network, Node, Seed Method, signature type, Open Check, Signing Check:
          // the flow asks each, and commits itself after the seed backup.
          <CreateWalletFlow
            defaultLabel=""
            actionHost={footerHost}
            onInProgressChange={setCreating}
            onDone={(meta) => {
              // Creation selects and enters nothing: the Chooser focuses the new card.
              announceAdded(meta.seedId)
              toast.success('Wallet added.')
              onClose()
            }}
          />
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="wlabel">Label</Label>
              <Input id="wlabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Savings" disabled={busy} />
            </div>
            {/* Frozen while a check or a write runs. */}
            <NetworkChoice value={addNetwork} onChange={setAddNetwork} disabled={busy} />
            <div className="grid gap-1.5">
              <Label htmlFor="wseed">Seed</Label>
              <Input id="wseed" type="password" autoComplete="off" spellCheck={false} ref={seedInputRef} />
            </div>
          </>
        )}
      </div>
      {addMode === 'generate' && <div ref={setFooterHost} className="contents" />}
      {addMode === 'import' && (
        <ScreenFooter>
          <Button ref={addButtonRef} onClick={handleAddImport} disabled={busy}>
            {busy ? 'Checking…' : 'Add'}
          </Button>
        </ScreenFooter>
      )}

      <Dialog open={!!importWarning} onOpenChange={(o) => !o && !busy && cancelImportWarning()}>
        <DialogContent variant="sheet" returnFocusTo={() => addButtonRef.current}>
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
    </TaskScreen>
  )
}
