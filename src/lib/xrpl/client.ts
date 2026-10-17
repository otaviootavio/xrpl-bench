import { Client } from 'xrpl'
import { builtInNodes, canonicalNodeUrl, NETWORKS, type NetworkId } from './networks'
import { isRecord } from './narrow'

/**
 * How a `Client` is obtained for a URL — AD-12: the module that owns the
 * external resource exposes a way to substitute it, so the failover loop,
 * the connect timeout and the connection reuse are all reachable without a
 * live network. Production never passes one; the default constructs the real
 * xrpl.js client, so behaviour is unchanged.
 */
export type XrplClientFactory = (url: string) => Client

/**
 * The pool is keyed by Node (AD-20), not by network: built-in Nodes share one
 * slot per network (their list fails over inside it), a custom Node gets its
 * own slot, so two Wallets on one network with different Nodes never share a
 * socket. The custom slot also carries the network it was proven for, so one
 * URL offered for two networks is two slots, each with its own proof.
 */
type PoolSlot = string

function slotOf(network: NetworkId, node?: string): PoolSlot {
  return node ? `${network}|${node}` : network
}

const clients = new Map<PoolSlot, Client>()

/**
 * One connect attempt per network at a time (story 8.2). Several queries fire
 * at mount and each calls `getXrplClient` before any socket is open; without
 * this, each ran its own failover loop and opened its own socket, and all but
 * the last were dropped while still connected.
 */
const inflight = new Map<PoolSlot, Promise<Client>>()

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
 * Returns a connected xrpl.js Client for the given Wallet's network and Node,
 * reusing a single connection per Node across the app rather than opening a
 * new socket per call. Callers should always `await` this before issuing
 * requests. `node` is a custom Node URL; omitted, the network's built-in Nodes
 * are used.
 *
 * Concurrent callers for the same Node share one connect attempt. A failed
 * attempt is forgotten, so the next call runs afresh. A custom Node that fails
 * its network-id check rejects here and nothing is cached or requested.
 */
