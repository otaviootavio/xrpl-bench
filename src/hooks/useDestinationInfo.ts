import { useQuery } from '@tanstack/react-query'
import { isValidClassicAddress } from 'xrpl'
import { destinationInfoQueryOptions, type DestinationInfo } from '@/lib/xrpl/query-reads'
import type { NetworkId } from '@/lib/xrpl/networks'

export type { DestinationInfo }

/**
 * Looks up everything the Send form needs to know about a destination.
 *
 * This is a TanStack Query hook rather than a fetch inside the destination
 * field's onBlur handler: docs/decisions.md §4 bans calling the XRPL client's
 * read methods directly from a `useEffect` OR an event handler, and the
 * handler version had no retry/backoff and no cache reuse.
 *
 * The key, the freshness window and the `queryFn` all come from
 * `destinationInfoQueryOptions` in `lib/xrpl/query-reads.ts`, which the submit
 * path's one-shot probe also builds from — so the read that displays the check
 * and the read that authorises the payment cannot drift apart. They live in
 * `lib` rather than here because dependencies point one way (AD-1): `lib` may
 * not import from a hook.
 */
export function useDestinationInfo(
  network: NetworkId,
  destination: string,
  asset: string, // 'XRP' or `${currency}|${issuer}`
) {
  const valid = isValidClassicAddress(destination)
  return useQuery<DestinationInfo>({
    ...destinationInfoQueryOptions(network, destination, asset),
    enabled: valid,
  })
}
