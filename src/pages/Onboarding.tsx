import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { ChassisShell } from '@/components/ChassisShell'
import { setUpVaultAuth, hasPasskeyRegistered } from '@/lib/crypto/auth'
import { addressFromSeed, parseSeedInput, generateAndStoreWallet, importAndStoreWallet, listWallets, type WalletMeta } from '@/lib/crypto/keystore'
import { checkBeforeImport, IMPORT_WARNING_COPY, INVALID_SEED_MESSAGE, type ImportWarning } from '@/lib/seed-import'
import { useAppStore } from '@/store/app-store'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/notify'
import { BUILD, shortSha, sourceUrl } from '@/lib/build-info'
import { ExternalLinkIcon } from 'lucide-react'

type Step = 'choice' | 'vault-setup' | 'import-seed' | 'backup-confirm' | 'import-warning'

/**
 * IMPORTANT: this component intentionally does NOT call the app store's
 * `unlock()`/`setWallets()`/`setActiveWalletId()` until the entire flow is
 * finished (seed backed up for a new wallet, or any import warning
 * dismissed). App.tsx's top-level Gate switches to <Main> the instant
 * `wallets.length > 0 && unlocked`, so committing those earlier would skip
 * straight past the seed-backup screen — a real bug caught during browser
 * validation (the wallet's own account-onboarding.md US-6 requires an
 * explicit backup confirmation before continuing).
 *
 * Guardrail #3 also applies throughout: no seed — neither the generated one
 * nor the one typed in to import — is ever held in React state. Both live in
 * refs and are cleared as soon as the flow that needs them completes.
 */
export function Onboarding() {
  const [step, setStep] = useState<Step>('choice')
  const [mode, setMode] = useState<'generate' | 'import'>('generate')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null)
  const [backedUp, setBackedUp] = useState(false)
  const [busy, setBusy] = useState(false)

  // Held locally until the flow completes — never written to the store early.
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const [pendingMeta, setPendingMeta] = useState<WalletMeta | null>(null)

  // Secrets: refs only, never state. `hasPendingSeed` is a render flag, not
  // the value itself.
  const pendingSeedRef = useRef<string | null>(null)
  const [hasPendingSeed, setHasPendingSeed] = useState(false)
  const getPendingSeed = useCallback(() => pendingSeedRef.current, [])
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

  const queryClient = useQueryClient()
  const network = useAppStore((s) => s.network)
  const setWallets = useAppStore((s) => s.setWallets)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const unlock = useAppStore((s) => s.unlock)

  function commitToStore(key: CryptoKey, meta: WalletMeta, wallets: WalletMeta[]) {
    setWallets(wallets)
    setActiveWalletId(meta.id)
    unlock(key)
  }

  function clearSeeds() {
    pendingSeedRef.current = null
    pendingImportSeedRef.current = null
    setHasPendingSeed(false)
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

      if (mode === 'generate') {
        const { meta, seed } = await generateAndStoreWallet('My Wallet', key)
        setPendingMeta(meta)
        pendingSeedRef.current = seed
        setHasPendingSeed(true)
        setStep('backup-confirm')
      } else {
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
        const warning = await checkBeforeImport(queryClient, network, addressFromSeed(seed))
        if (warning) {
          setImportWarning(warning)
          setStep('import-warning')
          return
        }
        const meta = await importAndStoreWallet('My Wallet', seed, key)
        const wallets = await listWallets()
        clearSeeds()
        commitToStore(key, meta, wallets)
        toast.success('Wallet imported.')
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Setup failed.')
    } finally {
      setBusy(false)
    }
  }

  async function finishBackup() {
    if (!vaultKey || !pendingMeta) return
    const wallets = await listWallets()
    clearSeeds()
    commitToStore(vaultKey, pendingMeta, wallets)
  }

  /** The import is only actually written to the vault here, once the user has
   * acknowledged the disabled-master-key warning. */
  async function acceptImportWarning() {
    const seed = pendingImportSeedRef.current
    if (!vaultKey || !seed) return
    setBusy(true)
    try {
      const meta = await importAndStoreWallet('My Wallet', seed, vaultKey)
      const wallets = await listWallets()
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
                onClick={() => {
                  setMode('generate')
                  setStep('vault-setup')
                }}
              >
                Create a new wallet
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setMode('import')
                  setStep('import-seed')
                }}
              >
                Import an existing wallet
              </Button>
            </CardContent>
          </Card>

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
              <Label htmlFor="seed">Seed</Label>
              <Input id="seed" type="password" autoComplete="off" spellCheck={false} ref={importSeedRef} placeholder="s..." />
              <Button
                onClick={() => {
                  const seed = parseSeedInput(importSeedRef.current?.value ?? '')
                  if (seed) {
                    pendingImportSeedRef.current = seed
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

  if (step === 'backup-confirm' && hasPendingSeed) {
    return (
      <ChassisShell maxWidthClassName="max-w-md">
        <div className="flex min-h-full flex-col justify-center gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle as="h1">Back up your seed</CardTitle>
              <CardDescription>This is the only way to recover your wallet.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SeedReveal getSeed={getPendingSeed} />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={backedUp} onCheckedChange={(v) => setBackedUp(v === true)} />
                I've written down my seed and stored it somewhere safe.
              </label>
              <Button disabled={!backedUp} onClick={finishBackup}>
                Continue to my wallet
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
