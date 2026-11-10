import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { QrScanner } from '@/components/wallet/QrScanner'
import { TxLink } from '@/components/wallet/AddressLink'
import { TxStatusBadge } from '@/components/wallet/TxStatusBadge'
import { SignedFieldList } from '@/components/wallet/SignedTransactionReview'
import { usePrompts } from '@/hooks/usePrompts'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { decodeRequest, decodeSigned, payloadKindOf, type RequestPayload } from '@/lib/qr-codec'
import { answerRequest, type AnswerResult } from '@/lib/answer-request'
import { HandoffPlate } from '@/components/wallet/HandoffPlate'
import { useWakeLock } from '@/hooks/useWakeLock'
import * as R from '@/lib/offline-round-words'
import { EXPIRED_NOTHING_SENT, SEND_KEY, TRANSACTION_HASH, fill } from '@/lib/transmit-words'
import { CHECK_LIST, CONFIRM_ACCOUNT, TRANSMIT_SCANNER_LINE, UNSIGNED_ON_TRANSMIT } from '@/lib/transmitter-words'
import { TRANSMITTER_SCREENS } from '@/lib/wallet-kind-words'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import { describeResultCode, UNCONFIRMED_SUBMIT_WORDS, UNKNOWN_OUTCOME_WORDS } from '@/lib/xrpl/result-codes'
import {
  expectedAccountFor,
  previewSignedTransaction,
  transmitSignedTransaction,
  type CheckedSignedTransaction,
  type SignedForReview,
  type SubmitOutcome,
} from '@/lib/xrpl/writes'
import { KindScreenPlate } from './KindScreenPlate'

/** The scanned Signed Transaction, held only while it is shown: never stored. */
interface Ready {
  txBlob: string
  envelopeNetwork: NetworkId
  checked: CheckedSignedTransaction
  /** The Account the Transmit step expects; `null`: confirmed on Send (P-27). */
  expected: string | null
}

type State =
  | { kind: 'idle' }
  | { kind: 'refused'; text: string }
  | { kind: 'ready'; ready: Ready }
  | { kind: 'sending'; ready: Ready }
  | { kind: 'declined'; text: string }
  | { kind: 'outcome'; outcome: SubmitOutcome }
  | { kind: 'expired' }
  | { kind: 'unconfirmed' }
  /** A Data-to-Sign Request is being checked (OS-FR-15). */
  | { kind: 'answering'; request: RequestPayload }
  | { kind: 'answered'; answer: Extract<AnswerResult, { status: 'answered' }> }
  | { kind: 'read-failed'; request: RequestPayload }

/**
 * Transmit (OS-FR-9, OS-FR-10, EXPERIENCE "Transmit step"): one scanner. A Signed
 * Transaction is checked (P-25) with no ledger read, its fields are shown, and
 * only the orange Send hands it to the Transmit step, which runs every check
 * again with the window on a fresh read. The Network passed is the one the
 * signed envelope names (story 2), never this Wallet's own. An unsynced
 * Transmitter shows P-27: Send then confirms the blob's Account. An Unsigned
 * Transaction (or a Data to Sign, which is the offline wallet's too) gets P-36's
 * Transmit line. A Data-to-Sign Request is answered after the online pre-flight
 * checks (`answer-request.ts`, OS-FR-15): the Data to Sign QR, or the refusal in
 * online words, or P-28 on a failed read. The answered request's Account is then
 * the Account the Transmit step expects (OS-FR-9), so an unsynced Transmitter does
 * not ask for P-27's confirm on the signed code that follows.
 */
