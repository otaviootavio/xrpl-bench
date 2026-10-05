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

/**
 * One connect attempt per network at a time (story 8.2). Several queries fire
 * at mount and each calls `getXrplClient` before any socket is open; without
 * this, each ran its own failover loop and opened its own socket, and all but
 * the last were dropped while still connected.
 */
const inflight = new Map<NetworkId, Promise<Client>>()

/**
 * Clients a write is still using, by how many writes hold each. `submitAndWait`
 * polls the ledger on the client it was given for as long as the transaction is
 * pending, and after a dropped socket it relies on xrpl.js reconnecting THAT
 * client. Replacing it in the cache must therefore not close it while a write
 * holds it; the close is deferred to the last release instead.
 */
const holds = new Map<Client, number>()

/** Clients replaced in the cache while held — closed by the last release. */
const abandonOnRelease = new Set<Client>()

/** Bumped by `resetXrplClients`, so an attempt it forgot cannot write the cache. */
let generation = 0

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
 * sockets. It must not gain a disconnect (Epic 8's non-goal).
 *
 * It also forgets any connect attempt still in flight, so an attempt one test
 * left hanging is never handed to the next. A forgotten attempt still settles
 * for its own callers, but never writes to the cache.
 *
 * It deliberately does NOT restore the factory: a test that clears the cache
 * mid-run and forgets to re-install its fake would otherwise construct a real
 * `Client` and block on two live endpoints. Restoring is its own call.
 */
export function resetXrplClients(): void {
  clients.clear()
  inflight.clear()
  holds.clear()
  abandonOnRelease.clear()
  generation += 1
}

/** Restores the real xrpl.js client constructor. Tests only. */
export function resetXrplClientFactory(): void {
  clientFactory = defaultClientFactory
}

const CONNECT_TIMEOUT_MS = 10_000

/**
 * Closes a client the app has stopped using (story 8.1). Never awaited and
 * never throws: xrpl.js's `disconnect()` on a socket still CONNECTING waits for
 * a `close` event whose listener a failed connect may already have removed, so
 * awaiting it could hang the failover loop — and a client being abandoned has
 * nothing left to report.
 */
function abandon(client: Client): void {
  Promise.resolve()
    .then(() => client.disconnect())
    .catch(() => {})
}

async function connectWithTimeout(client: Client): Promise<void> {
  // The timer is cleared once the race settles so a resolved connect does not
  // leave a 10s timer pending behind it.
  let timer: ReturnType<typeof setTimeout> | undefined
  const connecting = Promise.resolve().then(() => client.connect())
  try {
    await Promise.race([
      connecting,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    // The timeout won the race, or the connect itself failed: close what was
    // started rather than leave it unreferenced. A connect that lost to the
    // timeout can still open later — close it again then, so no socket opens
    // that belongs to nobody. The rejection handler keeps a late failure from
    // surfacing as an unhandled rejection.
    abandon(client)
    connecting.then(
      () => abandon(client),
      () => {},
    )
    throw err
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Returns a connected xrpl.js Client for the given network, reusing a single
 * connection per network across the app rather than opening a new socket
 * per call. Callers should always `await` this before issuing requests.
 *
 * Concurrent callers for the same network share one connect attempt. A failed
 * attempt is forgotten, so the next call runs the failover loop afresh.
 */
export function getXrplClient(network: NetworkId): Promise<Client> {
  const existing = clients.get(network)
  if (existing?.isConnected()) return Promise.resolve(existing)

  const pending = inflight.get(network)
  if (pending) return pending

  const attempt = connectNetwork(network)
  inflight.set(network, attempt)
  // Identity check: after `resetXrplClients` a newer attempt may own the slot,
  // and an older attempt settling must not evict it.
  const forget = () => {
    if (inflight.get(network) === attempt) inflight.delete(network)
  }
  attempt.then(forget, forget)
  return attempt
}

/**
 * Like `getXrplClient`, but the client is held until `release` is called: if a
 * later read replaces it in the cache meanwhile (it dropped, so it reports not
 * connected), it is left to xrpl.js's own reconnect rather than closed, and is
 * closed only once the last holder releases it. For a caller that keeps using
 * one client across awaits — a write waiting for validation.
 */
export async function holdXrplClient(network: NetworkId): Promise<{ client: Client; release: () => void }> {
  const client = await getXrplClient(network)
  holds.set(client, (holds.get(client) ?? 0) + 1)
  let released = false
  const release = () => {
    if (released) return
    released = true
    const remaining = (holds.get(client) ?? 1) - 1
    if (remaining > 0) {
      holds.set(client, remaining)
      return
    }
    holds.delete(client)
    if (abandonOnRelease.delete(client)) abandon(client)
  }
  return { client, release }
}

/**
 * Falls back to the network's backup endpoint if the primary can't be
 * reached, per docs/decisions.md §2 — a single hardcoded endpoint meant any
 * outage of that one host took the whole wallet offline.
 */
async function connectNetwork(network: NetworkId): Promise<Client> {
  const startedIn = generation

  // A cached client that is no longer connected is about to be replaced.
  // Close it first: xrpl.js schedules its own reconnect after an unexpected
  // close, so an overwritten entry would reconnect into a socket nobody holds.
  // A client a write still holds is the exception: that write is waiting on
  // the very reconnect a close would cancel, so its close waits for the release.
  const replaced = clients.get(network)
  if (replaced) {
    clients.delete(network)
    if (holds.has(replaced)) abandonOnRelease.add(replaced)
    else abandon(replaced)
  }

  const { wsUrl, wsUrlBackup } = NETWORKS[network]
  let lastError: unknown
  for (const url of [wsUrl, wsUrlBackup]) {
    try {
      const client = clientFactory(url)
      await connectWithTimeout(client)
      if (generation === startedIn) clients.set(network, client)
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
