import { useQuery } from '@tanstack/react-query'
import { fetchRecommendedFeeDrops } from '@/lib/xrpl/reads'
import { queryKeys } from '@/lib/xrpl/query-keys'
import type { NetworkId } from '@/lib/xrpl/networks'

export function useRecommendedFee(network: NetworkId) {
  return useQuery({
    queryKey: queryKeys.recommendedFee(network),
    queryFn: () => fetchRecommendedFeeDrops(network),
    staleTime: 10_000,
    // Polled, because Send pins this figure as the fee it signs: a figure read
    // once per mount could be minutes old by the time it is confirmed, and a
    // fee above the cap would refuse "until it falls" with nothing re-reading.
    refetchInterval: 10_000,
  })
}
