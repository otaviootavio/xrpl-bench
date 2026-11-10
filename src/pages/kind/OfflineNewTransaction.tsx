import { useEffect, useRef, useState } from 'react'
import { encode, isValidClassicAddress } from 'xrpl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AmountInput, validateAmountString } from '@/components/wallet/AmountInput'
import { HandoffPlate } from '@/components/wallet/HandoffPlate'
import { QrScanner } from '@/components/wallet/QrScanner'
import { SignedFieldList } from '@/components/wallet/SignedTransactionReview'
import { useOfflineRound } from '@/hooks/useOfflineRound'
import { usePrompts } from '@/hooks/usePrompts'
import { useWakeLock } from '@/hooks/useWakeLock'
import { ledgerSeenOf, noteLedgerSeen, SigningCheckError, type KeyWalletMeta } from '@/lib/crypto/keystore'
import {
  assembleTransaction,
  buildHashOf,
  builtTransaction,
  clearRound,
  judgeDataToSign,
  ledgerJumpWarning,
  newRequestId,
  requestText,
  roundOf,
  setRound,
  signRound,
  type OfflineBuild,
  type Round,
} from '@/lib/offline-round'
import * as W from '@/lib/offline-round-words'
import { SIGN_KEY, fill } from '@/lib/transmit-words'
import { OFFLINE_SCREENS } from '@/lib/wallet-kind-words'
import { dropsToXrpString, formatXrp, xrpToDropsString } from '@/lib/xrpl/money'
import { NETWORKS } from '@/lib/xrpl/networks'
import { lockRemainingMs, useAppStore, useWalletOpenKey } from '@/store/app-store'
import { KindScreenPlate } from './KindScreenPlate'

const MAX_DESTINATION_TAG = 4294967295

/**
 * An Offline Wallet's New transaction (OS-FR-13 to OS-FR-16, EXPERIENCE "Offline
 * round"): the Payment type with online Send's fields and P-1 in every reading's
 * slot, the review, the request QR and the Data-to-Sign scan plate, the signing
 * review, then the signed QR and the Kept transaction plate. It reads nothing
 * from the ledger and has no Send key (OS-FR-11). The round lives in memory
 * (`offline-round.ts`) while the Wallet is unlocked; a lock erases it.
 */
export function OfflineNewTransaction({ wallet }: { wallet: KeyWalletMeta }) {
  const round = useOfflineRound(wallet.id)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const phase = round?.phase.name ?? 'building'

  // A new state of the round moves focus to its heading (EXPERIENCE "Focus").
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    headingRef.current?.focus()
  }, [phase])

  return (
    <KindScreenPlate title={OFFLINE_SCREENS.newTransaction.title}>
      {round && round.phase.name !== 'editing' && round.phase.name !== 'reviewed' && <LockSoon lockId={round.lockId} />}
      {!round || round.phase.name === 'editing' ? (
        <BuildForm
          wallet={wallet}
          initial={round?.build}
          headingRef={headingRef}
          onReview={(build) => setRound(wallet.id, { lockId: wallet.lockId, build, phase: { name: 'reviewed' } })}
        />
      ) : round.phase.name === 'reviewed' ? (
        <Reviewed wallet={wallet} round={round} headingRef={headingRef} />
      ) : round.phase.name === 'request' ? (
        <RequestShown wallet={wallet} round={round} headingRef={headingRef} />
      ) : round.phase.name === 'signing' ? (
        <SigningReview wallet={wallet} round={round} headingRef={headingRef} />
      ) : (
        <Signed wallet={wallet} round={round} headingRef={headingRef} />
      )}
    </KindScreenPlate>
  )
}

type HeadingRef = React.RefObject<HTMLHeadingElement | null>

/** One reading the online screen shows, here as P-1 in its slot (EXPERIENCE "Read-placeholder"). */
function FromTransmitter({ legend }: { legend: string }) {
  return (
    <div>
      <dt className="panel-legend text-readout-muted">{legend}</dt>
      <dd className="text-sm">{W.FROM_TRANSMITTER}</dd>
    </div>
  )
}

