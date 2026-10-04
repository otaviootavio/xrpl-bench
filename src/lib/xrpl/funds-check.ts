import type { ReadState } from '@/lib/read-state'
import type { TrustLine } from './reads'
import {
  amountPlusFeeFits,
  compareDecimalStrings,
  displayCurrencyCode,
  formatXrp,
  isPositiveDecimalString,
  xrpToDropsString,
} from './money'

/**
 * Why the amount on the Send form cannot be sent, in the form's own words.
 *
 * `pending` marks a reason that is a read still in flight rather than a fault.
 * The send is refused either way, but a read that has not landed has not
 * failed, so the amount field must not be painted or announced as invalid for
 * it (story 5.3 AC 2; 5.2's loading case is the same).
 */
export interface FundsRefusal {
  reason: string
  pending: boolean
}

/**
 * The spendable figure as the shared read state.
 *
 * Takes the shape `useSpendableBalance` returns, stated structurally because
 * `lib` does not import from a hook (AD-1). A figure is `ok` only when one is
 * present. Without one, the hook's own status says which fact it is; a status
 * that claims `ok` with no figure is reported as `failed`, never as a figure,
 * so this mapping cannot turn a missing number into permission.
 */
export function spendableReadState(spendable: {
  status: 'loading' | 'unavailable' | 'not-activated' | 'ok'
  spendableDrops: string | null
}): ReadState<string> {
  if (spendable.spendableDrops) return { status: 'ok', value: spendable.spendableDrops }
  if (spendable.status === 'loading') return { status: 'pending' }
  if (spendable.status === 'not-activated') return { status: 'not-activated' }
  return { status: 'failed' }
}

/** The fields of a trust line the Send form offers and checks against. */
export type HeldTokenLine = Pick<TrustLine, 'account' | 'currency' | 'balance' | 'freeze' | 'freezePeer'>

/**
 * The lines a token can be sent from: a positive balance, frozen by neither
 * side. Frozen assets can't be moved, so they're not offerable
 * (docs/decisions.md §2). Balances are DECIMAL strings — never BigInt them.
 *
 * Empty unless the read succeeded — including while it is in error over a
 * retained earlier answer: no balance from a read that has stopped succeeding
 * is offered or checked against (§12 rule 2).
 */
export function heldTokenLines<L extends HeldTokenLine>(trustLines: ReadState<L[]>): L[] {
  if (trustLines.status !== 'ok') return []
  return trustLines.value.filter((l) => isPositiveDecimalString(l.balance) && !l.freezePeer && !l.freeze)
}

/** The asset key a picked line is offered under: `${currency}|${issuer}`. */
export function tokenAssetKey(line: Pick<HeldTokenLine, 'currency' | 'account'>): string {
  return `${line.currency}|${line.account}`
}

/** The held line the asset on screen names, or `undefined`: XRP, a read that
 * has not succeeded, or a line no longer offerable. One definition, so the
 * picker's label and the funds check cannot disagree about which line it is. */
export function selectedTokenLine<L extends HeldTokenLine>(trustLines: ReadState<L[]>, asset: string): L | undefined {
  if (asset === 'XRP') return undefined
  return heldTokenLines(trustLines).find((l) => tokenAssetKey(l) === asset)
}

/** Why there is no spendable figure: the read is in flight, the account does
 * not exist yet, or the read failed. Three facts, three sentences. */
function spendableReason(state: ReadState<string>): FundsRefusal {
  switch (state.status) {
    case 'pending':
      return {
        reason: 'Your spendable balance is still being read, so this amount cannot be checked against it yet.',
        pending: true,
      }
    case 'not-activated':
      return {
        reason: "This account isn't activated yet, so there is no spendable balance to check this against.",
        pending: false,
      }
    default:
      return {
        reason: 'Your spendable balance could not be read, so this amount cannot be checked against it.',
        pending: false,
      }
  }
}

/** Why there is no fee figure. A fee read has no `not-activated`: anything but
 * a read in flight is the read not succeeding. */
