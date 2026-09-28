import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { fetchAccountTx, fetchTx, paymentAmountOf } from '../reads'
import { isPositiveLedgerDecimalString } from '../money'

/**
 * FR-57: a Payment's figure is exact only when the ledger reports a positive,
 * well-formed `delivered_amount`. Every other case shows the requested amount
 * flagged as an upper bound — before this, only the literal `"unavailable"`
 * raised the flag, so an absent, zero or malformed field showed a requested
 * figure as if it had arrived.
 */

const SENDER = 'rSender'
const RECEIVER = 'rReceiver'
const USD = { currency: 'USD', issuer: 'rIssuer' }

function payment(amount: unknown, extra: Record<string, unknown> = {}) {
  return { TransactionType: 'Payment', Account: SENDER, Destination: RECEIVER, DeliverMax: amount, ...extra }
}

function ok(delivered?: unknown, present = true) {
  const meta: Record<string, unknown> = { TransactionResult: 'tesSUCCESS' }
  if (present) meta.delivered_amount = delivered
  return meta
}

describe('paymentAmountOf — the I/O matrix', () => {
  it('normal XRP payment: delivered, exact', () => {
    expect(paymentAmountOf(payment('1000000'), ok('1000000'))).toEqual({ amountDrops: '1000000' })
  })

  it('normal issued payment: delivered, exact', () => {
    expect(paymentAmountOf(payment({ ...USD, value: '10' }), ok({ ...USD, value: '10' }))).toEqual({
      amountIssued: { ...USD, value: '10' },
    })
  })

  it('partial payment: the smaller delivered figure, exact', () => {
    expect(paymentAmountOf(payment('5000000'), ok('1000000'))).toEqual({ amountDrops: '1000000' })
    expect(paymentAmountOf(payment({ ...USD, value: '10' }), ok({ ...USD, value: '2.5' }))).toEqual({
      amountIssued: { ...USD, value: '2.5' },
    })
  })

  it("legacy 'unavailable': requested, upper bound", () => {
    expect(paymentAmountOf(payment('5000000'), ok('unavailable'))).toEqual({
      amountDrops: '5000000',
      amountIsUpperBound: true,
    })
  })

  it('absent delivered_amount: requested, upper bound', () => {
    expect(paymentAmountOf(payment('5000000'), ok(undefined, false))).toEqual({
      amountDrops: '5000000',
      amountIsUpperBound: true,
    })
    expect(paymentAmountOf(payment({ ...USD, value: '10' }), ok(undefined, false))).toEqual({
      amountIssued: { ...USD, value: '10' },
      amountIsUpperBound: true,
    })
  })

  it.each([['0'], ['-5'], [{ ...USD, value: '0' }], [{ ...USD, value: '0.000' }], [{ ...USD, value: '-1' }], [{ ...USD, value: '0e5' }]])(
    'non-positive %j: requested, upper bound',
    (delivered) => {
      expect(paymentAmountOf(payment('5000000'), ok(delivered))).toEqual({
        amountDrops: '5000000',
        amountIsUpperBound: true,
      })
    },
  )

  it.each([['abc'], ['1.5'], [''], [{}], [null], [{ ...USD, value: 'abc' }], [{ value: '10' }], [42]])(
    'malformed %j: requested, upper bound',
    (delivered) => {
      expect(paymentAmountOf(payment('5000000'), ok(delivered))).toEqual({
        amountDrops: '5000000',
        amountIsUpperBound: true,
      })
    },
  )

  it('exponent-notation issued value: delivered, exact', () => {
    expect(paymentAmountOf(payment({ ...USD, value: '1' }), ok({ ...USD, value: '1e-7' }))).toEqual({
      amountIssued: { ...USD, value: '1e-7' },
    })
    expect(paymentAmountOf(payment({ ...USD, value: '1' }), ok({ ...USD, value: '1.5E+3' }))).toEqual({
      amountIssued: { ...USD, value: '1.5E+3' },
    })
  })

  it('not a Payment: no amount, no flag', () => {
    const trustSet = { TransactionType: 'TrustSet', Account: SENDER, LimitAmount: { ...USD, value: '100' } }
    expect(paymentAmountOf(trustSet, ok('1000000'))).toEqual({})
    expect(paymentAmountOf(trustSet, ok(undefined, false))).toEqual({})
  })

  it('failed payment: requested, upper bound, even if a delivered figure is present', () => {
    expect(paymentAmountOf(payment('5000000'), { TransactionResult: 'tecPATH_DRY' })).toEqual({
      amountDrops: '5000000',
      amountIsUpperBound: true,
    })
    expect(paymentAmountOf(payment('5000000'), { TransactionResult: 'tecNO_DST', delivered_amount: '5000000' })).toEqual({
      amountDrops: '5000000',
      amountIsUpperBound: true,
    })
  })

  it('falls back to a legacy `Amount` when there is no `DeliverMax`', () => {
    const legacy = { TransactionType: 'Payment', Account: SENDER, Destination: RECEIVER, Amount: '7000000' }
    expect(paymentAmountOf(legacy, ok(undefined, false))).toEqual({ amountDrops: '7000000', amountIsUpperBound: true })
  })

  it('missing meta: requested, upper bound', () => {
    expect(paymentAmountOf(payment('5000000'), undefined)).toEqual({ amountDrops: '5000000', amountIsUpperBound: true })
  })
})

