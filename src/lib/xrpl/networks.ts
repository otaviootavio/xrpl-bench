export type NetworkId = 'mainnet' | 'testnet' | 'devnet'

/** Display order for the range selector; also the single source of truth for
 * which networks exist. */
export const NETWORK_IDS = ['mainnet', 'testnet', 'devnet'] as const satisfies readonly NetworkId[]

export interface NetworkConfig {
  id: NetworkId
  label: string
  /** The `network_id` a Node of this network reports in `server_info` (AD-20). */
  networkId: number
  wsUrl: string
  /** Hardcoded backup endpoint used when the primary can't be reached.
   * Failover happens only inside a network's built-in list (AD-20); Devnet has
   * no backup. */
  wsUrlBackup: string | null
  rpcUrl: string
  explorerBaseUrl: string
  faucetUrl: string | null
}

// Endpoints and explorer/faucet URL patterns verified live against the
// public XRPL testnet and xrpl.org explorer on 2026-08-31 — see
// docs/user-stories/network-selection.md and block-explorer-links.md.
export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    networkId: 0,
    wsUrl: 'wss://xrplcluster.com',
    wsUrlBackup: 'wss://s1.ripple.com',
    rpcUrl: 'https://xrplcluster.com',
    explorerBaseUrl: 'https://livenet.xrpl.org',
    faucetUrl: null,
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    networkId: 1,
    wsUrl: 'wss://s.altnet.rippletest.net:51233',
    wsUrlBackup: 'wss://testnet.xrpl-labs.com',
    rpcUrl: 'https://s.altnet.rippletest.net:51234',
    explorerBaseUrl: 'https://testnet.xrpl.org',
    faucetUrl: 'https://faucet.altnet.rippletest.net/accounts',
  },
  devnet: {
    id: 'devnet',
    label: 'Devnet',
    networkId: 2,
    wsUrl: 'wss://s.devnet.rippletest.net:51233',
    wsUrlBackup: null,
    rpcUrl: 'https://s.devnet.rippletest.net:51234',
    explorerBaseUrl: 'https://devnet.xrpl.org',
    faucetUrl: 'https://faucet.devnet.rippletest.net/accounts',
  },
}

/** Narrows an untrusted value (persisted state) to a network this build knows. */
export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === 'string' && (NETWORK_IDS as readonly string[]).includes(value)
}

/**
 * The one validator and canonicaliser for a custom Node URL (AD-20). Returns
 * `wss://host[:port][/path]` or null. Rejects anything that is not `wss:`
 * (case-insensitive scheme), and anything that can carry a secret — userinfo,
 * a query or a fragment — because a Node URL is persisted, shown and put in
 * error messages. The default port and a trailing slash are normalised away so
 * one Node is one pool slot and one stored string.
 */
export function canonicalNodeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'wss:' || u.username || u.password || u.search || u.hash || !u.hostname) return null
  return `wss://${u.host}${u.pathname.replace(/\/+$/, '')}`
}

/** A network's built-in Nodes, default first (FR-60). Failover is over this
 * list and nothing else. */
export function builtInNodes(network: NetworkId): string[] {
  const { wsUrl, wsUrlBackup } = NETWORKS[network]
  return wsUrlBackup ? [wsUrl, wsUrlBackup] : [wsUrl]
}

export function accountExplorerUrl(network: NetworkId, address: string): string {
  return `${NETWORKS[network].explorerBaseUrl}/accounts/${address}`
}

export function txExplorerUrl(network: NetworkId, hash: string): string {
  return `${NETWORKS[network].explorerBaseUrl}/transactions/${hash}`
}
