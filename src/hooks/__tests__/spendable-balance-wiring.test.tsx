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
type Fixture = { data: unknown; isLoading: boolean; isError: boolean; refetch: () => Promise<unknown> }
const accountState: Fixture = { data: undefined, isLoading: false, isError: false, refetch: vi.fn(async () => ({})) }
const reserves: Fixture = { data: undefined, isLoading: false, isError: false, refetch: vi.fn(async () => ({})) }

vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => accountState }))
vi.mock('@/hooks/useServerReserves', () => ({ useServerReserves: () => reserves }))

function given(
  account: Record<string, unknown> | undefined,
  reserveData: Record<string, unknown> | undefined,
  errors: { account?: boolean; reserve?: boolean } = {},
) {
  accountState.data = account
  reserves.data = reserveData
  accountState.isError = errors.account ?? false
  reserves.isError = errors.reserve ?? false
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

/**
 * Story 5.2. The hook used to answer three different facts with the same pair
 * of nulls, so no consumer could report any of them: `!reserves.data` collapsed
 * a *failed* read into "nothing yet", and a failed read that still held an
 * earlier answer skipped that gate entirely and computed a Spendable figure
 * from a read that was in error at that moment. These pin the word, not just
 * the nulls — the word is what a screen has to report.
 */
describe('useSpendableBalance — which of the four outcomes happened', () => {
  it('says ok, with figures, when both reads succeeded', () => {
    expect(given(ACCOUNT, RESERVES).status).toBe('ok')
  })

  it('says loading, not failed, while a read is in flight', () => {
    const result = given(ACCOUNT, undefined)
    expect(result.status).toBe('loading')
    expect(result.reserveFailed).toBe(false)
  })

  it('says not-activated for an absent account — a successful read, never an error', () => {
    const result = given({ exists: false, balanceDrops: '0', ownerCount: 0 }, RESERVES)
    expect(result.status).toBe('not-activated')
    expect(result.reserveFailed).toBe(false)
    expect(result.accountFailed).toBe(false)
  })

  it('says unavailable, and names the reserve read, when the reserve read failed', () => {
    const result = given(ACCOUNT, undefined, { reserve: true })
    expect(result.status).toBe('unavailable')
    expect(result.reserveFailed).toBe(true)
    expect(result.isLoading).toBe(false)
  })

  it('withholds both figures computed from a retained answer while the reserve read is in error', () => {
    // The half that used to fall straight through: TanStack keeps the previous
    // answer across a failed refetch, so `data` is truthy and `isError` is true
    // together. Computing here returns a Spendable figure derived from a read
    // that is currently failing.
    const result = given(ACCOUNT, RESERVES, { reserve: true })
    expect(result.status).toBe('unavailable')
    expect(result.spendableDrops).toBeNull()
    expect(result.reservedDrops).toBeNull()
  })

  it('names the account read, not the reserve read, when account_info failed', () => {
    const result = given(ACCOUNT, RESERVES, { account: true })
    expect(result.status).toBe('unavailable')
    expect(result.accountFailed).toBe(true)
    expect(result.reserveFailed).toBe(false)
  })

  it('hands back the reserve query\u2019s own refetch, so the failure can carry a retry', async () => {
    const result = given(ACCOUNT, RESERVES, { reserve: true })
    await result.retryReserves()
    expect(reserves.refetch).toHaveBeenCalled()
  })
})
