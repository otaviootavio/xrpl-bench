import { useAccountState } from './useAccountState'
import { useServerReserves } from './useServerReserves'
import { subtractDrops, multiplyDropsByCount } from '@/lib/xrpl/money'
import type { NetworkId } from '@/lib/xrpl/networks'

// viewing-balances.md US-2: spendable = balance - base_reserve - (owner_reserve * ownerCount)
export function useSpendableBalance(network: NetworkId, address: string | null) {
  const accountState = useAccountState(network, address)
  const reserves = useServerReserves(network)

  if (!accountState.data || !reserves.data || !accountState.data.exists) {
    return { isLoading: accountState.isLoading || reserves.isLoading, spendableDrops: null, reservedDrops: null }
  }

  const reservedDrops = (
    BigInt(reserves.data.baseReserveDrops) + BigInt(multiplyDropsByCount(reserves.data.ownerReserveDrops, accountState.data.ownerCount))
  ).toString()
  const spendableRaw = subtractDrops(accountState.data.balanceDrops, reservedDrops)
  const spendableDrops = BigInt(spendableRaw) > 0n ? spendableRaw : '0'

  return { isLoading: false, spendableDrops, reservedDrops }
}
