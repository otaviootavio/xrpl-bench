import { useAccountState } from './useAccountState'
import { useServerReserves } from './useServerReserves'
import { reserveRequirementDrops, spendableAfterReserve } from '@/lib/xrpl/money'
import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * Which of the four things happened, in one word.
 *
 * This hook used to return a bare `{ isLoading, spendableDrops, reservedDrops }`,
 * and three different facts arrived at the consumer as the same pair of nulls:
 * the reads are still in flight, a read *failed*, and the account does not
 * exist yet. A screen cannot report what it cannot distinguish, so Spendable
 * and Reserved simply vanished on a failed reserve read — a balance with no
 * obligation shown against it.
 *
 * - `loading` — at least one read is in flight (or not yet enabled, with no
 *   address to read for). Nothing is known yet; nothing failed.
 * - `unavailable` — a read errored. No figure is returned, *including* when
 *   TanStack has retained an earlier success: a figure derived from a read
 *   that is currently in error is a stale number presented as current
 *   (docs/decisions.md §12 rule 2).
 * - `not-activated` — both reads SUCCEEDED and say this address has no account
 *   on-ledger. A successful read of an absent account, never an error.
 * - `ok` — both figures are present and were read for what is on screen now.
 */
export type SpendableBalanceStatus = 'loading' | 'unavailable' | 'not-activated' | 'ok'

export interface SpendableBalance {
  /** The reason there is, or is not, a figure. Always present: a consumer can
   * never receive no figure and no reason. */
  status: SpendableBalanceStatus
  isLoading: boolean
  /** The reserve read errored. Separate from `accountFailed` so a screen
   * reports each failed read once, where that read's data would have been,
   * rather than one message standing in for both. */
  reserveFailed: boolean
  /** The `account_info` read errored. */
  accountFailed: boolean
  /** Attempt the reserve read again — the reserve query's own `refetch`,
   * handed back as-is, so a screen reporting the failure can carry a retry
   * without reaching for a second copy of the query. */
  retryReserves: () => Promise<unknown>
  spendableDrops: string | null
  reservedDrops: string | null
}

// viewing-balances.md US-2: spendable = balance - base_reserve - (owner_reserve * ownerCount).
// The arithmetic itself lives in money.ts (AD-7); this hook only supplies the inputs.
export function useSpendableBalance(network: NetworkId, address: string | null): SpendableBalance {
  const accountState = useAccountState(network, address)
  const reserves = useServerReserves(network)

  const base = {
    reserveFailed: reserves.isError,
    accountFailed: accountState.isError,
    retryReserves: reserves.refetch,
  }

  // Error first, and before any use of `.data`: both queries keep the previous
  // answer across a failed refetch, so `data` and `isError` are true together
  // on the poll. Falling through to the arithmetic here is what returned a
  // Spendable figure derived from a read that had stopped succeeding.
  if (reserves.isError || accountState.isError) {
    return { ...base, status: 'unavailable', isLoading: false, spendableDrops: null, reservedDrops: null }
  }

  if (!accountState.data || !reserves.data) {
    return {
      ...base,
      status: 'loading',
      isLoading: accountState.isLoading || reserves.isLoading,
      spendableDrops: null,
      reservedDrops: null,
    }
  }

  if (!accountState.data.exists) {
    return { ...base, status: 'not-activated', isLoading: false, spendableDrops: null, reservedDrops: null }
  }

  const reservedDrops = reserveRequirementDrops(
    reserves.data.baseReserveDrops,
    reserves.data.ownerReserveDrops,
    accountState.data.ownerCount,
  )
  const spendableDrops = spendableAfterReserve(accountState.data.balanceDrops, reservedDrops)

  return { ...base, status: 'ok', isLoading: false, spendableDrops, reservedDrops }
}
