import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { fetchAccountDelegates } from '../reads'

/**
 * OS-FR-22: the Account's delegates, from `account_objects` of type `delegate`.
 * `actNotFound` is no delegates; any other error (a server that does not know
 * the type included) is a failed read, thrown, so the screen says unknown.
 */
const ADDR = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const D1 = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const D2 = 'rJZdUusLDtY9NEsGea7ijqhVrXv98rYBYN'

function rippledError(error: string) {
  return Object.assign(new Error(error), { data: { error, status: 'error', type: 'response' } })
}

function install(answer: (req: Record<string, unknown>) => unknown) {
  const requests: Array<Record<string, unknown>> = []
  setXrplClientFactory(
    () =>
      ({
        connect: async () => {},
        isConnected: () => true,
        disconnect: async () => {},
        request: async (req: Record<string, unknown>) => {
          requests.push(req)
          return { result: answer(req) }
        },
      }) as unknown as Client,
  )
  return requests
}

const delegate = (authorize: string, values: string[]) => ({
  LedgerEntryType: 'Delegate',
  Account: ADDR,
  Authorize: authorize,
  Permissions: values.map((v) => ({ Permission: { PermissionValue: v } })),
})

beforeEach(() => resetXrplClients())
afterEach(() => {
  resetXrplClientFactory()
  resetXrplClients()
})

describe('fetchAccountDelegates (OS-FR-22)', () => {
  it('asks for validated delegate objects and follows the marker to the end', async () => {
    const requests = install((req) =>
      req.marker === undefined
        ? { account_objects: [delegate(D1, ['Payment'])], marker: 'm1', ledger_index: 777 }
        : { account_objects: [delegate(D1, ['Payment']), delegate(D2, ['TrustlineAuthorize', 'AccountDomainSet'])], ledger_index: 777 },
    )
    expect(await fetchAccountDelegates('testnet', ADDR)).toEqual([
      { authorize: D1, permissions: ['Payment'] },
      { authorize: D2, permissions: ['TrustlineAuthorize', 'AccountDomainSet'] },
    ])
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({ command: 'account_objects', account: ADDR, type: 'delegate', ledger_index: 'validated' })
    expect(requests[1].marker).toBe('m1')
    // Page 2 reads page 1's ledger, and a delegate seen twice is listed once.
    expect(requests[1].ledger_index).toBe(777)
  })

  it('skips an object that is not a Delegate of this Account', async () => {
    install(() => ({ account_objects: [{ LedgerEntryType: 'Offer' }, { ...delegate(D1, ['Payment']), Account: D2 }] }))
    expect(await fetchAccountDelegates('testnet', ADDR)).toEqual([])
  })

  it('actNotFound is no delegates', async () => {
    setXrplClientFactory(() => ({ connect: async () => {}, isConnected: () => true, disconnect: async () => {}, request: async () => { throw rippledError('actNotFound') } }) as unknown as Client)
    expect(await fetchAccountDelegates('testnet', ADDR)).toEqual([])
  })

  it('a server that refuses the type is a failed read, never "none"', async () => {
    setXrplClientFactory(() => ({ connect: async () => {}, isConnected: () => true, disconnect: async () => {}, request: async () => { throw rippledError('invalidParams') } }) as unknown as Client)
    await expect(fetchAccountDelegates('testnet', ADDR)).rejects.toThrow('invalidParams')
  })
})
