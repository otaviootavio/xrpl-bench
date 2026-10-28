import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QrCode } from '@/components/wallet/QrCode'
import { TaskScreen } from '@/components/wallet/TaskScreen'
import { useLeaveBlocker } from '@/hooks/useRoute'
import { navigate, walletScreenPath } from '@/lib/route'
import { QrScanner } from '@/components/wallet/QrScanner'
import { useAccountState } from '@/hooks/useAccountState'
import { usePrompts } from '@/hooks/usePrompts'
import type { WalletMeta } from '@/lib/crypto/keystore'
import {
  buildUnsigned,
  expiryWords,
  reviewUnsigned,
  signUnsigned,
  submitReturned,
  twoDeviceBlockedReason,
  type BuildResult,
  type ReturnedResult,
  type TwoDeviceKind,
  type TwoDeviceRequest,
  type UnsignedReview,
} from '@/lib/two-device'
import { xrpToDropsString } from '@/lib/xrpl/money'
import { NETWORKS } from '@/lib/xrpl/networks'
import { useAppStore, useWalletOpenKey } from '@/store/app-store'

type Role = 'online' | 'offline'

const KINDS: { kind: TwoDeviceKind; label: string }[] = [
  { kind: 'payment', label: 'Send XRP' },
  { kind: 'regular-key', label: 'Set Regular Key' },
  { kind: 'master-key', label: 'Master key' },
]

/** The Settings row's entry to the two-device screen. */
export function TwoDeviceSign({ wallet }: { wallet: WalletMeta }) {
  return (
    <div className="mt-1 text-xs text-muted-foreground" data-testid="two-device-sign">
      <Button variant="outline" size="sm" onClick={() => navigate(walletScreenPath('two-device', wallet.id))}>
        Sign with two devices
      </Button>
    </div>
  )
}

/** The primary Button is `whitespace-nowrap`: a long role sentence overflowed sideways at 320px. */
const ROLE_BUTTON = 'h-auto min-h-9 w-full whitespace-normal py-2 text-center'

/**
 * Two-device signing (FR-78, AD-30), a routed screen. One device is online and
 * builds a transaction; the other holds the key, has no network, confirms and
 * signs it. This only renders: judging, building, signing and verifying are
 * `lib/two-device.ts`, and nothing here outlives the screen. Mount only for a
 * Wallet whose lock is open (AD-26).
 */
export function TwoDeviceScreen({ wallet, onClose, backLabel }: { wallet: WalletMeta; onClose: () => void; backLabel?: string }) {
  const [role, setRole] = useState<Role | null>(null)
  // True while a build, a Signing Check or a submission is running: leaving then would hide the outcome.
  const [busy, setBusy] = useState(false)
  useLeaveBlocker(busy)
  const mainnet = wallet.network === 'mainnet'

  return (
    <TaskScreen
      title="Sign with two devices"
      description={
        <>
          {wallet.label} on {NETWORKS[wallet.network].label}
          {mainnet && ' — real funds'}.
        </>
      }
      onBack={onClose}
      backLabel={backLabel}
      locked={busy}
    >
      {role === null && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            A key that lives on a device with no network cannot read the sequence number or the fee. The online device builds the
            transaction, the offline device signs it, and the online device checks what came back before it sends anything.
          </p>
          <Button variant="outline" className={ROLE_BUTTON} onClick={() => setRole('online')}>
            This device is online: build a transaction
          </Button>
          <Button variant="outline" className={ROLE_BUTTON} onClick={() => setRole('offline')}>
            This device is offline: sign a transaction
          </Button>
        </div>
      )}
      {role === 'online' && <OnlinePanel wallet={wallet} onBusy={setBusy} />}
      {role === 'offline' && <OfflinePanel wallet={wallet} onBusy={setBusy} />}
    </TaskScreen>
  )
}

/** About four pixels per module, estimated from the payload's length (a QR's side is
 * roughly sqrt(bytes x 14) + 17 modules), so a long payload stays scannable. */
function qrDrawSize(text: string): number {
  const modules = Math.min(177, Math.max(21, Math.ceil(Math.sqrt(text.length * 14)) + 17))
  return Math.min(720, Math.max(220, (modules + 2) * 4))
}

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="panel-legend text-muted-foreground">{label}</dt>
      <dd className={mono ? 'break-all font-mono' : undefined}>{value}</dd>
    </div>
  )
}

