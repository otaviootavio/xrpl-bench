import { useQuery } from '@tanstack/react-query'
import { fetchRecommendedFeeDrops } from '@/lib/xrpl/reads'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useRecommendedFee(network: NetworkId) {
  return useQuery({
    queryKey: ['fee', network],
    queryFn: () => fetchRecommendedFeeDrops(network),
    staleTime: 10_000,
  })
}
