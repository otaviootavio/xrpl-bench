import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Axis, Choice } from '@/components/wallet/check-controls'
import { ScreenFooter, TaskScreen } from '@/components/wallet/TaskScreen'
import { useLeaveBlocker } from '@/hooks/useRoute'
import { minutesLabel } from '@/lib/minutes-label'
import { WrittenSeedConfirm } from '@/components/wallet/WrittenSeedConfirm'
import { usePrompts } from '@/hooks/usePrompts'
import { LEGACY_LOCK_ID } from '@/lib/crypto/db'
import { describeCheckFailure, editChecks, type EditChecksResult, type WalletMeta } from '@/lib/crypto/keystore'
import { getLockInfo, hasAppPin } from '@/lib/crypto/lock'
import { triesRemaining } from '@/lib/crypto/pin'
import {
  checkEditAllowed,
  describeEditOptions,
  olderBuildCannotOpen,
  resolveEdit,
  type CheckEditRequest,
  type CurrentChecks,
  type PasskeyCapability,
  type SigningKind,
} from '@/lib/crypto/policy'
import { detectPrfSupport, getRpId } from '@/lib/crypto/webauthn'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { useAppStore } from '@/store/app-store'

/**
 * Edit a Wallet's checks (FR-73, AD-28): Open Check, auto-lock, Signing Check and
 * their passkeys. This component only RENDERS. What the edit would leave, which
 * answers are legal and why one is not all come from `lib/crypto/policy.ts`; the
 * change itself is `keystore.editChecks`, which asks the current check, judges the
 * result again and writes atomically. An unavailable answer is `aria-disabled` with
 * its reason as visible text — never hidden, never colour alone.
 *
 * Secrets: a typed PIN is in an uncontrolled input, read once and cleared; the
 * written Seed (FR-72) is held in a ref for its step only.
 */

export type EditedChecks = Extract<EditChecksResult, { status: 'ok' }>['value']

type OpenSel = 'keep' | 'pin' | 'passkey-new' | 'passkey-existing' | 'none'
type SignSel = 'keep' | 'standard' | 'pin' | 'passkey-new' | 'passkey-existing'

const MIN_PIN_HINT = 'The App PIN must be at least 6 digits.'

function openCheckWords(kind: string): string {
  switch (kind) {
    case 'pin':
      return 'App PIN'
    case 'passkey':
      return 'Passkey'
    case 'either':
      return 'Passkey or App PIN, shared with the other wallets on this lock'
    default:
      return 'No Open Check'
  }
}

function signingWords(kind: SigningKind): string {
  return kind === 'standard' ? 'Standard' : kind === 'passkey' ? 'Passkey only' : 'App PIN only'
}

export interface EditChecksScreenProps {
  /** The Wallet to edit; its lock is open (the route mounts this only then). */
  wallet: WalletMeta
  /** Leaves the screen: after a committed edit, or when the user goes back. */
  onClose: () => void
  /** Called once the edit is committed. The caller swaps the lock and session. */
  onEdited: (edited: EditedChecks) => void | Promise<void>
}

export function EditChecksScreen({ wallet, onClose, onEdited }: EditChecksScreenProps) {
  // A step that is writing or waiting on the written Seed must not be left from under it.
  const [locked, setLocked] = useState(false)
  useLeaveBlocker(locked)
  return (
    <TaskScreen
      title="Edit checks"
      description={`${wallet.label}. The address does not change. The check you pass now is the one the change affects.`}
      onBack={onClose}
      locked={locked}
    >
      <EditChecksForm key={wallet.id} wallet={wallet} onClose={onClose} onEdited={onEdited} onLockedChange={setLocked} />
    </TaskScreen>
  )
}

