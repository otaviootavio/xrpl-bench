import { useQuery } from '@tanstack/react-query'
import { fetchAccountLines } from '@/lib/xrpl/reads'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useTrustLines(network: NetworkId, address: string | null) {
  return useQuery({
    queryKey: ['trustLines', network, address],
    queryFn: () => fetchAccountLines(network, address as string),
    enabled: !!address,
    refetchInterval: 15_000,
  })
}
