import type { QueryClient } from '@tanstack/react-query'
import { fetchAccountState, fetchAccountLines, type AccountState } from './reads'
import { queryKeys } from './query-keys'
import type { NetworkId } from './networks'

/**
 * Imperative, one-shot account lookup for pre-flight checks inside a submit
 * handler (e.g. the disabled-master-key probe before completing an import).
 *
 * Goes through `queryClient.fetchQuery` rather than calling the XRPL client
 * directly, so it still gets the retry policy and cache reuse that
 * docs/decisions.md guardrail #1 exists to guarantee — and shares the exact
 * cache entry that `useAccountState` uses, so the probe and the UI can never
 * disagree about the same account.
 */
export function fetchAccountStateOnce(
  queryClient: QueryClient,
  network: NetworkId,
  address: string,
): Promise<AccountState> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.accountState(network, address),
    queryFn: () => fetchAccountState(network, address),
    staleTime: 15_000,
  })
}

/**
 * How long a successful destination check stays permission to send.
 *
 * Named here rather than written as a bare `staleTime`, because the two
 * questions are different: staleness decides when a cache entry may be
 * refetched, and this decides whether a read still authorises a payment.
 *
 * Three sites read this one constant, which is what keeps them aligned: the
 * form derives expiry from `dataUpdatedAt` plus it, the probe below is given it
 * as `staleTime`, and `destinationInfoQueryOptions` hands it to the hook. Note
 * `staleTime` alone would not do that job — it decides refetch eligibility, and
 * TanStack keeps serving data past it; the form's expiry is computed separately.
 *
 * The consequence of the sharing is that retuning cache behaviour for this read
 * IS retuning the window in which a tagless payment can go to an address that
 * began requiring a tag: change it for one reason and you have changed it for
 * the other (docs/decisions.md §12).
 */
export const DESTINATION_CHECK_FRESHNESS_MS = 30_000

/** Everything the Send form needs to know about a destination, together with
 * the exact `(network, destination, asset)` triple the answer was read for.
 *
 * The triple is part of the payload rather than implied by the cache key
 * because a component holds the *previous* answer while a new key's read is in
 * flight, and holds it again when a refetch errors. Without the triple there is
 * no way to ask "did this answer come from the input on screen now?", and the
 * send guard was satisfied by answers about a different address or a different
 * asset. */
export interface DestinationInfo {
  network: NetworkId
  destination: string
  asset: string
  exists: boolean
  requireDestTag: boolean
  /** Whether the destination can actually receive the selected issued
   * currency (i.e. already has a trust line to that issuer). Undefined when
   * sending XRP, where no trust line is involved. */
  hasTrustLine?: boolean
}

/**
 * The one definition of the destination-check read: key, freshness and
 * `queryFn` together.
 *
 * `useDestinationInfo` and the submit-path probe below both build from this, so
 * the answer the form displays and the answer that authorises the payment
 * cannot come from differently-configured reads.
 */
export function destinationInfoQueryOptions(network: NetworkId, destination: string, asset: string) {
  return {
    queryKey: queryKeys.destinationInfo(network, destination, asset),
    staleTime: DESTINATION_CHECK_FRESHNESS_MS,
    queryFn: async (): Promise<DestinationInfo> => {
      const state = await fetchAccountState(network, destination)
      const info: DestinationInfo = {
        network,
        destination,
        asset,
        exists: state.exists,
        requireDestTag: state.requireDestTag,
      }
      if (asset !== 'XRP' && state.exists) {
        const [currency, issuer] = asset.split('|')
        const lines = await fetchAccountLines(network, destination)
        info.hasTrustLine = lines.some((l) => l.currency === currency && l.account === issuer)
      }
      return info
    },
  }
}

/**
 * Imperative, one-shot destination check for the send submit path.
 *
 * The same `fetchAccountStateOnce` idiom and the same reason (§5.4): it runs at
 * submit time and must block, but still goes through the cache entry the form's
 * own hook uses, so the probe and the displayed check can never disagree.
 *
 * `staleTime` is the freshness window, so a cached answer younger than the
 * window satisfies it and anything older forces a real read. The call sits
 * *after* the unlock, which can take seconds — that gap is precisely where a
 * check can age out from under an operator who is still looking at a form that
 * said the address was safe.
 */
export function fetchDestinationInfoOnce(
  queryClient: QueryClient,
  network: NetworkId,
  destination: string,
  asset: string,
): Promise<DestinationInfo> {
  // The key is `queryKeys.destinationInfo(...)` by construction, since the
  // options come from the one definition above (§5.4).
  return queryClient.fetchQuery(destinationInfoQueryOptions(network, destination, asset))
}
