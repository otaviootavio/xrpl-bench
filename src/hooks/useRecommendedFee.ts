import { useQuery } from '@tanstack/react-query'
import { fetchRecommendedFeeDrops } from '@/lib/xrpl/reads'
import { queryKeys } from '@/lib/xrpl/query-keys'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useRecommendedFee(network: NetworkId) {
  return useQuery({
    queryKey: queryKeys.recommendedFee(network),
    queryFn: () => fetchRecommendedFeeDrops(network),
    staleTime: 10_000,
  })
}
