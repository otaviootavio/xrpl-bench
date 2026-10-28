import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RENAME_ERRORS } from '@/components/wallet/rename-copy'
import { WalletQuestions } from '@/components/wallet/WalletQuestions'
import { ScreenFooter } from '@/components/wallet/TaskScreen'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { WrittenSeedConfirm } from '@/components/wallet/WrittenSeedConfirm'
import { createDerivedWallet, createStoredWallet, describeCheckFailure, importStoredWallet, listWallets, type WalletMeta } from '@/lib/crypto/keystore'
import { hasAppPin, startLockSession } from '@/lib/crypto/lock'
import { triesRemaining } from '@/lib/crypto/pin'
import {
  describeOptions,
  type NewOpenCheck,
  type PasskeyCapability,
  type SeedMethod,
  type SigningKind,
} from '@/lib/crypto/policy'
import { detectPrfSupport, getRpId } from '@/lib/crypto/webauthn'
import { verifyNode } from '@/lib/xrpl/client'
import { normalizeWalletName, uniqueDefaultName, validateWalletName } from '@/lib/wallet-name'
import type { NetworkId } from '@/lib/xrpl/networks'
import { useAppStore } from '@/store/app-store'

/**
 * The creation flow (FR-60): one question per axis, in this order — Network and
 * Node, Seed Method, signature type, Open Check with auto-lock, Signing Check —
 * each with a pre-selected answer.
 *
 * This component only RENDERS. Which answers are legal, and why one is not, come
 * from `describeOptions` in `lib/crypto/policy.ts` (AD-28); creation calls the
 * same policy and refuses before any write. An unavailable answer is
 * `aria-disabled` with its reason as visible text — never hidden, never colour
 * alone.
 *
 * Secrets: the generated Seed is held in a ref for the backup screen and cleared
 * with it; a typed PIN is in an uncontrolled input, read once and cleared. The
 * store is committed only after the backup step (Gate switches to Main the
 * moment a Wallet exists).
 */
/**
 * Import mode (AD-40): the same questions, PIN entry and written-Seed confirmation,
 * with the Seed supplied by the host instead of generated. The host owns the Seed
 * field and its ref; the flow asks for the Seed once, at the moment of writing,
 * holds it only as an argument to `importStoredWallet`, and calls `clear` in
 * `finally` on every exit. Seed Method and signature type are not asked (the Seed
 * fixes the algorithm).
 */
export interface ImportSource {
  /** The Seed field, rendered above the questions. `busy` freezes it. */
  field: (busy: boolean) => ReactNode
  /** Parse, duplicate probe, master-key check and its warning, in that order. */
  acquire: (choice: { network: NetworkId; node?: string }) => Promise<{ status: 'ok'; seed: string } | { status: 'refused'; reason: string } | { status: 'cancelled' }>
  /** Drops the Seed from the host's ref and field. */
  clear: () => void
}

export interface CreateWalletFlowProps {
  /** Present: this flow imports a Seed instead of generating one. */
  importSource?: ImportSource
  /** Called once the Wallet is committed to the store, after its backup. */
  onDone?: (meta: WalletMeta) => void
  /** True from the moment a Wallet is being written until it is committed:
   * a host dialog should not close in between. */
  onInProgressChange?: (inProgress: boolean) => void
  defaultLabel?: string
  /** Render Create wallet in a `ScreenFooter` portalled into this element, a
   * direct child of the routed screen. A sticky footer cannot leave the box of
   * its parent, so left inside the form it stayed below the fold until the
   * form itself scrolled into view. */
  actionHost?: HTMLElement | null
}

/** `confirm-seed`: the Seed is shown and three groups of it typed back, BEFORE
 * anything is written (FR-72). `finish`: a confirmed Stored Wallet is written and
 * only needs its lock opened. */
type Step = 'questions' | 'confirm-seed' | 'finish' | 'backup'

/** What a Passkey-Derived creation leaves for the backup step. All public: the
 * ordinal rebuilds the Wallet on a new device, and is shown once here. */
interface DerivedBackup {
  ordinal: string
  label: string
  /** `undefined`: the authenticator did not say (or an existing passkey was used). */
  backupEligible?: boolean
}

