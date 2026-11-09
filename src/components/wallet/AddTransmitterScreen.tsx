import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { isValidClassicAddress } from 'xrpl'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TaskScreen } from '@/components/wallet/TaskScreen'
import { QuizShell, type QuizStep } from '@/components/wallet/QuizShell'
import { NameAndNetworkStep, NodeQuestion, OpenCheckQuestion, ReviewPlate, ReviewStep, type AnswerRow, type WalletQuestionsProps } from '@/components/wallet/WalletQuestions'
import { formatAutoLock, formatLabel, formatNetwork, formatNode, formatOpenCheck, QUESTION_TERMS, WALK_QUESTIONS } from '@/components/wallet/walk-questions'
import { NETWORK_LOCKED_NOTE } from '@/components/wallet/check-words'
import { NETWORK_RESET_NOTE, preselection } from '@/components/wallet/network-reset'
import { RENAME_ERRORS } from '@/components/wallet/rename-copy'
import { WarningSentence } from '@/components/wallet/WarningSentence'
import { useLeaveBlocker } from '@/hooks/useRoute'
import { announceAdded } from '@/lib/chooser-signals'
import { createTransmitterWallet, describeCheckFailure, listWallets } from '@/lib/crypto/keystore'
import { hasAppPin, startLockSession } from '@/lib/crypto/lock'
import { triesRemaining } from '@/lib/crypto/pin'
import { checkLockRequest, describeOptions, type NewOpenCheck, type PasskeyCapability } from '@/lib/crypto/policy'
import { detectPrfSupport } from '@/lib/crypto/webauthn'
import { toast } from '@/lib/notify'
import { INVALID_ADDRESS, offlineWalletHas } from '@/lib/same-address'
import { ADD_TRANSMITTER, SAME_ADDRESS_OFFLINE_HERE, SKIP_THIS_STEP, SYNC_LATER, SYNC_TO_AN_ADDRESS } from '@/lib/transmitter-words'
import { NOT_SYNCED } from '@/lib/wallet-kind-words'
import { normalizeWalletName, uniqueDefaultName, validateWalletName } from '@/lib/wallet-name'
import { verifyNode } from '@/lib/xrpl/client'
import type { NetworkId } from '@/lib/xrpl/networks'
import { useAppStore } from '@/store/app-store'


const step = (id: string) => WALK_QUESTIONS.find((q) => q.id === id)!

/**
 * Add a Transmitter wallet (P-2, OS-FR-3, OS-FR-4), a chooser-side screen like Add
 * wallet. The quiz is EXPERIENCE "Add Transmitter quiz": Label and Network, Node,
 * Open Check and auto-lock, Sync to an address (optional, P-41), Review. There is
 * no Seed and no Signing Check question: a Transmitter holds no key. The rule is
 * the lock's alone (`checkLockRequest`, FR-65): no written-Seed or passkey-origin
 * safeguard. The keystore decides again before it writes.
 */
export function AddTransmitterScreen({
  onClose,
  onAdded,
  backLabel = 'Wallets',
}: {
  onClose: () => void
  /** First run: the new Wallet becomes the active one. */
  onAdded?: (walletId: string) => void
  backLabel?: string
}) {
  const [capability, setCapability] = useState<PasskeyCapability | null>(null)
  const [busy, setBusy] = useState(false)
  useLeaveBlocker(busy)
  useEffect(() => {
    let cancelled = false
    detectPrfSupport()
      .then((found) => !cancelled && setCapability(found))
      .catch(() => !cancelled && setCapability('unknown'))
    return () => {
      cancelled = true
    }
  }, [])
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  return (
    <TaskScreen title={ADD_TRANSMITTER} backLabel={backLabel} onBack={onClose} locked={busy}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {capability === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking what this device supports…
          </p>
        ) : (
          <AddTransmitterQuiz
            capability={capability}
            footerHost={footerHost}
            busy={busy}
            setBusy={setBusy}
            onDone={(id) => {
              onAdded?.(id)
              onClose()
            }}
          />
        )}
      </div>
      <div ref={setFooterHost} className="contents" />
    </TaskScreen>
  )
}

