import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'xrpl'
import { resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import {
  fetchAccountLines,
  fetchAccountState,
  fetchAccountTx,
  fetchRecommendedFeeDrops,
  fetchServerReserves,
  fetchTx,
} from '../reads'

/**
 * Review finding (story 12.2): every read must go through the Wallet's own Node.
 * `node-wiring.test.tsx` mocks the fetchers and `node-pool.test.ts` never calls
 * them, so a fetcher that dropped `node` would read from the built-in Nodes and
 * bypass the network-id proof, with every other test still green.
 */

const NODE = 'wss://node.example.com'
const ADDRESS = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

/** Records the URL of every client built; answers each command with the least
 * the fetcher needs. `server_info` reports no network id (accepted on Mainnet). */
function recordingFactory() {
  const urls: string[] = []
  setXrplClientFactory((url) => {
    urls.push(url)
    return {
      connect: async () => {},
      isConnected: () => true,
      disconnect: async () => {},
      request: async (req: { command: string }) => {
        switch (req.command) {
          case 'server_info':
            return { result: { info: {} } }
          case 'account_info':
            return { result: { account_data: { Balance: '1', OwnerCount: 0, Sequence: 1, Flags: 0 } } }
          case 'account_lines':
            return { result: { lines: [] } }
          case 'server_state':
            return { result: { state: { validated_ledger: { reserve_base: 1, reserve_inc: 1 } } } }
          case 'fee':
            return { result: { drops: { open_ledger_fee: '10' } } }
          case 'account_tx':
            return { result: { transactions: [] } }
          case 'tx':
            return { result: {} }
          default:
            throw new Error(`unexpected ${req.command}`)
        }
      },
    } as unknown as Client
  })
  return urls
}

beforeEach(() => resetXrplClients())
afterEach(() => {
  resetXrplClients()
  resetXrplClientFactory()
})

describe('every ledger read forwards the Wallet\'s Node', () => {
  const reads: Array<[string, () => Promise<unknown>]> = [
    ['fetchAccountState', () => fetchAccountState('mainnet', ADDRESS, NODE)],
    ['fetchAccountLines', () => fetchAccountLines('mainnet', ADDRESS, NODE)],
    ['fetchServerReserves', () => fetchServerReserves('mainnet', NODE)],
    ['fetchRecommendedFeeDrops', () => fetchRecommendedFeeDrops('mainnet', NODE)],
    ['fetchAccountTx', () => fetchAccountTx('mainnet', ADDRESS, undefined, NODE)],
    ['fetchTx', () => fetchTx('mainnet', 'ABCD', NODE)],
  ]

  it.each(reads)('%s asks the factory for the custom Node and nothing else', async (_name, read) => {
    const urls = recordingFactory()
    await read()
    expect(urls).toEqual([NODE])
  })
})