export function TransmitScreen({ wallet }: { wallet: TransmitterMeta }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const prompts = usePrompts()
  const queryClient = useQueryClient()
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const network = NETWORKS[wallet.network].label
  /** The Account of the last request this Transmitter answered (route-checks "Transmit step"). Session memory only. */
  const [answeredAccount, setAnsweredAccount] = useState<string | null>(null)
  // A waiting scanner keeps the screen awake (EXPERIENCE "Round timing").
  useWakeLock(true)

  // A new state with a heading takes focus there, never on Send.
  useEffect(() => {
    if (state.kind !== 'idle' && state.kind !== 'refused') headingRef.current?.focus()
  }, [state.kind])

  function onPayload(text: string) {
    // A scan while a send runs is ignored: the blob on screen is the one being sent.
    if (state.kind === 'sending' || state.kind === 'answering') return
    const kind = payloadKindOf(text)
    // Both are for the offline wallet: P-36's Transmit line says so.
    if (kind === 'u' || kind === 'd') return setState({ kind: 'refused', text: UNSIGNED_ON_TRANSMIT })
    if (kind === 'r') {
      const request = decodeRequest(text)
      if (!request.ok) return setState({ kind: 'refused', text: request.reason })
      return void answer(request.value)
    }
    const decoded = decodeSigned(text)
    if (!decoded.ok) return setState({ kind: 'refused', text: decoded.reason })
    const expected = expectedAccountFor({ syncedAddress: wallet.address ?? undefined, requestAccount: answeredAccount ?? undefined })
    try {
      const checked = previewSignedTransaction(wallet.network, { txBlob: decoded.value.tx_blob, network: decoded.value.network }, expected)
      setState({ kind: 'ready', ready: { txBlob: decoded.value.tx_blob, envelopeNetwork: decoded.value.network, checked, expected } })
    } catch (err) {
      setState({ kind: 'refused', text: err instanceof Error ? err.message : UNCONFIRMED_SUBMIT_WORDS })
    }
  }

  async function answer(request: RequestPayload) {
    setState({ kind: 'answering', request })
    let result: AnswerResult
    try {
      result = await answerRequest(wallet, request, { queryClient })
    } catch {
      result = { status: 'read-failed' }
    }
    if (result.status === 'answered') {
      setAnsweredAccount(result.account)
      setState({ kind: 'answered', answer: result })
    } else if (result.status === 'refused') setState({ kind: 'refused', text: result.reason })
    else setState({ kind: 'read-failed', request })
  }

  async function send(ready: Ready) {
    setState({ kind: 'sending', ready })
    // Send confirms the blob's own Account when none was expected (P-27).
    const expected = ready.expected ?? expectedAccountFor({ confirmedAccount: ready.checked.account })!
    const review = wallet.showBeforeSending
      ? (signed: SignedForReview) => prompts.reviewSignedTransaction?.(signed) ?? Promise.resolve(false)
      : undefined
    try {
      const outcome = await transmitSignedTransaction(wallet.network, { txBlob: ready.txBlob, network: ready.envelopeNetwork }, expected, wallet.node, review)
      setState(outcome.status === 'expired' ? { kind: 'expired' } : { kind: 'outcome', outcome })
      await invalidateAccountScoped(queryClient, wallet.network, ready.checked.account).catch(() => {})
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'TransmitDeclinedError') setState({ kind: 'declined', text: (err as Error).message })
      else if (name === 'TransmitRefusedError' || name === 'FeeAboveCapError') setState({ kind: 'refused', text: (err as Error).message })
      else {
        // It may have reached the ledger: never "not sent", and never offered again.
        setState({ kind: 'unconfirmed' })
        await invalidateAccountScoped(queryClient, wallet.network, ready.checked.account).catch(() => {})
      }
    }
  }

  const ready = state.kind === 'ready' || state.kind === 'sending' ? state.ready : null
  return (
    <KindScreenPlate title={TRANSMITTER_SCREENS.transmit.title}>
      <p className="text-sm">{TRANSMIT_SCANNER_LINE}</p>
      <QrScanner onPayload={onPayload} label="a code" />
      {/* Always mounted, so a refusal is announced when it arrives; focus stays on the scanner. */}
      <div role="alert">
        {state.kind === 'refused' && (
          <p className="break-words text-sm text-text-destructive">{state.text}</p>
        )}
      </div>
      {ready && (
        <section aria-labelledby="transmit-ready" className="flex min-w-0 flex-col gap-3 border-t border-border pt-3">
          <ul className="flex flex-col gap-1 text-sm">
            <li>{CHECK_LIST.signature}</li>
            {ready.expected !== null && <li className="[overflow-wrap:anywhere]">{fill(CHECK_LIST.account, ready.checked.account)}</li>}
            <li>{fill(CHECK_LIST.network, network)}</li>
            <li>{fill(CHECK_LIST.timeLimit, ready.checked.lastLedgerSequence)}</li>
          </ul>
          {ready.expected === null && (
            <Alert variant="warning" role="none">
              <AlertDescription className="[overflow-wrap:anywhere]">{fill(CONFIRM_ACCOUNT, ready.checked.account)}</AlertDescription>
            </Alert>
          )}
          <div className="grid min-w-0 gap-1">
            <h2 id="transmit-ready" ref={headingRef} tabIndex={-1} className="panel-legend">
              {TRANSACTION_HASH}
            </h2>
            <p className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{ready.checked.hash}</p>
          </div>
          <SignedFieldList txBlob={ready.txBlob} />
          {/* The one key here that moves funds (commit). */}
          <Button type="button" variant="commit" className="w-fit" disabled={state.kind === 'sending'} onClick={() => void send(ready)}>
            {SEND_KEY}
          </Button>
        </section>
      )}
      {state.kind === 'read-failed' && (
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-normal">
            {R.ANSWER_READ_FAILED}
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void answer(state.request)}>
            {R.READ_AGAIN}
          </Button>
        </div>
      )}
      {state.kind === 'answered' && <Answered answer={state.answer} network={wallet.network} headingRef={headingRef} />}
      {state.kind === 'declined' && (
        <div role="status">
          <Alert variant="warning" role="presentation">
            <AlertDescription>{state.text}</AlertDescription>
          </Alert>
        </div>
      )}
      {state.kind === 'expired' && (
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
          {EXPIRED_NOTHING_SENT}
        </h2>
      )}
      {state.kind === 'unconfirmed' && (
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-normal">
          {UNCONFIRMED_SUBMIT_WORDS}
        </h2>
      )}
      {state.kind === 'outcome' && <Outcome outcome={state.outcome} headingRef={headingRef} />}
    </KindScreenPlate>
  )
}

