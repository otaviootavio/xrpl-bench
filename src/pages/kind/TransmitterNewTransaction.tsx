import { useEffect, useRef, useState } from 'react'
import { isValidClassicAddress } from 'xrpl'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Radio } from '@/components/ui/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AmountInput, validateAmountString } from '@/components/wallet/AmountInput'
import { HandoffPlate } from '@/components/wallet/HandoffPlate'
import { KeyStateRows, KeyWarning } from '@/components/wallet/KeyStateRows'
import { QrScanner } from '@/components/wallet/QrScanner'
import { ReadingValue } from '@/components/wallet/ReadingValue'
import { QueryErrorState } from '@/components/wallet/QueryErrorState'
import { TrustLineRow } from '@/components/wallet/TrustLineRow'
import { ReadyView, ResultView } from '@/components/wallet/TransmitStep'
import { readySigned, sendReady, type Ready, type StepResult } from '@/lib/transmit-step'
import { WRAPPING_KEYS } from '@/components/wallet/wrapping-keys'
import { useAccountState } from '@/hooks/useAccountState'
import { useDestinationCheck } from '@/hooks/useDestinationCheck'
import { usePrompts } from '@/hooks/usePrompts'
import { useRecommendedFee } from '@/hooks/useRecommendedFee'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useSignerList } from '@/hooks/useSignerList'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { useTrustLines } from '@/hooks/useTrustLines'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { canonicalLimit, PAYLOAD_NAMES, replacesRegularKey } from '@/lib/offline-round'
import { isCurrencyCode, payloadKindOf, type KeyState } from '@/lib/qr-codec'
import { readStateOf } from '@/lib/read-state'
import { makeUnsigned, type MakeResult, type TransmitterBuild } from '@/lib/transmitter-build'
import { fieldValue } from '@/lib/tx-fields'
import * as W from '@/lib/offline-round-words'
import { LEDGER_UNREAD, fill } from '@/lib/transmit-words'
import { NONE, UNSIGNED_ON_TRANSMIT, WRONG_KIND } from '@/lib/transmitter-words'
import { TRANSMITTER_SCREENS } from '@/lib/wallet-kind-words'
import { checkFunds, heldTokenLines, selectedTokenLine, spendableReadState, tokenAssetKey } from '@/lib/xrpl/funds-check'
import { displayCurrencyCode, dropsToXrpString, formatXrp, xrpToDropsString } from '@/lib/xrpl/money'
import { NETWORKS } from '@/lib/xrpl/networks'
import { KindScreenPlate } from './KindScreenPlate'

const MAX_DESTINATION_TAG = 4294967295
type HeadingRef = React.RefObject<HTMLHeadingElement | null>
type Made = Extract<MakeResult, { status: 'made' }>

type Phase =
  | { name: 'building'; failure?: { kind: 'refused'; text: string } | { kind: 'read-failed' } }
  | { name: 'making' }
  | { name: 'unsigned'; made: Made; refusal?: string; ready?: Ready; sending?: boolean; result?: StepResult }

/**
 * A Synced Transmitter's New transaction (OS-FR-17, EXPERIENCE "Transmitter-builds
 * round"): the type, then that type's online fields with live reads of the Synced
 * address; "Make the unsigned transaction" (P-38) runs the online pre-flight on
 * fresh reads and makes the Unsigned Transaction; its plate (P-33) shows the code
 * and the scanner for the signed code below it, which enters the Transmit step
 * (checks, fields, Send) with the Synced address as the expected Account. Nothing
 * here signs. The round lives in this screen only: a lock, a Sync change or leaving
 * the screen drops it (EXPERIENCE: "The Unsigned Transaction is dropped").
 */
