import type { QueryClient } from '@tanstack/react-query'
import { fetchAccountState, type AccountState } from './reads'
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
    queryKey: ['accountState', network, address],
    queryFn: () => fetchAccountState(network, address),
    staleTime: 15_000,
  })
}