function EditChecksForm({
  wallet,
  onClose,
  onEdited,
  onLockedChange,
}: {
  wallet: WalletMeta
  onClose: () => void
  onEdited: EditChecksScreenProps['onEdited']
  onLockedChange: (locked: boolean) => void
}) {
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
  const lockQuery = useQuery({ queryKey: queryKeys.lockInfo(wallet.lockId), queryFn: () => getLockInfo(wallet.lockId) })

  if (lockQuery.isError) {
    return (
      <>
        <p role="alert" className="text-sm text-text-destructive">
          Could not read this wallet's checks. Nothing was changed.
        </p>
        <Button variant="outline" className="w-fit" onClick={() => void lockQuery.refetch()}>
          Retry
        </Button>
      </>
    )
  }
  if (capability === null || !lockQuery.data) {
    return (
      <>
        <p role="status" className="text-sm text-muted-foreground">
          Checking what this device supports…
        </p>
      </>
    )
  }
  return (
    <EditChecksBody
      wallet={wallet}
      capability={capability}
      lock={{ openCheck: lockQuery.data.openCheck, autoLockMinutes: lockQuery.data.autoLockMinutes }}
      onClose={onClose}
      onEdited={onEdited}
      onLockedChange={onLockedChange}
    />
  )
}

function EditChecksBody({
  wallet,
  capability,
  lock,
  onClose,
  onEdited,
  onLockedChange,
}: {
  wallet: WalletMeta
  capability: PasskeyCapability
  lock: { openCheck: CurrentChecks['openCheck']; autoLockMinutes: number }
  onClose: () => void
  onEdited: EditChecksScreenProps['onEdited']
  onLockedChange: (locked: boolean) => void
}) {
  const group = useId()
  const prompts = usePrompts()
  const wallets = useAppStore((s) => s.wallets)
  const [openSel, setOpenSel] = useState<OpenSel>('keep')
  const [signSel, setSignSel] = useState<SignSel>('keep')
  const [minutes, setMinutes] = useState(lock.autoLockMinutes)
  const [step, setStep] = useState<'form' | 'confirm-seed'>('form')
  const [busy, setBusy] = useState(false)
  // The edit is written but the caller could not finish: the form still holds the
  // pre-edit values, so a second Save would send a stale request. Only Close is left.
  const [committed, setCommitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appPin, setAppPin] = useState<{ exists: boolean; tries: number } | null>(null)
  const [pinReadFailed, setPinReadFailed] = useState(false)
  // Secrets: refs only, never state.
  const pinRef = useRef<HTMLInputElement | null>(null)
  const pinConfirmRef = useRef<HTMLInputElement | null>(null)
  const seedRef = useRef<string | null>(null)
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null)
  const getSeed = useCallback(() => seedRef.current, [])

  const derived = wallet.seedMethod === 'passkey-derived'
  const current: CurrentChecks = {
    seedMethod: wallet.seedMethod,
    openCheck: lock.openCheck,
    signing: derived ? 'passkey' : wallet.signingCheck,
    autoLockMinutes: lock.autoLockMinutes,
  }
  const request: CheckEditRequest = {
    ...(openSel === 'keep' ? {} : { openCheck: { kind: openSel === 'none' ? 'none' : openSel === 'pin' ? 'pin' : 'passkey', ...(openSel === 'passkey-new' ? { passkey: 'new' as const } : openSel === 'passkey-existing' ? { passkey: 'existing' as const } : {}) } }),
    ...(signSel === 'keep' ? {} : { signing: { kind: signSel === 'standard' ? 'standard' : signSel === 'pin' ? 'pin' : 'passkey', ...(signSel === 'passkey-new' ? { passkey: 'new' as const } : signSel === 'passkey-existing' ? { passkey: 'existing' as const } : {}) } }),
    // Only a changed window is sent: a stale cached read must not revert a window set elsewhere.
    ...(minutes !== lock.autoLockMinutes ? { autoLockMinutes: minutes } : {}),
  } as CheckEditRequest
  const resolved = resolveEdit(current, request)
  // Mainnet if any view of this Seed is Mainnet (the same rule as `editChecks`).
  const network: NetworkId = wallets.some((w) => w.seedId === wallet.seedId && w.network === 'mainnet') ? 'mainnet' : wallet.network
  const origin = useMemo(() => {
    try {
      return getRpId()
    } catch {
      return undefined
    }
  }, [])
  const options = describeEditOptions({
    network,
    seedMethod: wallet.seedMethod,
    openCheck: resolved.result.openCheck,
    autoLockMinutes: resolved.result.autoLockMinutes,
    signing: resolved.result.signing,
    passkey: capability,
    origin,
    // This dialog asks for the written Seed itself (the `confirm-seed` step).
    canConfirmWrittenSeed: true,
    writtenSeedConfirmed: wallet.writtenSeedConfirmedAt !== undefined,
    // The auto-lock floor reads every Wallet on the lock the window will apply to.
    lockNetworks: wallets
      .filter((w) => (resolved.openChange ? w.seedId === wallet.seedId : w.lockId === wallet.lockId))
      .map((w) => w.network),
  })
  const allowed = checkEditAllowed(current, resolved)
  const verdict = !allowed.ok ? allowed : options.combination
  const needsPin = (resolved.openChange && resolved.result.openCheck === 'pin') || (resolved.signingChange && resolved.result.signing === 'pin')
  const warnOlder = olderBuildCannotOpen({ lockIsLegacy: wallet.lockId === LEGACY_LOCK_ID, signing: current.signing }, resolved)

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
      // Leaving the dialog drops the Seed with it.
      seedRef.current = null
      confirmResolveRef.current?.(false)
      confirmResolveRef.current = null
    },
    [],
  )
  useEffect(() => {
    onLockedChange(busy || step === 'confirm-seed')
    return () => onLockedChange(false)
  }, [busy, step, onLockedChange])

  function confirmWrittenSeed(seed: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      seedRef.current = seed
      confirmResolveRef.current = resolve
      setStep('confirm-seed')
    })
  }

  function settleConfirmation(ok: boolean) {
    const resolve = confirmResolveRef.current
    if (!resolve) return
    confirmResolveRef.current = null
    seedRef.current = null
    resolve(ok)
    if (!ok) setStep('form')
  }

  function clearPinFields() {
    if (pinRef.current) pinRef.current.value = ''
    if (pinConfirmRef.current) pinConfirmRef.current.value = ''
  }

  async function save() {
    if (busy || committed || !resolved.changed || !verdict.ok) return
    setError(null)
    if (needsPin && pinReadFailed) {
      setError('Could not read the App PIN state. Retry before saving.')
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
          setError(MIN_PIN_HINT)
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
    try {
      const result = await editChecks(wallet.id, request, { prompts, pin, confirmWrittenSeed, passkey: capability })
      switch (result.status) {
        case 'ok':
          try {
            await onEdited(result.value)
          } catch {
            // The edit IS written: say so, never "Nothing was changed".
            setError('Saved, but the wallet could not be reopened. Unlock it again.')
            setCommitted(true)
            return
          }
          onClose()
          return
        case 'refused':
          setError(result.reason)
          break
        case 'cancelled':
          setError('Cancelled. Nothing was changed.')
          break
        case 'unsupported':
          setError('This device or browser could not use a passkey for this change. Nothing was changed.')
          break
        default:
          setError(`${describeCheckFailure(result)} Nothing was changed.`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change the checks. Nothing was changed.')
    } finally {
      clearPinFields()
      setBusy(false)
      setStep('form')
      void refreshAppPin()
    }
  }

  if (step === 'confirm-seed') {
    return <WrittenSeedConfirm getSeed={getSeed} network={network} onSettle={settleConfirmation} />
  }

  const openKeep = (
    <Choice
      name={`${group}-open`}
      checked={openSel === 'keep'}
      label={`Keep: ${openCheckWords(lock.openCheck)}`}
      state={{ available: true }}
      onSelect={() => setOpenSel('keep')}
    />
  )
  const signKeep = (
    <Choice
      name={`${group}-sign`}
      checked={signSel === 'keep'}
      label={`Keep: ${signingWords(current.signing)}`}
      state={{ available: true }}
      onSelect={() => setSignSel('keep')}
    />
  )
  // A Passkey-Derived Wallet shows every Signing Check answer, all unavailable with the reason.
  const showSigning = (kind: SigningKind) => derived || current.signing !== kind

  return (
    <>
      <div className="flex flex-col gap-5">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>Network: {NETWORKS[network].label}</span>
          {network === 'mainnet' && <Badge variant="warning">Real funds</Badge>}
        </p>

        <Axis legend="Open Check">
          {openKeep}
          {lock.openCheck !== 'pin' && (
            <Choice name={`${group}-open`} checked={openSel === 'pin'} label="App PIN" state={options.openCheck.pin} onSelect={() => setOpenSel('pin')} />
          )}
          <Choice
            name={`${group}-open`}
            checked={openSel === 'passkey-new'}
            label={lock.openCheck === 'passkey' ? 'A new passkey' : 'Passkey: create a new one'}
            detail="Named after this wallet."
            state={options.openCheck.passkey}
            onSelect={() => setOpenSel('passkey-new')}
          />
          <Choice
            name={`${group}-open`}
            checked={openSel === 'passkey-existing'}
            label="Passkey: use one already on this device"
            state={options.openCheck.passkey}
            onSelect={() => setOpenSel('passkey-existing')}
          />
          {lock.openCheck !== 'none' && (
            <Choice name={`${group}-open`} checked={openSel === 'none'} label="No Open Check" state={options.openCheck.none} onSelect={() => setOpenSel('none')} />
          )}
        </Axis>

        <Axis legend="Auto-lock after inactivity">
          {options.autoLock.map((choice) => (
            <Choice
              key={choice.minutes}
              name={`${group}-lock`}
              checked={minutes === choice.minutes}
              label={minutesLabel(choice.minutes)}
              state={choice}
              onSelect={() => setMinutes(choice.minutes)}
            />
          ))}
          {lock.openCheck === 'either' && (
            <p className="text-xs text-muted-foreground">This wallet is on the lock shared with the other wallets made before per-wallet locks. Changing the auto-lock changes it for all of them.</p>
          )}
        </Axis>

        <Axis legend="Signing Check">
          {signKeep}
          {showSigning('standard') && (
            <Choice
              name={`${group}-sign`}
              checked={signSel === 'standard'}
              label="Standard"
              detail="Signs once the wallet is open, with no further check."
              state={options.signing.standard}
              onSelect={() => setSignSel('standard')}
            />
          )}
          {showSigning('pin') && (
            <Choice
              name={`${group}-sign`}
              checked={signSel === 'pin'}
              label="App PIN only"
              detail="The App PIN for every signature."
              state={options.signing.pin}
              onSelect={() => setSignSel('pin')}
            />
          )}
          <Choice
            name={`${group}-sign`}
            checked={signSel === 'passkey-new'}
            label={current.signing === 'passkey' ? 'A new passkey' : 'Passkey only: create a new one'}
            detail="A passkey prompt for every signature. Named after this wallet."
            state={options.signing.passkey}
            onSelect={() => setSignSel('passkey-new')}
          />
          <Choice
            name={`${group}-sign`}
            checked={signSel === 'passkey-existing'}
            label="Passkey only: use one already on this device"
            state={options.signing.passkey}
            onSelect={() => setSignSel('passkey-existing')}
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
                <Label htmlFor={`${group}-pin`}>Your App PIN, for the new check</Label>
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

        {warnOlder && (
          <Alert variant="warning">
            <AlertTitle>An older version of this app can no longer open this wallet</AlertTitle>
            <AlertDescription>
              After this change the wallet only opens with this version or a newer one. Updates are never automatic, so make sure every device you use it on is up to date.
            </AlertDescription>
          </Alert>
        )}
        {resolved.changed && !verdict.ok && (
          <Alert variant="warning" id={`${group}-blocked`}>
            <AlertTitle>This change cannot be made yet</AlertTitle>
            <AlertDescription>{verdict.reason}</AlertDescription>
          </Alert>
        )}
        {resolved.changed && verdict.ok && options.writtenSeedRequired && (
          <p className="text-sm text-muted-foreground">
            After this change a passkey is the only check on this Mainnet wallet, so you will be asked to write your Seed down and type parts of it back before anything is saved.
          </p>
        )}
        {!resolved.changed && <p className="text-sm text-muted-foreground">Nothing to change yet. Pick a different answer above.</p>}
        {error && (
          <p role="alert" className="text-sm text-text-destructive">
            {error}
          </p>
        )}

        <ScreenFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            aria-disabled={committed || !resolved.changed || !verdict.ok || (needsPin && pinReadFailed) ? true : undefined}
            aria-describedby={resolved.changed && !verdict.ok ? `${group}-blocked` : undefined}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </ScreenFooter>
      </div>
    </>
  )
}
