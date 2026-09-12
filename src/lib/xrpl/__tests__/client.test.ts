import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from 'xrpl'
import { getXrplClient, resetXrplClientFactory, resetXrplClients, setXrplClientFactory } from '../client'
import { NETWORKS } from '../networks'

/**
 * The two-endpoint failover is what keeps the wallet readable when an
 * endpoint is down (docs/decisions.md §2), and until AD-12 gave `client.ts`
 * an injectable factory it could only be verified by unplugging a cable —
 * which in practice meant it was never verified. Every row of the epic's
 * edge-case matrix is pinned here through the seam.
 */

type FakeClient = Client & { url: string; connectCalls: number; connected: boolean }

function fakeClient(url: string, connect: () => Promise<void>): FakeClient {
  const client = {
    url,
    connectCalls: 0,
    connected: true,
    connect() {
      client.connectCalls += 1
      return connect()
    },
    isConnected: () => client.connected,
    disconnect: async () => {},
  }
  return client as unknown as FakeClient
}

const { wsUrl, wsUrlBackup, label } = NETWORKS.testnet

beforeEach(() => {
  resetXrplClients()
})

afterEach(() => {
  resetXrplClients()
  resetXrplClientFactory()
  vi.useRealTimers()
})

describe('getXrplClient failover', () => {
  it('uses the primary endpoint when it connects', async () => {
    const built: string[] = []
    setXrplClientFactory((url) => {
      built.push(url)
      return fakeClient(url, async () => {})
    })

    const client = await getXrplClient('testnet')

    expect((client as FakeClient).url).toBe(wsUrl)
    expect(built).toEqual([wsUrl])
  })

  it('falls through to the backup when the primary refuses', async () => {
    const built: string[] = []
    setXrplClientFactory((url) => {
      built.push(url)
      return fakeClient(url, async () => {
        if (url === wsUrl) throw new Error('ECONNREFUSED')
      })
    })

    const client = await getXrplClient('testnet')

    expect((client as FakeClient).url).toBe(wsUrlBackup)
    expect(built).toEqual([wsUrl, wsUrlBackup])
  })

  it('falls through to the backup after the primary hangs past the connect timeout', async () => {
    vi.useFakeTimers()
    const built: string[] = []
    setXrplClientFactory((url) => {
      built.push(url)
      return fakeClient(url, () => (url === wsUrl ? new Promise<void>(() => {}) : Promise.resolve()))
    })

    const pending = getXrplClient('testnet')
    // Async variant: the microtasks between the timeout rejection and the
    // backup attempt have to drain before the second client is built.
    await vi.advanceTimersByTimeAsync(10_000)
    const client = await pending

    expect((client as FakeClient).url).toBe(wsUrlBackup)
    expect(built).toEqual([wsUrl, wsUrlBackup])
  })

  it('throws one error naming both endpoints, with the last failure as cause, when both refuse', async () => {
    const backupError = new Error('backup down')
    setXrplClientFactory((url) =>
      fakeClient(url, async () => {
        throw url === wsUrl ? new Error('primary down') : backupError
      }),
    )

    await expect(getXrplClient('testnet')).rejects.toMatchObject({
      message: expect.stringContaining(wsUrl),
      cause: backupError,
    })
    await expect(getXrplClient('testnet')).rejects.toThrow(wsUrlBackup)
    await expect(getXrplClient('testnet')).rejects.toThrow(label)
  })
})

describe('getXrplClient connection reuse', () => {
  it('returns the cached client to a later caller without opening a second connection', async () => {
    let built = 0
    setXrplClientFactory((url) => {
      built += 1
      return fakeClient(url, async () => {})
    })

    const first = await getXrplClient('testnet')
    const second = await getXrplClient('testnet')

    expect(second).toBe(first)
    expect(built).toBe(1)
    expect((first as FakeClient).connectCalls).toBe(1)
  })

  it('gives concurrent callers a connected client each — the real case at mount', async () => {
    // Several query hooks mount at once and all call getXrplClient before any
    // connection has finished. Nothing may be handed an unconnected client,
    // and the cache must settle on one connection for the network.
    let built = 0
    let resolveConnect: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      resolveConnect = resolve
    })
    setXrplClientFactory((url) => {
      built += 1
      return fakeClient(url, () => gate)
    })

    const all = Promise.all([getXrplClient('testnet'), getXrplClient('testnet'), getXrplClient('testnet')])
    resolveConnect!()
    const [a, b, c] = await all

    expect(a.isConnected()).toBe(true)
    expect(b.isConnected()).toBe(true)
    expect(c.isConnected()).toBe(true)
    // Documents today's behaviour honestly: there is no in-flight-connection
    // dedupe, so concurrent cold callers each open one. The cache then holds
    // a single client, which every later caller reuses.
    expect(built).toBe(3)
    expect(await getXrplClient('testnet')).toBe(c)
    expect(built).toBe(3)
  })

  it('reconnects when the cached client reports it is no longer connected', async () => {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {})
      built.push(client)
      return client
    })

    const first = (await getXrplClient('testnet')) as FakeClient
    // The socket dropped: the cache still holds this client, but it now
    // answers `isConnected()` false, so a fresh connection must be made.
    first.connected = false
    const second = await getXrplClient('testnet')

    expect(second).not.toBe(first)
    expect(built).toHaveLength(2)
    expect(second.isConnected()).toBe(true)
  })

  it('caches per network rather than globally', async () => {
    setXrplClientFactory((url) => fakeClient(url, async () => {}))

    const testnet = await getXrplClient('testnet')
    const mainnet = await getXrplClient('mainnet')

    expect((testnet as FakeClient).url).toBe(NETWORKS.testnet.wsUrl)
    expect((mainnet as FakeClient).url).toBe(NETWORKS.mainnet.wsUrl)
    expect(mainnet).not.toBe(testnet)
  })
})