function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        Copy the text of {label}
      </Button>
      {copied === true && <p role="status" className="text-xs">Copied.</p>}
      {copied === false && <p role="status" className="text-xs">Copying was not allowed. Select the text below and copy it.</p>}
      <textarea
        readOnly
        rows={3}
        value={text}
        aria-label={`Text of ${label}`}
        className="w-full rounded-md border border-input bg-background px-2.5 py-1 font-data text-[0.8125rem] pointer-coarse:text-base"
      />
    </div>
  )
}

function OnlinePanel({ wallet, onBusy }: { wallet: WalletMeta; onBusy: (busy: boolean) => void }) {
  const queryClient = useQueryClient()
  const account = useAccountState(wallet.network, wallet.address, wallet.node)
  const [kind, setKind] = useState<TwoDeviceKind>('payment')
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [tag, setTag] = useState('')
  const [regularKey, setRegularKey] = useState('')
  const [enable, setEnable] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const [built, setBuilt] = useState<Extract<BuildResult, { status: 'built' }> | null>(null)
  const [result, setResult] = useState<ReturnedResult | null>(null)

  const wallets = useAppStore((s) => s.wallets)
  const blocked = twoDeviceBlockedReason(kind, account.isError ? null : account.data, account.isError, enable, { wallet, wallets })
  const mainnet = wallet.network === 'mainnet'

  function request(): TwoDeviceRequest | string {
    if (kind === 'payment') {
      let amountDrops: string
      try {
        amountDrops = xrpToDropsString(amount.trim())
      } catch {
        return 'Enter the amount as a number of XRP.'
      }
      const t = tag.trim()
      if (t !== '' && !/^\d+$/.test(t)) return 'The destination tag must be a whole number.'
      return { kind, destination: destination.trim(), amountDrops, ...(t !== '' ? { destinationTag: Number(t) } : {}) }
    }
    if (kind === 'regular-key') return { kind, regularKey: regularKey.trim() }
    return { kind, enable }
  }

  async function build() {
    if (busy || blocked) return
    const req = request()
    if (typeof req === 'string') {
      setMessage(req)
      return
    }
    setBusy(true)
    onBusy(true)
    setMessage(null)
    try {
      const r = await buildUnsigned(wallet.id, req, { queryClient })
      if (r.status === 'built') setBuilt(r)
      else setMessage(r.reason)
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  async function returned(text: string) {
    // The ref closes the gap before `busy` re-renders: two scan hits must not submit twice.
    if (inFlight.current || busy || !built) return
    inFlight.current = true
    setBusy(true)
    onBusy(true)
    try {
      setResult(await submitReturned(wallet, built.tx, text, { queryClient }))
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusy(false)
    }
  }

  function again() {
    setBuilt(null)
    setResult(null)
    setMessage(null)
  }

  if (built) {
    // Anything but a refusal (which sent nothing and may be retried) ends this build: the signed copy is not offered again.
    const settled = result !== null && result.status !== 'refused'
    return (
      <div className="flex flex-col gap-3 text-sm" data-testid="two-device-online-built">
        <p>{expiryWords(built.lastLedgerSequence)}</p>
        <p>Last ledger: <span className="font-mono">{built.lastLedgerSequence}</span>.</p>
        {mainnet && <p>This is Mainnet: real funds.</p>}
        {!settled && (
          <>
            <p>Step 1. Show this to the offline device, which has this account’s wallet on {NETWORKS[wallet.network].label}.</p>
            <QrCode text={built.text} size={qrDrawSize(built.text)} />
            <CopyText text={built.text} label="the transaction to sign" />
            <p>Step 2. When the offline device shows its signed result, bring it back here.</p>
            <QrScanner label="the signed transaction" onPayload={(t) => void returned(t)} />
          </>
        )}
        {busy && <p role="status">Checking and sending…</p>}
        {result?.status === 'validated' && (
          <p role="status">Validated. The ledger applied this transaction (ledger {result.outcome.ledgerIndex ?? 'unknown'}).</p>
        )}
        {result && result.status !== 'validated' && <p role="status">{result.reason}</p>}
        {result !== null && (
          <Button variant="outline" size="sm" onClick={again}>
            Build another
          </Button>
        )}
      </div>
    )
  }

  const reasonId = 'two-device-reason'
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="two-device-online">
      <div role="group" aria-label="What to sign" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button key={k.kind} variant={kind === k.kind ? 'default' : 'outline'} size="sm" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
            {k.label}
          </Button>
        ))}
      </div>
      {kind === 'payment' && (
        <>
          <Label htmlFor="td-destination">Destination</Label>
          <Input id="td-destination" value={destination} onChange={(e) => setDestination(e.target.value)} autoComplete="off" spellCheck={false} />
          <Label htmlFor="td-amount">Amount (XRP)</Label>
          <Input id="td-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />
          <Label htmlFor="td-tag">Destination tag (optional)</Label>
          <Input id="td-tag" inputMode="numeric" value={tag} onChange={(e) => setTag(e.target.value)} autoComplete="off" />
        </>
      )}
      {kind === 'regular-key' && (
        <>
          <Label htmlFor="td-regular">Regular Key address</Label>
          <Input id="td-regular" value={regularKey} onChange={(e) => setRegularKey(e.target.value)} autoComplete="off" spellCheck={false} />
        </>
      )}
      {kind === 'master-key' && (
        <div role="group" aria-label="Master key" className="flex flex-wrap gap-2">
          <Button variant={!enable ? 'default' : 'outline'} size="sm" aria-pressed={!enable} onClick={() => setEnable(false)}>
            Turn the master key off
          </Button>
          <Button variant={enable ? 'default' : 'outline'} size="sm" aria-pressed={enable} onClick={() => setEnable(true)}>
            Turn the master key on
          </Button>
        </div>
      )}
      {kind === 'master-key' && !enable && (
        <p>Turning the master key off means only the Regular Key can sign for this account afterwards. If it is lost, so are the funds.</p>
      )}
      <Button aria-disabled={busy || blocked ? true : undefined} aria-describedby={blocked ? reasonId : undefined} onClick={() => void build()}>
        {busy ? 'Building…' : 'Build the transaction'}
      </Button>
      {blocked && <p id={reasonId}>{blocked}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  )
}