export function getXrplClient(network: NetworkId, rawNode?: string): Promise<Client> {
  const node = rawNode ? canonicalNodeUrl(rawNode) : undefined
  if (rawNode && !node) return Promise.reject(new Error(INVALID_NODE_MESSAGE))
  const slot = slotOf(network, node ?? undefined)
  const existing = clients.get(slot)
  if (existing?.isConnected()) return Promise.resolve(existing)

  const pending = inflight.get(slot)
  if (pending) return pending

  const attempt = node ? connectCustomNode(network, node) : connectNetwork(network)
  inflight.set(slot, attempt)
  // Identity check: after `resetXrplClients` a newer attempt may own the slot,
  // and an older attempt settling must not evict it.
  const forget = () => {
    if (inflight.get(slot) === attempt) inflight.delete(slot)
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
export async function holdXrplClient(network: NetworkId, node?: string): Promise<{ client: Client; release: () => void }> {
  const client = await getXrplClient(network, node)
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
 * Closes a cached client the pool is about to replace (see `connectNetwork`'s
 * note on xrpl.js's own reconnect). A client a write still holds is closed by
 * the last release instead.
 */
function retire(slot: PoolSlot): void {
  const replaced = clients.get(slot)
  if (!replaced) return
  clients.delete(slot)
  if (holds.has(replaced)) abandonOnRelease.add(replaced)
  else abandon(replaced)
}

/**
 * Falls back to the network's backup endpoint if the primary can't be
 * reached — a single hardcoded endpoint meant any outage of that one host took
 * the whole wallet offline. Built-in Nodes only (AD-20): they were verified
 * live (check-rules.md), so no `server_info` proof is asked of them.
 */
async function connectNetwork(network: NetworkId): Promise<Client> {
  const startedIn = generation

  // A cached client that is no longer connected is about to be replaced.
  // Close it first: xrpl.js schedules its own reconnect after an unexpected
  // close, so an overwritten entry would reconnect into a socket nobody holds.
  retire(network)

  const urls = builtInNodes(network)
  let lastError: unknown
  for (const url of urls) {
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
    `Could not reach the ${NETWORKS[network].label} network (tried ${urls.join(' and ')}). Check your connection and try again.`,
    { cause: lastError },
  )
}

/** Why a Node may not serve a network, as a plain sentence — or null when it
 * may. Mainnet accepts a Node that states no `network_id`; no other network
 * does (AD-20, confirmed 2026-10-11). */
function networkIdProblem(network: NetworkId, reported: unknown): string | null {
  const { networkId, label } = NETWORKS[network]
  if (typeof reported !== 'number' && reported !== undefined && reported !== null) {
    return 'This Node reported an unreadable network id, so it was not trusted.'
  }
  if (reported === undefined || reported === null) {
    return network === 'mainnet'
      ? null
      : `This Node did not state which network it serves, so it cannot be used for ${label}.`
  }
  if (reported === networkId) return null
  const other = (Object.values(NETWORKS) as (typeof NETWORKS)[NetworkId][]).find((n) => n.networkId === reported)
  const named = other ? `${other.label} (network id ${String(reported)})` : `network id ${String(reported)}`
  return `This Node serves ${named}, but this Wallet is on ${label} (network id ${networkId}).`
}

/** Asks a connected client which network it serves and throws the reason if it
 * is not `network`. */
async function assertServesNetwork(client: Client, network: NetworkId): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let reported: unknown
  try {
    const res = await Promise.race([
      client.request({ command: 'server_info' }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Node did not answer server_info in time')), CONNECT_TIMEOUT_MS)
      }),
    ])
    const info: unknown = isRecord(res) && isRecord(res.result) ? res.result.info : undefined
    reported = isRecord(info) ? info.network_id : undefined
  } catch (err) {
    throw new Error('This Node connected but could not report its network, so it was not trusted.', { cause: err })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  const problem = networkIdProblem(network, reported)
  if (problem) throw new Error(problem)
}

const INVALID_NODE_MESSAGE =
  'A custom Node must be a secure WebSocket address starting with wss://, with no username, password, query or fragment.'

/** The canonical form of a candidate Node, or throws a message that does not
 * echo the input (it may carry a secret). */
function requireNode(node: string): string {
  const canonical = canonicalNodeUrl(node)
  if (!canonical) throw new Error(INVALID_NODE_MESSAGE)
  return canonical
}

/**
 * Closes and drops a custom Node's pooled socket — called when a Wallet's Node
 * is changed or cleared, so the old Node stops being held open. A write still
 * holding it closes it on release. A no-op for an unknown or built-in Node.
 */
export function retireNode(network: NetworkId, node: string): void {
  const canonical = canonicalNodeUrl(node)
  if (!canonical) return
  const slot = slotOf(network, canonical)
  inflight.delete(slot)
  retire(slot)
}

/**
 * Connects a user-declared Node. No failover (a custom Node has none), and the
 * Node is trusted only once `server_info` reports the chosen network's id —
 * checked on EVERY connect, not just when it was saved, because a Node can be
 * repointed afterwards. A failed check closes the client and caches nothing,
 * so no read can be issued through it.
 */
async function connectCustomNode(network: NetworkId, node: string): Promise<Client> {
  const startedIn = generation
  const slot = slotOf(network, node)
  retire(slot)
  const client = clientFactory(node)
  try {
    await connectWithTimeout(client)
  } catch (err) {
    abandon(client)
    throw new Error(`Could not reach your Node ${node}. Check the address and your connection.`, { cause: err })
  }
  try {
    await assertServesNetwork(client, network)
  } catch (err) {
    abandon(client)
    throw err
  }
  if (generation !== startedIn) {
    // `resetXrplClients` ran mid-connect: this client belongs to no pool and no
    // holder, so it is closed rather than left open, and the caller retries.
    abandon(client)
    throw new Error('The connection attempt was reset before it finished. Try again.')
  }
  clients.set(slot, client)
  return client
}

/**
 * Proves a candidate custom Node before it is stored (AD-20): `wss://`,
 * reachable, and reporting `network`'s id. Resolves on acceptance; throws the
 * plain reason otherwise. The probe client is always closed and never pooled,
 * so a rejected Node leaves nothing behind.
 */
export async function verifyNode(network: NetworkId, rawNode: string): Promise<void> {
  const node = requireNode(rawNode)
  const client = clientFactory(node)
  try {
    try {
      await connectWithTimeout(client)
    } catch (err) {
      throw new Error(`Could not reach ${node}. Check the address and your connection.`, { cause: err })
    }
    await assertServesNetwork(client, network)
  } finally {
    abandon(client)
  }
}

export async function disconnectAllClients(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => (c.isConnected() ? c.disconnect() : Promise.resolve())))
  clients.clear()
}
