import { RegularKeyNotes } from '@/components/wallet/KeyWarnings'
import { masterOffToBlackHole } from '@/lib/key-warnings'
import { useEffect, useRef, useState } from 'react'
import { encode, isValidClassicAddress } from 'xrpl'
import { isCurrencyCode } from '@/lib/qr-codec'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Radio } from '@/components/ui/radio'
import { AmountInput, validateAmountString } from '@/components/wallet/AmountInput'
import { HandoffPlate } from '@/components/wallet/HandoffPlate'
import { QrScanner } from '@/components/wallet/QrScanner'
import { SignedFieldList } from '@/components/wallet/SignedTransactionReview'
import { fieldValue } from '@/lib/tx-fields'
import { AddressScan } from '@/components/wallet/AddressScan'
import { KeyStateRows, KeyWarning } from '@/components/wallet/KeyStateRows'
import { useOfflineRound } from '@/hooks/useOfflineRound'
import { usePrompts } from '@/hooks/usePrompts'
import { useWakeLock } from '@/hooks/useWakeLock'
import { ledgerSeenOf, noteLedgerSeen, noteSigned, signedListOf, SigningCheckError, type KeyWalletMeta } from '@/lib/crypto/keystore'
import { EarlierSigningRecord } from '@/components/wallet/EarlierSigningRecord'
import { useSignedList } from '@/hooks/useSignedList'
import { latestSameBuild, retryCaseOf, type SignedRecord } from '@/lib/signed-list'
import {
  assembleTransaction,
  buildHashOf,
  builtTransaction,
  canonicalLimit,
  clearRound,
  isKeyChange,
  replacesRegularKey,
  judgeDataToSign,
  ledgerJumpWarning,
  newRequestId,
  requestText,
  roundOf,
  setRound,
  signedRecordOf,
  signRound,
  type MasterKeyBuild,
  type OfflineBuild,
  type PaymentBuild,
  type RegularKeyBuild,
  type Round,
  type SignedRound,
  type TrustLineBuild,
} from '@/lib/offline-round'
import * as W from '@/lib/offline-round-words'
import { SIGN_KEY, fill } from '@/lib/transmit-words'
import { OFFLINE_SCREENS } from '@/lib/wallet-kind-words'
import { dropsToXrpString, formatXrp, xrpToDropsString } from '@/lib/xrpl/money'
import { NETWORKS } from '@/lib/xrpl/networks'
import { lockRemainingMs, useAppStore, useWalletOpenKey } from '@/store/app-store'
import { KindScreenPlate } from './KindScreenPlate'
import { WRAPPING_KEYS } from '@/components/wallet/wrapping-keys'

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
      <div className={`flex min-w-0 flex-col gap-3 ${WRAPPING_KEYS}`}>
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
      ) : round.phase.name === 'retry-higher' ? (
        <RetryHigher wallet={wallet} round={round} headingRef={headingRef} />
      ) : round.phase.name === 'signing' ? (
        <SigningReview wallet={wallet} round={round} headingRef={headingRef} />
      ) : (
        <Signed wallet={wallet} round={round} headingRef={headingRef} />
      )}
      </div>
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

type BuildType = OfflineBuild['type']

/** P-62's type words, in the type list's order. */
const TYPE_WORDS: Record<BuildType, string> = {
  payment: W.PAYMENT,
  'trust-line': W.TRUST_LINE,
  'regular-key': W.REGULAR_KEY_TYPE,
  'master-key': W.MASTER_KEY_TYPE,
}
const TYPES = Object.keys(TYPE_WORDS) as BuildType[]

