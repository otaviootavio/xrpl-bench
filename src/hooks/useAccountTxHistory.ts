import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchAccountTx } from '@/lib/xrpl/reads'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useAccountTxHistory(network: NetworkId, address: string | null) {
  return useInfiniteQuery({
    queryKey: ['accountTx', network, address],
    queryFn: ({ pageParam }) => fetchAccountTx(network, address as string, pageParam),
    initialPageParam: undefined as unknown,
    getNextPageParam: (lastPage) => lastPage.marker,
    enabled: !!address,
  })
}