function feeReason(state: ReadState<string>): FundsRefusal {
  return state.status === 'pending'
    ? {
        reason:
          'The network fee is still being read, so this amount cannot be checked against your spendable balance yet.',
        pending: true,
      }
    : {
        reason: 'The network fee could not be read, so this amount cannot be checked against your spendable balance.',
        pending: false,
      }
}

/** Why there is no line to check a token amount against. A read that
 * succeeded without the line is a fact about the ledger, not a failure: the
 * balance went to zero, the line was frozen, or the line is gone. */
function tokenLineReason(trustLines: ReadState<unknown>): FundsRefusal {
  switch (trustLines.status) {
    case 'pending':
      return {
        reason: 'Your token balances are still being read, so this amount cannot be checked against what you hold yet.',
        pending: true,
      }
    case 'ok':
    case 'not-activated':
      return {
        reason: 'You hold none of this token that can be sent: its balance is zero, it is frozen, or the trust line is gone.',
        pending: false,
      }
    default:
      return {
        reason: 'Your token balances could not be read, so this amount cannot be checked against what you hold.',
        pending: false,
      }
  }
}

/**
 * The Send form's funds check: whether the amount on screen fits what the
 * account can send, so a too-large send fails here with a clear reason instead
 * of costing a fee and coming back as tecUNFUNDED_PAYMENT.
 *
 * `undefined` means no refusal. It is returned for an amount that is not valid
 * yet (the field's own validation speaks for that) and for an amount that
 * fits, and for nothing else.
 *
 * Every branch fails CLOSED: with no figure to check against, the amount is
 * refused, never waved through. Absence of a prohibition is not permission
 * (docs/decisions.md §12 rule 1).
 */
export function checkFunds(input: {
  amount: string
  amountValid: boolean
  /** `'XRP'` or `${currency}|${issuer}`. */
  asset: string
  spendable: ReadState<string>
  fee: ReadState<string>
  trustLines: ReadState<HeldTokenLine[]>
}): FundsRefusal | undefined {
  const { amount, asset } = input
  if (!input.amountValid) return undefined
  if (asset === 'XRP') {
    // Both figures are needed, and there is no "safe" substitute for either:
    // a fabricated fee or balance is how an amount that does not fit gets
    // declared affordable.
    const missing: FundsRefusal[] = []
    if (input.spendable.status !== 'ok') missing.push(spendableReason(input.spendable))
    if (input.fee.status !== 'ok') missing.push(feeReason(input.fee))
    // A fault outranks a read in flight. Reporting "still being read" while
    // the other figure has already failed tells the operator to wait for
    // something that will not arrive on its own. Between two of the same
    // kind, the spendable figure is named first.
    const reported = missing.find((m) => !m.pending) ?? missing[0]
    if (reported) return reported
    // Both present (the checks above guarantee it; the guard restates it for
    // the type). The fee comes out on top of the amount, so both must fit.
    if (input.spendable.status === 'ok' && input.fee.status === 'ok') {
      const spendableDrops = input.spendable.value
      if (!amountPlusFeeFits(xrpToDropsString(amount), input.fee.value, spendableDrops)) {
        return {
          reason: `That's more than your spendable balance (${formatXrp(spendableDrops)}) once the network fee is included.`,
          pending: false,
        }
      }
    }
    return undefined
  }
  // A token amount is checked only against a line a successful trust-line
  // read for this account and network holds now. An errored read (even over a
  // retained answer), a read in flight, and a read that no longer holds the
  // line all refuse — each one otherwise ends in a submitted payment that
  // fails `tec*` on the ledger and still costs the fee.
  const selectedLine = selectedTokenLine(input.trustLines, asset)
  if (!selectedLine) return tokenLineReason(input.trustLines)
  if (compareDecimalStrings(amount, selectedLine.balance) > 0) {
    return { reason: `You only hold ${selectedLine.balance} ${displayCurrencyCode(selectedLine.currency)}.`, pending: false }
  }
  return undefined
}
