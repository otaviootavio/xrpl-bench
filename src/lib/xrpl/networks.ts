export type NetworkId = 'mainnet' | 'testnet'

/** Display order for the range selector; also the single source of truth for
 * which networks exist. */
export const NETWORK_IDS = ['mainnet', 'testnet'] as const satisfies readonly NetworkId[]

export interface NetworkConfig {
  id: NetworkId
  label: string
  wsUrl: string
  /** Hardcoded backup endpoint used when the primary can't be reached —
   * docs/decisions.md §2: "one hardcoded public endpoint per network plus one
   * hardcoded backup for failover; no user-editable custom endpoint yet." */
  wsUrlBackup: string
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
    wsUrl: 'wss://xrplcluster.com',
    wsUrlBackup: 'wss://s1.ripple.com',
    rpcUrl: 'https://xrplcluster.com',
    explorerBaseUrl: 'https://livenet.xrpl.org',
    faucetUrl: null,
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    wsUrl: 'wss://s.altnet.rippletest.net:51233',
    wsUrlBackup: 'wss://testnet.xrpl-labs.com',
    rpcUrl: 'https://s.altnet.rippletest.net:51234',
    explorerBaseUrl: 'https://testnet.xrpl.org',
    faucetUrl: 'https://faucet.altnet.rippletest.net/accounts',
  },
}

export function accountExplorerUrl(network: NetworkId, address: string): string {
  return `${NETWORKS[network].explorerBaseUrl}/accounts/${address}`
}

export function txExplorerUrl(network: NetworkId, hash: string): string {
  return `${NETWORKS[network].explorerBaseUrl}/transactions/${hash}`
}
