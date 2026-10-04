import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from 'xrpl'
import {
  disconnectAllClients,
  getXrplClient,
  holdXrplClient,
  resetXrplClientFactory,
  resetXrplClients,
  setXrplClientFactory,
} from '../client'
import { NETWORKS } from '../networks'

/**
 * The two-endpoint failover is what keeps the wallet readable when an
 * endpoint is down (docs/decisions.md §2), and until AD-12 gave `client.ts`
 * an injectable factory it could only be verified by unplugging a cable —
 * which in practice meant it was never verified. Every row of the epic's
 * edge-case matrix is pinned here through the seam.
 */

type FakeClient = Client & { url: string; connectCalls: number; disconnectCalls: number; connected: boolean }

function fakeClient(url: string, connect: () => Promise<void>): FakeClient {
  const client = {
    url,
    connectCalls: 0,
    disconnectCalls: 0,
    connected: true,
    connect() {
      client.connectCalls += 1
      return connect()
    },
    isConnected: () => client.connected,
    disconnect: async () => {
      client.disconnectCalls += 1
      client.connected = false
    },
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

  it('gives concurrent callers one shared connected client — the real case at mount', async () => {
    // Several query hooks mount at once and all call getXrplClient before any
    // connection has finished. Nothing may be handed an unconnected client,
    // and they share one connect attempt (story 8.2).
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
    // Until story 8.2 each cold caller opened its own socket and this read 3.
    expect(built).toBe(1)
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(await getXrplClient('testnet')).toBe(a)
    expect(built).toBe(1)
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

/** Lets the fire-and-forget disconnects queued on the microtask queue run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type Controlled = { client: FakeClient; resolve: () => void; reject: (err: Error) => void }

/** A factory whose every client's connect stays pending until the test settles it. */
function controlledFactory(): Controlled[] {
  const built: Controlled[] = []
  setXrplClientFactory((url) => {
    let resolve!: () => void
    let reject!: (err: Error) => void
    const gate = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    const client = fakeClient(url, () => gate)
    built.push({ client, resolve, reject })
    return client
  })
  return built
}

/**
 * Story 8.1 — a connection the app has stopped using is closed. Each abandon
 * path is pinned on its own, because the register named only the failover one.
 */
describe('getXrplClient closes what it abandons', () => {
  it('disconnects the primary it fell through from, and leaves the backup it kept open', async () => {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {
        if (url === wsUrl) throw new Error('ECONNREFUSED')
      })
      built.push(client)
      return client
    })

    const client = await getXrplClient('testnet')
    await flush()

    expect(client).toBe(built[1])
    expect(built[0].disconnectCalls).toBe(1)
    expect(built[1].disconnectCalls).toBe(0)
  })

  it('disconnects both endpoints when neither connects', async () => {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {
        throw new Error('down')
      })
      built.push(client)
      return client
    })

    await expect(getXrplClient('testnet')).rejects.toThrow(wsUrl)
    await flush()

    expect(built.map((c) => c.disconnectCalls)).toEqual([1, 1])
  })

  it('closes the connection that lost to the timeout rather than merely dropping it', async () => {
    vi.useFakeTimers()
    const built = controlledFactory()

    const pending = getXrplClient('testnet')
    await vi.advanceTimersByTimeAsync(10_000)
    built[1].resolve()
    const client = await pending
    await vi.advanceTimersByTimeAsync(0)

    expect(client).toBe(built[1].client)
    expect(built[0].client.disconnectCalls).toBe(1)
    expect(built[1].client.disconnectCalls).toBe(0)
  })

  it('closes a connect abandoned at the timeout that opens afterwards', async () => {
    vi.useFakeTimers()
    const built = controlledFactory()

    const pending = getXrplClient('testnet')
    await vi.advanceTimersByTimeAsync(10_000)
    built[1].resolve()
    await pending
    await vi.advanceTimersByTimeAsync(0)
    const closedAtTimeout = built[0].client.disconnectCalls

    // The primary's socket finally opens, ten seconds too late. Nobody holds
    // it: it must be closed again, not left connected.
    built[0].resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(built[0].client.disconnectCalls).toBe(closedAtTimeout + 1)
    expect(await getXrplClient('testnet')).toBe(built[1].client)
  })

  it('disconnects a cached client that dropped before replacing it — the cache-miss path', async () => {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {})
      built.push(client)
      return client
    })

    const first = (await getXrplClient('testnet')) as FakeClient
    // xrpl.js would schedule its own reconnect on this client; only a
    // disconnect() cancels that.
    first.connected = false
    const second = await getXrplClient('testnet')
    await flush()

    expect(second).toBe(built[1])
    expect(first.disconnectCalls).toBe(1)
    expect(built[1].disconnectCalls).toBe(0)
  })

  it('never disconnects a client it returned', async () => {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {})
      built.push(client)
      return client
    })

    await getXrplClient('testnet')
    await getXrplClient('testnet')
    await flush()

    expect(built).toHaveLength(1)
    expect(built[0].disconnectCalls).toBe(0)
  })
})

/**
 * PR #33 review: a write's `submitAndWait` polls on the client it was given and
 * relies on xrpl.js reconnecting THAT client after a drop. A read replacing the
 * dropped client must not close it under the write — that turned a payment
 * that may well validate into a reported failure the user could resend.
 */
