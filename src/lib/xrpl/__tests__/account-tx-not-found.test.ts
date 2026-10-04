import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { fetchAccountTx } from '../reads'

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