describe('isPositiveLedgerDecimalString', () => {
  it.each(['10', '10.5', '0.000001', '1e-7', '1.5e-7', '1E+20', '.5', '5.'])('accepts %s', (v) => {
    expect(isPositiveLedgerDecimalString(v)).toBe(true)
  })
  it.each(['0', '0.0', '0e10', '-1', '-1e-7', '', 'abc', '1e', 'e5', '1.2.3', ' 1', 'Infinity', 'NaN'])(
    'rejects %j',
    (v) => {
      expect(isPositiveLedgerDecimalString(v)).toBe(false)
    },
  )
})

/** A fake connected client answering one canned response per command. */
function installFakeClient(responses: Record<string, unknown>) {
  setXrplClientFactory(
    () =>
      ({
        connect: async () => {},
        isConnected: () => true,
        disconnect: async () => {},
        request: async (req: { command: string }) => {
          if (!(req.command in responses)) throw new Error(`unexpected command ${req.command}`)
          return responses[req.command]
        },
      }) as unknown as Client,
  )
}

beforeEach(() => resetXrplClients())
afterEach(() => {
  resetXrplClients()
  resetXrplClientFactory()
})

describe('fetchTx and fetchAccountTx normalise through the same function', () => {
  const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['exact', payment('1000000'), ok('1000000')],
    ['partial', payment('5000000'), ok('1000000')],
    ['absent', payment('5000000'), ok(undefined, false)],
    ['unavailable', payment('5000000'), ok('unavailable')],
    ['zero', payment({ ...USD, value: '10' }), ok({ ...USD, value: '0' })],
    ['malformed', payment('5000000'), ok({})],
    ['exponent', payment({ ...USD, value: '1' }), ok({ ...USD, value: '1e-7' })],
    ['failed', payment('5000000'), { TransactionResult: 'tecPATH_DRY' }],
  ]

  it.each(cases)('%s: the two reads agree', async (_name, tx, meta) => {
    const hash = 'ABC123'
    installFakeClient({
      account_tx: {
        result: { transactions: [{ hash, tx_json: tx, meta, validated: true, ledger_index: 1 }], marker: undefined },
      },
      tx: { result: { hash, tx_json: tx, meta, validated: true } },
    })

    const { items } = await fetchAccountTx('testnet', RECEIVER)
    const detail = await fetchTx('testnet', hash)
    const expected = paymentAmountOf(tx, meta)

    const fromList = {
      amountDrops: items[0].amountDrops,
      amountIssued: items[0].amountIssued,
      amountIsUpperBound: items[0].amountIsUpperBound,
    }
    const fromDetail = {
      amountDrops: detail.amountDrops,
      amountIssued: detail.amountIssued,
      amountIsUpperBound: detail.amountIsUpperBound,
    }
    expect(fromList).toEqual(fromDetail)
    expect(fromDetail).toEqual({
      amountDrops: expected.amountDrops,
      amountIssued: expected.amountIssued,
      amountIsUpperBound: expected.amountIsUpperBound,
    })
    // The raw response is kept beside the normalised figure.
    expect((detail.result as any).tx_json).toEqual(tx)
  })

  it('fetchAccountTx flags an absent delivered_amount (the FR-57 regression)', async () => {
    installFakeClient({
      account_tx: {
        result: {
          transactions: [{ hash: 'H', tx_json: payment('5000000'), meta: ok(undefined, false), validated: true }],
        },
      },
    })
    const { items } = await fetchAccountTx('testnet', RECEIVER)
    expect(items[0].amountDrops).toBe('5000000')
    expect(items[0].amountIsUpperBound).toBe(true)
  })

  it('fetchTx reads a flat API-v1 result too', async () => {
    installFakeClient({ tx: { result: { ...payment('5000000'), hash: 'H', meta: ok('1000000') } } })
    const detail = await fetchTx('testnet', 'H')
    expect(detail.amountDrops).toBe('1000000')
    expect(detail.amountIsUpperBound).toBeUndefined()
  })

  it('fetchAccountTx leaves a non-Payment row without amount or flag', async () => {
    installFakeClient({
      account_tx: {
        result: {
          transactions: [
            {
              hash: 'T',
              tx_json: { TransactionType: 'TrustSet', Account: RECEIVER, LimitAmount: { ...USD, value: '100' } },
              meta: ok(undefined, false),
              validated: true,
            },
          ],
        },
      },
    })
    const { items } = await fetchAccountTx('testnet', RECEIVER)
    expect(items[0].amountDrops).toBeUndefined()
    expect(items[0].amountIssued).toBeUndefined()
    expect(items[0].amountIsUpperBound).toBeUndefined()
  })
})
