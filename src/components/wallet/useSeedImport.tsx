import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ImportSource } from '@/components/wallet/CreateWalletFlow'
import { addressFromSeed, importDuplicateReason, parseSeedInput } from '@/lib/crypto/keystore'
import { checkBeforeImport, IMPORT_WARNING_COPY, INVALID_SEED_MESSAGE, type ImportWarning } from '@/lib/seed-import'

/**
 * The one Seed-import wiring (AD-39, AD-40), used by Add wallet and by first-run
 * Onboarding. It supplies `CreateWalletFlow` with a Seed source. Order, with
 * nothing written until the last step: parse the typed Seed; the duplicate probe
 * (before any prompt and before any ledger read); the master-key pre-check and
 * its warning (lib/seed-import.ts), skipped for an Offline Wallet, which reads
 * nothing; then the flow's `importStoredWallet` under its
 * own new lock.
 *
 * Guardrail #3: the typed Seed is in an uncontrolled input; the parsed one waits
 * in a ref only while the master-key warning is open, and is handed to the keystore
 * as a parameter. The ref and the input are cleared by the flow's `finally` on every
 * exit, when the sheet is cancelled, and on unmount of the component that calls
 * this hook. The Seed is never in state, the path, the history entry, an error or
 * a log.
 *
 * The caller renders `warningDialog` once, anywhere in its tree.
 */
export function useSeedImport(): { importSource: ImportSource; clearSeed: () => void; warningDialog: ReactNode } {
  const queryClient = useQueryClient()
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null)
  // Only whether the Seed field holds anything, never what: step 1 of the flow waits on it.
  const [seedTyped, setSeedTyped] = useState(false)

  // Uncontrolled: a controlled input would put the typed Seed into React state on every keystroke.
  const seedInputRef = useRef<HTMLInputElement | null>(null)
  // The last input element ever mounted: the field leaves the DOM while the written-Seed step shows.
  const lastInputRef = useRef<HTMLInputElement | null>(null)
  // The parsed Seed, only until it is handed to the keystore.
  const pendingSeedRef = useRef<string | null>(null)
  const warningResolveRef = useRef<((proceed: boolean) => void) | null>(null)
  // False once the host is left: a probe or a ledger check that finishes after that must not go on.
  const mountedRef = useRef(true)

  // A STABLE ref callback: React calls it with null only when the field really leaves the DOM (the
  // written-Seed step, a mode switch), never on a re-render. What was typed goes with it, so a
  // detached element does not keep the Seed.
  const setSeedInput = useCallback((el: HTMLInputElement | null) => {
    if (!el && seedInputRef.current) {
      seedInputRef.current.value = ''
      setSeedTyped(false)
    }
    seedInputRef.current = el
    if (el) lastInputRef.current = el
  }, [])

  const clearSeed = useCallback(() => {
    pendingSeedRef.current = null
    if (seedInputRef.current) seedInputRef.current.value = ''
    if (lastInputRef.current) lastInputRef.current.value = ''
    setSeedTyped(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Leaving drops the Seed and abandons an open sheet.
      pendingSeedRef.current = null
      if (lastInputRef.current) lastInputRef.current.value = ''
      warningResolveRef.current?.(false)
      warningResolveRef.current = null
    }
  }, [])

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
    seedTyped,
    field: (busy, reason) => (
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
          onChange={(e) => setSeedTyped(e.target.value.trim() !== '')}
          aria-invalid={reason ? true : undefined}
          aria-describedby="wseed-note"
        />
        {reason ? (
          <p id="wseed-note" role="alert" className="text-sm text-text-destructive">
            {reason}
          </p>
        ) : (
          <p id="wseed-note" className="text-xs text-muted-foreground">
            {seedTyped ? 'Next is ready.' : 'Type your Seed to continue.'}
          </p>
        )}
      </div>
    ),
    clear: clearSeed,
    async acquire({ network, node, offline }) {
      const seed = parseSeedInput(seedInputRef.current?.value ?? '')
      if (!seed) return { status: 'refused', reason: INVALID_SEED_MESSAGE, at: 'seed' }
      pendingSeedRef.current = seed
      try {
        // Before any prompt and before any ledger read: a duplicate stops here.
        const duplicate = await importDuplicateReason(seed, network)
        if (duplicate) return { status: 'refused', reason: duplicate, at: 'seed' }
        if (!mountedRef.current) return { status: 'cancelled' } // left meanwhile: no ledger read for an abandoned address
        // An Offline Wallet never reads the ledger (OS-FR-2): no master-key check, and so
        // no warning about it. Its Text E was acknowledged on step 1 instead.
        if (!offline) {
          const warning = await checkBeforeImport(queryClient, network, addressFromSeed(seed), node)
          if (!mountedRef.current) return { status: 'cancelled' }
          if (warning && !(await askWarning(warning))) return { status: 'cancelled' }
        }
      } catch {
        return { status: 'refused', reason: 'Could not check this key against the wallets on this device. Nothing was imported.' }
      }
      // Gone if the host was left while a check ran.
      const held = pendingSeedRef.current
      pendingSeedRef.current = null
      return held ? { status: 'ok', seed: held } : { status: 'cancelled' }
    },
  }

  const warningDialog = (
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
  )

  return { importSource, clearSeed, warningDialog }
}
