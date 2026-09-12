import { useAccountState } from './useAccountState'
import { useServerReserves } from './useServerReserves'
import { reserveRequirementDrops, spendableAfterReserve } from '@/lib/xrpl/money'
import type { NetworkId } from '@/lib/xrpl/networks'

// viewing-balances.md US-2: spendable = balance - base_reserve - (owner_reserve * ownerCount).
// The arithmetic itself lives in money.ts (AD-7); this hook only supplies the inputs.
export function useSpendableBalance(network: NetworkId, address: string | null) {
  const accountState = useAccountState(network, address)
  const reserves = useServerReserves(network)

  if (!accountState.data || !reserves.data || !accountState.data.exists) {
    return { isLoading: accountState.isLoading || reserves.isLoading, spendableDrops: null, reservedDrops: null }
  }

  const reservedDrops = reserveRequirementDrops(
    reserves.data.baseReserveDrops,
    reserves.data.ownerReserveDrops,
    accountState.data.ownerCount,
  )
  const spendableDrops = spendableAfterReserve(accountState.data.balanceDrops, reservedDrops)

  return { isLoading: false, spendableDrops, reservedDrops }
}
