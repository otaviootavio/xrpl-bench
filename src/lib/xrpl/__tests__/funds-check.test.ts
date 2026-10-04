import { describe, expect, it } from 'vitest'
import type { ReadState } from '@/lib/read-state'
import {
  checkFunds,
  heldTokenLines,
  selectedTokenLine,
  spendableReadState,
  tokenAssetKey,
  type HeldTokenLine,
} from '../funds-check'
import { formatXrp } from '../money'

const ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const USD = `USD|${ISSUER}`

function line(overrides: Partial<HeldTokenLine> = {}): HeldTokenLine {
  return { currency: 'USD', account: ISSUER, balance: '50', freeze: false, freezePeer: false, ...overrides }
}

const ok = <T,>(value: T): ReadState<T> => ({ status: 'ok', value })
const pending = { status: 'pending' } as const
const failed = { status: 'failed' } as const
const notActivated = { status: 'not-activated' } as const

/** A form that sends 1 XRP against 100 XRP spendable and a 12-drop fee, with
 * one held USD line. Every test changes one thing from here. */
function input(overrides: Partial<Parameters<typeof checkFunds>[0]> = {}): Parameters<typeof checkFunds>[0] {
  return {
    amount: '1',
    amountValid: true,
    asset: 'XRP',
    spendable: ok('100000000'),
    fee: ok('12'),
    trustLines: ok([line()]),
    ...overrides,
  }
}

const SPENDABLE_PENDING = 'Your spendable balance is still being read, so this amount cannot be checked against it yet.'
const SPENDABLE_FAILED = 'Your spendable balance could not be read, so this amount cannot be checked against it.'
const SPENDABLE_NOT_ACTIVATED =
  "This account isn't activated yet, so there is no spendable balance to check this against."
const FEE_PENDING =
  'The network fee is still being read, so this amount cannot be checked against your spendable balance yet.'
const FEE_FAILED = 'The network fee could not be read, so this amount cannot be checked against your spendable balance.'
const LINES_PENDING =
  'Your token balances are still being read, so this amount cannot be checked against what you hold yet.'
const LINES_FAILED = 'Your token balances could not be read, so this amount cannot be checked against what you hold.'
const LINE_NOT_HELD =
  'You hold none of this token that can be sent: its balance is zero, it is frozen, or the trust line is gone.'

describe('spendableReadState', () => {
  it('maps each hook status to its own read state', () => {
    expect(spendableReadState({ status: 'ok', spendableDrops: '5' })).toEqual({ status: 'ok', value: '5' })
    expect(spendableReadState({ status: 'loading', spendableDrops: null })).toEqual(pending)
    expect(spendableReadState({ status: 'unavailable', spendableDrops: null })).toEqual(failed)
    expect(spendableReadState({ status: 'not-activated', spendableDrops: null })).toEqual(notActivated)
  })

  it('never reports a figure it does not have, whatever the status claims', () => {
    expect(spendableReadState({ status: 'ok', spendableDrops: null })).toEqual(failed)
  })

  it('never reports a figure as current when the status says the read is not ok', () => {
    expect(spendableReadState({ status: 'unavailable', spendableDrops: '5' })).toEqual(failed)
    expect(spendableReadState({ status: 'loading', spendableDrops: '5' })).toEqual(pending)
    expect(spendableReadState({ status: 'not-activated', spendableDrops: '5' })).toEqual(notActivated)
  })
})

describe('heldTokenLines / selectedTokenLine', () => {
  it('offers only positive, unfrozen lines from a read that succeeded', () => {
    const lines = [line(), line({ balance: '0' }), line({ currency: 'EUR', freeze: true }), line({ currency: 'JPY', freezePeer: true })]
    expect(heldTokenLines(ok(lines)).map(tokenAssetKey)).toEqual([USD])
  })

  it('offers nothing while the read is pending, failed, or for an unactivated account', () => {
    expect(heldTokenLines(pending)).toEqual([])
    expect(heldTokenLines(failed)).toEqual([])
    expect(heldTokenLines(notActivated)).toEqual([])
  })

  it('finds the line the asset names, and none for XRP', () => {
    expect(selectedTokenLine(ok([line()]), USD)).toEqual(line())
    expect(selectedTokenLine(ok([line()]), 'XRP')).toBeUndefined()
    expect(selectedTokenLine(failed, USD)).toBeUndefined()
  })
})

