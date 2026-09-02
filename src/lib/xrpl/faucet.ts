import { NETWORKS, type NetworkId } from './networks'

export interface FaucetResult {
  /** Kept as a string — money never passes through a JS number, even for a
   * display-only faucet confirmation (guardrail #4). */
  amountXrp: string
  transactionHash?: string
}

/** Testnet-only funding via the public faucet — see network-selection.md
 * US-2. Verified live 2026-08-31: funds an EXISTING destination address
 * (no seed generated/returned) via POST {"destination": address}. */
export async function requestTestnetFunds(network: NetworkId, address: string): Promise<FaucetResult> {
  const { faucetUrl } = NETWORKS[network]
  if (!faucetUrl) {
    throw new Error('This network has no faucet. Fund this account with real XRP from an exchange or another wallet.')
  }
  const res = await fetch(faucetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: address }),
  })
  if (!res.ok) {
    throw new Error(`Faucet request failed (${res.status}). It may be rate-limited — try again shortly.`)
  }
  const data = await res.json()
  return { amountXrp: String(data.amount ?? ''), transactionHash: data.transactionHash }
}
