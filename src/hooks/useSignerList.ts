import { useQuery } from '@tanstack/react-query'
import { fetchSignerList } from '@/lib/xrpl/reads'
import { queryKeys } from '@/lib/xrpl/query-keys'
import type { NetworkId } from '@/lib/xrpl/networks'

/** The Account's signer list (OS-FR-21 key state). Keyed on network and address like
 * every account-scoped read; nothing is read without an address. */
export function useSignerList(network: NetworkId, address: string | null, node?: string) {
  return useQuery({
    queryKey: queryKeys.signerList(network, address),
    queryFn: () => fetchSignerList(network, address as string, node),
    enabled: !!address,
    refetchInterval: 15_000,
  })
}
