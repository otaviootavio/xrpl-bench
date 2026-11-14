import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { QrScanner } from '@/components/wallet/QrScanner'
import { usePrompts } from '@/hooks/usePrompts'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { decodeRequest, payloadKindOf, type RequestPayload } from '@/lib/qr-codec'
import { answerRequest, type AnswerResult } from '@/lib/answer-request'
import { HandoffPlate } from '@/components/wallet/HandoffPlate'
import { KeyStateRows, KeyWarning } from '@/components/wallet/KeyStateRows'
import { ReadyView, ResultView } from '@/components/wallet/TransmitStep'
import { readySigned, sendReady, type Ready, type StepResult } from '@/lib/transmit-step'
import { replacesRegularKey } from '@/lib/offline-round'
import { WRAPPING_KEYS } from '@/components/wallet/wrapping-keys'
import { useWakeLock } from '@/hooks/useWakeLock'
import * as R from '@/lib/offline-round-words'
import { fill } from '@/lib/transmit-words'
import { TRANSMIT_SCANNER_LINE, UNSIGNED_ON_TRANSMIT } from '@/lib/transmitter-words'
import { TRANSMITTER_SCREENS } from '@/lib/wallet-kind-words'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { forgetSyncedAddress } from '@/lib/teardown'
import { KindScreenPlate } from './KindScreenPlate'

type State =
  | { kind: 'idle' }
  | { kind: 'refused'; text: string }
  | { kind: 'ready'; ready: Ready }
  | { kind: 'sending'; ready: Ready }
  | Exclude<StepResult, { kind: 'refused' }>
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
 * online words, or P-28 on a failed read. Every Account this screen answered a
 * request for is an Account the Transmit step expects (OS-FR-9), so an unsynced
 * Transmitter does not ask for P-27's confirm on the signed code that follows.
 * That set, and the account data the answers read, go when the screen unmounts
 * (a lock unmounts it).
 */
export function TransmitScreen({ wallet }: { wallet: TransmitterMeta }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const prompts = usePrompts()
  const queryClient = useQueryClient()
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const network = NETWORKS[wallet.network].label
  const scannerRef = useRef<HTMLDivElement | null>(null)
  /** The Accounts of the requests this screen answered (route-checks "Transmit step"). This mount only. */
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set())
  const answeredRef = useRef(answered)
  answeredRef.current = answered
  // Awake only while a round is up: a request being answered, or a signed code awaited after an answer.
  useWakeLock(state.kind === 'answering' || (answered.size > 0 && state.kind !== 'outcome' && state.kind !== 'expired' && state.kind !== 'unconfirmed'))

  // The request Accounts' reads do not outlive this screen (a lock unmounts it),
  // unless an open Wallet holds the address (story 6 review).
  useEffect(
    () => () => {
      for (const account of answeredRef.current) {
        if (account !== wallet.address) forgetSyncedAddress(queryClient, wallet.id, wallet.network, account)
      }
    },
    [queryClient, wallet.id, wallet.network, wallet.address],
  )

  // A new state with a heading takes focus there, never on Send. A refusal and an
  // answer being read leave focus on the scanner, which stays ready.
  useEffect(() => {
    if (state.kind === 'refused' || state.kind === 'answering') {
      scannerRef.current?.querySelector<HTMLElement>('button, textarea')?.focus()
      return
    }
    if (state.kind !== 'idle') headingRef.current?.focus()
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
    setState(readySigned(wallet, text, answered))
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
      const account = result.account
      setAnswered((before) => new Set([...before, account]))
      setState({ kind: 'answered', answer: result })
    } else if (result.status === 'refused') setState({ kind: 'refused', text: result.reason })
    else setState({ kind: 'read-failed', request })
  }

  async function send(ready: Ready) {
    setState({ kind: 'sending', ready })
    setState(await sendReady(wallet, ready, { prompts, queryClient }))
  }

  const ready = state.kind === 'ready' || state.kind === 'sending' ? state.ready : null
  return (
    <KindScreenPlate title={TRANSMITTER_SCREENS.transmit.title}>
      <p className="text-sm">{TRANSMIT_SCANNER_LINE}</p>
      <div ref={scannerRef}>
        <QrScanner onPayload={onPayload} label="a code" />
      </div>
      {/* Always mounted, so "Checking …" is announced while the answer is read. */}
      <div role="status" className="text-sm">
        {state.kind === 'answering' && fill(R.CHECKING, state.request.account, network)}
      </div>
      {/* Always mounted, so a refusal is announced when it arrives; focus stays on the scanner. */}
      <div role="alert">
        {state.kind === 'refused' && (
          <p className="break-words text-sm text-text-destructive">{state.text}</p>
        )}
      </div>
      {ready && (
        <ReadyView ready={ready} network={wallet.network} sending={state.kind === 'sending'} headingRef={headingRef} headingId="transmit-ready" onSend={() => void send(ready)} />
      )}
      {state.kind === 'read-failed' && (
        <div className={`flex min-w-0 flex-col items-start gap-2 ${WRAPPING_KEYS}`}>
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-normal">
            {R.ANSWER_READ_FAILED}
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void answer(state.request)}>
            {R.READ_AGAIN}
          </Button>
        </div>
      )}
      {state.kind === 'answered' && <Answered answer={state.answer} network={wallet.network} headingRef={headingRef} />}
      {(state.kind === 'declined' || state.kind === 'expired' || state.kind === 'unconfirmed' || state.kind === 'outcome') && (
        <ResultView result={state} headingRef={headingRef} />
      )}
    </KindScreenPlate>
  )
}

/** The answer (EXPERIENCE "Transmitter answer"): the Data to Sign QR on this Wallet's Network, its title focused, then what was checked. */
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
  const { checks, tx } = answer
  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-3">
      <HandoffPlate heading={R.DATA_TO_SIGN_TITLE} headingRef={headingRef} network={network} text={answer.text} scan={2}>
        <p className="text-sm">{R.DATA_PLATE_LINE}</p>
        <section aria-labelledby="answer-checked" className="flex min-w-0 flex-col gap-2">
          <h3 id="answer-checked" className="panel-legend">
            {fill(R.CHECKED_ON, label)}
          </h3>
          <dl className="grid min-w-0 gap-1 text-sm">
            {checks.type === 'payment' && checks.destinationExists && <CheckRow term={R.FIELD.destination} value={R.CHECK_RESULT.found} />}
            {checks.type === 'payment' && checks.tagSupplied && <CheckRow term={R.FIELD.destinationTag} value={R.CHECK_RESULT.supplied} />}
            {(checks.type === 'payment' || (checks.type === 'trust-line' && checks.spendable)) && (
              <CheckRow term={R.SHIPPED.spendable} value={R.CHECK_RESULT.sufficient} />
            )}
            <CheckRow term={R.FIELD.fee} value={R.CHECK_RESULT.underFeeLimit} />
          </dl>
        </section>
        {/* Before a key change (OS-FR-15, OS-FR-21): the key state it read, then W5 when a set
            Regular Key is replaced, W4's sentence when the master key goes off. Warnings only. */}
        {answer.keyState !== undefined && <KeyStateRows keyState={answer.keyState} />}
        {tx.TransactionType === 'SetRegularKey' && replacesRegularKey(tx.RegularKey, answer.keyState) && <KeyWarning words={R.W5_SENTENCE} />}
        {tx.TransactionType === 'AccountSet' && 'SetFlag' in tx && <KeyWarning words={R.W4_SENTENCE} />}
      </HandoffPlate>
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