/**
 * Building (EXPERIENCE "Offline round"): "Type of transaction" over P-62's four types,
 * then the chosen type's online fields with P-1 in each reading's slot. The Built
 * values come back on "Change the transaction" (P-10).
 */
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
  const [type, setType] = useState<BuildType>(initial?.type ?? 'payment')
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <fieldset className="grid gap-1.5">
        <legend ref={headingRef as unknown as React.RefObject<HTMLLegendElement | null>} tabIndex={-1} className="panel-legend mb-1">
          {W.TYPE_OF_TRANSACTION}
        </legend>
        {TYPES.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm">
            <Radio name="off-type" value={t} checked={type === t} onChange={() => setType(t)} />
            {TYPE_WORDS[t]}
          </label>
        ))}
      </fieldset>
      {type === 'payment' && <PaymentForm wallet={wallet} initial={initial?.type === 'payment' ? initial : undefined} onReview={onReview} />}
      {type === 'trust-line' && <TrustLineForm wallet={wallet} initial={initial?.type === 'trust-line' ? initial : undefined} onReview={onReview} />}
      {type === 'regular-key' && <RegularKeyForm wallet={wallet} initial={initial?.type === 'regular-key' ? initial : undefined} onReview={onReview} />}
      {type === 'master-key' && <MasterKeyForm wallet={wallet} initial={initial?.type === 'master-key' ? initial : undefined} onReview={onReview} />}
    </div>
  )
}