function OfflinePanel({ wallet, onBusy }: { wallet: WalletMeta; onBusy: (busy: boolean) => void }) {
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(wallet.id)
  const [pending, setPending] = useState<{ text: string; review: UnsignedReview } | null>(null)
  const [signed, setSigned] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function received(text: string) {
    setSigned(null)
    const r = reviewUnsigned(text, wallet)
    if (r.status === 'refused') {
      setPending(null)
      setMessage(r.reason)
      return
    }
    setMessage(null)
    setPending({ text, review: r.review })
  }

  async function sign() {
    if (busy || !pending) return
    setBusy(true)
    onBusy(true)
    setMessage(null)
    try {
      const r = await signUnsigned(wallet.id, pending.text, { openKey: openKey ?? undefined, prompts })
      if (r.status === 'signed') {
        setSigned(r.text)
        setPending(null)
      } else {
        setMessage(r.reason)
      }
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  if (signed) {
    return (
      <div className="flex flex-col gap-3 text-sm" data-testid="two-device-offline-signed">
        <p>Signed. Show this to the online device, which checks it and sends it. Close this window when it has it: nothing is kept.</p>
        <QrCode text={signed} size={qrDrawSize(signed)} />
        <CopyText text={signed} label="the signed transaction" />
      </div>
    )
  }

  const r = pending?.review
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="two-device-offline">
      <p>This device needs no network to sign. Nothing is sent from here.</p>
      {!r && <QrScanner label="the transaction to sign" onPayload={received} />}
      {r && (
        <>
          <dl className="flex flex-col gap-1.5">
            <Field label="Action" value={r.title} mono={false} />
            <Field label="Account" value={r.account} />
            {r.destination && <Field label="Destination" value={r.destination} />}
            {r.destinationTag !== undefined && <Field label="Destination tag" value={String(r.destinationTag)} />}
            {r.amountXrp && <Field label="Amount" value={r.amountXrp} mono={false} />}
            {r.regularKey && <Field label="New Regular Key" value={r.regularKey} />}
            <Field label="Network fee" value={r.feeXrp} mono={false} />
            <Field label="Last ledger" value={String(r.lastLedgerSequence)} />
            <Field label="Network" value={r.mainnet ? `${r.networkLabel} — real funds` : r.networkLabel} mono={false} />
          </dl>
          <p>{expiryWords(r.lastLedgerSequence, true)}</p>
          {r.kind === 'master-key-off' && (
            <p>After this, only the Regular Key can sign for this account. If it is lost, so are the funds.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button aria-disabled={busy ? true : undefined} onClick={() => void sign()}>
              {busy ? 'Signing…' : 'Confirm and sign'}
            </Button>
            <Button variant="outline" onClick={() => setPending(null)} aria-disabled={busy ? true : undefined}>
              Discard
            </Button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