export function TransmitterNewTransaction({ wallet, address }: { wallet: TransmitterMeta; address: string }) {
  const [phase, setPhase] = useState<Phase>({ name: 'building' })
  const [build, setBuild] = useState<TransmitterBuild | null>(null)
  const queryClient = useQueryClient()
  const prompts = usePrompts()
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const scannerRef = useRef<HTMLDivElement | null>(null)

  // A new state with a heading takes focus there (EXPERIENCE "Focus"); a refusal leaves it on the scanner.
  const focusKey = phase.name === 'unsigned' ? `u-${phase.ready ? 'r' : ''}-${phase.result?.kind ?? ''}-${phase.refusal ?? ''}` : phase.name
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (phase.name === 'unsigned' && phase.refusal) {
      scannerRef.current?.querySelector<HTMLElement>('button, textarea')?.focus()
      return
    }
    if (phase.name === 'unsigned' && phase.result?.kind === 'refused') return
    headingRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  async function make(next: TransmitterBuild) {
    setBuild(next)
    setPhase({ name: 'making' })
    let result: MakeResult
    try {
      result = await makeUnsigned({ ...wallet, address }, next, { queryClient })
    } catch {
      result = { status: 'read-failed' }
    }
    if (result.status === 'made') setPhase({ name: 'unsigned', made: result })
    else setPhase({ name: 'building', failure: result.status === 'refused' ? { kind: 'refused', text: result.reason } : { kind: 'read-failed' } })
  }

  function onSigned(made: Made, text: string) {
    if (phase.name !== 'unsigned' || phase.sending) return
    const kind = payloadKindOf(text)
    if (kind === 'u') return setPhase({ name: 'unsigned', made, refusal: UNSIGNED_ON_TRANSMIT })
    if (kind !== null && kind !== 's') return setPhase({ name: 'unsigned', made, refusal: fill(WRONG_KIND, PAYLOAD_NAMES[kind], PAYLOAD_NAMES.s) })
    const r = readySigned({ ...wallet, address }, text)
    setPhase(r.kind === 'ready' ? { name: 'unsigned', made, ready: r.ready } : { name: 'unsigned', made, refusal: r.text })
  }

  async function send(made: Made, ready: Ready) {
    setPhase({ name: 'unsigned', made, ready, sending: true })
    const result = await sendReady({ ...wallet, address }, ready, { prompts, queryClient })
    setPhase(result.kind === 'refused' ? { name: 'unsigned', made, ready, refusal: result.text } : { name: 'unsigned', made, result })
  }

  return (
    <KindScreenPlate title={TRANSMITTER_SCREENS.newTransaction.title}>
      <div className={`flex min-w-0 flex-col gap-3 ${WRAPPING_KEYS}`}>
        {phase.name !== 'unsigned' ? (
          <>
            <BuildForm wallet={wallet} address={address} initial={build} busy={phase.name === 'making'} onMake={(b) => void make(b)} headingRef={headingRef} />
            <div role="alert">
              {phase.name === 'building' && phase.failure?.kind === 'refused' && <p className="break-words text-sm text-text-destructive">{phase.failure.text}</p>}
            </div>
            {phase.name === 'building' && phase.failure?.kind === 'read-failed' && build && (
              <div className="flex min-w-0 flex-col items-start gap-2">
                <p className="text-sm">{LEDGER_UNREAD}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void make(build)}>
                  {W.READ_AGAIN}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <UnsignedPlate made={phase.made} wallet={wallet} headingRef={phase.ready || phase.result ? undefined : headingRef} />
            <section aria-labelledby="tx-scan-signed" className="flex min-w-0 flex-col gap-2">
              <h3 id="tx-scan-signed" className="panel-legend">
                {W.SCAN_SIGNED_TITLE}
              </h3>
              <div ref={scannerRef}>
                <QrScanner onPayload={(t) => onSigned(phase.made, t)} label="a code" />
              </div>
              <div role="alert">{phase.refusal && <p className="break-words text-sm text-text-destructive">{phase.refusal}</p>}</div>
            </section>
            {phase.ready && !phase.result && (
              <ReadyView
                ready={phase.ready}
                network={wallet.network}
                sending={phase.sending === true}
                headingRef={headingRef}
                headingId="tx-ready"
                onSend={() => phase.ready && void send(phase.made, phase.ready)}
              />
            )}
            {phase.result && <ResultView result={phase.result} headingRef={headingRef} />}
            <div className="flex flex-wrap gap-2">
              {/* Past its window the plate offers to make it again with new values (EXPERIENCE). */}
              {phase.result?.kind === 'expired' && build && (
                <Button type="button" onClick={() => void make(build)}>
                  {W.MAKE_THE_UNSIGNED}
                </Button>
              )}
              {!phase.sending && (
                <Button type="button" variant="outline" onClick={() => setPhase({ name: 'building' })}>
                  {W.CHANGE_THE_TRANSACTION}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </KindScreenPlate>
  )
}

/** The Unsigned plate: P-33 heads it (no title is approved), the code on this Wallet's Network, then what was made and checked. */
function UnsignedPlate({ made, wallet, headingRef }: { made: Made; wallet: TransmitterMeta; headingRef?: HeadingRef }) {
  const label = NETWORKS[wallet.network].label
  const { checks, tx } = made
  return (
    <HandoffPlate heading={W.UNSIGNED_LINE} payload={PAYLOAD_NAMES.u} headingRef={headingRef} network={wallet.network} text={made.text}>
      <dl className="grid min-w-0 gap-2">
        {Object.entries(tx).map(([name, value]) => (
          <div key={name} className="grid min-w-0 gap-0.5">
            <dt className="panel-legend [overflow-wrap:anywhere]">{name}</dt>
            <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{fieldValue(name, value, tx.TransactionType)}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="unsigned-checked" className="flex min-w-0 flex-col gap-2">
        <h3 id="unsigned-checked" className="panel-legend">
          {fill(W.CHECKED_ON, label)}
        </h3>
        <dl className="grid min-w-0 gap-1 text-sm">
          {(checks.type === 'payment' || checks.type === 'token-payment') && checks.destinationExists && <CheckRow term={W.FIELD.destination} value={W.CHECK_RESULT.found} />}
          {(checks.type === 'payment' || checks.type === 'token-payment') && checks.tagSupplied && <CheckRow term={W.FIELD.destinationTag} value={W.CHECK_RESULT.supplied} />}
          {(checks.type === 'payment' || checks.type === 'token-payment' || (checks.type === 'trust-line' && checks.spendable)) && (
            <CheckRow term={W.SHIPPED.spendable} value={W.CHECK_RESULT.sufficient} />
          )}
          <CheckRow term={W.FIELD.fee} value={W.CHECK_RESULT.underFeeLimit} />
        </dl>
      </section>
      {checks.type === 'token-payment' && checks.warnings.includes('destination-not-activated') && (
        <SendWarning title={W.SHIPPED_SEND.notActivatedTitle} line={W.SHIPPED_SEND.notActivatedLine} />
      )}
      {checks.type === 'token-payment' && checks.warnings.includes('no-trust-line') && <SendWarning title={W.SHIPPED_SEND.noTrustLineTitle} line={W.SHIPPED_SEND.noTrustLineLine} />}
      {made.keyState !== undefined && <KeyStateRows keyState={made.keyState} />}
      {tx.TransactionType === 'SetRegularKey' && replacesRegularKey(tx.RegularKey as string | undefined, made.keyState) && <KeyWarning words={W.W5_SENTENCE} />}
      {tx.TransactionType === 'AccountSet' && tx.SetFlag !== undefined && <KeyWarning words={W.W4_SENTENCE} />}
    </HandoffPlate>
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

function SendWarning({ title, line }: { title: string; line: string }) {
  return (
    <Alert variant="warning" role="none">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{line}</AlertDescription>
    </Alert>
  )
}

type BuildType = 'payment' | 'trust-line' | 'regular-key' | 'master-key'
const TYPE_WORDS: Record<BuildType, string> = {
  payment: W.PAYMENT,
  'trust-line': W.TRUST_LINE,
  'regular-key': W.REGULAR_KEY_TYPE,
  'master-key': W.MASTER_KEY_TYPE,
}
const TYPES = Object.keys(TYPE_WORDS) as BuildType[]
const typeOf = (b: TransmitterBuild | null): BuildType => (!b ? 'payment' : b.type === 'token-payment' ? 'payment' : b.type)

interface FormProps {
  wallet: TransmitterMeta
  address: string
  busy: boolean
  onMake: (build: TransmitterBuild) => void
}

/**
 * "Type of transaction" over P-62's types. These four hold every write the online app
 * builds (a token is a Payment, as on online Send), so "Other transactions" would open
 * nothing and is not shown (story 9 Design Notes, OS-SM-2).
 */
function BuildForm({ initial, headingRef, ...props }: FormProps & { initial: TransmitterBuild | null; headingRef: HeadingRef }) {
  const [type, setType] = useState<BuildType>(typeOf(initial))
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <fieldset className="grid gap-1.5">
        <legend ref={headingRef as unknown as React.RefObject<HTMLLegendElement | null>} tabIndex={-1} className="panel-legend mb-1">
          {W.TYPE_OF_TRANSACTION}
        </legend>
        {TYPES.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm">
            <Radio name="tx-type" value={t} checked={type === t} onChange={() => setType(t)} />
            {TYPE_WORDS[t]}
          </label>
        ))}
      </fieldset>
      {type === 'payment' && <PaymentForm {...props} initial={initial?.type === 'payment' || initial?.type === 'token-payment' ? initial : undefined} />}
      {type === 'trust-line' && <TrustLineForm {...props} initial={initial?.type === 'trust-line' ? initial : undefined} />}
      {(type === 'regular-key' || type === 'master-key') && <KeyForm {...props} type={type} initial={initial?.type === type ? initial : undefined} />}
    </div>
  )
}

function MakeKey({ disabled, busy, onMake }: { disabled: boolean; busy: boolean; onMake: () => void }) {
  return (
    <Button type="button" className="w-fit" disabled={disabled || busy} onClick={onMake}>
      {W.MAKE_THE_UNSIGNED}
    </Button>
  )
}

/**
 * Payment: online Send's fields and reads for the Synced address (asset, destination with
 * its live check, tag, amount, Network fee, Spendable) and its funds check. The pre-flight
 * runs again on fresh reads when the Unsigned Transaction is made.
 */
function PaymentForm({ wallet, address, busy, onMake, initial }: FormProps & { initial?: Extract<TransmitterBuild, { type: 'payment' | 'token-payment' }> }) {
  const { network, node } = wallet
  const [destination, setDestination] = useState(initial?.destination ?? '')
  const [destTag, setDestTag] = useState(initial?.destinationTag !== undefined ? String(initial.destinationTag) : '')
  const [asset, setAsset] = useState(initial?.type === 'token-payment' ? tokenAssetKey({ currency: initial.currency, account: initial.issuer }) : 'XRP')
  const [amount, setAmount] = useState(initial ? (initial.type === 'payment' ? dropsToXrpString(initial.amountDrops) : initial.value) : '')
  const spendable = useSpendableBalance(network, address, node)
  const spendableState = spendableReadState(spendable)
  const fee = useRecommendedFee(network, node)
  const feeState = readStateOf(fee)
  const trustLines = useTrustLines(network, address, node)
  const trustLinesState = readStateOf(trustLines)
  const destCheck = useDestinationCheck(network, destination, asset, node)
  const destInfo = destCheck.info
  const heldTokens = heldTokenLines(trustLinesState)
  const selectedLine = selectedTokenLine(trustLinesState, asset)
  const isSelfSend = destination === address
  const amountValidation = validateAmountString(amount, asset === 'XRP' ? 'xrp' : 'issued')
  const tagValue = destTag ? Number(destTag) : undefined
  const tagValid = tagValue === undefined || (Number.isInteger(tagValue) && tagValue >= 0 && tagValue <= MAX_DESTINATION_TAG)
  const funds = checkFunds({ amount, amountValid: amountValidation.valid, asset, spendable: spendableState, fee: feeState, trustLines: trustLinesState })
  const canMake =
    destCheck.destinationValid && !isSelfSend && amountValidation.valid && !funds && tagValid && destCheck.ok && (!destInfo?.requireDestTag || destTag.length > 0)
  const tagLabel = destCheck.ok
    ? destInfo?.requireDestTag
      ? W.SHIPPED.tagRequired
      : W.SHIPPED_SEND.tagOptional
    : destCheck.destinationValid
      ? W.SHIPPED.destinationTagUnknown
      : W.SHIPPED_SEND.tagOptional

  function onMakeClick() {
    const tag = tagValue !== undefined ? { destinationTag: tagValue } : {}
    if (asset === 'XRP') return onMake({ type: 'payment', destination, amountDrops: xrpToDropsString(amount), ...tag })
    const [currency, issuer] = asset.split('|')
    onMake({ type: 'token-payment', destination, currency, issuer, value: amount, ...tag })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="tx-dest">{W.SHIPPED.destinationAddress}</Label>
        <Input
          id="tx-dest"
          value={destination}
          onChange={(e) => setDestination(e.target.value.trim())}
          placeholder="r..."
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={destination.length > 0 && !destCheck.destinationValid}
          aria-describedby={destination.length > 0 && !destCheck.destinationValid ? 'tx-dest-error' : undefined}
        />
        {destination.length > 0 && !destCheck.destinationValid && (
          <p id="tx-dest-error" className="text-sm text-text-destructive">
            {W.SHIPPED.invalidAddress}
          </p>
        )}
        {isSelfSend && <p className="text-sm text-text-destructive">{W.SHIPPED.selfSend}</p>}
        {(destCheck.pending || destCheck.query.isFetching) && <p className="text-xs text-muted-foreground">{W.SHIPPED_SEND.checkingDestination}</p>}
      </div>
      {destCheck.ok && destInfo && !destInfo.exists && <SendWarning title={W.SHIPPED_SEND.notActivatedTitle} line={W.SHIPPED_SEND.notActivatedLine} />}
      {destCheck.ok && destInfo?.hasTrustLine === false && <SendWarning title={W.SHIPPED_SEND.noTrustLineTitle} line={W.SHIPPED_SEND.noTrustLineLine} />}
      <div className="grid gap-1.5">
        <Label htmlFor="tx-dtag">{tagLabel}</Label>
        <Input
          id="tx-dtag"
          inputMode="numeric"
          value={destTag}
          onChange={(e) => setDestTag(e.target.value.replace(/\D/g, ''))}
          aria-invalid={!tagValid}
          aria-describedby={!tagValid ? 'tx-dtag-error' : undefined}
        />
        {!tagValid && (
          <p id="tx-dtag-error" className="text-sm text-text-destructive">
            A destination tag must be between 0 and {MAX_DESTINATION_TAG}.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label>{W.SHIPPED_SEND.asset}</Label>
        <Select
          value={asset}
          onValueChange={(next) => {
            if (next !== asset) setAmount('')
            setAsset(next)
          }}
        >
          <SelectTrigger>
            <SelectValue>{asset !== 'XRP' && !selectedLine ? displayCurrencyCode(asset.split('|')[0]) : undefined}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="XRP">{W.SHIPPED_SEND.xrp}</SelectItem>
            {heldTokens.map((l) => (
              <SelectItem key={`${l.account}-${l.currency}`} value={tokenAssetKey(l)}>
                {displayCurrencyCode(l.currency)} (balance {l.balance})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AmountInput
        id="tx-amount"
        label={W.SHIPPED.amount}
        value={amount}
        onChange={setAmount}
        kind={asset === 'XRP' ? 'xrp' : 'issued'}
        suffix={asset === 'XRP' ? 'XRP' : displayCurrencyCode(asset.split('|')[0])}
        error={amount.length > 0 ? (amountValidation.error ?? (funds?.pending ? undefined : funds?.reason)) : undefined}
        pending={amount.length > 0 && !amountValidation.error && funds?.pending ? funds.reason : undefined}
      />
      <dl className="panel-well flex flex-wrap gap-x-8 gap-y-2 rounded-md px-3 py-2.5">
        <div>
          <dt className="panel-legend text-readout-muted">{W.SHIPPED.networkFee}</dt>
          <ReadingValue state={feeState} format={formatXrp} />
        </div>
        {asset === 'XRP' && (
          <div>
            <dt className="panel-legend text-readout-muted">{W.SHIPPED.spendable}</dt>
            <ReadingValue state={spendableState.status === 'ok' ? spendableState : { status: 'failed' }} format={formatXrp} />
          </div>
        )}
      </dl>
      <MakeKey disabled={!canMake} busy={busy} onMake={onMakeClick} />
    </div>
  )
}

type TrustAction = 'add' | 'edit' | 'close'

/** Trust line: the online trust-line screen's actions and fields, with the Synced address's lines, Owner reserve and Network fee read live. */
function TrustLineForm({ wallet, address, busy, onMake, initial }: FormProps & { initial?: Extract<TransmitterBuild, { type: 'trust-line' }> }) {
  const { network, node } = wallet
  const [action, setAction] = useState<TrustAction>(initial?.limit === '0' ? 'close' : 'add')
  const [issuer, setIssuer] = useState(initial?.issuer ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const [limit, setLimit] = useState(initial && initial.limit !== '0' ? initial.limit : '1000000000')
  const lines = useTrustLines(network, address, node)
  const reserves = useServerReserves(network, node)
  const fee = useRecommendedFee(network, node)
  const issuerValid = isValidClassicAddress(issuer)
  const codeValid = isCurrencyCode(currency)
  const canonical = action === 'close' ? '0' : canonicalLimit(limit)
  const limitValid = canonical !== null && (action === 'close' || canonical !== '0')
  const K = W.SHIPPED_KEYS
  const ownerReserve = readStateOf(reserves.isError ? { isError: true } : { data: reserves.data?.ownerReserveDrops })
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-label={K.trustLines} className="flex min-w-0 flex-col gap-2">
        <h3 className="panel-legend">{K.trustLines}</h3>
        {lines.isError ? (
          <QueryErrorState
            title="Token balances unavailable"
            description="The trust lines for this account could not be read from the ledger, so the app cannot say which tokens it holds."
            onRetry={() => lines.refetch()}
          />
        ) : lines.data && lines.data.length === 0 ? (
          <p className="text-sm">{NONE}</p>
        ) : (
          lines.data?.map((l) => <TrustLineRow key={`${l.account}-${l.currency}`} line={l} />)
        )}
      </section>
      <fieldset className="grid gap-1.5">
        <legend className="panel-legend mb-1">{W.TRUST_LINE}</legend>
        {(['add', 'edit', 'close'] as const).map((a) => (
          <label key={a} className="flex items-center gap-2 text-sm">
            <Radio name="tx-trust" checked={action === a} onChange={() => setAction(a)} />
            {a === 'add' ? K.addTrustLine : a === 'edit' ? K.editTrustLineLimit : K.closeTrustLine}
          </label>
        ))}
      </fieldset>
      {action === 'add' && <p className="text-sm">{K.addLine}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="tx-issuer">{K.issuerAddress}</Label>
        <Input
          id="tx-issuer"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value.trim())}
          placeholder="r..."
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={issuer.length > 0 && !issuerValid}
          aria-describedby={issuer.length > 0 && !issuerValid ? 'tx-issuer-error' : undefined}
        />
        {issuer.length > 0 && !issuerValid && (
          <p id="tx-issuer-error" className="text-sm text-text-destructive">
            {W.SHIPPED.invalidAddress}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tx-currency">{K.currencyCode}</Label>
        <Input
          id="tx-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.trim())}
          placeholder="USD"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={currency.length > 0 && !codeValid}
          aria-describedby={currency.length > 0 && !codeValid ? 'tx-currency-error' : undefined}
        />
        {currency.length > 0 && !codeValid && (
          <p id="tx-currency-error" className="text-sm text-text-destructive">
            {K.currencyError}
          </p>
        )}
      </div>
      {action !== 'close' && (
        <div className="grid gap-1.5">
          <Label htmlFor="tx-limit">{action === 'add' ? K.trustLimit : K.newLimit}</Label>
          <Input id="tx-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.trim())} aria-invalid={limit.length > 0 && !limitValid} />
        </div>
      )}
      <dl className="panel-well flex flex-wrap gap-x-8 gap-y-2 rounded-md px-3 py-2.5">
        {action === 'add' && (
          <div>
            <dt className="panel-legend text-readout-muted">{K.ownerReserve}</dt>
            <ReadingValue state={ownerReserve} format={formatXrp} />
          </div>
        )}
        <div>
          <dt className="panel-legend text-readout-muted">{W.SHIPPED.networkFee}</dt>
          <ReadingValue state={readStateOf(fee)} format={formatXrp} />
        </div>
      </dl>
      <MakeKey
        disabled={!(issuerValid && codeValid && limitValid)}
        busy={busy}
        onMake={() => canonical !== null && onMake({ type: 'trust-line', currency, issuer, limit: canonical })}
      />
    </div>
  )
}

/**
 * Regular Key or Master key (P-47, P-48's line): the Account's key state read live (P-29
 * on a failed read), W5 when a set Regular Key is replaced, and before the master key goes
 * off "Test the Regular Key" (P-50: it points elsewhere) and W4's sentence. Warnings only:
 * the app refuses no key action (SPEC "Trust the user").
 */
function KeyForm({ wallet, address, busy, onMake, type, initial }: FormProps & { type: 'regular-key' | 'master-key'; initial?: TransmitterBuild }) {
  const { network, node } = wallet
  const account = useAccountState(network, address, node)
  const signers = useSignerList(network, address, node)
  const [remove, setRemove] = useState(initial?.type === 'regular-key' ? initial.regularKey === null : false)
  const [key, setKey] = useState(initial?.type === 'regular-key' ? (initial.regularKey ?? '') : '')
  const [enable, setEnable] = useState(initial?.type === 'master-key' ? initial.enable : false)
  const [testShown, setTestShown] = useState(false)
  const valid = isValidClassicAddress(key)
  const state = account.isError ? null : account.data
  const keyState: KeyState | null = account.isError
    ? 'unknown'
    : state?.exists
      ? {
          regular_key: state.regularKey ?? null,
          master_key: state.disableMasterKey ? 'off' : 'on',
          signer_list: signers.isError ? 'unknown' : signers.data !== undefined ? signers.data : 'unknown',
        }
      : null
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-sm">{W.KEY_CHANGE_UNSIGNED}</p>
      {keyState !== null && <KeyStateRows keyState={keyState} />}
      {type === 'regular-key' ? (
        <>
          <fieldset className="grid gap-1.5">
            <legend className="panel-legend mb-1">{W.REGULAR_KEY_TYPE}</legend>
            <label className="flex items-center gap-2 text-sm">
              <Radio name="tx-regular" checked={!remove} onChange={() => setRemove(false)} />
              {W.SET_A_REGULAR_KEY}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Radio name="tx-regular" checked={remove} onChange={() => setRemove(true)} />
              {W.REMOVE_THE_REGULAR_KEY}
            </label>
          </fieldset>
          {!remove && (
            <div className="grid gap-1.5">
              <Label htmlFor="tx-regular-key">{W.SHIPPED_KEYS.regularKeyAddress}</Label>
              <Input
                id="tx-regular-key"
                value={key}
                onChange={(e) => setKey(e.target.value.trim())}
                placeholder="r..."
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={key.length > 0 && !valid}
                aria-describedby={key.length > 0 && !valid ? 'tx-regular-key-error' : undefined}
              />
              {key.length > 0 && !valid && (
                <p id="tx-regular-key-error" className="text-sm text-text-destructive">
                  {W.SHIPPED.invalidAddress}
                </p>
              )}
            </div>
          )}
          {!remove && valid && keyState !== null && replacesRegularKey(key, keyState) && <KeyWarning words={W.W5_SENTENCE} />}
          <MakeKey disabled={!remove && !valid} busy={busy} onMake={() => onMake({ type: 'regular-key', regularKey: remove ? null : key })} />
        </>
      ) : (
        <>
          <fieldset className="grid gap-1.5">
            <legend className="panel-legend mb-1">{W.MASTER_KEY_TYPE}</legend>
            <label className="flex items-center gap-2 text-sm">
              <Radio name="tx-master" checked={!enable} onChange={() => setEnable(false)} />
              {W.TURN_OFF_THE_MASTER_KEY}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Radio name="tx-master" checked={enable} onChange={() => setEnable(true)} />
              {W.TURN_ON_THE_MASTER_KEY}
            </label>
          </fieldset>
          {!enable && (
            <div className="flex min-w-0 flex-col items-start gap-2">
              <Button type="button" variant="outline" size="sm" aria-expanded={testShown} onClick={() => setTestShown(true)}>
                {W.TEST_THE_REGULAR_KEY}
              </Button>
              <p role="status" className="text-sm">
                {testShown ? W.TEST_ELSEWHERE : ''}
              </p>
              <KeyWarning words={W.W4_SENTENCE} />
            </div>
          )}
          <MakeKey disabled={false} busy={busy} onMake={() => onMake({ type: 'master-key', enable })} />
        </>
      )}
    </div>
  )
}
