import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { fetchAccountLines, fetchAccountState, fetchAccountTx } from '../reads'

/**
 * Epic 5 retro item 3: `account_tx` answering `actNotFound` for an unactivated
 * address is an empty history, as it already is for `account_info` and
 * `account_lines` — but only on the first page. History and the incoming-payment
 * watch both read through `fetchAccountTx`, so this one function decides
 * whether a new wallet is shown "No transactions yet" or "could not be read".
 */

const ADDRESS = 'rUnactivated'

/** The shape xrpl.js rejects with for a rippled error response. */
function rippledError(error: string) {
  return Object.assign(new Error(error), { data: { error, status: 'error', type: 'response' } })
}

/** A fake connected client whose `account_tx` rejects with `err`, recording
 * the requests it was sent. */
function installRejectingClient(err: unknown) {
  const requests: Array<Record<string, unknown>> = []
  setXrplClientFactory(
    () =>
      ({
        connect: async () => {},
        isConnected: () => true,
        disconnect: async () => {},
        request: async (req: Record<string, unknown>) => {
          requests.push(req)
          throw err
        },
      }) as unknown as Client,
  )
  return requests
}

beforeEach(() => resetXrplClients())
afterEach(() => {
  resetXrplClients()
  resetXrplClientFactory()
})

describe('fetchAccountTx and an account the ledger does not hold', () => {
  it('answers actNotFound on the first page with an empty history and no marker', async () => {
    const requests = installRejectingClient(rippledError('actNotFound'))
    await expect(fetchAccountTx('testnet', ADDRESS)).resolves.toEqual({ items: [], marker: undefined })
    // Non-vacuous: the read really went to the ledger and was refused there.
    expect(requests).toHaveLength(1)
    expect(requests[0].command).toBe('account_tx')
  })

  it('rethrows actNotFound on a continuation page — an early end would look like a complete list', async () => {
    const err = rippledError('actNotFound')
    installRejectingClient(err)
    await expect(fetchAccountTx('testnet', ADDRESS, { ledger: 1, seq: 0 })).rejects.toBe(err)
  })

  it.each(['actMalformed', 'lgrIdxMalformed', 'tooBusy', 'noNetwork'])('still fails on %s', async (code) => {
    const err = rippledError(code)
    installRejectingClient(err)
    await expect(fetchAccountTx('testnet', ADDRESS)).rejects.toBe(err)
  })

  it('still fails on a transport error that carries no ledger error code', async () => {
    const err = new Error('websocket closed')
    installRejectingClient(err)
    await expect(fetchAccountTx('testnet', ADDRESS)).rejects.toBe(err)
  })
})

/** The same reading on `account_info` and `account_lines`: Send's destination
 * check and the trust-line list. Both now read the code through
 * `rippledErrorCode` (`narrow.ts`), so these pin that narrowing. */
describe('fetchAccountState and fetchAccountLines and an account the ledger does not hold', () => {
  it('answers actNotFound on account_info with a non-existent account', async () => {
    const requests = installRejectingClient(rippledError('actNotFound'))
    await expect(fetchAccountState('testnet', ADDRESS)).resolves.toMatchObject({ exists: false, address: ADDRESS })
    expect(requests[0].command).toBe('account_info')
  })

  it('answers actNotFound on account_lines with no trust lines', async () => {
    const requests = installRejectingClient(rippledError('actNotFound'))
    await expect(fetchAccountLines('testnet', ADDRESS)).resolves.toEqual([])
    expect(requests[0].command).toBe('account_lines')
  })

  it.each([rippledError('tooBusy'), new Error('websocket closed'), 'a thrown string', null])(
    'still fails on anything else (%s)',
    async (err) => {
      installRejectingClient(err)
      await expect(fetchAccountState('testnet', ADDRESS)).rejects.toBe(err)
      await expect(fetchAccountLines('testnet', ADDRESS)).rejects.toBe(err)
    },
  )
})

/** A fake client whose `account_tx` answers with `transactions`. */
function installAnsweringClient(transactions: unknown[]) {
  setXrplClientFactory(
    () =>
      ({
        connect: async () => {},
        isConnected: () => true,
        disconnect: async () => {},
        request: async () => ({ result: { transactions } }),
      }) as unknown as Client,
  )
}

const PAYMENT = {
  TransactionType: 'Payment',
  Account: ADDRESS,
  Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
  DeliverMax: '1000000',
  Fee: '12',
}

/** A row the ledger returned is never dropped, and an unreadable result is
 * never shown as a failure: History would look complete, or invite a resend. */
describe('fetchAccountTx and an entry whose result cannot be read', () => {
  it.each([
    ['meta: null', null],
    ['meta without TransactionResult', {}],
    ['an empty-string TransactionResult', { TransactionResult: '' }],
  ])('keeps a validated entry with %s, marked unknown, amount only as an upper bound', async (_label, meta) => {
    installAnsweringClient([
      { tx_json: PAYMENT, hash: 'A', validated: true, meta },
      { tx_json: PAYMENT, hash: 'B', validated: true, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000000' } },
    ])
    const { items } = await fetchAccountTx('testnet', ADDRESS)
    expect(items.map((i) => i.hash)).toEqual(['A', 'B'])
    expect(items[0]).toMatchObject({ validated: true, resultCode: 'unknown', amountDrops: '1000000', amountIsUpperBound: true })
    expect(items[1]).toMatchObject({ resultCode: 'tesSUCCESS', amountDrops: '1000000' })
    expect(items[1].amountIsUpperBound).toBeUndefined()
  })

  it('keeps an unvalidated entry with meta: null as Pending (no result code)', async () => {
    installAnsweringClient([{ tx_json: PAYMENT, hash: 'P', validated: false, meta: null }])
    const { items } = await fetchAccountTx('testnet', ADDRESS)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ hash: 'P', validated: false, resultCode: '' })
  })
})
