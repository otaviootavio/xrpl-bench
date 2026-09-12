/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSpendableBalance } from '@/hooks/useSpendableBalance'

/**
 * The spendable rule now lives in `money.ts`, but the hook still decides which
 * figure goes into which parameter — and `reserveRequirementDrops` takes two
 * same-typed drops strings, so swapping the base reserve for the owner reserve
 * typechecks, passes every money test, and quietly doubles the reserve on
 * Balances, Send and Trust Lines. Only an assertion on the exact strings this
 * hook returns for a known account can see that.
 *
 * The two source hooks are mocked: this is about the composition, not about
 * what the ledger says.
 */
const accountState: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: false }
const reserves: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: false }

vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => accountState }))
vi.mock('@/hooks/useServerReserves', () => ({ useServerReserves: () => reserves }))

function given(account: Record<string, unknown> | undefined, reserveData: Record<string, unknown> | undefined) {
  accountState.data = account
  reserves.data = reserveData
  return renderHook(() => useSpendableBalance('mainnet', 'rSpendable')).result.current
}

// A funded account with three owned objects, at the real 2026 reserve figures:
// base 1 XRP, owner 0.2 XRP. Reserve = 1 + 3 x 0.2 = 1.6 XRP; balance 25 XRP.
const ACCOUNT = { exists: true, balanceDrops: '25000000', ownerCount: 3 }
const RESERVES = { baseReserveDrops: '1000000', ownerReserveDrops: '200000' }

describe('useSpendableBalance — which figure goes where', () => {
  it('reserves base + owner x count, and spends the rest, to the drop', () => {
    const result = given(ACCOUNT, RESERVES)
    // Swapping the base and owner reserves would give '3200000' / '21800000'.
    expect(result.reservedDrops).toBe('1600000')
    expect(result.spendableDrops).toBe('23400000')
    expect(result.isLoading).toBe(false)
  })

  it('reserves only the base reserve when nothing is owned', () => {
    const result = given({ ...ACCOUNT, ownerCount: 0 }, RESERVES)
    expect(result.reservedDrops).toBe('1000000')
    expect(result.spendableDrops).toBe('24000000')
  })

  it('clamps to zero, never a negative string, when the balance is below the reserve', () => {
    const result = given({ ...ACCOUNT, balanceDrops: '900000' }, RESERVES)
    expect(result.reservedDrops).toBe('1600000')
    expect(result.spendableDrops).toBe('0')
  })

  it('produces no figure at all for an account that does not exist', () => {
    const result = given({ exists: false, balanceDrops: '0', ownerCount: 0 }, RESERVES)
    expect(result.spendableDrops).toBeNull()
    expect(result.reservedDrops).toBeNull()
  })

  it('produces no figure before the reserves have loaded', () => {
    const result = given(ACCOUNT, undefined)
    expect(result.spendableDrops).toBeNull()
  })
})
