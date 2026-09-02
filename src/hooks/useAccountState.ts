import { useQuery } from '@tanstack/react-query'
import { fetchAccountState } from '@/lib/xrpl/reads'
import type { NetworkId } from '@/lib/xrpl/networks'

// Every query key includes network + address — the single-source-of-truth
// guardrail from docs/decisions.md: switching either can never leave stale
// cross-wallet/cross-network data on screen, because the key itself changes.
export function useAccountState(network: NetworkId, address: string | null) {
  return useQuery({
    queryKey: ['accountState', network, address],
    queryFn: () => fetchAccountState(network, address as string),
    enabled: !!address,
    refetchInterval: 15_000,
  })
}
