import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'xrpl'
import {
  getXrplClient,
  holdXrplClient,
  retireNode,
  resetXrplClientFactory,
  resetXrplClients,
  setXrplClientFactory,
  verifyNode,
} from '../client'
import { builtInNodes, isNetworkId, NETWORKS } from '../networks'

/**
 * Story 2 / AD-20: the pool is keyed by Node, and a custom Node is trusted only
 * after `server_info` reports the chosen network's id — on accept AND on every
 * connect. Driven through the AD-12 seam, so no socket opens.
 */

type Fake = Client & { url: string; requests: string[]; disconnects: number; connected: boolean }

/** `networkId: 'absent'` models a Node that omits `network_id` from server_info. */
function fake(url: string, networkId: number | 'absent', opts: { refuse?: boolean } = {}): Fake {
  const c = {
    url,
    requests: [] as string[],
    disconnects: 0,
    connected: true,
    connect: async () => {
      if (opts.refuse) throw new Error('ECONNREFUSED')
    },
    isConnected: () => c.connected,
    disconnect: async () => {
      c.disconnects += 1
      c.connected = false
    },
    request: async (req: { command: string }) => {
      c.requests.push(req.command)
      return { result: { info: networkId === 'absent' ? {} : { network_id: networkId } } }
    },
  }
  return c as unknown as Fake
}

let built: Fake[]
/** Installs a factory whose Nodes report `ids[url]` (default: the id of the
 * network the URL belongs to, 0). */
function install(ids: Record<string, number | 'absent'>, refuse: string[] = []) {
  built = []
  setXrplClientFactory((url) => {
    const c = fake(url, ids[url] ?? 0, { refuse: refuse.includes(url) })
    built.push(c)
    return c
  })
}

beforeEach(() => resetXrplClients())
afterEach(() => {
  resetXrplClients()
  resetXrplClientFactory()
})

const CUSTOM = 'wss://node.example.com'

describe('networks', () => {
  it('Devnet is a network with its own ids, Node, explorer and faucet, and no backup', () => {
    expect(isNetworkId('devnet')).toBe(true)
    expect(isNetworkId('signet')).toBe(false)
    expect(NETWORKS.devnet).toMatchObject({
      networkId: 2,
      // check-explorer-links-allow
      explorerBaseUrl: 'https://devnet.xrpl.org',
      faucetUrl: 'https://faucet.devnet.rippletest.net/accounts',
      wsUrlBackup: null,
    })
    expect(builtInNodes('devnet')).toEqual(['wss://s.devnet.rippletest.net:51233'])
    expect([NETWORKS.mainnet.networkId, NETWORKS.testnet.networkId]).toEqual([0, 1])
    expect(builtInNodes('mainnet')).toEqual(['wss://xrplcluster.com', 'wss://s1.ripple.com'])
  })
})