function PaymentForm({ wallet, initial, onReview }: { wallet: KeyWalletMeta; initial?: PaymentBuild; onReview: (build: OfflineBuild) => void }) {
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

/** One radio of a type's actions. */
function ActionRadio({ name, checked, onSelect, children }: { name: string; checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Radio name={name} checked={checked} onChange={onSelect} />
      {children}
    </label>
  )
}

/** The review key of the types after Payment (the quizzes' shipped "Review"). */
function ReviewKey({ disabled, onReview }: { disabled: boolean; onReview: () => void }) {
  return (
    <Button type="button" className="w-fit" disabled={disabled} onClick={onReview}>
      {W.SHIPPED_KEYS.review}
    </Button>
  )
}

/** A currency code as the codec carries it (`isCurrencyCode`): case kept as typed, never XRP,
 * and no 40-hex code starting with 00 (story 8 review). */
const currencyValid = isCurrencyCode

type TrustAction = 'add' | 'edit' | 'close'

/**
 * Trust line (story 8): the online trust-line screen's three actions and fields. The
 * current lines are a reading (P-56: P-1 in their place), so the user names the action;
 * the Transmitter reads whether the line is there and applies the online guard for it.
 * Each builds the online TrustSet (`tfSetNoRipple`); Close sets the limit to zero.
 */
function TrustLineForm({ wallet, initial, onReview }: { wallet: KeyWalletMeta; initial?: TrustLineBuild; onReview: (build: OfflineBuild) => void }) {
  const [action, setAction] = useState<TrustAction>(initial?.limit === '0' ? 'close' : 'add')
  const [issuer, setIssuer] = useState(initial?.issuer ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const [limit, setLimit] = useState(initial && initial.limit !== '0' ? initial.limit : '1000000000')
  const issuerValid = isValidClassicAddress(issuer)
  const codeValid = currencyValid(currency)
  const canonical = action === 'close' ? '0' : canonicalLimit(limit)
  const limitValid = canonical !== null && (action === 'close' || canonical !== '0')
  const canReview = issuerValid && codeValid && limitValid
  const K = W.SHIPPED_KEYS
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <dl className="grid gap-0.5">
        <dt className="panel-legend">{K.trustLines}</dt>
        <dd className="text-sm">{W.FROM_TRANSMITTER}</dd>
      </dl>
      <fieldset className="grid gap-1.5">
        <legend className="panel-legend mb-1">{W.TRUST_LINE}</legend>
        <ActionRadio name="off-trust" checked={action === 'add'} onSelect={() => setAction('add')}>
          {K.addTrustLine}
        </ActionRadio>
        <ActionRadio name="off-trust" checked={action === 'edit'} onSelect={() => setAction('edit')}>
          {K.editTrustLineLimit}
        </ActionRadio>
        <ActionRadio name="off-trust" checked={action === 'close'} onSelect={() => setAction('close')}>
          {K.closeTrustLine}
        </ActionRadio>
      </fieldset>
      {action === 'add' && <p className="text-sm">{K.addLine}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="off-issuer">{K.issuerAddress}</Label>
        <Input
          id="off-issuer"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value.trim())}
          placeholder="r..."
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={issuer.length > 0 && !issuerValid}
          aria-describedby={issuer.length > 0 && !issuerValid ? 'off-issuer-error' : undefined}
        />
        {issuer.length > 0 && !issuerValid && (
          <p id="off-issuer-error" className="text-sm text-text-destructive">
            {W.SHIPPED.invalidAddress}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="off-currency">{K.currencyCode}</Label>
        <Input
          id="off-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.trim())}
          placeholder="USD"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={currency.length > 0 && !codeValid}
          aria-describedby={currency.length > 0 && !codeValid ? 'off-currency-error' : undefined}
        />
        {currency.length > 0 && !codeValid && (
          <p id="off-currency-error" className="text-sm text-text-destructive">
            {K.currencyError}
          </p>
        )}
      </div>
      {action !== 'close' && (
        <div className="grid gap-1.5">
          <Label htmlFor="off-limit">{action === 'add' ? K.trustLimit : K.newLimit}</Label>
          <Input id="off-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.trim())} aria-invalid={limit.length > 0 && !limitValid} />
        </div>
      )}
      <dl className="panel-well flex flex-wrap gap-x-8 gap-y-2 rounded-md px-3 py-2.5">
        {action === 'add' && <FromTransmitter legend={K.ownerReserve} />}
        <FromTransmitter legend={W.SHIPPED.networkFee} />
      </dl>
      <ReviewKey
        disabled={!canReview}
        onReview={() => canonical !== null && onReview({ type: 'trust-line', account: wallet.address, currency, issuer, limit: canonical })}
      />
    </div>
  )
}

/** The key state's two rows on a key-change Build: both are readings the Transmitter gives (P-1). */
function KeyReadings() {
  return (
    <dl className="grid gap-2">
      <div className="grid gap-0.5">
        <dt className="panel-legend">{W.REGULAR_KEY_TYPE}</dt>
        <dd className="text-sm">{W.FROM_TRANSMITTER}</dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="panel-legend">{W.MASTER_KEY_TYPE}</dt>
        <dd className="text-sm">{W.FROM_TRANSMITTER}</dd>
      </div>
    </dl>
  )
}

/**
 * Regular Key (story 8, P-47): set one, typed or scanned on this device (OS-FR-21: never
 * taken from the Transmitter), or remove it. The app takes any valid address; whether a
 * key is set now is the Transmitter's reading, so no W5 here (EXPERIENCE: "Never on the
 * Offline Build, which cannot know the key state"). Story 11: P-30 or W1, and W2 for a
 * black-hole address, under the address (EXPERIENCE Flow 7 step 2). Cautions, never refusals.
 */
function RegularKeyForm({ wallet, initial, onReview }: { wallet: KeyWalletMeta; initial?: RegularKeyBuild; onReview: (build: OfflineBuild) => void }) {
  const [remove, setRemove] = useState(initial ? initial.regularKey === null : false)
  const [address, setAddress] = useState(initial?.regularKey ?? '')
  const valid = isValidClassicAddress(address)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <KeyReadings />
      <fieldset className="grid gap-1.5">
        <legend className="panel-legend mb-1">{W.REGULAR_KEY_TYPE}</legend>
        <ActionRadio name="off-regular" checked={!remove} onSelect={() => setRemove(false)}>
          {W.SET_A_REGULAR_KEY}
        </ActionRadio>
        <ActionRadio name="off-regular" checked={remove} onSelect={() => setRemove(true)}>
          {W.REMOVE_THE_REGULAR_KEY}
        </ActionRadio>
      </fieldset>
      {!remove && (
        <div className="grid gap-1.5">
          <Label htmlFor="off-regular-key">{W.SHIPPED_KEYS.regularKeyAddress}</Label>
          <Input
            id="off-regular-key"
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            placeholder="r..."
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={address.length > 0 && !valid}
            aria-describedby={address.length > 0 && !valid ? 'off-regular-key-error' : undefined}
          />
          {address.length > 0 && !valid && (
            <p id="off-regular-key-error" className="text-sm text-text-destructive">
              {W.SHIPPED.invalidAddress}
            </p>
          )}
          <AddressScan onAddress={setAddress} />
        </div>
      )}
      {!remove && valid && <RegularKeyNotes address={address} />}
      <ReviewKey
        disabled={!remove && !valid}
        onReview={() => onReview({ type: 'regular-key', account: wallet.address, regularKey: remove ? null : address })}
      />
    </div>
  )
}

/**
 * Master key (story 8, P-47): turn it off or on. Before off: "Test the Regular Key",
 * which this device cannot run in place, so it says where to run it (P-50), then W4's
 * sentence (EXPERIENCE "Approved strings", W4). Offered, never required; nothing refuses.
 */
function MasterKeyForm({ wallet, initial, onReview }: { wallet: KeyWalletMeta; initial?: MasterKeyBuild; onReview: (build: OfflineBuild) => void }) {
  const [enable, setEnable] = useState(initial?.enable ?? false)
  const [testShown, setTestShown] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <KeyReadings />
      <fieldset className="grid gap-1.5">
        <legend className="panel-legend mb-1">{W.MASTER_KEY_TYPE}</legend>
        <ActionRadio name="off-master" checked={!enable} onSelect={() => setEnable(false)}>
          {W.TURN_OFF_THE_MASTER_KEY}
        </ActionRadio>
        <ActionRadio name="off-master" checked={enable} onSelect={() => setEnable(true)}>
          {W.TURN_ON_THE_MASTER_KEY}
        </ActionRadio>
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
      <ReviewKey disabled={false} onReview={() => onReview({ type: 'master-key', account: wallet.address, enable })} />
    </div>
  )
}

