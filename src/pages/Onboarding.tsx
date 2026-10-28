import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CreateWalletFlow } from '@/components/wallet/CreateWalletFlow'
import { ChassisShell } from '@/components/ChassisShell'
import { setUpVaultAuth, hasPasskeyRegistered } from '@/lib/crypto/auth'
import { DEFAULT_AUTO_LOCK_MINUTES } from '@/lib/crypto/lock'
import { LEGACY_LOCK_ID } from '@/lib/crypto/db'
import { RemoveAllPlate } from '@/components/wallet/RemoveAllPlate'
import { addressFromSeed, appPinResidue, parseSeedInput, importAndStoreWallet, listWallets, type WalletMeta } from '@/lib/crypto/keystore'
import { checkBeforeImport, IMPORT_WARNING_COPY, INVALID_SEED_MESSAGE, type ImportWarning } from '@/lib/seed-import'
import { useAppStore } from '@/store/app-store'
import { NetworkChoice } from '@/components/wallet/NetworkChoice'
import type { NetworkId } from '@/lib/xrpl/networks'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/notify'
import { BUILD, shortSha, sourceUrl } from '@/lib/build-info'
import { ExternalLinkIcon } from 'lucide-react'

type Step = 'choice' | 'create' | 'vault-setup' | 'import-seed' | 'import-warning'

/**
 * IMPORTANT: this component intentionally does NOT call the app store's
 * `openLock()`/`setWallets()`/`setActiveWalletId()` until the entire flow is
 * finished (any import warning dismissed; a new wallet's own flow, `CreateWalletFlow`,
 * commits only after its seed backup). App.tsx's top-level Gate switches to <Main> the instant
 * `wallets.length > 0`, so committing those earlier would skip
 * straight past the seed-backup screen — a real bug caught during browser
 * validation (the wallet's own account-onboarding.md US-6 requires an
 * explicit backup confirmation before continuing).
 *
 * Guardrail #3 also applies throughout: no seed — neither the generated one
 * (held by `CreateWalletFlow`) nor the one typed in to import — is ever held in
 * React state. Both live in refs and are cleared as soon as the flow that needs
 * them completes.
 */
