import { useQuery } from '@tanstack/react-query'
import { fetchAccountLines } from '@/lib/xrpl/reads'
import { queryKeys } from '@/lib/xrpl/query-keys'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useTrustLines(network: NetworkId, address: string | null, node?: string) {
  return useQuery({
    queryKey: queryKeys.trustLines(network, address),
    queryFn: () => fetchAccountLines(network, address as string, node),
    enabled: !!address,
    refetchInterval: 15_000,
  })
}