/** The Built transaction in the ledger's own field names (P-52). Before signing the Fee is a
 * reading (P-1); after it, the signed Fee and Sequence are shown. */
function BuiltFields({ build, signedWith }: { build: OfflineBuild; signedWith?: { fee: string; sequence: number } }) {
  const tx = builtTransaction(build)
  return (
    <dl className="grid min-w-0 gap-2">
      {Object.entries(tx).map(([name, value]) => (
        <div key={name} className="grid min-w-0 gap-0.5">
          <dt className="panel-legend [overflow-wrap:anywhere]">{name}</dt>
          <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{fieldValue(name, value, tx.TransactionType)}</dd>
        </div>
      ))}
      {signedWith ? (
        <>
          <div className="grid min-w-0 gap-0.5">
            <dt className="panel-legend">{W.FIELD.fee}</dt>
            <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight">{formatXrp(signedWith.fee)}</dd>
          </div>
          <div className="grid min-w-0 gap-0.5">
            <dt className="panel-legend">Sequence</dt>
            <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight">{signedWith.sequence}</dd>
          </div>
        </>
      ) : (
        <div className="grid min-w-0 gap-0.5">
          <dt className="panel-legend">{W.FIELD.fee}</dt>
          <dd className="text-sm">{W.FROM_TRANSMITTER}</dd>
        </div>
      )}
    </dl>
  )
}

/**
 * P-19 and the earlier-signing record, when this Wallet signed a Same Build
 * before (by content hash, so also after a lock and a Build typed again). For
 * display: the signing path reads the list fresh. A list that cannot be read
 * shows P-16 here (never silence, which would read as "no earlier signing"),
 * and the Data to Sign is then refused.
 */
