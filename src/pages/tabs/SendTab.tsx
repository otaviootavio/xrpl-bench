import { useEffect, useState } from 'react'
import { isValidClassicAddress } from 'xrpl'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AmountInput, validateAmountString } from '@/components/wallet/AmountInput'
import { TxLink } from '@/components/wallet/AddressLink'
import { TxStatusBadge } from '@/components/wallet/TxStatusBadge'
import { QueryErrorState } from '@/components/wallet/QueryErrorState'
import { useAppStore, useActiveWallet } from '@/store/app-store'
import type { NetworkId } from '@/lib/xrpl/networks'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'
import { useRecommendedFee } from '@/hooks/useRecommendedFee'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useDestinationInfo } from '@/hooks/useDestinationInfo'
import { submitXrpPayment, submitIssuedPayment, type SubmitOutcome } from '@/lib/xrpl/writes'
import { unlockWalletForSigning } from '@/lib/crypto/keystore'
import {
  formatXrp,
  xrpToDropsString,
  displayCurrencyCode,
  isPositiveDecimalString,
  compareDecimalStrings,
  amountPlusFeeFits,
} from '@/lib/xrpl/money'
import { describeResultCode } from '@/lib/xrpl/result-codes'
import { invalidateAccountScoped, invalidateDestinationCheck } from '@/lib/xrpl/query-keys'
import {
  DESTINATION_CHECK_FRESHNESS_MS,
  fetchDestinationInfoOnce,
  type DestinationInfo,
} from '@/lib/xrpl/query-reads'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/notify'

const MAX_DESTINATION_TAG = 4294967295

/** Why the submit path refused. Named as a type rather than written inline
 * three times, because the retirement rule below switches on it exhaustively:
 * a new reason that forgets to say when it stops being true is a compile
 * error, not a message that outlives its cause. */
type PreflightReason = 'failed' | 'tag-required' | 'guard-closed' | 'not-activated' | 'no-trust-line'

