import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { StatusLegend } from '@/components/ui/lamp'
import { TxLink } from '@/components/wallet/AddressLink'
import { TxStatusBadge } from '@/components/wallet/TxStatusBadge'
import { SignedFieldList } from '@/components/wallet/SignedTransactionReview'
import { SignsForOffer } from '@/components/wallet/SignsForOffer'
import * as R from '@/lib/offline-round-words'
import { EXPIRED_NOTHING_SENT, SEND_KEY, TRANSACTION_HASH, fill } from '@/lib/transmit-words'
import { CHECK_LIST, CONFIRM_ACCOUNT } from '@/lib/transmitter-words'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { describeResultCode, UNCONFIRMED_SUBMIT_WORDS, UNKNOWN_OUTCOME_WORDS } from '@/lib/xrpl/result-codes'
import type { TransmitOutcome } from '@/lib/xrpl/writes'
import type { Ready, StepResult } from '@/lib/transmit-step'

/**
 * The Transmit step's screen part for a scanned Signed Transaction (OS-FR-9,
 * OS-FR-10, EXPERIENCE "Transmit step"), shared by Transmit and by the Synced
 * Transmitter's New transaction (story 9): the P-25 checks, the fields, the one
 * orange Send, then the outcome in today's words (`lib/transmit-step.ts` does the work).
 */

/** The checks (P-25), P-27 when no Account is expected, the hash (focused), the fields and the one orange Send. */
export function ReadyView({
  ready,
  network,
  sending,
  headingRef,
  headingId,
  onSend,
}: {
  ready: Ready
  network: NetworkId
  sending: boolean
  headingRef: React.RefObject<HTMLHeadingElement | null>
  headingId: string
  onSend: () => void
}) {
  const label = NETWORKS[network].label
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 border-t border-border pt-3">
      <ul className="flex flex-col gap-1 text-sm">
        <li>{CHECK_LIST.signature}</li>
        {ready.expected !== null && <li className="[overflow-wrap:anywhere]">{fill(CHECK_LIST.account, ready.checked.account)}</li>}
        <li>{fill(CHECK_LIST.network, label)}</li>
        <li>{fill(CHECK_LIST.timeLimit, ready.checked.lastLedgerSequence)}</li>
      </ul>
      {ready.expected === null && (
        <Alert variant="warning" role="none">
          <AlertDescription className="[overflow-wrap:anywhere]">{fill(CONFIRM_ACCOUNT, ready.checked.account)}</AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 gap-1">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="panel-legend">
          {TRANSACTION_HASH}
        </h2>
        <p className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{ready.checked.hash}</p>
      </div>
      <SignedFieldList txBlob={ready.txBlob} />
      {/* The one key here that moves funds (commit). */}
      <Button type="button" variant="commit" className="w-fit" disabled={sending} onClick={onSend}>
        {SEND_KEY}
      </Button>
    </section>
  )
}

/** After Send: a decline (P-24 caution), the expiry, an unconfirmed submit, or the outcome. A refusal is the caller's alert. */
export function ResultView({
  result,
  headingRef,
  breakableCode,
}: {
  result: StepResult
  headingRef: React.RefObject<HTMLHeadingElement | null>
  /** A narrow place (the Online key plate): the result code may break inside itself (`TxStatusBadge`). */
  breakableCode?: boolean
}) {
  switch (result.kind) {
    case 'declined':
      return (
        <div role="status">
          <Alert variant="warning" role="presentation">
            <AlertDescription>{result.text}</AlertDescription>
          </Alert>
        </div>
      )
    case 'expired':
      return (
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
          {EXPIRED_NOTHING_SENT}
        </h2>
      )
    case 'unconfirmed':
      return (
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-normal">
          {UNCONFIRMED_SUBMIT_WORDS}
        </h2>
      )
    case 'outcome':
      return (
        <>
          <Outcome outcome={result.outcome} headingRef={headingRef} breakableCode={breakableCode} />
          {/* P-54 (OS-FR-20): after a validated Regular Key change. */}
          {result.regularKeySet && <SignsForOffer set={result.regularKeySet} />}
        </>
      )
    default:
      return null
  }
}

function Outcome({ outcome, headingRef, breakableCode }: { outcome: TransmitOutcome; headingRef: React.RefObject<HTMLHeadingElement | null>; breakableCode?: boolean }) {
  // P-23: the ledger used this Sequence; never "Failed", and nothing offers to send again.
  // No link to this blob's hash: it is never on the ledger, and "not found" would read as "not sent".
  if (outcome.status === 'sent-before') {
    return (
      <div className="panel-plate flex min-w-0 flex-col gap-2 rounded-md p-3">
        <h2 ref={headingRef} tabIndex={-1} className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusLegend tone="caution">{R.PROBABLY_SENT_BEFORE}</StatusLegend>
        </h2>
        <p className="text-sm">{R.PROBABLY_SENT_BEFORE_LINE}</p>
      </div>
    )
  }
  return (
    <div className="panel-plate flex min-w-0 flex-col gap-2 rounded-md p-3">
      <h2 ref={headingRef} tabIndex={-1} className="flex min-w-0 flex-wrap items-center gap-2">
        <TxStatusBadge resultCode={outcome.status === 'unknown' || outcome.status === 'expired' ? outcome.status : outcome.resultCode} validated breakableCode={breakableCode} />
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
