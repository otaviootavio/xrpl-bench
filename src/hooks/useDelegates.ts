import { useQuery } from '@tanstack/react-query'
import { fetchAccountDelegates } from '@/lib/xrpl/reads'
import { queryKeys } from '@/lib/xrpl/query-keys'
import type { NetworkId } from '@/lib/xrpl/networks'

/** The Account's delegates (OS-FR-22). Keyed on network and address like every
 * account-scoped read; nothing is read without an address. */
export function useDelegates(network: NetworkId, address: string | null, node?: string) {
  return useQuery({
    queryKey: queryKeys.delegates(network, address),
    queryFn: () => fetchAccountDelegates(network, address as string, node),
    enabled: !!address,
    refetchInterval: 15_000,
  })
}