export function SendTab() {
  const network = useAppStore((s) => s.network)
  const wallet = useActiveWallet()
  const vaultKey = useAppStore((s) => s.vaultKey)
  const addressBook = useAppStore((s) => s.addressBook)
  const addAddressBookEntry = useAppStore((s) => s.addAddressBookEntry)
  const queryClient = useQueryClient()

  const [destination, setDestination] = useState('')
  /** The asset picked, stamped with the `(network, address)` it was picked
   * for, and read back only while both still match — `'XRP'` otherwise.
   *
   * `SendTab` is not remounted by a wallet or network switch (Main keys it by
   * tab), so a bare string would carry a token picked on one account into
   * another, where nothing has said that account holds it. The stamp retires
   * the choice for every way the account can change, in the render itself,
   * on the same pattern as `preflightReport` below. A retired choice is then
   * cleared, so switching back does not quietly put the token back on the
   * form: picking it again is an act the operator takes. */
  const [assetChoice, setAssetChoice] = useState<{ network: NetworkId; address: string; asset: string } | null>(null)
  const [amount, setAmount] = useState('')
  const assetChoiceMatches = !!assetChoice && assetChoice.network === network && assetChoice.address === wallet?.address
  // A same-component state adjustment during render; it clears its own
  // condition. A retired TOKEN choice takes its amount with it: "1000" typed
  // as USD would otherwise be reread as 1000 XRP on the next account.
  if (assetChoice && !assetChoiceMatches) {
    if (assetChoice.asset !== 'XRP') setAmount('')
    setAssetChoice(null)
  }
  const asset = assetChoice && assetChoiceMatches ? assetChoice.asset : 'XRP'
  const setAsset = (next: string) => setAssetChoice({ network, address: wallet?.address ?? '', asset: next })
  const [destTag, setDestTag] = useState('')
  /** The operator's intent to confirm, pinned to the exact check that was on
   * screen when they asked for it — `destQuery.dataUpdatedAt`, or `null` for
   * no intent at all.
   *
   * The intent is withdrawn outright whenever the guard closes outside a send
   * (below, beside `confirmOpen`). The pin adds the case the guard alone does
   * not see: a destination reading replaced by a newer one without the guard
   * ever closing. `dataUpdatedAt` only increases, so an intent formed against
   * an older reading can never match again. */
  const [confirmingFor, setConfirmingFor] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)
  /** Why the submit path refused to send, and the `(network, destination,
   * asset)` it refused for. Inline on the form, never a toast: a failed *read*
   * reports where the data would have been (AD-8).
   *
   * The triple is stored with the reason, and the reason is read back only when
   * it still matches, so one comparison retires the report for every way the
   * inputs can change — including a network switch, which no field's `onChange`
   * ever sees. A report about another ledger is not a smaller version of the
   * truth; it is a false statement about this one. */
  const [preflightReport, setPreflightReport] = useState<{
    network: NetworkId
    destination: string
    asset: string
    reason: PreflightReason
  } | null>(null)
  /** The last clock reading the form has actually taken, written only by the
   * timer below. Rendering never calls `Date.now()` itself: a render that reads
   * the clock answers differently each time it runs, and a guard that cannot be
   * reasoned about or pinned by a test is not a guard. It starts at mount time
   * rather than 0, so an answer restored from the cache already older than the
   * window is refused on the FIRST render rather than on the timer's. */
  const [observedNow, setObservedNow] = useState(Date.now)

  const spendable = useSpendableBalance(network, wallet?.address ?? null)
  const spendableDrops = spendable.spendableDrops
  /**
   * Why there is no figure, in the form's own words.
   *
   * All three states stop an amount being declared affordable — absence of a
   * prohibition is not permission — but they are not the same fact, and this
   * epic exists because a screen that cannot tell them apart says the wrong
   * one. A read still in flight has not failed, and an account that does not
   * exist yet has nothing to fail about.
   */
  const spendableUnknownReason =
    spendable.status === 'loading'
      ? 'Your spendable balance is still being read, so this amount cannot be checked against it yet.'
      : spendable.status === 'not-activated'
        ? "This account isn't activated yet, so there is no spendable balance to check this against."
        : 'Your spendable balance could not be read, so this amount cannot be checked against it.'
  const fee = useRecommendedFee(network)
  /**
   * The fee, in drops, only when it was actually read for the network on
   * screen now — never a fabricated one.
   *
   * `fee.data ?? '0'` used to reach `amountPlusFeeFits`, so a read that failed
   * or had not landed yet was substituted with a fee of zero and an amount that
   * does not fit was declared affordable. A retained value is dropped while the
   * read is in error too: while a read is in error, nothing from an earlier
   * success stays on screen (docs/decisions.md §12, rule 2).
   */
  const feeDrops = !fee.isError && fee.data ? fee.data : null
  /**
   * Why there is no fee figure, in the form's own words — the same three-state
   * shape the spendable figure uses above. The hook has no `enabled`, so no
   * data and no error really does mean a read still in flight, and a read in
   * flight has not failed.
   */
  const feeUnknownReason = fee.isError
    ? 'The network fee could not be read, so this amount cannot be checked against your spendable balance.'
    : 'The network fee is still being read, so this amount cannot be checked against your spendable balance yet.'
  const trustLines = useTrustLines(network, wallet?.address ?? null)
  // Ledger reads go through a query hook, never an onBlur handler (§4).
  const destQuery = useDestinationInfo(network, destination, asset)
  const destInfo = destQuery.data
  const destinationValid = isValidClassicAddress(destination)

  const destCheckMatchesInput =
    !!destInfo && destInfo.network === network && destInfo.destination === destination && destInfo.asset === asset
  const checkedAt = destQuery.dataUpdatedAt || 0
  const checkExpiresAt = destCheckMatchesInput && checkedAt > 0 ? checkedAt + DESTINATION_CHECK_FRESHNESS_MS : null
  const destCheckFresh = checkExpiresAt !== null && observedNow < checkExpiresAt
  /**
   * The send guard, stated positively: a read SUCCEEDED for the input on screen
   * now and is still fresh.
   *
   * It used to be `!destCheckFailed`, where `destCheckFailed` was
   * `destQuery.isError && !destQuery.data` — "no failure seen" — and three
   * states passed it that are not permission: a failed refetch that
   * kept an earlier answer, an answer about a different address or asset while
   * the new read is in flight, and a successful answer older than its window.
   * Each ends the same way: `!destInfo?.requireDestTag` is satisfied, the label
   * says "(optional)", and a tagless payment goes to an address that requires a
   * tag — credited to nobody, unrecoverable from here. Absence of a prohibition
   * is not permission (docs/decisions.md §12, rule 1).
   */
  const destCheckOk = !destQuery.isError && destCheckMatchesInput && destCheckFresh

  /** A check that succeeded for this input and then aged out. It did not FAIL,
   * and must not say it did (AD-15) — it is out of date, and re-readable. */
  const destCheckStale = !destQuery.isError && destCheckMatchesInput && !destCheckFresh
  /** Nothing is known yet for what is in the field: the read is in flight, or
   * has not started, or the retained answer is about a different input. */
  const destCheckPending = destinationValid && !destQuery.isError && !destCheckMatchesInput

  // Take one clock reading when this check expires — and immediately, if it was
  // already old when it arrived from the cache. No fetch and no interval: the
  // app does not re-read on going stale and does not poll to keep the answer
  // warm; this only stops the screen claiming a permission it no longer has.
  //
  // The reading is the LATEST of the three moments known here, never just
  // `Date.now()`: a browser that fires a backgrounded timeout late gives a
  // clock later than the expiry, and a fake or coarsened clock that reports
  // the callback as early still cannot un-expire a check whose own expiry
  // moment has arrived. `setObservedNow` takes the previous reading too, so
  // this clock only ever moves forward.
  useEffect(() => {
    if (checkExpiresAt === null) return
    const timer = setTimeout(
      () => setObservedNow((prev) => Math.max(prev, checkExpiresAt, Date.now())),
      Math.max(0, checkExpiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [checkExpiresAt])

  // The other way the clock moves: the tab coming back into view.
  //
  // A `setTimeout` is not a promise that it fires. A hidden tab that the
  // browser froze, or whose timers it throttled, can outlive the freshness
  // window, and the form would then render an expired check as permission
  // until the timeout eventually ran. This catches exactly one moment — the
  // tab becoming visible again — and claims no more: a machine resuming with
  // this tab already in view fires no `visibilitychange` and is left to the
  // timeout.
  //
  // That one moment survives `useAutoLock`'s own 30 s background grace, so it
  // is not dead code behind the lock: hidden at t=25 s and visible again at
  // t=45 s is 20 s away — too short to lock the app — while the check is 45 s
  // old and its timer never fired.
  //
  // Event-driven, so there is still no interval and still no read: this only
  // takes a reading (docs/decisions.md §12).
  useEffect(() => {
    function readClockOnReturn() {
      if (document.visibilityState !== 'visible') return
      setObservedNow((prev) => Math.max(prev, Date.now()))
    }
    document.addEventListener('visibilitychange', readClockOnReturn)
    return () => document.removeEventListener('visibilitychange', readClockOnReturn)
  }, [])

  // Frozen assets can't be moved, so they're not offerable (decisions.md §2).
  // Balances are DECIMAL strings — never BigInt them. Empty while the read is
  // in error, even over a retained earlier answer: no balance from a read that
  // has stopped succeeding is offered or checked against (§12 rule 2).
  const heldTokens = trustLines.isError
    ? []
    : (trustLines.data ?? []).filter((l) => isPositiveDecimalString(l.balance) && !l.freezePeer && !l.freeze)
  const selectedLine = asset === 'XRP' ? null : heldTokens.find((l) => `${l.currency}|${l.account}` === asset)
  /** Why there is no line to check a token amount against — the same
   * three-way shape as the spendable and fee reasons above. `useTrustLines`
   * is enabled whenever there is a wallet, so no data and no error is a read
   * in flight. A read that succeeded without the line is a fact about the
   * ledger, not a failure: the balance went to zero, the line was frozen, or
   * the line is gone. */
  const tokenLineUnknown: { reason: string; pending: boolean } = trustLines.isError
    ? { reason: 'Your token balances could not be read, so this amount cannot be checked against what you hold.', pending: false }
    : !trustLines.data
      ? {
          reason: 'Your token balances are still being read, so this amount cannot be checked against what you hold yet.',
          pending: true,
        }
      : {
          reason: "You hold none of this token that can be sent: its balance is zero, it is frozen, or the trust line is gone.",
          pending: false,
        }

  const isKnownDestination = addressBook.some((e) => e.address === destination)
  const isSelfSend = !!wallet && destination === wallet.address
  const amountValidation = validateAmountString(amount || '', asset === 'XRP' ? 'xrp' : 'issued')
  const tagValue = destTag ? Number(destTag) : undefined
  const tagValid = tagValue === undefined || (Number.isInteger(tagValue) && tagValue >= 0 && tagValue <= MAX_DESTINATION_TAG)

  /** Funds check done in the form, so a too-large send fails here with a clear
   * reason instead of costing a fee and coming back as tecUNFUNDED_PAYMENT.
   *
   * `pending` marks a reason that is a read still in flight rather than a
   * fault. The send is refused either way, but a read that has not landed has
   * not failed, so the amount field must not be painted or announced as
   * invalid for it (story 5.3 AC 2; 5.2's loading case is the same).
   *
   * Every branch fails CLOSED: with no figure to check against, the amount is
   * refused, never waved through. Absence of a prohibition is not permission
   * (docs/decisions.md §12 rule 1). */
  const fundsCheck = ((): { reason: string; pending: boolean } | undefined => {
    if (!amountValidation.valid) return undefined
    if (asset === 'XRP') {
      // Both figures are needed, and there is no "safe" substitute for either:
      // a fabricated fee or balance is how an amount that does not fit gets
      // declared affordable. `useAccountState` polls every 15 seconds with
      // `retry: 1`, so a single failed poll reaches here on a form the
      // operator is already filling in.
      const missing: { reason: string; pending: boolean }[] = []
      if (!spendableDrops) missing.push({ reason: spendableUnknownReason, pending: spendable.status === 'loading' })
      if (!feeDrops) missing.push({ reason: feeUnknownReason, pending: !fee.isError })
      // A fault outranks a read in flight. Reporting "still being read" while
      // the other figure has already failed tells the operator to wait for
      // something that will not arrive on its own. Between two of the same
      // kind, the spendable figure is named first.
      const reported = missing.find((m) => !m.pending) ?? missing[0]
      if (reported) return reported
      // Both present (the checks above guarantee it; the guard restates it for
      // the type). The fee comes out on top of the amount, so both must fit.
      if (spendableDrops && feeDrops && !amountPlusFeeFits(xrpToDropsString(amount), feeDrops, spendableDrops)) {
        return {
          reason: `That's more than your spendable balance (${formatXrp(spendableDrops)}) once the network fee is included.`,
          pending: false,
        }
      }
      return undefined
    }
    // A token amount is checked only against a line a successful trust-line
    // read for this account and network holds now. An errored read (even over
    // a retained answer), a read in flight, and a read that no longer holds
    // the line all refuse — each one otherwise ends in a submitted payment
    // that fails `tec*` on the ledger and still costs the fee.
    if (!selectedLine) return tokenLineUnknown
    if (compareDecimalStrings(amount, selectedLine.balance) > 0) {
      return { reason: `You only hold ${selectedLine.balance} ${displayCurrencyCode(selectedLine.currency)}.`, pending: false }
    }
    return undefined
  })()
  const fundsError = fundsCheck?.reason

  const canSend =
    destinationValid &&
    !isSelfSend &&
    amountValidation.valid &&
    !fundsError &&
    tagValid &&
    destCheckOk &&
    (!destInfo?.requireDestTag || destTag.length > 0) &&
    !busy

  /**
   * Whether a refusal is still true of the form in front of the operator.
   *
   * The `(network, destination, asset)` stamp is the outer bound and stays
   * where it was; this is the inner one. A refusal that outlives its cause is
   * a false statement about the form: "enter the tag the recipient gave you"
   * with the tag entered, or "the form was no longer ready" on a form that is.
   *
   * The three reasons that answer `true` unconditionally retire on the stamp
   * alone, deliberately:
   * - `failed` — its cause is a read that did not succeed, and the form's own
   *   observer may still be showing a perfectly good earlier answer for this
   *   same triple. Retiring it on `destCheckOk` would take the report off the
   *   screen in exactly the case it was written for.
   * - `not-activated` / `no-trust-line` — the probe writes into the same cache
   *   entry the form observes, so the contradicted fact *becomes* the displayed
   *   one within the same tick. Retiring on the fact would erase the refusal
   *   before it was read, leaving a payment that did not happen unexplained.
   *   Their cause is the disagreement at that attempt, not the current value;
   *   the next confirm clears the report on its own.
   */
  const preflightReasonStillHolds = (reason: PreflightReason): boolean => {
    switch (reason) {
      // Retires on the very predicate that wrote it — `tagValue !== undefined`
      // is what the submit path tests, so anything it would not accept as a
      // tag must not retire a refusal that asked for one.
      case 'tag-required':
        return tagValue === undefined
      // Retires when the form is ready again, which is what it said it was not.
      case 'guard-closed':
        return !canSend
      case 'failed':
      case 'not-activated':
      case 'no-trust-line':
        return true
    }
  }

  /** The report, read back only while it is still about what is on screen —
   * and still true of it. */
  const preflight =
    preflightReport &&
    preflightReport.network === network &&
    preflightReport.destination === destination &&
    preflightReport.asset === asset &&
    preflightReasonStillHolds(preflightReport.reason)
      ? preflightReport.reason
      : null

  /**
   * An intent the guard has withdrawn is gone, not suspended.
   *
   * Whenever the guard closes outside a send — the amount stops fitting, the
   * fee, spendable or trust-line read fails, the destination check ages out —
   * the intent is cleared during this render (a same-component state
   * adjustment, no effect and no read). Without it, the guard reopening on
   * its own — a read recovering on its next poll, the amount typed back —
   * would put "Confirm and send" back on screen with nobody having asked.
   * It terminates because it clears its own condition.
   */
  if (confirmingFor !== null && !busy && !canSend) setConfirmingFor(null)

  /**
   * The confirm step's open state, derived — intent and the whole send guard
   * together, so the last thing on screen before "Confirm and send" can never
   * be a permission the form has already withdrawn.
   *
   * `canSend` itself goes false on `busy` the moment the send starts, so
   * `busy ||` holds the dialog open once a send is under way: a read failing
   * or a check aging out during the unlock must not pull "Sending…" off the
   * screen mid-submission and leave the operator with no sign that a payment
   * is in flight. Outside `busy` the intent must also still be about the
   * destination reading it was formed against.
   */
  const confirmOpen = confirmingFor !== null && (busy || (canSend && confirmingFor === checkedAt))

  async function doSend() {
    if (!wallet || !vaultKey) return
    /**
     * The guard lives here, not on the button. `disabled` dims a control; it
     * does not prevent activation, and this handler is what actually spends
     * money — so the same conditions are re-asserted inside the submit path.
     */
    // A report, not a silent no-op: a dialog that vanishes on a press says
    // nothing about why nothing happened.
    const report = (reason: PreflightReason) => setPreflightReport({ network, destination, asset, reason })

    // Re-entry returns silently rather than reporting. `canSend` contains
    // `!busy`, so without this a second entry would fall into the branch below
    // and claim "nothing was submitted" about a payment that was — the one
    // statement this screen must never make.
    //
    // What it does NOT catch is two presses inside one React flush: `busy` here
    // is the render closure's value, so both reads see `false`. That race is
    // closed by `disabled={busy}` on Confirm (pinned below), which is also why
    // this branch is unreachable today and has no test of its own. It stands as
    // defence-in-depth against that attribute being dropped, on the same
    // reasoning that kept `!destCheckOk`.
    if (busy) return
    // Unreachable from the dialog as well: it is open only while `canSend`
    // holds, and a closed guard withdraws the intent in the same render. Kept,
    // and kept reporting, as defence-in-depth against the dialog's condition
    // drifting from this one — this handler is what actually spends money.
    if (!canSend || !destCheckOk) {
      report('guard-closed')
      setConfirmingFor(null)
      return
    }
    setBusy(true)
    setOutcome(null)
    setPreflightReport(null)
    try {
      const signingWallet = await unlockWalletForSigning(wallet.id, vaultKey)

      /**
       * Re-check the destination AFTER the unlock and immediately before
       * submitting. The unlock can take seconds (passphrase typing, passkey
       * prompt, key derivation), and the answer the operator was shown can age
       * out inside that gap.
       *
       * This is a re-CHECK, not always a re-READ. `staleTime` on the shared
       * options is the freshness window itself, so an answer still inside the
       * window satisfies `fetchQuery` from the cache and no request is made;
       * only an answer that aged out during the unlock forces a real read.
       * What this guarantees is therefore the window, not a round trip: the
       * permission that authorises this payment is at most
       * `DESTINATION_CHECK_FRESHNESS_MS` old at the moment of submission.
       */
      let latest: DestinationInfo
      try {
        latest = await fetchDestinationInfoOnce(queryClient, network, destination, asset)
      } catch {
        // Inline, not the Annunciator: this is a failed READ of data with a
        // place on screen (AD-8). Nothing was signed and no fee was spent.
        report('failed')
        setConfirmingFor(null)
        return
      }
      if (latest.requireDestTag && tagValue === undefined) {
        report('tag-required')
        setConfirmingFor(null)
        return
      }
      /**
       * A destination fact the operator was SHOWN may not change under them
       * between the displayed check and the submission.
       *
       * Compared against the displayed answer, never against a constant. Both
       * facts are legitimately false on a form that sends: an unactivated
       * address is activated BY a payment, and neither fact joins `canSend` —
       * they warn without blocking, and that stays true. What is refused is
       * only the contradiction: shown activated and now not, shown a trust
       * line and now none. `=== true` states the "was it shown?" half
       * explicitly, so a token send (where `hasTrustLine` is undefined for XRP)
       * and an address that was already unactivated on screen both pass.
       *
       * Both sides test `=== false` rather than falsiness, so neither depends
       * on the other running first. `latest.hasTrustLine` is legitimately
       * `undefined` — for XRP, and for an account that does not exist
       * (query-reads.ts skips the trust-line read then) — and undefined is not
       * a contradiction of anything.
       *
       * `destInfo` here is the render closure's — the answer that was on
       * screen when this handler was entered — which is the whole point.
       */
      if (destInfo?.exists === true && latest.exists === false) {
        report('not-activated')
        setConfirmingFor(null)
        return
      }
      if (destInfo?.hasTrustLine === true && latest.hasTrustLine === false) {
        report('no-trust-line')
        setConfirmingFor(null)
        return
      }

      let result: SubmitOutcome
      if (asset === 'XRP') {
        result = await submitXrpPayment(network, signingWallet, {
          destination,
          amountDrops: xrpToDropsString(amount),
          destinationTag: tagValue,
        })
      } else {
        const [currency, issuer] = asset.split('|')
        result = await submitIssuedPayment(network, signingWallet, {
          destination,
          currency,
          issuer,
          value: amount,
          destinationTag: tagValue,
        })
      }
      setOutcome(result)
      setConfirmingFor(null)
      if (result.status === 'validated') {
        toast.success('Payment sent.')
        if (!isKnownDestination) addAddressBookEntry(destination, destination.slice(0, 8))
      } else if (result.status === 'expired') {
        toast.warning('This transaction expired before validating. It was not applied — you can retry.')
      } else if (result.status === 'claimed') {
        // tec*: in a validated ledger, did not go through, fee WAS taken.
        toast.error(`${describeResultCode(result.resultCode)} The network fee was still charged.`)
      } else {
        toast.error(describeResultCode(result.resultCode))
      }
      await Promise.all([
        invalidateAccountScoped(queryClient, network, wallet.address),
        // Only a validated payment can change what the destination check says
        // (it may just have activated the address); a `tec` claim, an expiry
        // or a rejection changed nothing on the destination's side. Without
        // this the form kept saying "not activated" for up to the freshness
        // window, and the next send's post-unlock probe was served from it.
        result.status === 'validated' ? invalidateDestinationCheck(queryClient, network, destination) : null,
      ])
    } catch (err: any) {
      toast.error(err?.message ?? 'Send failed.')
      // The intent to confirm goes too, deliberately rather than as a side
      // effect of whether the probe happened to bump `dataUpdatedAt`. A throw
      // here means the unlock or the submit call itself failed; the toast says
      // so, and re-confirming a payment after that should be an act the
      // operator takes again, not a dialog left standing over a failure.
      setConfirmingFor(null)
    } finally {
      setBusy(false)
    }
  }

  if (!wallet) return <p className="text-muted-foreground">No active wallet.</p>

  const amountLabel = asset === 'XRP' ? `${amount} XRP` : `${amount} ${displayCurrencyCode(asset.split('|')[0])}`

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Send</CardTitle>
          <CardDescription>Send XRP or a token you hold.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="dest">Destination address</Label>
            <Input
              id="dest"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="r..."
              aria-invalid={destination.length > 0 && !destinationValid}
              aria-describedby={destination.length > 0 && !destinationValid ? 'dest-error' : undefined}
            />
            {destination.length > 0 && !destinationValid && (
              <p id="dest-error" className="text-sm text-text-destructive">
                That doesn't look like a valid XRPL address.
              </p>
            )}
            {isSelfSend && <p className="text-sm text-text-destructive">You can't send a payment to your own address.</p>}
            {/* A read not yet completed FOR WHAT IS IN THE FIELD NOW — in flight,
                not started, or still holding an answer about a previous input.
                Unknown is not an error, and it is not permission either. */}
            {(destCheckPending || destQuery.isFetching) && (
              <p className="text-xs text-muted-foreground">Checking destination…</p>
            )}
          </div>

          {/* Any errored check, including one that kept an earlier answer. That
              retained answer is not shown and does not count: while a read is in
              error, nothing from an earlier success stays on screen (§12). */}
          {destQuery.isError && preflight !== 'failed' && (
            <QueryErrorState
              title="Destination check failed"
              description="This address could not be checked against the ledger, so the app cannot tell whether it exists or whether the recipient requires a destination tag. Sending is held until the check succeeds — an untagged payment to an address that requires one cannot be recovered from here."
              onRetry={() => destQuery.refetch()}
            />
          )}

          {/* Aged out, which is not the same fact as failed and must not borrow
              its words. The app does not re-read on its own here: a silent
              refetch would put the operator back in front of an answer they
              never asked for and did not watch arrive. */}
          {destCheckStale && (
            <Alert variant="warning">
              <AlertTitle>Destination check is out of date</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>
                  This address was checked more than {Math.round(DESTINATION_CHECK_FRESHNESS_MS / 1000)} seconds ago. The
                  answer may no longer hold — an account can start requiring a destination tag at any time — so sending is
                  held until the check is run again.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPreflightReport(null)
                    void destQuery.refetch()
                  }}
                >
                  Check again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* The submit-path re-check refused. Reported where the check lives,
              not in the notice band, and never as a completed payment. */}
          {preflight === 'failed' && (
            <QueryErrorState
              title="Payment not sent — destination check failed"
              description="The destination was re-checked immediately before sending, as it always is, and that read did not succeed. Nothing was submitted to the ledger and no network fee was spent. Run the check again, then send."
              onRetry={() => {
                setPreflightReport(null)
                return destQuery.refetch()
              }}
            />
          )}

          {preflight === 'guard-closed' && (
            <Alert variant="warning">
              <AlertTitle>Payment not sent — the form was no longer ready</AlertTitle>
              <AlertDescription>
                Something this form checks changed between opening the confirmation and confirming it, so nothing was
                submitted and no network fee was spent. What is outstanding is shown on the form.
              </AlertDescription>
            </Alert>
          )}

          {preflight === 'tag-required' && (
            <Alert variant="warning">
              <AlertTitle>Payment not sent — this address now requires a destination tag</AlertTitle>
              <AlertDescription>
                The re-check made immediately before sending came back saying this recipient requires a destination tag,
                which it did not when you filled the form in. Nothing was submitted and no network fee was spent. Enter the
                tag the recipient gave you, then send again.
              </AlertDescription>
            </Alert>
          )}

          {preflight === 'not-activated' && (
            <Alert variant="warning">
              <AlertTitle>Payment not sent — this address stopped being activated</AlertTitle>
              <AlertDescription>
                This address existed on the ledger when the form was filled in, and the re-check made immediately before
                sending came back saying it no longer does. Nothing was submitted and no network fee was spent. The form now
                shows the address as it currently stands, so sending again will go through — check the address with the
                recipient first if you did not expect this.
              </AlertDescription>
            </Alert>
          )}

          {preflight === 'no-trust-line' && (
            <Alert variant="warning">
              <AlertTitle>Payment not sent — the recipient stopped accepting this token</AlertTitle>
              <AlertDescription>
                This recipient had a trust line to this issuer when the form was filled in, and the re-check made
                immediately before sending came back saying they no longer do. Nothing was submitted and no network fee was
                spent. The form now shows the trust line as it currently stands, so sending again will go through — and
                will most likely fail on the ledger, at the cost of the fee.
              </AlertDescription>
            </Alert>
          )}

          {/* Suppressed while the refusal above is on screen: the refusal
              already states this fact, and in the stronger form of what
              changed. Two `role="alert"` panels making overlapping claims
              about one fact is one fact told twice. */}
          {destCheckOk && destInfo && !destInfo.exists && preflight !== 'not-activated' && (
            <Alert variant="warning">
              <AlertTitle>Destination not activated</AlertTitle>
              <AlertDescription>
                This address doesn't exist on-ledger yet. If you send less than the base reserve in XRP, this payment will fail
                to activate it.
              </AlertDescription>
            </Alert>
          )}

          {destCheckOk && destInfo?.hasTrustLine === false && preflight !== 'no-trust-line' && (
            <Alert variant="warning">
              <AlertTitle>Recipient can't hold this token</AlertTitle>
              <AlertDescription>
                They don't have a trust line to this issuer yet, so this payment will most likely fail.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="dtag">
              {/* Driven by the guard, not by the error flag: a stale answer and
                  an answer about a different address are as unknown as a failed
                  read, and "(optional)" is the sentence that loses the money. */}
              {destCheckOk
                ? destInfo?.requireDestTag
                  ? 'Destination tag (required by recipient)'
                  : 'Destination tag (optional)'
                : destinationValid
                  ? 'Destination tag (requirement unknown)'
                  : 'Destination tag (optional)'}
            </Label>
            <Input
              id="dtag"
              inputMode="numeric"
              value={destTag}
              onChange={(e) => setDestTag(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!tagValid}
              aria-describedby={!tagValid ? 'dtag-error' : undefined}
            />
            {!tagValid && (
              <p id="dtag-error" className="text-sm text-text-destructive">
                A destination tag must be between 0 and {MAX_DESTINATION_TAG}.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Asset</Label>
            <Select value={asset} onValueChange={setAsset}>
              <SelectTrigger>
                {/* A token no longer offered — the read failed, or no longer
                    holds the line — has no item to name it, and the trigger
                    would go blank while the amount suffix still says the
                    token. Named from the operator's own choice, never from
                    the read: no balance is shown for it. */}
                <SelectValue>
                  {asset !== 'XRP' && !selectedLine ? displayCurrencyCode(asset.split('|')[0]) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="XRP">XRP</SelectItem>
                {heldTokens.map((l) => (
                  <SelectItem key={`${l.account}-${l.currency}`} value={`${l.currency}|${l.account}`}>
                    {displayCurrencyCode(l.currency)} (balance {l.balance})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reported where the token list would have been. Not gated on the
              asset, like the fee panel below: one read, one statement, which
              does not come and go with the picker. Worded so it does not
              assert a hold on XRP, which never uses this read. */}
          {trustLines.isError && (
            <QueryErrorState
              title="Token balances could not be read"
              description="Your trust lines could not be read from the ledger, so the tokens you hold cannot be listed and a token amount cannot be checked against your balance. Sending a token is held until this read succeeds; sending XRP does not depend on it and is not held."
              onRetry={() => trustLines.refetch()}
            />
          )}

          <AmountInput
            id="amount"
            label="Amount"
            value={amount}
            onChange={setAmount}
            kind={asset === 'XRP' ? 'xrp' : 'issued'}
            suffix={asset === 'XRP' ? 'XRP' : displayCurrencyCode(asset.split('|')[0])}
            error={amount.length > 0 ? (amountValidation.error ?? (fundsCheck?.pending ? undefined : fundsError)) : undefined}
            pending={amount.length > 0 && !amountValidation.error && fundsCheck?.pending ? fundsCheck.reason : undefined}
          />

          {/* A reading, so it is shown in the panel's well rather than a grey
              box: these two numbers are what decide whether the send fits. */}
          <dl className="panel-well flex flex-wrap gap-x-8 gap-y-2 rounded-md px-3 py-2.5">
            {/* Three outcomes, three renderings. The ellipsis is the PENDING
                treatment and may not stand in for a failure — that is exactly
                how this read used to hide. */}
            <div>
              <dt className="panel-legend text-readout-muted">Network fee</dt>
              {feeDrops ? (
                <dd className="font-data text-base tracking-tight">{formatXrp(feeDrops)}</dd>
              ) : fee.isError ? (
                <dd className="font-legend text-sm text-readout-muted">Unavailable</dd>
              ) : (
                <dd className="font-data text-base tracking-tight">…</dd>
              )}
            </div>
            {/* The row stays when there is no figure and says so. Removing it
                left the operator with a fee and nothing to weigh it against,
                and no hint that anything was missing. Words, not a numeral, so
                the data face and tabular numerals step aside. */}
            {asset === 'XRP' && (
              <div>
                <dt className="panel-legend text-readout-muted">Spendable</dt>
                {spendableDrops ? (
                  <dd className="font-data text-base tracking-tight">{formatXrp(spendableDrops)}</dd>
                ) : (
                  <dd className="font-legend text-sm text-readout-muted">Unavailable</dd>
                )}
              </div>
            )}
          </dl>

          {/* Reported where the figure belongs, immediately under the row that
              now says "Unavailable". The hook has no `refetchInterval`, so this
              retry is the only way back — without it a failed read stays failed
              for as long as the screen is open. Worded so it does not assert a
              hold that is not in force: a token send never uses this figure and
              is deliberately NOT blocked by its absence. */}
          {fee.isError && (
            <QueryErrorState
              title="Network fee could not be read"
              description="The current network fee could not be read from the ledger, so it cannot be shown and an XRP amount cannot be checked against your spendable balance with the fee added. Sending XRP is held until this read succeeds; a token send does not depend on this figure and is not held."
              onRetry={() => fee.refetch()}
            />
          )}

          <Button onClick={() => setConfirmingFor(checkedAt)} disabled={!canSend}>
            Review payment
          </Button>

          {outcome && (
            <div className="panel-plate flex flex-col gap-2 rounded-md p-3">
              <div className="flex items-center gap-2">
                <TxStatusBadge
                  resultCode={outcome.status === 'expired' ? 'expired' : outcome.resultCode}
                  validated={outcome.status !== 'expired'}
                />
                <TxLink hash={outcome.hash} />
              </div>
              {(outcome.status === 'failed' || outcome.status === 'claimed') && (
                <p className="text-sm text-text-destructive">
                  {describeResultCode(outcome.resultCode)}
                  {outcome.status === 'claimed' && ' The network fee was still charged for this attempt.'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sending is irreversible, so it ALWAYS gets an explicit confirm step
          stating the exact consequence (§4) — not only for unknown addresses.
          A first-send additionally escalates the warning, since the address
          book auto-records every successful destination. */}
      {/* The confirm step is gated on the whole send guard (`canSend`), not
          merely on the control that opened it, so the last thing on screen
          before "Confirm and send" can never be a permission the submit path
          is already going to refuse. Anything that closes the guard while the
          dialog is up — a failed fee, spendable or trust-line read, an amount
          that stops fitting, a check that ages out — takes the dialog down and
          withdraws the intent in the same render, so the guard reopening does
          not bring it back. Only an explicit "Review payment" does. */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmingFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {amountLabel}?</DialogTitle>
            <DialogDescription>
              This sends {amountLabel} to {destination}
              {tagValue !== undefined ? ` (destination tag ${tagValue})` : ''} on {network},{' '}
              {/* "the current rate" named a figure that was never read. An XRP
                  send cannot reach this dialog without one; a token send can,
                  and is told the plain fact instead. */}
              {feeDrops
                ? `plus a network fee of ${formatXrp(feeDrops)}`
                : fee.isError
                  ? 'plus a network fee that could not be read'
                  : 'plus a network fee that is still being read'}
              . Payments on the XRP Ledger are irreversible and cannot be cancelled or refunded once sent.
            </DialogDescription>
          </DialogHeader>
          {!isKnownDestination && (
            <Alert variant="warning">
              <AlertTitle>You haven't sent here before</AlertTitle>
              <AlertDescription>Double-check the address character by character before continuing.</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingFor(null)} disabled={busy}>
              Cancel
            </Button>
            {/* The one control in this app that moves funds, and therefore the
                only one that may wear --commit. See button.tsx. */}
            <Button variant="commit" onClick={doSend} disabled={busy}>
              {busy ? 'Sending…' : 'Confirm and send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
