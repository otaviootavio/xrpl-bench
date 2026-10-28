import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreateWalletFlow, type ImportSource } from '@/components/wallet/CreateWalletFlow'
import { TaskScreen } from '@/components/wallet/TaskScreen'
import { useLeaveBlocker } from '@/hooks/useRoute'
import { addressFromSeed, importDuplicateReason, parseSeedInput } from '@/lib/crypto/keystore'
import { announceAdded } from '@/lib/chooser-signals'
import { toast } from '@/lib/notify'
import { checkBeforeImport, IMPORT_WARNING_COPY, INVALID_SEED_MESSAGE, type ImportWarning } from '@/lib/seed-import'

/**
 * Add wallet (`/wallets/new`), a chooser-side screen the app shell renders (AD-32,
 * AD-40): it needs no open wallet. Generate and Import are both `CreateWalletFlow`,
 * the component onboarding renders: it asks the per-wallet questions, makes the
 * Wallet its own lock and commits itself, and it never selects or enters the
 * wallet. On success this returns to where the user came from and announces the
 * new card so the Chooser can focus it.
 *
 * Import (AD-39) supplies the flow with a Seed source. Order, with nothing
 * written until the last step: parse the typed Seed; the duplicate probe (before
 * any prompt and before any ledger read); the master-key pre-check and its warning
 * (lib/seed-import.ts); then `importStoredWallet` under its own new lock.
 *
 * Guardrail #3: the typed Seed is in an uncontrolled input; the parsed one waits
 * in a ref only while the master-key warning is open, and is handed to the keystore
 * as a parameter. The ref and the input are cleared by the flow's `finally` on every
 * exit, when the sheet is cancelled, and on unmount. The Seed is never in state,
 * the path, the history entry, an error or a log.
 */
export function AddWalletScreen({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'generate' | 'import'>('generate')
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null)
  // A new Wallet is being checked, written or backed up inside the flow. Not
  // leavable meanwhile: leaving reads as "stop", and the write would still land.
  const [creating, setCreating] = useState(false)
  useLeaveBlocker(creating)

  // Uncontrolled: a controlled input would put the typed Seed into React state on every keystroke.
  const seedInputRef = useRef<HTMLInputElement | null>(null)
  // The last input element ever mounted: the field leaves the DOM while the written-Seed step shows.
  const lastInputRef = useRef<HTMLInputElement | null>(null)
  // The parsed Seed, only until it is handed to the keystore.
  const pendingSeedRef = useRef<string | null>(null)
  const warningResolveRef = useRef<((proceed: boolean) => void) | null>(null)

  // A STABLE ref callback: React calls it with null only when the field really leaves the DOM (the
  // written-Seed step, a mode switch), never on a re-render. What was typed goes with it, so a
  // detached element does not keep the Seed.
  const setSeedInput = useCallback((el: HTMLInputElement | null) => {
    if (!el && seedInputRef.current) seedInputRef.current.value = ''
    seedInputRef.current = el
    if (el) lastInputRef.current = el
  }, [])

  function clearSeed() {
    pendingSeedRef.current = null
    if (seedInputRef.current) seedInputRef.current.value = ''
    if (lastInputRef.current) lastInputRef.current.value = ''
  }

  // False once the screen is left: a probe or a ledger check that finishes after that must not go on.
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(
    () => () => {
      // Leaving the screen drops the Seed and abandons an open sheet.
      pendingSeedRef.current = null
      if (lastInputRef.current) lastInputRef.current.value = ''
      warningResolveRef.current?.(false)
      warningResolveRef.current = null
    },
    [],
  )

  function settleWarning(proceed: boolean) {
    const resolve = warningResolveRef.current
    warningResolveRef.current = null
    setImportWarning(null)
    resolve?.(proceed)
  }

  function askWarning(warning: ImportWarning): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      warningResolveRef.current = resolve
      setImportWarning(warning)
    })
  }

  const importSource: ImportSource = {
    field: (busy) => (
      <div className="grid gap-1.5">
        <Label htmlFor="wseed">Seed</Label>
        <Input
          id="wseed"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          ref={setSeedInput}
        />
      </div>
    ),
    clear: clearSeed,
    async acquire({ network, node }) {
      const seed = parseSeedInput(seedInputRef.current?.value ?? '')
      if (!seed) return { status: 'refused', reason: INVALID_SEED_MESSAGE }
      pendingSeedRef.current = seed
      try {
        // Before any prompt and before any ledger read: a duplicate stops here.
        const duplicate = await importDuplicateReason(seed)
        if (duplicate) return { status: 'refused', reason: duplicate }
        if (!mountedRef.current) return { status: 'cancelled' } // left meanwhile: no ledger read for an abandoned address
        const warning = await checkBeforeImport(queryClient, network, addressFromSeed(seed), node)
        if (!mountedRef.current) return { status: 'cancelled' }
        if (warning && !(await askWarning(warning))) return { status: 'cancelled' }
      } catch {
        return { status: 'refused', reason: 'Could not check this key against the wallets on this device. Nothing was imported.' }
      }
      // Gone if the screen was left while a check ran.
      const held = pendingSeedRef.current
      pendingSeedRef.current = null
      return held ? { status: 'ok', seed: held } : { status: 'cancelled' }
    },
  }

  return (
    <TaskScreen
      title="Add another wallet"
      description="Generate a new wallet or import one with a seed."
      backLabel="Wallets"
      onBack={onClose}
      locked={creating}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === 'generate' ? 'default' : 'outline'} onClick={() => {
              clearSeed() // the typed Seed does not wait in a detached field
              setMode('generate')
            }} type="button" disabled={creating}>
            Generate
          </Button>
          <Button variant={mode === 'import' ? 'default' : 'outline'} onClick={() => setMode('import')} type="button" disabled={creating}>
            Import
          </Button>
        </div>
        {/* Keyed by mode: each mode starts its own answers, and the Seed field goes with Import. */}
        <CreateWalletFlow
          key={mode}
          defaultLabel=""
          actionHost={footerHost}
          onInProgressChange={setCreating}
          {...(mode === 'import' ? { importSource } : {})}
          onDone={(meta) => {
            // Adding selects and enters nothing: the Chooser focuses the new card.
            announceAdded(meta.seedId)
            toast.success('Wallet added.')
            onClose()
          }}
        />
      </div>
      <div ref={setFooterHost} className="contents" />

      <Dialog open={!!importWarning} onOpenChange={(open) => !open && settleWarning(false)}>
        <DialogContent variant="sheet" returnFocusTo={() => seedInputRef.current}>
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
            <Button variant="outline" onClick={() => settleWarning(false)}>
              Cancel import
            </Button>
            <Button onClick={() => settleWarning(true)}>Import anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TaskScreen>
  )
}
