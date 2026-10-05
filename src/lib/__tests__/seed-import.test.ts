import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, onlineManager } from '@tanstack/react-query'

const fetchAccountState = vi.fn()
vi.mock('@/lib/xrpl/reads', () => ({
  fetchAccountState: (...args: unknown[]) => fetchAccountState(...args),
  fetchAccountLines: vi.fn(),
}))

import { checkBeforeImport, IMPORT_CHECK_TIMEOUT_MS, IMPORT_WARNING_COPY } from '../seed-import'
import { queryKeys } from '../xrpl/query-keys'

const ADDRESS = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'

function account(over: Partial<{ exists: boolean; disableMasterKey: boolean }>) {
  return {
    exists: true,
    address: ADDRESS,
    balanceDrops: '10000000',
    ownerCount: 0,
    sequence: 1,
    requireDestTag: false,
    disableMasterKey: false,
    ...over,
  }
}

/**
 * Epic 11, story 11.1: the pre-flight check both import screens run before the
 * vault write. Whatever it answers is what both screens do, so the
 * fail-closed half lives here, where one test covers both.
 */
describe('checkBeforeImport', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    fetchAccountState.mockReset()
    queryClient = new QueryClient()
  })

  afterEach(() => {
    onlineManager.setOnline(true)
    queryClient.clear()
  })

  it('has nothing to warn about for an account whose master key is enabled', async () => {
    fetchAccountState.mockResolvedValue(account({}))
    await expect(checkBeforeImport(queryClient, 'testnet', ADDRESS)).resolves.toBeNull()
    expect(fetchAccountState).toHaveBeenCalledWith('testnet', ADDRESS)
  })

  it('has nothing to warn about for an account that does not exist yet', async () => {
    fetchAccountState.mockResolvedValue(account({ exists: false }))
    await expect(checkBeforeImport(queryClient, 'testnet', ADDRESS)).resolves.toBeNull()
  })

  it('warns when the account has its master key disabled', async () => {
    fetchAccountState.mockResolvedValue(account({ disableMasterKey: true }))
    await expect(checkBeforeImport(queryClient, 'testnet', ADDRESS)).resolves.toBe('master-key-disabled')
  })

  it('warns, and does not throw, when the account cannot be read — a failed read is not "the key is fine"', async () => {
    fetchAccountState.mockRejectedValue(new Error('WebSocket is closed'))
    await expect(checkBeforeImport(queryClient, 'testnet', ADDRESS)).resolves.toBe('unchecked')
  })

  it('reads through the shared account-state cache entry for the network it is given', async () => {
    fetchAccountState.mockResolvedValue(account({}))
    await checkBeforeImport(queryClient, 'mainnet', ADDRESS)
    expect(queryClient.getQueryData(queryKeys.accountState('mainnet', ADDRESS))).toBeDefined()
    expect(queryClient.getQueryData(queryKeys.accountState('testnet', ADDRESS))).toBeUndefined()
  })

  it('still settles when the browser reports itself offline, instead of pausing forever', async () => {
    // Under TanStack's default `networkMode: 'online'` this fetch would pause
    // and the screen awaiting it would never leave "Checking…".
    onlineManager.setOnline(false)
    fetchAccountState.mockRejectedValue(new Error('Failed to connect'))
    const settled = await Promise.race([
      checkBeforeImport(queryClient, 'testnet', ADDRESS),
      new Promise((resolve) => setTimeout(() => resolve('still pending'), 500)),
    ])
    expect(settled).toBe('unchecked')
  })

  it('gives up after its bound and reports the account as unchecked, rather than waiting on a dead socket', async () => {
    vi.useFakeTimers()
    try {
      fetchAccountState.mockReturnValue(new Promise(() => {}))
      const pending = checkBeforeImport(queryClient, 'testnet', ADDRESS)
      await vi.advanceTimersByTimeAsync(IMPORT_CHECK_TIMEOUT_MS)
      await expect(pending).resolves.toBe('unchecked')
    } finally {
      vi.useRealTimers()
    }
  })

  it('words each warning so it says the seed has not been saved', () => {
    for (const copy of Object.values(IMPORT_WARNING_COPY)) {
      expect(copy.body).toMatch(/has not been saved yet/)
    }
  })
})