function AddTransmitterQuiz({
  capability,
  footerHost,
  busy,
  setBusy,
  onDone,
}: {
  capability: PasskeyCapability
  footerHost: HTMLElement | null
  busy: boolean
  setBusy: (busy: boolean) => void
  onDone: (walletId: string) => void
}) {
  const group = useId()
  const [index, setIndex] = useState(0)
  const [returnToReview, setReturnToReview] = useState(false)
  const [label, setLabel] = useState('')
  const [network, setChosenNetwork] = useState<NetworkId>('testnet')
  const networkRef = useRef<NetworkId>('testnet')
  const [resetNote, setResetNote] = useState<string | null>(null)
  const [nodeMode, setNodeMode] = useState<'builtin' | 'custom'>('builtin')
  const [nodeDraft, setNodeDraft] = useState('')
  const [verifiedNode, setVerifiedNode] = useState<string | null>(null)
  const [nodeReason, setNodeReason] = useState<string | null>(null)
  const [nodeBusy, setNodeBusy] = useState(false)
  const [openCheck, setOpenCheck] = useState<NewOpenCheck>(() => preselection('testnet', capability).openCheck)
  const [autoLockMinutes, setAutoLockMinutes] = useState(5)
  const [address, setAddress] = useState('')
  const [appPin, setAppPin] = useState<{ exists: boolean; tries: number } | null>(null)
  const [pinReadFailed, setPinReadFailed] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pinRef = useRef<HTMLInputElement | null>(null)
  const pinConfirmRef = useRef<HTMLInputElement | null>(null)
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const openLock = useAppStore((s) => s.openLock)

  const otherNames = useMemo(() => [...new Map(wallets.map((w) => [w.seedId, w.label])).values()], [wallets])
  const typedVerdict = normalizeWalletName(label) === '' ? null : validateWalletName(label, otherNames)
  const labelError = typedVerdict && !typedVerdict.ok ? RENAME_ERRORS[typedVerdict.reason] : null

  const typed = address.trim()
  const addressInvalid = typed !== '' && !isValidClassicAddress(typed)
  const sameAsOffline = typed !== '' && !addressInvalid && offlineWalletHas(wallets, typed)

  useEffect(() => {
    let cancelled = false
    Promise.all([hasAppPin(), triesRemaining()])
      .then(([exists, tries]) => !cancelled && setAppPin({ exists, tries }))
      .catch(() => !cancelled && setPinReadFailed(true))
    return () => {
      cancelled = true
    }
  }, [])

  // The Open Check and auto-lock answers as the lock policy sees them; the Seed
  // questions in the options are not asked here and are not shown.
  const options = describeOptions({ network, seedMethod: 'stored', openCheck, autoLockMinutes, signing: 'standard', passkey: capability })
  const verdict = checkLockRequest({ network, openCheck, autoLockMinutes })
  const needsPin = openCheck === 'pin'

  function changeNetwork(next: NetworkId) {
    if (next === network) return
    setChosenNetwork(next)
    networkRef.current = next
    const pre = preselection(next, capability)
    setOpenCheck(pre.openCheck)
    setAutoLockMinutes(pre.autoLockMinutes)
    setNodeMode('builtin')
    setNodeDraft('')
    setVerifiedNode(null)
    setNodeReason(null)
    setResetNote(NETWORK_RESET_NOTE)
    setReturnToReview(false)
  }

  async function testNode() {
    setNodeBusy(true)
    setNodeReason(null)
    setVerifiedNode(null)
    const testedFor = network
    try {
      await verifyNode(network, nodeDraft.trim())
      if (networkRef.current === testedFor) setVerifiedNode(nodeDraft.trim())
    } catch (err: unknown) {
      if (networkRef.current !== testedFor) return
      setNodeMode('builtin')
      setNodeReason(err instanceof Error ? err.message : 'This Node could not be checked.')
    } finally {
      setNodeBusy(false)
    }
  }

  // Only the answers this quiz asks are read by the steps it renders.
  const questionProps: WalletQuestionsProps = {
    group,
    options,
    busy,
    origin: undefined,
    label,
    onLabelChange: setLabel,
    labelError,
    network,
    onNetworkChange: changeNetwork,
    nodeMode,
    onNodeMode: setNodeMode,
    nodeDraft,
    onNodeDraft: (d) => {
      setNodeDraft(d)
      setVerifiedNode(null)
    },
    verifiedNode,
    nodeReason,
    nodeBusy,
    onTestNode: () => void testNode(),
    seedMethod: 'stored',
    onSelectStored: () => {},
    onSelectDerived: () => {},
    passkeyChoice: 'new',
    onPasskeyChoice: () => {},
    algorithm: 'ed25519',
    onAlgorithm: () => {},
    openCheck,
    onOpenCheck: setOpenCheck,
    autoLockMinutes,
    onAutoLockMinutes: setAutoLockMinutes,
    signing: 'standard',
    onSigning: () => {},
  }

  const invalidId = `${group}-address-error`
  const steps: QuizStep[] = [
    { id: 'name-network', title: 'Name and network', blocked: !!labelError },
    { id: 'node', title: step('node').title },
    { id: 'open-check', title: step('open-check').title },
    {
      id: 'sync',
      title: SYNC_TO_AN_ADDRESS,
      blocked: addressInvalid,
      ...(addressInvalid ? { blockedReasonId: invalidId } : {}),
      secondary: (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setAddress('')
            go(index + 1)
          }}
        >
          {SKIP_THIS_STEP}
        </Button>
      ),
    },
    { id: 'review', title: 'Review' },
  ]
  const reviewIndex = steps.length - 1

  function go(next: number) {
    setResetNote(null)
    setPinError(null)
    const target = returnToReview && next > index ? reviewIndex : next
    if (target === reviewIndex || next < index) setReturnToReview(false)
    setIndex(target)
  }

  function changeAnswer(stepId: string) {
    const at = steps.findIndex((s) => s.id === stepId)
    if (at < 0) return
    setReturnToReview(true)
    setIndex(at)
  }

  const rows: AnswerRow[] = [
    { step: 'name-network', term: QUESTION_TERMS.Label, value: formatLabel(label) },
    { term: QUESTION_TERMS.Network, value: formatNetwork(network), note: NETWORK_LOCKED_NOTE },
    { step: 'node', term: QUESTION_TERMS.Node, value: formatNode(nodeMode, verifiedNode), data: nodeMode === 'custom' && !!verifiedNode },
    { step: 'open-check', term: QUESTION_TERMS['Open Check'], value: formatOpenCheck(openCheck) },
    { step: 'open-check', term: QUESTION_TERMS['Auto-lock'], value: formatAutoLock(autoLockMinutes) },
    { step: 'sync', term: SYNC_TO_AN_ADDRESS, value: typed === '' ? NOT_SYNCED : typed, data: typed !== '' },
  ]

  async function handleAdd() {
    if (busy || !verdict.ok || labelError || addressInvalid) return
    setError(null)
    setPinError(null)
    if (nodeMode === 'custom' && !verifiedNode) {
      setError('Test the custom Node first, or use the built-in Nodes.')
      return
    }
    if (needsPin && pinReadFailed) {
      setError('Could not read the App PIN state. Retry before creating.')
      return
    }
    let pin: string | undefined
    if (needsPin) {
      const typedPin = pinRef.current?.value ?? ''
      if (appPin?.exists) {
        if (typedPin === '') return setPinError('Enter your App PIN.')
      } else {
        if (typedPin.length < 6) return setPinError('The App PIN must be at least 6 digits.')
        if (typedPin !== (pinConfirmRef.current?.value ?? '')) return setPinError("The two PINs don't match.")
      }
      pin = typedPin
    }
    setBusy(true)
    try {
      const name = normalizeWalletName(label) === '' ? uniqueDefaultName('Wallet', otherNames) : label
      const result = await createTransmitterWallet(
        {
          label: name,
          network,
          ...(nodeMode === 'custom' && verifiedNode ? { node: verifiedNode } : {}),
          openCheck,
          autoLockMinutes,
          ...(typed !== '' ? { syncedAddress: typed } : {}),
        },
        { pin, appPinExpected: appPin?.exists === true },
      )
      if (result.status === 'ok') {
        await startLockSession(result.value.meta.lockId, result.value.openKey, autoLockMinutes)
        openLock(result.value.meta.lockId, result.value.openKey, autoLockMinutes)
        setWallets(await listWallets())
        announceAdded(result.value.meta.id)
        toast.success('Wallet added.')
        onDone(result.value.meta.id)
        return
      }
      if (result.status === 'refused') setError(result.reason)
      else if (result.status === 'cancelled') setError('Cancelled. Nothing was created.')
      else if (result.status === 'unsupported') setError('This device or browser could not use a passkey for this wallet. Nothing was created.')
      else setError(`${describeCheckFailure(result)} Nothing was created.`)
    } catch {
      setError('Could not create the wallet. Nothing was created.')
    } finally {
      if (pinRef.current) pinRef.current.value = ''
      if (pinConfirmRef.current) pinConfirmRef.current.value = ''
      setBusy(false)
    }
  }

  const addButton = (
    <Button type="button" aria-disabled={!verdict.ok || !!labelError || addressInvalid ? true : undefined} disabled={busy} onClick={() => void handleAdd()}>
      {busy ? 'Creating…' : ADD_TRANSMITTER}
    </Button>
  )

  return (
    <QuizShell steps={steps} index={index} onIndex={go} busy={busy} actionHost={footerHost} finalAction={addButton}>
      {index === 0 && <NameAndNetworkStep {...questionProps} resetNote={resetNote} />}
      {index > 0 && index < reviewIndex && network === 'mainnet' && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="warning">Real funds</Badge>
          Network: {formatNetwork(network)}
        </p>
      )}
      {index === 1 && <NodeQuestion {...questionProps} />}
      {index === 2 && <OpenCheckQuestion {...questionProps} />}
      {index === 3 && (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{SYNC_LATER}</p>
          <div className="grid gap-1.5">
            <Label htmlFor={`${group}-address`}>Address</Label>
            <Input
              id={`${group}-address`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-data"
              disabled={busy}
              aria-invalid={addressInvalid ? true : undefined}
              aria-describedby={addressInvalid ? invalidId : undefined}
            />
            {addressInvalid && (
              <p id={invalidId} className="text-sm text-text-destructive">
                {INVALID_ADDRESS}
              </p>
            )}
          </div>
          {sameAsOffline && <WarningSentence words={SAME_ADDRESS_OFFLINE_HERE} />}
        </div>
      )}
      {index === reviewIndex && !verdict.ok && (
        <Alert variant="warning">
          <AlertTitle>This wallet cannot be created yet</AlertTitle>
          <AlertDescription>{verdict.reason}</AlertDescription>
        </Alert>
      )}
      {index === reviewIndex && (
        <ReviewStep rows={rows} onChange={changeAnswer} disabled={busy} footer={sameAsOffline ? <WarningSentence words={SAME_ADDRESS_OFFLINE_HERE} /> : undefined} />
      )}
      {index === reviewIndex && needsPin && (
        <ReviewPlate legend="App PIN">
          {pinReadFailed ? (
            <p role="alert" className="text-sm text-text-destructive">
              Could not read the App PIN state on this device.
            </p>
          ) : !appPin ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking App PIN…
            </p>
          ) : appPin.exists ? (
            <div className="grid gap-1.5">
              <p className="text-sm text-muted-foreground">Enter your App PIN to confirm.</p>
              <Label htmlFor={`${group}-pin`}>Your App PIN</Label>
              <Input id={`${group}-pin`} ref={pinRef} type="password" inputMode="numeric" autoComplete="off" disabled={busy} aria-invalid={pinError ? true : undefined} aria-describedby={pinError ? `${group}-pin-error` : undefined} />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <p className="text-sm text-muted-foreground">Choose an App PIN to protect this device.</p>
              <Label htmlFor={`${group}-pin`}>Choose an App PIN (at least 6 digits)</Label>
              <Input id={`${group}-pin`} ref={pinRef} type="password" inputMode="numeric" autoComplete="new-password" disabled={busy} aria-invalid={pinError ? true : undefined} aria-describedby={pinError ? `${group}-pin-error` : undefined} />
              <Label htmlFor={`${group}-pin-confirm`}>Confirm the App PIN</Label>
              <Input id={`${group}-pin-confirm`} ref={pinConfirmRef} type="password" inputMode="numeric" autoComplete="new-password" disabled={busy} />
            </div>
          )}
          {pinError && (
            <p id={`${group}-pin-error`} className="text-sm text-text-destructive">
              {pinError}
            </p>
          )}
        </ReviewPlate>
      )}
      {error && (
        <Alert variant="warning">
          <AlertTitle>The wallet was not created</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </QuizShell>
  )
}