/** The consequence of the passkey's kind, in plain words (FR-71). */
function kindStatement(backupEligible: boolean | undefined): { title: string; body: string } {
  const synced = 'Access to your passkey provider account (for example your Apple, Google or password-manager account) opens this wallet.'
  const bound = 'If you lose this device, the wallet can be recovered only with a written Seed or a Controlling Wallet.'
  if (backupEligible === true) return { title: 'This passkey is synced', body: synced }
  if (backupEligible === false) return { title: 'This passkey is device-bound', body: bound }
  return {
    title: 'We could not tell whether this passkey is synced or device-bound',
    body: `If it is synced: ${synced.charAt(0).toLowerCase()}${synced.slice(1)} If it is device-bound: ${bound.charAt(0).toLowerCase()}${bound.slice(1)}`,
  }
}

const MAX_PIN_FIELD_HINT = 'The App PIN must be at least 6 digits.'

function defaultSigning(network: NetworkId, capability: PasskeyCapability): SigningKind {
  if (network !== 'mainnet') return 'standard'
  return capability === 'yes' ? 'passkey' : 'pin'
}

export function CreateWalletFlow(props: CreateWalletFlowProps) {
  const [capability, setCapability] = useState<PasskeyCapability | null>(null)

  useEffect(() => {
    let cancelled = false
    detectPrfSupport()
      .then((found) => !cancelled && setCapability(found))
      .catch(() => !cancelled && setCapability('unknown'))
    return () => {
      cancelled = true
    }
  }, [])

  if (capability === null) return <p role="status" className="text-sm text-muted-foreground">Checking what this device supports…</p>
  return <CreateWalletForm capability={capability} {...props} />
}

