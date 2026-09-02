import { useQuery } from '@tanstack/react-query'
import { isValidClassicAddress } from 'xrpl'
import { fetchAccountState, fetchAccountLines } from '@/lib/xrpl/reads'
import type { NetworkId } from '@/lib/xrpl/networks'

export interface DestinationInfo {
  exists: boolean
  requireDestTag: boolean
  /** Whether the destination can actually receive the selected issued
   * currency (i.e. already has a trust line to that issuer). Undefined when
   * sending XRP, where no trust line is involved. */
  hasTrustLine?: boolean
}

/**
 * Looks up everything the Send form needs to know about a destination.
 *
 * This is a TanStack Query hook rather than a fetch inside the destination
 * field's onBlur handler: docs/decisions.md §4 bans calling the XRPL client's
 * read methods directly from a `useEffect` OR an event handler, and the
 * handler version had no retry/backoff and no cache reuse.
 */
export function useDestinationInfo(
  network: NetworkId,
  destination: string,
  asset: string, // 'XRP' or `${currency}|${issuer}`
) {
  const valid = isValidClassicAddress(destination)
  return useQuery<DestinationInfo>({
    queryKey: ['destinationInfo', network, destination, asset],
    enabled: valid,
    staleTime: 30_000,
    queryFn: async () => {
      const state = await fetchAccountState(network, destination)
      const info: DestinationInfo = { exists: state.exists, requireDestTag: state.requireDestTag }
      if (asset !== 'XRP' && state.exists) {
        const [currency, issuer] = asset.split('|')
        const lines = await fetchAccountLines(network, destination)
        info.hasTrustLine = lines.some((l) => l.currency === currency && l.account === issuer)
      }
      return info
    },
  })
}
