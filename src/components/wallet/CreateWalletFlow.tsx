import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Axis, Choice } from '@/components/wallet/check-controls'
import { minutesLabel } from '@/lib/minutes-label'
import { NetworkChoice } from '@/components/wallet/NetworkChoice'
import { ScreenFooter } from '@/components/wallet/TaskScreen'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { WrittenSeedConfirm } from '@/components/wallet/WrittenSeedConfirm'
import { createDerivedWallet, createStoredWallet, describeCheckFailure, listWallets, type WalletMeta } from '@/lib/crypto/keystore'
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
import { builtInNodes, NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
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
export interface CreateWalletFlowProps {
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

function CreateWalletForm({ capability, onDone, onInProgressChange, defaultLabel = 'My Wallet', actionHost = null }: CreateWalletFlowProps & { capability: PasskeyCapability }) {
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
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const openLock = useAppStore((s) => s.openLock)

  const needsPin = openCheck === 'pin' || signing === 'pin'

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
    if (busy || !options.combination.ok) return
    setError(null)
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
    try {
      if (seedMethod === 'passkey-derived') {
        const derived = await createDerivedWallet(
          {
            label: label.trim() || 'Wallet',
            network,
            ...(nodeMode === 'custom' && verifiedNode ? { node: verifiedNode } : {}),
            algorithm,
            openCheck,
            autoLockMinutes,
            passkeyChoice,
            passkey: capability,
          },
          { pin, confirmWrittenSeed },
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
      const result = await createStoredWallet(
        {
          label: label.trim() || 'Wallet',
          network,
          ...(nodeMode === 'custom' && verifiedNode ? { node: verifiedNode } : {}),
          algorithm,
          openCheck,
          autoLockMinutes,
          signing,
          passkey: capability,
        },
        { pin, confirmWrittenSeed },
      )
      switch (result.status) {
        case 'ok':
          pendingRef.current = { meta: result.value.meta, key: result.value.openKey, autoLockMinutes }
          created = true
          if (options.writtenSeedRequired) {
            // Already written down and confirmed before anything was stored: no
            // second backup screen, and the Seed is not kept.
            setStep('finish')
            await finishBackup(true)
          } else {
            seedRef.current = result.value.seed
            setStep('backup')
          }
          break
        case 'refused':
          setError(result.reason)
          break
        case 'cancelled':
          setError('Cancelled. Nothing was created.')
          break
        case 'unsupported':
          setError('This device or browser could not use a passkey for this wallet. Nothing was created.')
          break
        case 'wrong-credential':
          setError(`${describeCheckFailure(result)} Nothing was created.`)
          break
        case 'locked-out':
          setError(`${describeCheckFailure(result)} Nothing was created.`)
          break
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create the wallet. Nothing was created.')
    } finally {
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
      setActiveWalletId(pending.meta.id)
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

  const nodes = builtInNodes(network)
  const verdict = options.combination
  const isRecommended =
    nodeMode === 'builtin' &&
    algorithm === 'ed25519' &&
    openCheck === (capability === 'yes' ? 'passkey' : 'pin') &&
    autoLockMinutes === 5 &&
    signing === (seedMethod === 'passkey-derived' ? 'passkey' : defaultSigning(network, capability))
  // What fixes a blocked combination or a failed Node test lives in Customise: show it then.
  const customiseShown = customiseOpen || !verdict.ok || nodeReason !== null
  const summaryRows: [string, string][] = [
    ['Network', NETWORKS[network].label],
    ['Node', nodeMode === 'builtin' ? 'Built-in Nodes' : verifiedNode ? `${verifiedNode} (tested)` : 'Your own Node (not tested yet)'],
    ['Seed Method', seedMethod === 'stored' ? 'Stored Seed' : 'Passkey-Derived Seed'],
    ['Signature type', algorithm === 'ed25519' ? 'Ed25519' : 'secp256k1'],
    ['Open Check', openCheck === 'pin' ? 'App PIN' : openCheck === 'passkey' ? 'Passkey' : 'No Open Check'],
    ['Auto-lock', minutesLabel(autoLockMinutes)],
    ['Signing Check', signing === 'standard' ? 'Standard' : signing === 'passkey' ? 'Passkey only' : 'App PIN only'],
  ]

  const createButton = (
    <Button type="button" aria-disabled={!verdict.ok || (needsPin && pinReadFailed) ? true : undefined} aria-describedby={!verdict.ok ? `${group}-blocked` : undefined} disabled={busy} onClick={() => void handleCreate()}>
      {busy ? 'Creating…' : 'Create wallet'}
    </Button>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor={`${group}-label`}>Label</Label>
        <Input id={`${group}-label`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Savings" disabled={busy} />
      </div>

      <NetworkChoice value={network} onChange={changeNetwork} disabled={busy || nodeBusy} />

      <Axis legend="Seed Method">
        <Choice
          name={`${group}-seed`}
          checked={seedMethod === 'stored'}
          label="Stored Seed"
          detail="A Seed is generated here and kept on this device, encrypted."
          state={options.seedMethod.stored}
          onSelect={() => {
            setSeedMethod('stored')
            setSigningTouched(false)
            setSigning(defaultSigning(network, capability))
          }}
        />
        <Choice
          name={`${group}-seed`}
          checked={seedMethod === 'passkey-derived'}
          label="Passkey-Derived Seed"
          detail="No Seed is stored: it is computed from your passkey each time it is needed."
          state={options.seedMethod['passkey-derived']}
          onSelect={() => {
            setSeedMethod('passkey-derived')
            // Its only Signing Check is its passkey (FR-67).
            setSigningTouched(true)
            setSigning('passkey')
          }}
        />
      </Axis>

      {seedMethod === 'passkey-derived' && (
        <>
          <Axis legend="Passkey">
            <Choice
              name={`${group}-passkey`}
              checked={passkeyChoice === 'new'}
              label="Create a new passkey"
              detail="The passkey is named after this wallet."
              state={{ available: true }}
              onSelect={() => setPasskeyChoice('new')}
            />
            <Choice
              name={`${group}-passkey`}
              checked={passkeyChoice === 'existing'}
              label="Use an existing passkey"
              detail="Your browser lists the passkeys on this device for this app."
              state={{ available: true }}
              onSelect={() => setPasskeyChoice('existing')}
            />
          </Axis>
          <Alert variant="warning">
            <AlertTitle>This Seed depends on the app's domain</AlertTitle>
            <AlertDescription>
              {origin ? `Your passkey is tied to ${origin}. ` : 'Your passkey is tied to the address this app is served from. '}
              If the app's domain ever changes, this wallet cannot be opened from the passkey. It could then be recovered only with a written Seed or a Controlling Wallet.
            </AlertDescription>
          </Alert>
        </>
      )}

      <section aria-labelledby={`${group}-recommended`} className="panel-well grid gap-2 px-3 py-2">
        <h2 id={`${group}-recommended`} className="font-legend text-xs uppercase text-muted-foreground">
          {isRecommended ? 'Recommended' : 'Your choices'}
        </h2>
        <dl className="grid gap-y-2 text-sm">
          {summaryRows.map(([term, value]) => (
            <div key={term}>
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          aria-expanded={customiseShown}
          aria-controls={`${group}-customise`}
          onClick={() => setCustomiseOpen(!customiseShown)}
        >
          Customise
          {customiseShown ? <ChevronUpIcon className="size-3.5" aria-hidden /> : <ChevronDownIcon className="size-3.5" aria-hidden />}
        </Button>
        <div id={`${group}-customise`} hidden={!customiseShown} className="flex flex-col gap-5">
          <Axis legend="Node">
            <Choice
              name={`${group}-node`}
              checked={nodeMode === 'builtin'}
              label="Built-in Nodes"
              state={{ available: true }}
              detail={nodes.join(', ')}
              onSelect={() => setNodeMode('builtin')}
            />
            <Choice
              name={`${group}-node`}
              checked={nodeMode === 'custom'}
              label="A Node you choose"
              state={{ available: true }}
              onSelect={() => setNodeMode('custom')}
            />
            {nodeMode === 'custom' && (
              <div className="grid gap-1.5 text-xs">
                <Label htmlFor={`${group}-node-url`}>Node address (wss://)</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id={`${group}-node-url`}
                    value={nodeDraft}
                    onChange={(e) => {
                      setNodeDraft(e.target.value)
                      setVerifiedNode(null)
                    }}
                    placeholder="wss://node.example.com"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={nodeBusy || busy}
                    className="min-w-0 flex-1"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => void testNode()} disabled={nodeBusy || busy || nodeDraft.trim() === ''}>
                    {nodeBusy ? 'Checking…' : 'Test this Node'}
                  </Button>
                </div>
                {verifiedNode && <p className="text-muted-foreground">This Node answers for this network and will be used.</p>}
              </div>
            )}
          </Axis>

          <Axis legend="Signature type">
            <Choice name={`${group}-algo`} checked={algorithm === 'ed25519'} label="Ed25519" state={{ available: true }} onSelect={() => setAlgorithm('ed25519')} />
            <Choice name={`${group}-algo`} checked={algorithm === 'secp256k1'} label="secp256k1" state={{ available: true }} onSelect={() => setAlgorithm('secp256k1')} />
          </Axis>

          <Axis legend="Open Check">
            <Choice name={`${group}-open`} checked={openCheck === 'pin'} label="App PIN" state={options.openCheck.pin} onSelect={() => setOpenCheck('pin')} />
            <Choice name={`${group}-open`} checked={openCheck === 'passkey'} label="Passkey" state={options.openCheck.passkey} onSelect={() => setOpenCheck('passkey')} />
            <Choice
              name={`${group}-open`}
              checked={openCheck === 'none'}
              label="No Open Check"
              detail={options.openCheck.none.available ? 'Opens without asking. Testnet and Devnet only.' : undefined}
              state={options.openCheck.none}
              onSelect={() => setOpenCheck('none')}
            />
          </Axis>

          <Axis legend="Auto-lock after inactivity">
            {options.autoLock.map((choice) => (
              <Choice
                key={choice.minutes}
                name={`${group}-lock`}
                checked={autoLockMinutes === choice.minutes}
                label={minutesLabel(choice.minutes)}
                state={choice}
                onSelect={() => setAutoLockMinutes(choice.minutes)}
              />
            ))}
          </Axis>

          <Axis legend="Signing Check">
            <Choice
              name={`${group}-sign`}
              checked={signing === 'standard'}
              label="Standard"
              detail="Signs without asking again once the wallet is open."
              state={options.signing.standard}
              onSelect={() => {
                setSigningTouched(true)
                setSigning('standard')
              }}
            />
            <Choice
              name={`${group}-sign`}
              checked={signing === 'passkey'}
              label="Passkey only"
              detail="Asks for your passkey on every signature."
              state={options.signing.passkey}
              onSelect={() => {
                setSigningTouched(true)
                setSigning('passkey')
              }}
            />
            <Choice
              name={`${group}-sign`}
              checked={signing === 'pin'}
              label="App PIN only"
              detail="Asks for your App PIN on every signature."
              state={options.signing.pin}
              onSelect={() => {
                setSigningTouched(true)
                setSigning('pin')
              }}
            />
          </Axis>
        </div>
      </div>

      {nodeReason && (
        <p role="alert" className="text-xs text-text-destructive">
          Not used. {nodeReason} The built-in Nodes stay selected.
        </p>
      )}

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