function SameBuildNotice({ walletId, keyAddress, build }: { walletId: string; keyAddress: string; build: OfflineBuild }) {
  const signed = useSignedList(walletId)
  if (signed.status === 'failed') {
    return (
      <Alert variant="destructive" role="none">
        <AlertDescription>{W.NOT_SIGNED}</AlertDescription>
      </Alert>
    )
  }
  const earlier = signed.status === 'ok' ? latestSameBuild(signed.list, buildHashOf(build), { account: build.account, keyAddress }) : null
  if (!earlier) return null
  return (
    <Alert role="none">
      <AlertDescription className="flex min-w-0 flex-col gap-2">
        <p>{W.SIGNED_BEFORE}</p>
        <EarlierSigningRecord record={earlier} />
      </AlertDescription>
    </Alert>
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
        {TYPE_WORDS[round.build.type]}
      </h2>
      <SameBuildNotice walletId={wallet.id} keyAddress={wallet.keyAddress} build={round.build} />
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
  /** A refusal under P-16: its P-17 reason, or `''` for P-16 alone. */
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
    // The signed list, read now (OS-FR-16): it decides the Sequence. A failed read
    // is never "no earlier signing", so nothing is signed (P-16; no P-17 reason fits).
    let list: SignedRecord[]
    try {
      list = await signedListOf(wallet.id)
    } catch {
      setRefusal('')
      return
    }
    setRefusal(null)
    let seen: { index: number; at: number } | null = null
    try {
      seen = await ledgerSeenOf(wallet.id)
    } catch {
      // The record could not be read: the Network's floor is the reference this time. Never a refusal.
    }
    // The highest seen is saved only once this answer is signed with (story 6 review):
    // a declined answer never moves it.
    const warning = ledgerJumpWarning(judged.data.ledger_index, seen, Date.now(), wallet.network)
    // A lock while this ran erased the round: nothing to move on with.
    const now = roundOf(wallet.id)
    if (!now || now.phase.name !== 'request' || now.phase.requestId !== keptPhase?.requestId) return
    const requestId = keptPhase.requestId
    const data = judged.data
    // The retry table (route-checks "Retry without paying twice"), against the latest earlier signing.
    const earlier = latestSameBuild(list, buildHashOf(now.build), { account: now.build.account, keyAddress: wallet.keyAddress })
    const retry = earlier ? retryCaseOf(earlier, data) : null
    if (earlier && retry?.case === 'higher') {
      setRound(wallet.id, { ...now, phase: { name: 'retry-higher', requestId, data, warning, earlier } })
    } else if (retry && retry.case !== 'higher') {
      setRound(wallet.id, { ...now, phase: { name: 'signing', requestId, data, sequence: retry.sequence, warning, retry: retry.case } })
    } else {
      setRound(wallet.id, { ...now, phase: { name: 'signing', requestId, data, sequence: data.sequence, warning } })
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SameBuildNotice walletId={wallet.id} keyAddress={wallet.keyAddress} build={round.build} />
      <HandoffPlate heading={W.DATA_TO_SIGN_NEEDED} headingRef={headingRef} network={wallet.network} text={text} scan={1}>
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
        <p className="text-xs text-muted-foreground">{fill(W.SCAN_COUNT, 2)}</p>
        <QrScanner onPayload={(t) => void onPayload(t)} label="a code" />
        {/* Always mounted, so a refusal is announced; focus stays on the scanner. */}
        <div role="alert">
          {refusal !== null && (
            <div className="text-sm text-text-destructive [overflow-wrap:anywhere]">
              <p className="font-semibold">{W.NOT_SIGNED}</p>
              {refusal && <p>{refusal}</p>}
            </div>
          )}
        </div>
      </section>
      {round.kept && <KeptPlate wallet={wallet} round={round} kept={round.kept} />}
    </div>
  )
}

/**
 * Retry case (a), P-20: the received Sequence is higher than the earlier
 * signing's, so the ledger used it, most likely for that signing. Nothing is
 * signed here. "Check first" goes back to the request; "This is a new payment"
 * goes to the signing review with the received Sequence (the user decides).
 */
function RetryHigher({ wallet, round, headingRef }: { wallet: KeyWalletMeta; round: Round; headingRef: HeadingRef }) {
  const phase = round.phase as Extract<Round['phase'], { name: 'retry-higher' }>
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Alert variant="warning" role="none">
        <AlertDescription className="flex min-w-0 flex-col gap-2">
          {/* Its caution's heading takes focus (EXPERIENCE "Focus", retry case (a)). */}
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-normal">
            {W.RETRY_HIGHER}
          </h2>
          <EarlierSigningRecord record={phase.earlier} />
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setRound(wallet.id, { ...round, phase: { name: 'request', requestId: phase.requestId } })}>
          {W.CHECK_FIRST}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setRound(wallet.id, {
              ...round,
              phase: { name: 'signing', requestId: phase.requestId, data: phase.data, sequence: phase.data.sequence, warning: phase.warning },
            })
          }
        >
          {W.THIS_IS_A_NEW_PAYMENT}
        </Button>
      </div>
      {round.kept && <KeptPlate wallet={wallet} round={round} kept={round.kept} />}
    </div>
  )
}

