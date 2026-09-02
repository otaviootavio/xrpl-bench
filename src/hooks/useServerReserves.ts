import { useQuery } from '@tanstack/react-query'
import { fetchServerReserves } from '@/lib/xrpl/reads'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useServerReserves(network: NetworkId) {
  return useQuery({
    queryKey: ['serverReserves', network],
    queryFn: () => fetchServerReserves(network),
    staleTime: 60_000,
  })
}