describe('holdXrplClient keeps a client a write is using open across a replacement', () => {
  function counting() {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {})
      built.push(client)
      return client
    })
    return built
  }

  it('does not disconnect a held client that a concurrent read replaces, and closes it on release', async () => {
    const built = counting()

    const { client, release } = await holdXrplClient('testnet')
    const held = client as FakeClient
    // The socket drops; xrpl.js is now reconnecting this very client.
    held.connected = false
    const replacement = await getXrplClient('testnet')
    await flush()

    expect(replacement).toBe(built[1])
    expect(held.disconnectCalls).toBe(0)

    release()
    await flush()
    expect(held.disconnectCalls).toBe(1)
    expect(built[1].disconnectCalls).toBe(0)
  })

  it('waits for the last of several holders before closing', async () => {
    counting()

    const a = await holdXrplClient('testnet')
    const b = await holdXrplClient('testnet')
    expect(b.client).toBe(a.client)
    ;(a.client as FakeClient).connected = false
    await getXrplClient('testnet')

    a.release()
    a.release() // idempotent: a second call must not count as b's release
    await flush()
    expect((a.client as FakeClient).disconnectCalls).toBe(0)

    b.release()
    await flush()
    expect((a.client as FakeClient).disconnectCalls).toBe(1)
  })

  it('never closes a held client that is still the cached one when released', async () => {
    const built = counting()

    const { release } = await holdXrplClient('testnet')
    release()
    await flush()

    expect(built).toHaveLength(1)
    expect(built[0].disconnectCalls).toBe(0)
    expect(await getXrplClient('testnet')).toBe(built[0])
  })
})

/** The epic's non-goal, and the production teardown this epic does not move. */
describe('the reset seam and the teardown path are unchanged', () => {
  it('resetXrplClients is synchronous and drops connections without disconnecting them', async () => {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {})
      built.push(client)
      return client
    })
    const first = (await getXrplClient('testnet')) as FakeClient

    const returned: unknown = resetXrplClients()
    await flush()

    // Not a promise: there is nothing for a caller to await.
    expect(returned).toBeUndefined()
    expect(first.disconnectCalls).toBe(0)
    expect(first.isConnected()).toBe(true)
    // ...but it is dropped: the next caller gets a fresh connection.
    expect(await getXrplClient('testnet')).not.toBe(first)
    expect(built).toHaveLength(2)
  })

  it('disconnectAllClients closes every cached connection and empties the cache', async () => {
    const built: FakeClient[] = []
    setXrplClientFactory((url) => {
      const client = fakeClient(url, async () => {})
      built.push(client)
      return client
    })
    await getXrplClient('testnet')
    await getXrplClient('mainnet')

    await disconnectAllClients()

    expect(built.map((c) => c.disconnectCalls)).toEqual([1, 1])
    await getXrplClient('testnet')
    expect(built).toHaveLength(3)
  })
})

/** Story 8.2 — concurrent callers share one connection attempt. */
describe('getXrplClient shares one connect attempt per network', () => {
  it('constructs exactly one client for several concurrent callers', async () => {
    let built = 0
    setXrplClientFactory((url) => {
      built += 1
      return fakeClient(url, async () => {})
    })

    const clients = await Promise.all(Array.from({ length: 5 }, () => getXrplClient('testnet')))

    expect(built).toBe(1)
    expect(new Set(clients).size).toBe(1)
  })

  it('discards a failed attempt so the next call retries the failover loop from the primary', async () => {
    const built: string[] = []
    let up = false
    setXrplClientFactory((url) => {
      built.push(url)
      return fakeClient(url, async () => {
        if (!up) throw new Error('down')
      })
    })

    const results = await Promise.allSettled([getXrplClient('testnet'), getXrplClient('testnet'), getXrplClient('testnet')])

    // One shared attempt, so one failover loop: primary then backup, once.
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(built).toEqual([wsUrl, wsUrlBackup])

    up = true
    const client = (await getXrplClient('testnet')) as FakeClient

    expect(client.url).toBe(wsUrl)
    expect(built).toEqual([wsUrl, wsUrlBackup, wsUrl])
  })

  it('does not share an attempt across networks', async () => {
    const built = controlledFactory()

    const testnet = getXrplClient('testnet')
    const mainnet = getXrplClient('mainnet')
    built.forEach((b) => b.resolve())
    const [t, m] = await Promise.all([testnet, mainnet])

    expect(built.map((b) => b.client.url)).toEqual([NETWORKS.testnet.wsUrl, NETWORKS.mainnet.wsUrl])
    expect(t).not.toBe(m)
  })

  it('resetXrplClients forgets an attempt in flight, so the next caller starts its own', async () => {
    const built = controlledFactory()

    void getXrplClient('testnet').catch(() => {})
    resetXrplClients()
    void getXrplClient('testnet').catch(() => {})

    expect(built).toHaveLength(2)
  })

  it('an attempt forgotten by a reset does not evict the newer attempt when it fails', async () => {
    const built = controlledFactory()

    const stale = getXrplClient('testnet')
    resetXrplClients()
    const current = getXrplClient('testnet')
    // The stale attempt fails on both endpoints.
    built[0].reject(new Error('down'))
    await flush()
    built[2].reject(new Error('down'))
    await expect(stale).rejects.toThrow(wsUrl)

    // A later caller still shares the current attempt rather than opening a third.
    const later = getXrplClient('testnet')
    expect(built).toHaveLength(3)
    built[1].resolve()
    expect(await later).toBe(await current)
  })

  it('an attempt forgotten by a reset does not write its client into the cache', async () => {
    const built = controlledFactory()

    const stale = getXrplClient('testnet')
    resetXrplClients()
    built[0].resolve()
    const staleClient = await stale

    const next = getXrplClient('testnet')
    expect(built).toHaveLength(2)
    built[1].resolve()
    expect(await next).not.toBe(staleClient)
  })
})