function SigningReview({ wallet, round, headingRef }: { wallet: KeyWalletMeta; round: Round; headingRef: HeadingRef }) {
  const phase = round.phase as Extract<Round['phase'], { name: 'signing' }>
  const prompts = usePrompts()
  const openKey = useWalletOpenKey(wallet.id)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // The Sequence signed with is the phase's: the received one, or the earlier signing's (retry case c).
  const signWith = { ...phase.data, sequence: phase.sequence }
  const tx = assembleTransaction(round.build, signWith)
  const label = NETWORKS[wallet.network].label
  const build = round.build
  // Master key off is irreversible-class (SPEC Constraints): W4's sentence above the typed
  // confirm, and on Mainnet Sign is held until the phrase is typed (today's master-key
  // pattern, P-39's "same pattern as today's 'turn off'"). The Signing Check follows.
  const turningOff = build.type === 'master-key' && !build.enable
  const [phrase, setPhrase] = useState('')
  const held = turningOff && wallet.network === 'mainnet' && phrase.trim().replace(/\s+/g, ' ').toLowerCase() !== W.SHIPPED_KEYS.offPhrase
  const phraseId = `off-phrase-${wallet.id}`

  async function sign() {
    if (held) return
    setBusy(true)
    setFailure(null)
    const current = () => {
      const now = roundOf(wallet.id)
      return now && now.phase.name === 'signing' && now.phase.requestId === phase.requestId ? now : null
    }
    try {
      const signed = await signRound(wallet, round.build, signWith, { openKey, prompts })
      // A lock during the Signing Check erased the round: the signed QR is not shown.
      if (!current()) return
      // The signed list first (OS-FR-16): a signing it does not hold is never shown,
      // so a later retry always finds it. A failed write drops the blob.
      try {
        await noteSigned(wallet.id, signedRecordOf(round.build, signed, phase.data.ledger_index))
      } catch {
        setFailure(W.NOT_SIGNED)
        setBusy(false)
        return
      }
      const now = current()
      if (!now) return
      setRound(wallet.id, { ...now, kept: signed, phase: { name: 'signed' } })
      // Only an index actually signed with becomes the highest seen (P-14).
      await noteLedgerSeen(wallet.id, phase.data.ledger_index, signed.signedAt).catch(() => {})
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
      <dl className="grid min-w-0 gap-0.5">
        <dt className="panel-legend">{W.SIGNING_KEY}</dt>
        <dd className="font-data text-[0.8125rem] leading-relaxed tracking-tight [overflow-wrap:anywhere]">{wallet.keyAddress}</dd>
      </dl>
      {/* The key state the Transmitter read, for display only: it changes nothing signed. */}
      {isKeyChange(build) && phase.data.key_state !== undefined && <KeyStateRows keyState={phase.data.key_state} />}
      {build.type === 'regular-key' && build.regularKey !== null && <RegularKeyNotes address={build.regularKey} />}
      {build.type === 'regular-key' && replacesRegularKey(build.regularKey, phase.data.key_state) && <KeyWarning words={W.W5_SENTENCE} />}
      {phase.retry && (
        <Alert role="none">
          <AlertDescription>{phase.retry === 'passed' ? W.RETRY_PASSED : W.RETRY_SAME_SEQUENCE}</AlertDescription>
        </Alert>
      )}
      {phase.warning && (
        <Alert variant="warning" role="none">
          <AlertDescription className="flex flex-col gap-1">
            <span>{phase.warning === 'lower' ? W.LEDGER_LOWER : W.LEDGER_TOO_HIGH}</span>
            <span>{W.CHECK_THE_TRANSMITTER}</span>
          </AlertDescription>
        </Alert>
      )}
      {/* W2 (story 11): the key state the Transmitter read names a black-hole Regular Key. */}
      {turningOff && masterOffToBlackHole(phase.data.key_state) && <KeyWarning words={W.W2_SENTENCE} />}
      {turningOff && <KeyWarning words={W.W4_SENTENCE} />}
      {turningOff && wallet.network === 'mainnet' && (
        <div className="grid gap-1.5">
          <Label htmlFor={phraseId}>{W.SHIPPED_KEYS.offPhraseLabel}</Label>
          <Input
            id={phraseId}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      )}
      <div role="alert">{failure && <p className="text-sm text-text-destructive">{failure}</p>}</div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          aria-disabled={held ? true : undefined}
          aria-describedby={held ? phraseId : undefined}
          onClick={() => void sign()}
        >
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
  const signed = round.kept
  if (!signed) return null
  const time = new Date(signed.signedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* No Send key anywhere (OS-FR-11): the last screen is the signed QR. */}
      <HandoffPlate heading={W.SIGNED_TRANSACTION_TITLE} headingRef={headingRef} network={wallet.network} text={signed.text} scan={3}>
        <p className="text-sm">{W.SIGNED_NOT_SENT}</p>
        <p className="text-sm">{fill(W.SIGNED_VALID_UNTIL, signed.lastLedgerSequence, W.TEN_MINUTES, time)}</p>
      </HandoffPlate>
      <KeptPlate wallet={wallet} round={round} kept={signed} restart />
    </div>
  )
}

/**
 * The Kept transaction plate (P-18). It stays on New transaction until the
 * outcome is marked, the transaction is cancelled or a lock erases it: also
 * under a restarted request and retry case (a), so "I know the result" is there
 * after "Check first" (EXPERIENCE Flow 4). "Start the request again" shows a new
 * request ID for the same Build; the retry table then decides the Sequence.
 */
function KeptPlate({ wallet, round, kept, restart = false }: { wallet: KeyWalletMeta; round: Round; kept: SignedRound; restart?: boolean }) {
  const [erasing, setErasing] = useState(false)
  return (
    <>
      <section aria-labelledby="off-kept" className="panel-plate flex min-w-0 flex-col gap-3 rounded-md px-4 pb-4 pt-3">
        <h2 id="off-kept" className="text-sm font-semibold">
          {W.KEPT_TITLE}
        </h2>
        <p className="text-sm">{W.KEPT_LINE}</p>
        <BuiltFields build={round.build} signedWith={{ fee: kept.fee, sequence: kept.sequence }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setErasing(true)}>
            {W.I_KNOW_THE_RESULT}
          </Button>
          {restart && (
            <Button type="button" variant="outline" onClick={() => startRequest(wallet.id, round)}>
              {W.START_THE_REQUEST_AGAIN}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setErasing(true)}>
            {W.CANCEL_THIS_TRANSACTION}
          </Button>
        </div>
      </section>
      {erasing && (
        <Dialog open onOpenChange={(open) => !open && setErasing(false)}>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle className="text-base font-normal leading-relaxed">{fill(W.ERASE_QUESTION, kept.lastLedgerSequence)}</DialogTitle>
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
    </>
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