function BuildForm({
  wallet,
  initial,
  headingRef,
  onReview,
}: {
  wallet: KeyWalletMeta
  initial?: OfflineBuild
  headingRef: HeadingRef
  onReview: (build: OfflineBuild) => void
}) {
  const [destination, setDestination] = useState(initial?.destination ?? '')
  const [destTag, setDestTag] = useState(initial?.destinationTag !== undefined ? String(initial.destinationTag) : '')
  const [amount, setAmount] = useState(initial ? dropsToXrpString(initial.amountDrops) : '')
  const destinationValid = isValidClassicAddress(destination)
  const isSelfSend = destination === wallet.address
  const amountValidation = validateAmountString(amount, 'xrp')
  const tagValue = destTag ? Number(destTag) : undefined
  const tagValid = tagValue === undefined || (Number.isInteger(tagValue) && tagValue >= 0 && tagValue <= MAX_DESTINATION_TAG)
  const canReview = destinationValid && !isSelfSend && amountValidation.valid && tagValid

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
        {W.PAYMENT}
      </h2>
      <div className="grid gap-1.5">
        <Label htmlFor="off-dest">{W.SHIPPED.destinationAddress}</Label>
        <Input
          id="off-dest"
          value={destination}
          onChange={(e) => setDestination(e.target.value.trim())}
          placeholder="r..."
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={destination.length > 0 && !destinationValid}
          aria-describedby={destination.length > 0 && !destinationValid ? 'off-dest-error' : 'off-dest-check'}
        />
        {destination.length > 0 && !destinationValid && (
          <p id="off-dest-error" className="text-sm text-text-destructive">
            {W.SHIPPED.invalidAddress}
          </p>
        )}
        {isSelfSend && <p className="text-sm text-text-destructive">{W.SHIPPED.selfSend}</p>}
        {/* The destination check's slot: the Transmitter reads it (P-1). */}
        <p id="off-dest-check" className="text-xs text-muted-foreground">
          {W.FROM_TRANSMITTER}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="off-dtag">{W.SHIPPED.destinationTagUnknown}</Label>
        <Input
          id="off-dtag"
          inputMode="numeric"
          value={destTag}
          onChange={(e) => setDestTag(e.target.value.replace(/\D/g, ''))}
          aria-invalid={!tagValid}
          aria-describedby={!tagValid ? 'off-dtag-error' : undefined}
        />
        {!tagValid && (
          <p id="off-dtag-error" className="text-sm text-text-destructive">
            A destination tag must be between 0 and {MAX_DESTINATION_TAG}.
          </p>
        )}
      </div>
      <AmountInput
        id="off-amount"
        label={W.SHIPPED.amount}
        value={amount}
        onChange={setAmount}
        kind="xrp"
        suffix="XRP"
        error={amount.length > 0 ? amountValidation.error : undefined}
      />
      <dl className="panel-well flex flex-wrap gap-x-8 gap-y-2 rounded-md px-3 py-2.5">
        <FromTransmitter legend={W.SHIPPED.networkFee} />
        <FromTransmitter legend={W.SHIPPED.spendable} />
      </dl>
      <Button
        type="button"
        className="w-fit"
        disabled={!canReview}
        onClick={() =>
          onReview({
            type: 'payment',
            account: wallet.address,
            destination,
            amountDrops: xrpToDropsString(amount),
            ...(tagValue !== undefined ? { destinationTag: tagValue } : {}),
          })
        }
      >
        {W.SHIPPED.reviewPayment}
      </Button>
    </div>
  )
}

/** The Built transaction in the ledger's own field names (P-52); the Fee is a reading (P-1). */
function BuiltFields({ build }: { build: OfflineBuild }) {
  const tx = builtTransaction(build)
  return (
    <dl className="grid min-w-0 gap-2">
      {Object.entries(tx).map(([name, value]) => (
        <div key={name} className="grid min-w-0 gap-0.5">
          <dt className="panel-legend [overflow-wrap:anywhere]">{name}</dt>
          <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">
            {name === 'Amount' ? formatXrp(String(value)) : String(value)}
          </dd>
        </div>
      ))}
      <div className="grid min-w-0 gap-0.5">
        <dt className="panel-legend">{W.FIELD.fee}</dt>
        <dd className="text-sm">{W.FROM_TRANSMITTER}</dd>
      </div>
    </dl>
  )
}

function startRequest(walletId: string, round: Round) {
  setRound(walletId, { ...round, phase: { name: 'request', requestId: newRequestId() } })
}