describe('checkFunds — XRP', () => {
  it('says nothing about an amount that is not valid yet', () => {
    expect(checkFunds(input({ amountValid: false, spendable: failed }))).toBeUndefined()
  })

  it('permits an amount that fits with the fee on top', () => {
    expect(checkFunds(input())).toBeUndefined()
  })

  it('refuses an amount that does not fit once the fee is added', () => {
    // 100 XRP exactly leaves nothing for the 12-drop fee.
    expect(checkFunds(input({ amount: '100' }))).toEqual({
      reason: `That's more than your spendable balance (${formatXrp('100000000')}) once the network fee is included.`,
      pending: false,
    })
  })

  it('refuses with each spendable state its own sentence', () => {
    expect(checkFunds(input({ spendable: pending }))).toEqual({ reason: SPENDABLE_PENDING, pending: true })
    expect(checkFunds(input({ spendable: failed }))).toEqual({ reason: SPENDABLE_FAILED, pending: false })
    expect(checkFunds(input({ spendable: notActivated }))).toEqual({ reason: SPENDABLE_NOT_ACTIVATED, pending: false })
  })

  it('refuses with each fee state its own sentence', () => {
    expect(checkFunds(input({ fee: pending }))).toEqual({ reason: FEE_PENDING, pending: true })
    expect(checkFunds(input({ fee: failed }))).toEqual({ reason: FEE_FAILED, pending: false })
  })

  it('names a failed read over a pending one, whichever figure failed', () => {
    expect(checkFunds(input({ spendable: pending, fee: failed }))).toEqual({ reason: FEE_FAILED, pending: false })
    expect(checkFunds(input({ spendable: failed, fee: pending }))).toEqual({ reason: SPENDABLE_FAILED, pending: false })
  })

  it('names the spendable figure first between two of the same kind', () => {
    expect(checkFunds(input({ spendable: pending, fee: pending }))?.reason).toBe(SPENDABLE_PENDING)
    expect(checkFunds(input({ spendable: failed, fee: failed }))?.reason).toBe(SPENDABLE_FAILED)
  })

  it('does not consult the trust-line read for XRP', () => {
    expect(checkFunds(input({ trustLines: failed }))).toBeUndefined()
  })
})

describe('checkFunds — token', () => {
  it('permits an amount up to the held balance', () => {
    expect(checkFunds(input({ asset: USD, amount: '50' }))).toBeUndefined()
  })

  it('refuses more than is held', () => {
    expect(checkFunds(input({ asset: USD, amount: '50.01' }))).toEqual({ reason: 'You only hold 50 USD.', pending: false })
  })

  it('refuses on a trust-line read that is not ok, with its own sentence', () => {
    expect(checkFunds(input({ asset: USD, trustLines: pending }))).toEqual({ reason: LINES_PENDING, pending: true })
    expect(checkFunds(input({ asset: USD, trustLines: failed }))).toEqual({ reason: LINES_FAILED, pending: false })
  })

  it('refuses a line the read no longer holds as sendable', () => {
    expect(checkFunds(input({ asset: USD, trustLines: ok([]) }))).toEqual({ reason: LINE_NOT_HELD, pending: false })
    expect(checkFunds(input({ asset: USD, trustLines: ok([line({ freezePeer: true })]) }))).toEqual({
      reason: LINE_NOT_HELD,
      pending: false,
    })
  })

  it('does not depend on the fee or spendable reads', () => {
    expect(checkFunds(input({ asset: USD, fee: failed, spendable: failed }))).toBeUndefined()
  })
})