function CreateWalletForm({ capability, onDone, onInProgressChange, defaultLabel = 'My Wallet', actionHost = null, importSource }: CreateWalletFlowProps & { capability: PasskeyCapability }) {
  const group = useId()
  const [step, setStep] = useState<Step>('questions')
  // Layout only: every answer lives in the state below, so closing Customise resets none.
  const [customiseOpen, setCustomiseOpen] = useState(false)
  const [label, setLabel] = useState(defaultLabel)
  const [network, setNewWalletNetwork] = useState<NetworkId>('testnet')
  const [nodeMode, setNodeMode] = useState<'builtin' | 'custom'>('builtin')
  const [nodeDraft, setNodeDraft] = useState('')
  const [verifiedNode, setVerifiedNode] = useState<string | null>(null)
  const [nodeReason, setNodeReason] = useState<string | null>(null)
  const [nodeBusy, setNodeBusy] = useState(false)
  const [seedMethod, setSeedMethod] = useState<SeedMethod>('stored')
  const [algorithm, setAlgorithm] = useState<'ed25519' | 'secp256k1'>('ed25519')
  const [openCheck, setOpenCheck] = useState<NewOpenCheck>(capability === 'yes' ? 'passkey' : 'pin')
  const [autoLockMinutes, setAutoLockMinutes] = useState(5)
  const [signing, setSigning] = useState<SigningKind>(defaultSigning('testnet', capability))
  const [signingTouched, setSigningTouched] = useState(false)
  const [appPin, setAppPin] = useState<{ exists: boolean; tries: number } | null>(null)
  // A failed read is its own state: never rendered as "no App PIN yet".
  const [pinReadFailed, setPinReadFailed] = useState(false)
  const networkRef = useRef<NetworkId>('testnet')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backedUp, setBackedUp] = useState(false)
  const [passkeyChoice, setPasskeyChoice] = useState<'new' | 'existing'>('new')
  const [derivedBackup, setDerivedBackup] = useState<DerivedBackup | null>(null)
  // The host the build's rpId is bound to: the one the domain warning names and
  // the Mainnet rule reads. Never read from the page's location here. When it
  // cannot be determined it stays undefined, and policy refuses Mainnet.
  const origin = useMemo(() => {
    try {
      return getRpId()
    } catch {
      return undefined
    }
  }, [])

  // Secrets and the key: refs only, never state.
  const pinRef = useRef<HTMLInputElement | null>(null)
  const pinConfirmRef = useRef<HTMLInputElement | null>(null)
  const seedRef = useRef<string | null>(null)
  // The pending written-Seed confirmation: resolved by the step's buttons, or
  // `false` if the flow is left. Answers live in uncontrolled inputs, never state.
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null)
  const pendingRef = useRef<{ meta: WalletMeta; key: CryptoKey; autoLockMinutes: number } | null>(null)
  const getSeed = useCallback(() => seedRef.current, [])

  const setWallets = useAppStore((s) => s.setWallets)
  const storedWallets = useAppStore((s) => s.wallets)
  const openLock = useAppStore((s) => s.openLock)

  const needsPin = openCheck === 'pin' || signing === 'pin'

  // One name per Seed (AD-42): sibling views share a name and never collide with each other.
  const otherNames = useMemo(() => {
    const bySeed = new Map<string, string>()
    for (const w of storedWallets) bySeed.set(w.seedId, w.label)
    return [...bySeed.values()]
  }, [storedWallets])
  // An empty label is the auto-suffixed default; only a typed one is judged.
  const typedVerdict = normalizeWalletName(label) === '' ? null : validateWalletName(label, otherNames)
  const labelError = typedVerdict && !typedVerdict.ok ? RENAME_ERRORS[typedVerdict.reason] : null

  const refreshAppPin = useCallback(async () => {
    try {
      const [exists, tries] = await Promise.all([hasAppPin(), triesRemaining()])
      setAppPin({ exists, tries })
      setPinReadFailed(false)
    } catch {
      setAppPin(null)
      setPinReadFailed(true)
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    Promise.all([hasAppPin(), triesRemaining()])
      .then(([exists, tries]) => {
        if (cancelled) return
        setAppPin({ exists, tries })
        setPinReadFailed(false)
      })
      .catch(() => !cancelled && setPinReadFailed(true))
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(
    () => () => {
      // Leaving the flow drops the Seed and the key with it.
      seedRef.current = null
      pendingRef.current = null
      confirmResolveRef.current?.(false)
      confirmResolveRef.current = null
    },
    [],
  )

  const options = describeOptions({
    network,
    seedMethod,
    openCheck,
    autoLockMinutes,
    signing,
    passkey: capability,
    origin,
    // This flow asks for the written Seed itself (the `confirm-seed` step).
    canConfirmWrittenSeed: true,
    ...(importSource ? { imported: true } : {}),
  })

  /** The pre-write callback the keystore calls with the new Seed (FR-72): shows
   * the step and resolves once the person confirms or cancels. */
  function confirmWrittenSeed(seed: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      seedRef.current = seed
      confirmResolveRef.current = resolve
      setStep('confirm-seed')
    })
  }

  function settleConfirmation(ok: boolean) {
    if (!confirmResolveRef.current) return
    const resolve = confirmResolveRef.current
    confirmResolveRef.current = null
    // The Seed leaves this component the moment the step ends: the keystore has it.
    seedRef.current = null
    resolve(ok)
    if (!ok) setStep('questions')
  }

  function changeNetwork(next: NetworkId) {
    setNewWalletNetwork(next)
    networkRef.current = next
    // A Node was proven for the network it was tested on, and only that one.
    setNodeMode('builtin')
    setVerifiedNode(null)
    setNodeReason(null)
    if (seedMethod === 'passkey-derived') setSigning('passkey')
    else if (!signingTouched) setSigning(defaultSigning(next, capability))
  }

  async function testNode() {
    setNodeBusy(true)
    setNodeReason(null)
    setVerifiedNode(null)
    const testedFor = network
    try {
      await verifyNode(network, nodeDraft.trim())
      // A result for a network that is no longer the chosen one proves nothing.
      if (networkRef.current === testedFor) setVerifiedNode(nodeDraft.trim())
    } catch (err: unknown) {
      if (networkRef.current !== testedFor) return
      // The flow keeps the built-in choice: nothing is stored.
      setNodeMode('builtin')
      setNodeReason(err instanceof Error ? err.message : 'This Node could not be checked.')
    } finally {
      setNodeBusy(false)
    }
  }

  function clearPinFields() {
    if (pinRef.current) pinRef.current.value = ''
    if (pinConfirmRef.current) pinConfirmRef.current.value = ''
  }

  async function handleCreate() {
    if (busy || !options.combination.ok || labelError) return
    setError(null)
    const newName = normalizeWalletName(label) === '' ? uniqueDefaultName('Wallet', otherNames) : label
    if (needsPin && pinReadFailed) {
      setError('Could not read the App PIN state. Retry before creating.')
      return
    }
    if (nodeMode === 'custom' && !verifiedNode) {
      setError('Test the custom Node first, or use the built-in Nodes.')
      return
    }
    let pin: string | undefined
    if (needsPin) {
      const typed = pinRef.current?.value ?? ''
      if (appPin?.exists) {
        if (typed === '') {
          setError('Enter your App PIN.')
          return
        }
      } else {
        if (typed.length < 6) {
          setError(MAX_PIN_FIELD_HINT)
          return
        }
        if (typed !== (pinConfirmRef.current?.value ?? '')) {
          setError("The two PINs don't match.")
          return
        }
      }
      pin = typed
    }
    setBusy(true)
    onInProgressChange?.(true)
    let created = false
    const nothingDone = importSource ? 'Nothing was imported.' : 'Nothing was created.'
    try {
      if (!importSource && seedMethod === 'passkey-derived') {
        const derived = await createDerivedWallet(
          {
            label: newName,
            network,
            ...(nodeMode === 'custom' && verifiedNode ? { node: verifiedNode } : {}),
            algorithm,
            openCheck,
            autoLockMinutes,
            passkeyChoice,
            passkey: capability,
          },
          { pin, confirmWrittenSeed, appPinExpected: appPin?.exists === true },
        )
        if (derived.status === 'ok') {
          pendingRef.current = { meta: derived.value.meta, key: derived.value.openKey, autoLockMinutes }
          setDerivedBackup({
            ordinal: derived.value.ordinal,
            label: derived.value.meta.label,
            ...(derived.value.backupEligible === undefined ? {} : { backupEligible: derived.value.backupEligible }),
          })
          created = true
          setStep('backup')
        } else if (derived.status === 'refused') {
          setError(derived.reason)
        } else if (derived.status === 'cancelled') {
          setError('Cancelled. Nothing was created.')
        } else if (derived.status === 'unsupported') {
          setError('This device or browser could not use a passkey for this wallet. Nothing was created.')
        } else {
          setError(`${describeCheckFailure(derived)} Nothing was created.`)
        }
        return
      }
      const nodeChoice = nodeMode === 'custom' && verifiedNode ? { node: verifiedNode } : {}
      const ctx = { pin, confirmWrittenSeed, appPinExpected: appPin?.exists === true }
      let result: Awaited<ReturnType<typeof createStoredWallet>> | Awaited<ReturnType<typeof importStoredWallet>>
      if (importSource) {
        // Order (AD-39): parse, duplicate probe, master-key check, then the keystore.
        const got = await importSource.acquire({ network, ...nodeChoice })
        if (got.status !== 'ok') {
          if (got.status === 'refused') setError(got.reason)
          else setError('Cancelled. Nothing was imported.')
          return
        }
        result = await importStoredWallet({ label: newName, network, ...nodeChoice, openCheck, autoLockMinutes, signing, seed: got.seed, passkey: capability }, ctx)
      } else {
        result = await createStoredWallet({ label: newName, network, ...nodeChoice, algorithm, openCheck, autoLockMinutes, signing, passkey: capability }, ctx)
      }
      switch (result.status) {
        case 'ok':
          pendingRef.current = { meta: result.value.meta, key: result.value.openKey, autoLockMinutes }
          created = true
          if (importSource || options.writtenSeedRequired) {
            // An import was typed in by the person; a required confirmation already
            // happened before anything was stored: no second backup screen, and
            // the Seed is not kept.
            setStep('finish')
            await finishBackup(true)
          } else if ('seed' in result.value) {
            seedRef.current = result.value.seed
            setStep('backup')
          } else {
            setError('Could not finish this wallet. Open it from the Wallets list.')
          }
          break
        case 'refused':
          setError(result.reason)
          break
        case 'cancelled':
          setError(`Cancelled. ${nothingDone}`)
          break
        case 'unsupported':
          setError(`This device or browser could not use a passkey for this wallet. ${nothingDone}`)
          break
        case 'wrong-credential':
          setError(`${describeCheckFailure(result)} ${nothingDone}`)
          break
        case 'locked-out':
          setError(`${describeCheckFailure(result)} ${nothingDone}`)
          break
      }
    } catch (err: unknown) {
      // An import never shows a library message: it is not ours to promise it holds no Seed.
      setError(importSource ? 'Could not import the wallet. Nothing was imported.' : err instanceof Error ? err.message : 'Could not create the wallet. Nothing was created.')
    } finally {
      importSource?.clear()
      clearPinFields()
      setBusy(false)
      if (!created) {
        onInProgressChange?.(false)
        // A written-Seed step the person passed leaves the screen on the Seed, with
        // its buttons inert and no place for the error: back to the questions, where
        // the reason shows and they can try again.
        setStep('questions')
      }
      void refreshAppPin().catch(() => {})
    }
  }

  async function finishBackup(fromCreate = false) {
    const pending = pendingRef.current
    if (!pending || (busy && !fromCreate)) return
    setBusy(true)
    try {
      await startLockSession(pending.meta.lockId, pending.key, pending.autoLockMinutes)
      // The lock first: Gate shows Main the moment a Wallet is listed, and a
      // Wallet whose lock is not yet open would flash its locked view.
      openLock(pending.meta.lockId, pending.key, pending.autoLockMinutes)
      setWallets(await listWallets(pending.meta.network))
      // Creation never selects: the caller decides (Onboarding sets its first wallet, Add wallet sets nothing).
      seedRef.current = null
      pendingRef.current = null
      setDerivedBackup(null)
      onInProgressChange?.(false)
      onDone?.(pending.meta)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not open the wallet.')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'confirm-seed') {
    return <WrittenSeedConfirm getSeed={getSeed} network={network} onSettle={settleConfirmation} />
  }

  if (step === 'finish') {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          {error ? 'The wallet was created but could not be opened.' : 'Opening your wallet…'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-text-destructive">
            {error}
          </p>
        )}
        {error && (
          <Button disabled={busy} onClick={() => void finishBackup()}>
            Try again
          </Button>
        )}
      </div>
    )
  }

  if (step === 'backup' && derivedBackup) {
    const kind = kindStatement(derivedBackup.backupEligible)
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="panel-legend">Write down your ordinal</h2>
          <p className="text-sm text-muted-foreground">
            This wallet has no Seed stored anywhere. Your passkey plus this number rebuild the wallet. This version has no restore screen yet. The number is shown only now.
          </p>
        </div>
        <div className="panel-well px-3 py-2">
          <p className="text-xs text-muted-foreground">Ordinal for “{derivedBackup.label}”</p>
          <p className="font-mono text-lg tracking-widest" aria-label={`Ordinal ${derivedBackup.ordinal.split('').join(' ')}`}>
            {derivedBackup.ordinal}
          </p>
        </div>
        <div className="text-sm">
          <p className="font-medium">{kind.title}</p>
          <p className="text-muted-foreground">{kind.body}</p>
        </div>
        <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
          <Checkbox checked={backedUp} onCheckedChange={(v) => setBackedUp(v === true)} />
          I've written down the ordinal with this wallet's name.
        </label>
        {error && (
          <p role="alert" className="text-sm text-text-destructive">
            {error}
          </p>
        )}
        <Button disabled={!backedUp || busy} onClick={() => void finishBackup()}>
          Continue to my wallet
        </Button>
      </div>
    )
  }

  if (step === 'backup') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="panel-legend">Back up your seed</h2>
          <p className="text-sm text-muted-foreground">Write it down: it is how you recover this wallet.</p>
        </div>
        <SeedReveal getSeed={getSeed} />
        <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
          <Checkbox checked={backedUp} onCheckedChange={(v) => setBackedUp(v === true)} />
          I've written down my seed and stored it somewhere safe.
        </label>
        {error && (
          <p role="alert" className="text-sm text-text-destructive">
            {error}
          </p>
        )}
        <Button disabled={!backedUp || busy} onClick={() => void finishBackup()}>
          Continue to my wallet
        </Button>
      </div>
    )
  }

  const verdict = options.combination
  const isRecommended =
    nodeMode === 'builtin' &&
    algorithm === 'ed25519' &&
    openCheck === (capability === 'yes' ? 'passkey' : 'pin') &&
    autoLockMinutes === 5 &&
    signing === (seedMethod === 'passkey-derived' ? 'passkey' : defaultSigning(network, capability))
  // What fixes a blocked combination or a failed Node test lives in Customise: show it then.
  const customiseForced = !verdict.ok || nodeReason !== null

  const createButton = (
    <Button type="button" aria-disabled={!verdict.ok || labelError || (needsPin && pinReadFailed) ? true : undefined} aria-describedby={!verdict.ok ? `${group}-blocked` : labelError ? `${group}-label-error` : undefined} disabled={busy} onClick={() => void handleCreate()}>
      {busy ? (importSource ? 'Importing…' : 'Creating…') : importSource ? 'Import wallet' : 'Create wallet'}
    </Button>
  )

  return (
    <div className="flex flex-col gap-5">
      {importSource?.field(busy)}
      <WalletQuestions
        imported={!!importSource}
        group={group}
        options={options}
        busy={busy}
        origin={origin}
        label={label}
        onLabelChange={setLabel}
        labelError={labelError}
        network={network}
        onNetworkChange={changeNetwork}
        nodeMode={nodeMode}
        onNodeMode={setNodeMode}
        nodeDraft={nodeDraft}
        onNodeDraft={(draft) => {
          setNodeDraft(draft)
          setVerifiedNode(null)
        }}
        verifiedNode={verifiedNode}
        nodeReason={nodeReason}
        nodeBusy={nodeBusy}
        onTestNode={() => void testNode()}
        seedMethod={seedMethod}
        onSelectStored={() => {
          setSeedMethod('stored')
          setSigningTouched(false)
          setSigning(defaultSigning(network, capability))
        }}
        onSelectDerived={() => {
          setSeedMethod('passkey-derived')
          // Its only Signing Check is its passkey (FR-67).
          setSigningTouched(true)
          setSigning('passkey')
        }}
        passkeyChoice={passkeyChoice}
        onPasskeyChoice={setPasskeyChoice}
        algorithm={algorithm}
        onAlgorithm={setAlgorithm}
        openCheck={openCheck}
        onOpenCheck={setOpenCheck}
        autoLockMinutes={autoLockMinutes}
        onAutoLockMinutes={setAutoLockMinutes}
        signing={signing}
        onSigning={(kind) => {
          setSigningTouched(true)
          setSigning(kind)
        }}
        isRecommended={isRecommended}
        customiseOpen={customiseOpen}
        onCustomiseOpen={setCustomiseOpen}
        customiseForced={customiseForced}
      />

      {needsPin && pinReadFailed && (
        <div role="alert" className="grid gap-1.5 text-sm">
          <p className="text-text-destructive">Could not read the App PIN state on this device.</p>
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void refreshAppPin()}>
            Retry
          </Button>
        </div>
      )}
      {needsPin && !pinReadFailed && appPin && (
        <div className="grid gap-1.5">
          {appPin.exists ? (
            <>
              <Label htmlFor={`${group}-pin`}>Your App PIN</Label>
              <Input id={`${group}-pin`} ref={pinRef} type="password" inputMode="numeric" autoComplete="off" disabled={busy} />
              <p className="text-xs text-muted-foreground">
                {appPin.tries} {appPin.tries === 1 ? 'try' : 'tries'} remaining. A wrong PIN counts; cancelling does not.
              </p>
            </>
          ) : (
            <>
              <Label htmlFor={`${group}-pin`}>Choose an App PIN (at least 6 digits)</Label>
              <Input id={`${group}-pin`} ref={pinRef} type="password" inputMode="numeric" autoComplete="new-password" disabled={busy} />
              <Label htmlFor={`${group}-pin-confirm`}>Confirm the App PIN</Label>
              <Input id={`${group}-pin-confirm`} ref={pinConfirmRef} type="password" inputMode="numeric" autoComplete="new-password" disabled={busy} />
              <p className="text-xs text-muted-foreground">One App PIN serves every wallet on this device that uses it.</p>
            </>
          )}
        </div>
      )}

      {!verdict.ok && (
        <Alert variant="warning" id={`${group}-blocked`}>
          <AlertTitle>This wallet cannot be created yet</AlertTitle>
          <AlertDescription>{verdict.reason}</AlertDescription>
        </Alert>
      )}
      {error && (
        <p role="alert" className="text-sm text-text-destructive">
          {error}
        </p>
      )}

      {actionHost ? createPortal(<ScreenFooter>{createButton}</ScreenFooter>, actionHost) : createButton}
    </div>
  )
}