function changeTransaction(walletId: string, round: Round) {
  setRound(walletId, { ...round, phase: { name: 'editing' } })
}

function Reviewed({ wallet, round, headingRef }: { wallet: KeyWalletMeta; round: Round; headingRef: HeadingRef }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
        {W.PAYMENT}
      </h2>
      <BuiltFields build={round.build} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => startRequest(wallet.id, round)}>
          {W.SHOW_THE_REQUEST}
        </Button>
        <Button type="button" variant="outline" onClick={() => changeTransaction(wallet.id, round)}>
          {W.CHANGE_THE_TRANSACTION}
        </Button>
      </div>
    </div>
  )
}

function RequestShown({ wallet, round, headingRef }: { wallet: KeyWalletMeta; round: Round; headingRef: HeadingRef }) {
  const phase = round.phase as Extract<Round['phase'], { name: 'request' }>
  const [refusal, setRefusal] = useState<string | null>(null)
  const text = requestText(wallet.network, round.build, phase.requestId)
  useWakeLock(true)

  async function onPayload(scanned: string) {
    const kept = roundOf(wallet.id)
    const keptPhase = kept?.phase.name === 'request' ? kept.phase : null
    const judged = judgeDataToSign(
      scanned,
      wallet,
      keptPhase ? { requestId: keptPhase.requestId, buildHash: buildHashOf(kept!.build) } : null,
      kept?.build ?? null,
    )
    if (!judged.ok) {
      setRefusal(judged.reason)
      return
    }
    setRefusal(null)
    let warning: 'lower' | 'too-high' | null = null
    try {
      warning = ledgerJumpWarning(judged.data.ledger_index, await ledgerSeenOf(wallet.id), Date.now())
      await noteLedgerSeen(wallet.id, judged.data.ledger_index, Date.now())
    } catch {
      // The record could not be read or written: no comparison is made this time. Never a refusal.
    }
    // A lock while this ran erased the round: nothing to move on with.
    const now = roundOf(wallet.id)
    if (!now || now.phase.name !== 'request' || now.phase.requestId !== keptPhase?.requestId) return
    setRound(wallet.id, { ...now, phase: { name: 'signing', requestId: keptPhase.requestId, data: judged.data, warning } })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HandoffPlate heading={W.DATA_TO_SIGN_NEEDED} headingRef={headingRef} network={wallet.network} text={text}>
        <p className="text-sm">{W.REQUEST_LINE}</p>
      </HandoffPlate>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => changeTransaction(wallet.id, round)}>
          {W.CHANGE_THE_TRANSACTION}
        </Button>
        <p className="text-xs text-muted-foreground">{W.CHANGE_RESTARTS}</p>
      </div>
      <div role="status">{phase.notice === 'not-signed' && <p className="text-sm">{W.NOT_SIGNED}</p>}</div>
      <section aria-labelledby="off-scan-data" className="panel-plate flex min-w-0 flex-col gap-3 rounded-md px-4 pb-4 pt-3">
        <h2 id="off-scan-data" className="text-sm font-semibold">
          {W.SCAN_DATA_TITLE}
        </h2>
        <p className="text-sm">{W.SCAN_DATA_LINE}</p>
        <QrScanner onPayload={(t) => void onPayload(t)} label="a code" />
        {/* Always mounted, so a refusal is announced; focus stays on the scanner. */}
        <div role="alert">
          {refusal && (
            <div className="text-sm text-text-destructive [overflow-wrap:anywhere]">
              <p className="font-semibold">{W.NOT_SIGNED}</p>
              <p>{refusal}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function SigningReview({ wallet, round, headingRef }: { wallet: KeyWalletMeta; round: Round; headingRef: HeadingRef }) {
  const phase = round.phase as Extract<Round['phase'], { name: 'signing' }>
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(wallet.id)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const tx = assembleTransaction(round.build, phase.data)
  const label = NETWORKS[wallet.network].label

  async function sign() {
    setBusy(true)
    setFailure(null)
    try {
      const signed = await signRound(wallet, round.build, phase.data, { openKey, prompts })
      const now = roundOf(wallet.id)
      // A lock during the Signing Check erased the round: the signed QR is not shown.
      if (!now || now.phase.name !== 'signing' || now.phase.requestId !== phase.requestId) return
      setRound(wallet.id, { ...now, phase: { name: 'signed', signed } })
    } catch (err) {
      setFailure(err instanceof SigningCheckError ? err.message : W.NOT_SIGNED)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* The signing-network well: the fixed string is the heading, one text node, and takes focus. */}
      <section className="panel-well flex min-w-0 flex-col gap-2 rounded-md px-4 pb-4 pt-3">
        <h2 ref={headingRef} tabIndex={-1} className="font-data text-[clamp(1.75rem,9vw,3rem)] font-medium leading-[1.02] tracking-[-0.035em] [overflow-wrap:anywhere]">
          {fill(W.SIGNING_FOR, label)}
        </h2>
        <div className="flex flex-col gap-0.5 border-t border-white/15 pt-2 text-xs text-readout-muted">
          <span>{W.TIME_LIMIT_TEN_MINUTES}</span>
          <span className="font-data">{fill(W.VALID_UNTIL_LEDGER, tx.LastLedgerSequence as number)}</span>
        </div>
      </section>
      <SignedFieldList txBlob={encode(tx)} />
      {phase.warning && (
        <Alert variant="warning" role="none">
          <AlertDescription className="flex flex-col gap-1">
            <span>{phase.warning === 'lower' ? W.LEDGER_LOWER : W.LEDGER_TOO_HIGH}</span>
            <span>{W.CHECK_THE_TRANSMITTER}</span>
          </AlertDescription>
        </Alert>
      )}
      <div role="alert">{failure && <p className="text-sm text-text-destructive">{failure}</p>}</div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void sign()}>
          {SIGN_KEY}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setRound(wallet.id, { ...round, phase: { name: 'request', requestId: phase.requestId, notice: 'not-signed' } })}
        >
          {W.DO_NOT_SIGN}
        </Button>
      </div>
    </div>
  )
}

function Signed({ wallet, round, headingRef }: { wallet: KeyWalletMeta; round: Round; headingRef: HeadingRef }) {
  const { signed } = round.phase as Extract<Round['phase'], { name: 'signed' }>
  const [erasing, setErasing] = useState(false)
  const time = new Date(signed.signedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* No Send key anywhere (OS-FR-11): the last screen is the signed QR. */}
      <HandoffPlate heading={W.SIGNED_NOT_SENT} headingRef={headingRef} network={wallet.network} text={signed.text}>
        <p className="text-sm">{fill(W.SIGNED_VALID_UNTIL, signed.lastLedgerSequence, W.TEN_MINUTES, time)}</p>
      </HandoffPlate>
      <section aria-labelledby="off-kept" className="panel-plate flex min-w-0 flex-col gap-3 rounded-md px-4 pb-4 pt-3">
        <h2 id="off-kept" className="text-sm font-semibold">
          {W.KEPT_TITLE}
        </h2>
        <p className="text-sm">{W.KEPT_LINE}</p>
        <BuiltFields build={round.build} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setErasing(true)}>
            {W.I_KNOW_THE_RESULT}
          </Button>
          <Button type="button" variant="outline" onClick={() => setErasing(true)}>
            {W.CANCEL_THIS_TRANSACTION}
          </Button>
        </div>
      </section>
      {erasing && (
        <Dialog open onOpenChange={(open) => !open && setErasing(false)}>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle className="text-base font-normal leading-relaxed">{fill(W.ERASE_QUESTION, signed.lastLedgerSequence)}</DialogTitle>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setErasing(false)}>
                {W.KEEP_IT}
              </Button>
              <Button type="button" variant="destructive" onClick={() => clearRound(wallet.id)}>
                {W.ERASE}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/**
 * P-58: one minute before an auto-lock during a round. "Keep it unlocked" is
 * activity like any press: the auto-lock timer (`useAutoLock`) restarts on its
 * mousedown or keydown. The lock rule itself is unchanged (Open Question 8).
 */
function LockSoon({ lockId }: { lockId: string }) {
  const [soon, setSoon] = useState(false)
  const open = useAppStore((s) => lockId in s.openLocks)
  useEffect(() => {
    if (!open) return
    const tick = () => {
      const left = lockRemainingMs(lockId)
      setSoon(left !== null && left <= 60_000)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [lockId, open])
  if (!soon) return null
  return (
    <Alert variant="warning" role="none">
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{W.LOCKS_SOON}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setSoon(false)}>
          {W.KEEP_IT_UNLOCKED}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