export function Onboarding() {
  const [step, setStep] = useState<Step>('choice')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null)
  const [busy, setBusy] = useState(false)
  // A new Wallet is being written or backed up: leaving would strand it.
  const [creating, setCreating] = useState(false)

  // Held locally until the flow completes — never written to the store early.
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)

  // Secrets: refs only, never state.
  // Uncontrolled input — a controlled one would put the typed seed into React
  // state on every keystroke.
  const importSeedRef = useRef<HTMLInputElement | null>(null)
  // The parsed Seed, taken from the input when the import step is left. It
  // has to be copied out: the input belongs to the `import-seed` step's tree,
  // so the moment the flow moves on to `vault-setup` React unmounts it and
  // `importSeedRef.current` becomes null. Reading the input at vault-setup
  // time — as this screen used to — read `''`, and import never got as far as
  // the probe.
  const pendingImportSeedRef = useRef<string | null>(null)
  // The network the import was started for; check and write both use it.
  const pendingImportNetworkRef = useRef<NetworkId>('testnet')

  // An App PIN or a failure count that outlived the last Wallet (a removal whose
  // discard failed, AD-46). Read through the keystore each time this step shows.
  const [pinResidue, setPinResidue] = useState(false)
  useEffect(() => {
    if (step !== 'choice') return undefined
    let cancelled = false
    appPinResidue().then(
      (found) => !cancelled && setPinResidue(found),
      // An unreadable vault is not proof of a clean one: keep the way out on offer.
      () => !cancelled && setPinResidue(true),
    )
    return () => {
      cancelled = true
    }
  }, [step])

  const queryClient = useQueryClient()
  // The new Wallet's network, chosen here and fixed on its record (AD-19).
  // Testnet is pre-selected: nothing real is at stake until it is changed.
  const [network, setNewWalletNetwork] = useState<NetworkId>('testnet')
  const setWallets = useAppStore((s) => s.setWallets)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const openLock = useAppStore((s) => s.openLock)

  function commitToStore(key: CryptoKey, meta: WalletMeta, wallets: WalletMeta[]) {
    // The lock first: the Gate shows Main the moment `wallets` is non-empty, and
    // a Wallet whose lock is not yet open would flash its locked view.
    openLock(LEGACY_LOCK_ID, key, DEFAULT_AUTO_LOCK_MINUTES)
    setWallets(wallets)
    setActiveWalletId(meta.id)
  }

  function clearSeeds() {
    pendingImportSeedRef.current = null
    if (importSeedRef.current) importSeedRef.current.value = ''
  }

  async function handleVaultSetup() {
    if (pin.length < 6) {
      toast.error('PIN must be at least 6 digits.')
      return
    }
    if (pin !== pinConfirm) {
      toast.error("PINs don't match.")
      return
    }
    setBusy(true)
    try {
      const key = await setUpVaultAuth('xrpl-wallet-user', pin)
      setVaultKey(key)

      const seed = pendingImportSeedRef.current
      if (!seed) {
        // Unreachable through the UI — the import step only advances with
        // a parsed Seed — but never write, or probe, without one.
        toast.error(INVALID_SEED_MESSAGE)
        setStep('import-seed')
        return
      }
      // Detect a disabled master key BEFORE the import is completed — the
      // resolved decision in docs/decisions.md says to warn *before*
      // completing import, so nothing is written to the vault until the
      // user has seen the warning and chosen to continue. An account that
      // could not be read warns too (lib/seed-import.ts).
      const importNetwork = pendingImportNetworkRef.current
      const warning = await checkBeforeImport(queryClient, importNetwork, addressFromSeed(seed))
      if (warning) {
        setImportWarning(warning)
        setStep('import-warning')
        return
      }
      const meta = await importAndStoreWallet('My Wallet', seed, key, importNetwork)
      const wallets = await listWallets(importNetwork)
      clearSeeds()
      commitToStore(key, meta, wallets)
      toast.success('Wallet imported.')
    } catch (err: any) {
      toast.error(err?.message ?? 'Setup failed.')
    } finally {
      setBusy(false)
    }
  }

  /** The import is only actually written to the vault here, once the user has
   * acknowledged the disabled-master-key warning. */
  async function acceptImportWarning() {
    const seed = pendingImportSeedRef.current
    if (!vaultKey || !seed) return
    setBusy(true)
    try {
      const meta = await importAndStoreWallet('My Wallet', seed, vaultKey, pendingImportNetworkRef.current)
      const wallets = await listWallets(pendingImportNetworkRef.current)
      clearSeeds()
      setImportWarning(null)
      commitToStore(vaultKey, meta, wallets)
      toast.success('Wallet imported.')
    } catch (err: any) {
      toast.error(err?.message ?? 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  function cancelImportWarning() {
    clearSeeds()
    setImportWarning(null)
    setStep('choice')
  }

  if (step === 'choice') {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          {/* The power-on nameplate. Engraved, not a display heading: the
              panel's maker's mark is the smallest thing on it, and the
              instrument itself is what the user came to read. */}
          <div className="border-b border-border pb-4">
            <h1 className="panel-legend text-[0.75rem] tracking-[0.22em] text-foreground">XRPL Bench</h1>
            <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
              A self-custody wallet for the XRP Ledger. Keys are generated and stored on this device only.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Get started</CardTitle>
              <CardDescription>Generate a brand-new wallet, or import one you already have.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                onClick={() => setStep('create')}
              >
                Create a new wallet
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('import-seed')}
              >
                Import an existing wallet
              </Button>
            </CardContent>
          </Card>

          {pinResidue && (
            <RemoveAllPlate>
              <p className="text-sm leading-snug text-muted-foreground">
                An App PIN or its failed-attempt count is still stored on this device, left over from a wallet that was removed.
                Removing everything clears it, so setup asks for a new PIN.
              </p>
            </RemoveAllPlate>
          )}

          {/* app-versioning-and-updates.md US-1: reachable before there is
              even a vault to unlock, not only after one exists. */}
          <p className="text-center text-xs text-muted-foreground">
            v{BUILD.version} ·{' '}
            <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">
              {shortSha}
              <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
            </a>
          </p>
        </div>
      </ChassisShell>
    )
  }

  if (step === 'import-seed') {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle as="h1">Import wallet</CardTitle>
              <CardDescription>Enter your existing seed. It never leaves this device.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <NetworkChoice value={network} onChange={setNewWalletNetwork} disabled={busy} />
              <Label htmlFor="seed">Seed</Label>
              <Input id="seed" type="password" autoComplete="off" spellCheck={false} ref={importSeedRef} placeholder="s..." />
              <Button
                onClick={() => {
                  const seed = parseSeedInput(importSeedRef.current?.value ?? '')
                  if (seed) {
                    pendingImportSeedRef.current = seed
                    pendingImportNetworkRef.current = network
                    setStep('vault-setup')
                  } else {
                    toast.error(INVALID_SEED_MESSAGE)
                  }
                }}
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        </div>
      </ChassisShell>
    )
  }

  if (step === 'vault-setup') {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle as="h1">Secure your wallet</CardTitle>
              <CardDescription>
                Set a PIN to unlock the app. If your device supports it, you'll also be able to register a passkey (Face ID/Touch
                ID/Windows Hello) for faster unlocking — the PIN always works as a fallback.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Label htmlFor="pin">PIN (min 6 digits)</Label>
              <Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} />
              <Label htmlFor="pin-confirm">Confirm PIN</Label>
              <Input id="pin-confirm" type="password" inputMode="numeric" autoComplete="new-password" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)} />
              <Button onClick={handleVaultSetup} disabled={busy}>
                {busy ? 'Setting up…' : 'Continue'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </ChassisShell>
    )
  }

  if (step === 'create') {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle as="h1">Create a new wallet</CardTitle>
              <CardDescription>Answer each question, or keep the answer already chosen. Keys are generated and stored on this device only.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Commits to the store itself, after the seed backup. */}
              <CreateWalletFlow onInProgressChange={setCreating} />
              <Button variant="outline" onClick={() => setStep('choice')} disabled={creating}>
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </ChassisShell>
    )
  }

  if (step === 'import-warning' && importWarning) {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          <Alert variant="warning">
            <AlertTitle>{IMPORT_WARNING_COPY[importWarning].title}</AlertTitle>
            <AlertDescription>{IMPORT_WARNING_COPY[importWarning].body}</AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancelImportWarning} disabled={busy}>
              Cancel import
            </Button>
            <Button onClick={acceptImportWarning} disabled={busy}>
              {busy ? 'Importing…' : 'Import anyway'}
            </Button>
          </div>
        </div>
      </ChassisShell>
    )
  }

  return null
}

// A thin re-export of hasPasskeyRegistered() consumed by Unlock; kept here so
// the onboarding flow that registers the passkey and the check for it stay in
// one place.
// oxlint-disable-next-line react/only-export-components
export async function passkeyAvailableForReturningUser() {
  return hasPasskeyRegistered()
}
