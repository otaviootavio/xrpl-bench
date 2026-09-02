import { Client } from 'xrpl'
import { NETWORKS, type NetworkId } from './networks'

const clients = new Map<NetworkId, Client>()

const CONNECT_TIMEOUT_MS = 10_000

async function connectWithTimeout(client: Client): Promise<void> {
  await Promise.race([
    client.connect(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)),
  ])
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
      const client = new Client(url)
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
