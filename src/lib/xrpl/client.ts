import { Client } from 'xrpl'
import { NETWORKS, type NetworkId } from './networks'

/**
 * How a `Client` is obtained for a URL — AD-12: the module that owns the
 * external resource exposes a way to substitute it, so the failover loop,
 * the connect timeout and the connection reuse are all reachable without a
 * live network. Production never passes one; the default constructs the real
 * xrpl.js client, so behaviour is unchanged.
 */
export type XrplClientFactory = (url: string) => Client

const clients = new Map<NetworkId, Client>()

const defaultClientFactory: XrplClientFactory = (url) => new Client(url)

let clientFactory: XrplClientFactory = defaultClientFactory

/** Substitutes the client constructor. Tests only. */
export function setXrplClientFactory(factory: XrplClientFactory): void {
  clientFactory = factory
}

/**
 * Drops every cached connection WITHOUT disconnecting — AD-12's reset.
 * Synchronous and deliberately separate from `disconnectAllClients`, which
 * is the production teardown path (`src/lib/teardown.ts`) and does close the
 * sockets.
 *
 * It deliberately does NOT restore the factory: a test that clears the cache
 * mid-run and forgets to re-install its fake would otherwise construct a real
 * `Client` and block on two live endpoints. Restoring is its own call.
 */
export function resetXrplClients(): void {
  clients.clear()
}

/** Restores the real xrpl.js client constructor. Tests only. */
export function resetXrplClientFactory(): void {
  clientFactory = defaultClientFactory
}

const CONNECT_TIMEOUT_MS = 10_000

async function connectWithTimeout(client: Client): Promise<void> {
  // The timer is cleared once the race settles so a resolved connect does not
  // leave a 10s timer pending behind it.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Returns a connected xrpl.js Client for the given network, reusing a single
 * connection per network across the app rather than opening a new socket
 * per call. Callers should always `await` this before issuing requests.
 *
 * Falls back to the network's backup endpoint if the primary can't be
 * reached, per docs/decisions.md §2 — a single hardcoded endpoint meant any
 * outage of that one host took the whole wallet offline.
 */
export async function getXrplClient(network: NetworkId): Promise<Client> {
  const existing = clients.get(network)
  if (existing?.isConnected()) return existing

  const { wsUrl, wsUrlBackup } = NETWORKS[network]
  let lastError: unknown
  for (const url of [wsUrl, wsUrlBackup]) {
    try {
      const client = clientFactory(url)
      await connectWithTimeout(client)
      clients.set(network, client)
      return client
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(
    `Could not reach the ${NETWORKS[network].label} network (tried ${wsUrl} and ${wsUrlBackup}). Check your connection and try again.`,
    { cause: lastError },
  )
}

export async function disconnectAllClients(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => (c.isConnected() ? c.disconnect() : Promise.resolve())))
  clients.clear()
}
