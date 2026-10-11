import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NetworkChoice } from '@/components/wallet/NetworkChoice'
import { SeedReveal } from '@/components/wallet/SeedReveal'
import { createStoredWallet, describeCheckFailure, listWallets, type WalletMeta } from '@/lib/crypto/keystore'
import { hasAppPin, startLockSession } from '@/lib/crypto/lock'
import { triesRemaining } from '@/lib/crypto/pin'
import {
  describeOptions,
  type NewOpenCheck,
  type OptionState,
  type PasskeyCapability,
  type SeedMethod,
  type SigningKind,
} from '@/lib/crypto/policy'
import { detectPrfSupport } from '@/lib/crypto/webauthn'
import { verifyNode } from '@/lib/xrpl/client'
import { builtInNodes, type NetworkId } from '@/lib/xrpl/networks'
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
}

type Step = 'questions' | 'backup'

const MAX_PIN_FIELD_HINT = 'The App PIN must be at least 6 digits.'

function defaultSigning(network: NetworkId, capability: PasskeyCapability): SigningKind {
  if (network !== 'mainnet') return 'standard'
  return capability === 'yes' ? 'passkey' : 'pin'
}

function minutesLabel(minutes: number): string {
  return minutes < 1 ? `${minutes * 60} seconds` : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/** One radio. An unavailable answer stays in the reading order: `aria-disabled`,
 * its reason in visible text, and selecting it does nothing. */
function Choice({
  name,
  checked,
  label,
  state,
  onSelect,
  detail,
}: {
  name: string
  checked: boolean
  label: ReactNode
  state: OptionState
  onSelect: () => void
  detail?: ReactNode
}) {
  const textId = useId()
  const hasText = !state.available || !!state.note || !!detail
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name={name}
          checked={checked}
          aria-disabled={state.available ? undefined : true}
          aria-describedby={hasText ? textId : undefined}
          onChange={() => {
            if (state.available) onSelect()
          }}
          onClick={(event) => {
            if (!state.available) event.preventDefault()
          }}
          className="mt-1"
        />
        <span>{label}</span>
      </label>
      {hasText && (
        <div id={textId} className="ml-6">
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
          {state.note && <p className="text-xs text-muted-foreground">{state.note}</p>}
          {!state.available && state.reason && <p className="text-xs text-text-warning">{state.reason}</p>}
        </div>
      )}
    </div>
  )
}

function Axis({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  )
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

function CreateWalletForm({ capability, onDone, onInProgressChange, defaultLabel = 'My Wallet' }: CreateWalletFlowProps & { capability: PasskeyCapability }) {
  const group = useId()
  const [step, setStep] = useState<Step>('questions')
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

  // Secrets and the key: refs only, never state.
  const pinRef = useRef<HTMLInputElement | null>(null)
  const pinConfirmRef = useRef<HTMLInputElement | null>(null)
  const seedRef = useRef<string | null>(null)
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
    passkeyDerivedBuilt: false,
  })

  function changeNetwork(next: NetworkId) {
    setNewWalletNetwork(next)
    networkRef.current = next
    // A Node was proven for the network it was tested on, and only that one.
    setNodeMode('builtin')
    setVerifiedNode(null)
    setNodeReason(null)
    if (!signingTouched) setSigning(defaultSigning(next, capability))
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
        { pin },
      )
      switch (result.status) {
        case 'ok':
          seedRef.current = result.value.seed
          pendingRef.current = { meta: result.value.meta, key: result.value.openKey, autoLockMinutes }
          created = true
          setStep('backup')
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
      if (!created) onInProgressChange?.(false)
      void refreshAppPin().catch(() => {})
    }
  }

  async function finishBackup() {
    const pending = pendingRef.current
    if (!pending || busy) return
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
      onInProgressChange?.(false)
      onDone?.(pending.meta)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not open the wallet.')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'backup') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Back up your seed</h2>
          <p className="text-sm text-muted-foreground">This is the only way to recover your wallet.</p>
        </div>
        <SeedReveal getSeed={getSeed} />
        <label className="flex items-center gap-2 text-sm">
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

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor={`${group}-label`}>Label</Label>
        <Input id={`${group}-label`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Savings" disabled={busy} />
      </div>

      <NetworkChoice value={network} onChange={changeNetwork} disabled={busy || nodeBusy} />

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
        {nodeReason && (
          <p role="alert" className="text-xs text-text-destructive">
            Not used. {nodeReason} The built-in Nodes stay selected.
          </p>
        )}
      </Axis>

      <Axis legend="Seed Method">
        <Choice
          name={`${group}-seed`}
          checked={seedMethod === 'stored'}
          label="Stored Seed"
          detail="A Seed is generated here and kept on this device, encrypted."
          state={options.seedMethod.stored}
          onSelect={() => setSeedMethod('stored')}
        />
        <Choice
          name={`${group}-seed`}
          checked={seedMethod === 'passkey-derived'}
          label="Passkey-Derived Seed"
          state={options.seedMethod['passkey-derived']}
          onSelect={() => setSeedMethod('passkey-derived')}
        />
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
          detail="Signs once the wallet is open, with no further check."
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
          detail="A passkey prompt for every signature."
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
          detail="The App PIN for every signature."
          state={options.signing.pin}
          onSelect={() => {
            setSigningTouched(true)
            setSigning('pin')
          }}
        />
      </Axis>

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

      <Button type="button" aria-disabled={!verdict.ok || (needsPin && pinReadFailed) ? true : undefined} aria-describedby={!verdict.ok ? `${group}-blocked` : undefined} disabled={busy} onClick={() => void handleCreate()}>
        {busy ? 'Creating…' : 'Create wallet'}
      </Button>
    </div>
  )
}