describe('verifyNode — on accept', () => {
  it('accepts a wss:// Node reporting the chosen network id, and closes the probe', async () => {
    install({ [CUSTOM]: 0 })
    await expect(verifyNode('mainnet', CUSTOM)).resolves.toBeUndefined()
    expect(built[0].disconnects).toBe(1)
  })

  it('rejects a Testnet Node offered as Mainnet, naming both ids, and closes the client', async () => {
    install({ [CUSTOM]: 1 })
    await expect(verifyNode('mainnet', CUSTOM)).rejects.toThrow(/Testnet \(network id 1\).*Mainnet \(network id 0\)/)
    expect(built[0].disconnects).toBe(1)
  })

  it('accepts a Node with no network_id for Mainnet only', async () => {
    install({ [CUSTOM]: 'absent' })
    await expect(verifyNode('mainnet', CUSTOM)).resolves.toBeUndefined()
    await expect(verifyNode('testnet', CUSTOM)).rejects.toThrow(/did not state which network/)
    await expect(verifyNode('devnet', CUSTOM)).rejects.toThrow(/did not state which network/)
  })

  it('rejects ws:// and malformed addresses without opening a socket', async () => {
    install({})
    await expect(verifyNode('mainnet', 'ws://node.example.com')).rejects.toThrow(/wss:\/\//)
    await expect(verifyNode('mainnet', 'not a url')).rejects.toThrow(/wss:\/\//)
    expect(built).toHaveLength(0)
  })

  it('rejects an unreachable Node with a reason', async () => {
    install({}, [CUSTOM])
    await expect(verifyNode('mainnet', CUSTOM)).rejects.toThrow(/Could not reach/)
  })
})

describe('getXrplClient — a custom Node, on every connect', () => {
  it('connects once the Node proves its network, and reuses it', async () => {
    install({ [CUSTOM]: 1 })
    const a = await getXrplClient('testnet', CUSTOM)
    expect(await getXrplClient('testnet', CUSTOM)).toBe(a)
    expect(built).toHaveLength(1)
  })

  it('rejects a Node that now reports another id: nothing cached, nothing requested through it', async () => {
    install({ [CUSTOM]: 1 })
    await expect(getXrplClient('mainnet', CUSTOM)).rejects.toThrow(/network id 1/)
    const probe = built[0]
    // Only the identity question was asked; the client was closed.
    expect(probe.requests).toEqual(['server_info'])
    expect(probe.disconnects).toBe(1)
    // Not cached: the next call connects and checks afresh.
    await expect(getXrplClient('mainnet', CUSTOM)).rejects.toThrow()
    expect(built).toHaveLength(2)
  })

  it('a Node that changes its answer after being saved is caught at the next connect', async () => {
    install({ [CUSTOM]: 0 })
    const first = await getXrplClient('mainnet', CUSTOM)
    ;(first as Fake).connected = false
    install({ [CUSTOM]: 1 })
    await expect(getXrplClient('mainnet', CUSTOM)).rejects.toThrow(/Testnet/)
  })

  it('has no failover: an unreachable custom Node is an error, never the built-in list', async () => {
    install({}, [CUSTOM])
    await expect(getXrplClient('mainnet', CUSTOM)).rejects.toThrow(/Could not reach your Node/)
    expect(built.map((c) => c.url)).toEqual([CUSTOM])
  })

  it('refuses ws:// at connect time too', async () => {
    install({})
    await expect(getXrplClient('mainnet', 'ws://insecure.example.com')).rejects.toThrow(/wss:\/\//)
    expect(built).toHaveLength(0)
  })

  it('holdXrplClient takes the Node as well', async () => {
    install({ [CUSTOM]: 1 })
    const { client, release } = await holdXrplClient('testnet', CUSTOM)
    expect((client as Fake).url).toBe(CUSTOM)
    release()
  })
})

describe('the pool is keyed by Node', () => {
  it('two Wallets, two Nodes: a Mainnet default and a Testnet custom are two entries', async () => {
    install({ [CUSTOM]: 1 })
    const main = await getXrplClient('mainnet')
    const test = await getXrplClient('testnet', CUSTOM)
    expect(main).not.toBe(test)
    expect((main as Fake).url).toBe('wss://xrplcluster.com')
    expect((test as Fake).url).toBe(CUSTOM)
    expect(await getXrplClient('mainnet')).toBe(main)
    expect(await getXrplClient('testnet', CUSTOM)).toBe(test)
  })

  it('one URL offered for two networks is two entries, each with its own proof', async () => {
    install({ [CUSTOM]: 'absent' })
    const asMainnet = await getXrplClient('mainnet', CUSTOM)
    await expect(getXrplClient('testnet', CUSTOM)).rejects.toThrow(/did not state/)
    expect(await getXrplClient('mainnet', CUSTOM)).toBe(asMainnet)
  })

  it('built-in Nodes are not asked for proof and fail over inside the network list only', async () => {
    install({}, ['wss://xrplcluster.com'])
    const c = await getXrplClient('mainnet')
    expect((c as Fake).url).toBe('wss://s1.ripple.com')
    expect(built.flatMap((b) => b.requests)).toEqual([])
  })

  it('Devnet has one built-in Node and no backup to fall to', async () => {
    install({}, ['wss://s.devnet.rippletest.net:51233'])
    await expect(getXrplClient('devnet')).rejects.toThrow(/Devnet network \(tried wss:\/\/s\.devnet\.rippletest\.net:51233\)/)
    expect(built).toHaveLength(1)
  })
})

describe('a Node URL may not carry a secret, and is canonical', () => {
  it.each([
    'wss://SECRETUSER:SECRETPW@node.example.com',
    'wss://node.example.com/?token=SECRETTOKEN',
    'wss://node.example.com/#SECRETFRAG',
    'ws://SECRETHOST.example.com',
    'https://SECRETHOST.example.com',
  ])('rejects %s without echoing it', async (bad) => {
    install({})
    const err = await verifyNode('mainnet', bad).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toMatch(/SECRET/)
    await expect(getXrplClient('mainnet', bad)).rejects.toThrow(/wss:\/\//)
    expect(built).toHaveLength(0)
  })

  it('treats case and a trailing slash as the same Node, one pool slot', async () => {
    install({})
    const a = await getXrplClient('mainnet', 'WSS://Node.Example.com/')
    expect(await getXrplClient('mainnet', 'wss://node.example.com')).toBe(a)
    expect(built.map((c) => c.url)).toEqual(['wss://node.example.com'])
  })

  it('says a non-numeric network id is unreadable', async () => {
    install({ [CUSTOM]: 'garbage' as never })
    await expect(verifyNode('mainnet', CUSTOM)).rejects.toThrow(/unreadable network id/)
  })
})

describe('retireNode', () => {
  it('closes and drops the custom slot, so the next call connects afresh', async () => {
    install({ [CUSTOM]: 0 })
    const first = (await getXrplClient('mainnet', CUSTOM)) as Fake
    retireNode('mainnet', CUSTOM)
    await Promise.resolve()
    await Promise.resolve()
    expect(first.disconnects).toBe(1)
    const second = await getXrplClient('mainnet', CUSTOM)
    expect(second).not.toBe(first)
  })

  it('leaves a client a write still holds open until it is released', async () => {
    install({ [CUSTOM]: 0 })
    const { client, release } = await holdXrplClient('mainnet', CUSTOM)
    retireNode('mainnet', CUSTOM)
    expect((client as Fake).disconnects).toBe(0)
    release()
    await Promise.resolve()
    await Promise.resolve()
    expect((client as Fake).disconnects).toBe(1)
  })

  it('is a no-op for a built-in or invalid Node', () => {
    expect(() => retireNode('mainnet', 'ws://nope')).not.toThrow()
  })
})