/** The answer (EXPERIENCE "Transmitter answer"): what was checked, then the Data to Sign QR on this Wallet's Network. */
function Answered({
  answer,
  network,
  headingRef,
}: {
  answer: Extract<AnswerResult, { status: 'answered' }>
  network: NetworkId
  headingRef: React.RefObject<HTMLHeadingElement | null>
}) {
  const label = NETWORKS[network].label
  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-3">
      <section aria-labelledby="answer-checked" className="flex min-w-0 flex-col gap-2">
        <h3 id="answer-checked" className="panel-legend">
          {fill(R.CHECKED_ON, label)}
        </h3>
        <dl className="grid min-w-0 gap-1 text-sm">
          {answer.checks.destinationExists && <CheckRow term={R.FIELD.destination} value={R.CHECK_RESULT.found} />}
          {answer.checks.tagSupplied && <CheckRow term={R.FIELD.destinationTag} value={R.CHECK_RESULT.supplied} />}
          <CheckRow term={R.SHIPPED.spendable} value={R.CHECK_RESULT.sufficient} />
          <CheckRow term={R.FIELD.fee} value={R.CHECK_RESULT.underFeeLimit} />
        </dl>
        {/* Online Send warns here and still sends; so does the answer (OS-FR-15). */}
        {!answer.checks.destinationExists && (
          <Alert variant="warning" role="none">
            <AlertDescription>
              <span className="block font-semibold">{R.SHIPPED.destinationNotActivatedTitle}</span>
              {R.SHIPPED.destinationNotActivated}
            </AlertDescription>
          </Alert>
        )}
      </section>
      <HandoffPlate heading={R.DATA_PLATE_LINE} headingRef={headingRef} network={network} text={answer.text} />
    </div>
  )
}

function CheckRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-2">
      <dt className="panel-legend self-center">{term}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Outcome({ outcome, headingRef }: { outcome: SubmitOutcome; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="panel-plate flex min-w-0 flex-col gap-2 rounded-md p-3">
      <h2 ref={headingRef} tabIndex={-1} className="flex min-w-0 flex-wrap items-center gap-2">
        <TxStatusBadge resultCode={outcome.status === 'unknown' || outcome.status === 'expired' ? outcome.status : outcome.resultCode} validated />
        <TxLink hash={outcome.hash} />
      </h2>
      {outcome.status === 'unknown' && <p className="text-sm">{UNKNOWN_OUTCOME_WORDS}</p>}
      {(outcome.status === 'failed' || outcome.status === 'claimed') && (
        <p className="text-sm text-text-destructive">
          {describeResultCode(outcome.resultCode)}
          {outcome.status === 'claimed' && ' The network fee was still charged for this attempt.'}
        </p>
      )}
    </div>
  )
}
