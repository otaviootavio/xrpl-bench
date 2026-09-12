import { useQuery } from '@tanstack/react-query'
import { fetchServerReserves } from '@/lib/xrpl/reads'
import { queryKeys } from '@/lib/xrpl/query-keys'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useServerReserves(network: NetworkId) {
  return useQuery({
    queryKey: queryKeys.serverReserves(network),
    queryFn: () => fetchServerReserves(network),
    staleTime: 60_000,
  })
}
