/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** Remove as a section of Configure (story 2): the real guards, a mocked keystore. */
const h = vi.hoisted(() => ({
  remove: vi.fn(),
  list: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  order: [] as string[],
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/notify', () => ({ notify: { success: (m: string) => h.success(m), error: (m: string) => h.error(m), warning: () => {} }, toast: { error: () => {}, success: () => {}, warning: () => {} } }))
vi.mock('@/lib/route', async (orig) => {
  const real = await orig<typeof import('@/lib/route')>()
  return {
    ...real,
    leaveToChooser: () => {
      // The store has not been written yet: the wallet is still listed when the history is unwound.
      h.order.push(`leave:${useAppStoreRef.getState().wallets.length}`)
      real.leaveToChooser()
    },
  }
})
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  listWallets: (...a: unknown[]) => h.list(...a),
  removeWallet: (id: string) => h.remove(id),
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: () => 'locked',
  renameWallet: async () => ({ ok: true, metas: [] }),
}))

import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { REMOVE_BACKUP, REMOVE_DONE, REMOVE_FAILED, REMOVE_LAST, REMOVE_PIN_NOT_DISCARDED, REMOVE_SIBLING, REMOVE_SOLE } from '@/components/wallet/remove-copy'
import { Chooser } from '@/pages/Chooser'
import { navigate } from '@/lib/route'
import { useAppStore } from '@/store/app-store'

const useAppStoreRef = useAppStore
const KEY = {} as CryptoKey
const base = { lockId: 'L1', createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }
const W = { ...base, id: 'w1', seedId: 's1', label: 'Savings', address: 'rA', network: 'testnet' }
const SIBLING = { ...base, id: 'w1b', seedId: 's1', label: 'Savings', address: 'rA2', network: 'devnet' }
const OTHER = { ...base, id: 'w2', seedId: 's2', label: 'Travel', address: 'rB', network: 'mainnet', lockId: 'other' }
const state = () => useAppStore.getState()

function seed(wallets: unknown[], openLocks = ['L1']) {
  useAppStore.setState({ wallets, activeWalletId: 'w1', network: 'testnet', openLocks: {} } as never)
  for (const l of openLocks) state().openLock(l, KEY, 5)
}
function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <ConfigureScreen wallet={W as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}
const key = () => screen.getByRole('button', { name: 'Remove Savings on Testnet' })
const dialog = () => screen.getByRole('dialog', { name: 'Remove this wallet?' })
const confirm = () => within(dialog()).getByRole('button', { name: 'Remove wallet' })
const vaultWithout = (...ids: string[]) => h.list.mockImplementation(async () => state().wallets.filter((w) => !ids.includes(w.id)))

beforeEach(() => {
  h.remove.mockReset().mockResolvedValue({ emptied: false, appPin: 'kept' })
  h.list.mockReset()
  h.success.mockReset()
  h.error.mockReset()
  h.order.length = 0
  window.history.replaceState(null, '', '/')
  seed([W, SIBLING, OTHER], ['L1', 'other'])
})
afterEach(cleanup)

describe('Configure Remove plate', () => {
  it('is the last plate, after Two-device signing, in plate styling, with a danger key named for its network', () => {
    mount()
    const titles = screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)
    expect(titles[titles.length - 1]).toBe('Remove')
    expect(titles.indexOf('Two-device signing')).toBe(titles.length - 2)
    const plate = key().closest('[data-slot="config-plate"]') as HTMLElement
    expect(plate.className).toMatch(/panel-plate/)
    expect(key().textContent).toBe('Remove')
    expect(key().className).toMatch(/border-destructive\/55/)
    expect(key().className).not.toMatch(/(^|\s)bg-destructive(\s|$)/)
    expect(within(plate).getByText('Remove this wallet on Testnet from this device.')).toBeTruthy()
  })

  it('the chooser card keeps its own Remove key', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <Chooser />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: 'Remove Savings on Testnet' })).toBeTruthy()
  })

  it.each([
    ['a sibling view remains', [W, SIBLING, OTHER], [REMOVE_SIBLING, REMOVE_BACKUP]],
    ['the only view of the Seed', [W, OTHER], [REMOVE_SOLE, REMOVE_BACKUP]],
    ['the last wallet', [W], [REMOVE_LAST, REMOVE_SOLE, REMOVE_BACKUP]],
  ])('the confirm body when %s', (_n, wallets, sentences) => {
    seed(wallets)
    mount()
    fireEvent.click(key())
    expect(dialog().textContent).toContain(sentences.join(' '))
    expect(confirm().className).toMatch(/bg-destructive/)
    expect(h.remove).not.toHaveBeenCalled()
  })

  it('last wallet body names the App PIN', () => {
    seed([W])
    mount()
    fireEvent.click(key())
    expect(dialog().textContent).toMatch(/App PIN/)
  })

  it('sibling view: removes that view only, leaves before the store write, keeps the Seed and its lock', async () => {
    vaultWithout('w1')
    mount()
    fireEvent.click(key())
    fireEvent.click(confirm())
    await waitFor(() => expect(state().wallets.map((w) => w.id)).toEqual(['w1b', 'w2']))
    expect(h.remove).toHaveBeenCalledTimes(1)
    expect(h.remove).toHaveBeenCalledWith('w1')
    expect(h.order).toEqual(['leave:3'])
    expect(Object.keys(state().openLocks).sort()).toEqual(['L1', 'other'])
    expect(state().activeWalletId).toBe('w1b')
    expect(h.success).toHaveBeenCalledWith(REMOVE_DONE)
  })

  it('sole view: removed, its lock closes when no other wallet uses it, and the app is back at the chooser path', async () => {
    seed([W, OTHER], ['L1', 'other'])
    window.history.replaceState(null, '', '/')
    act(() => navigate('/wallets/w1/configure'))
    vaultWithout('w1')
    mount()
    fireEvent.click(key())
    fireEvent.click(confirm())
    await waitFor(() => expect(state().wallets.map((w) => w.id)).toEqual(['w2']))
    expect(Object.keys(state().openLocks)).toEqual(['other'])
    expect(state().activeWalletId).toBe('w2')
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('last wallet: no leave call, the list empties, the App PIN failure is reported', async () => {
    seed([W])
    h.remove.mockResolvedValue({ emptied: true, appPin: 'failed' })
    h.list.mockResolvedValue([])
    mount()
    fireEvent.click(key())
    fireEvent.click(confirm())
    await waitFor(() => expect(state().wallets).toEqual([]))
    expect(h.order).toEqual([])
    expect(state().activeWalletId).toBeNull()
    expect(state().openLocks).toEqual({})
    expect(h.error).toHaveBeenCalledWith(REMOVE_PIN_NOT_DISCARDED)
  })

  it('a lock that closed after Configure opened: Remove opens nothing and removes nothing', () => {
    mount()
    const pressed = key()
    act(() => state().closeLock('L1'))
    fireEvent.click(pressed)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.remove).not.toHaveBeenCalled()
  })

  it('a lock that closes while the dialog is open: refused at confirm with the locked message', async () => {
    mount()
    fireEvent.click(key())
    const go = confirm()
    act(() => state().closeLock('L1'))
    fireEvent.click(go)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.remove).not.toHaveBeenCalled()
    expect(h.error).toHaveBeenCalledWith('This wallet is locked. Open it to remove it.')
    expect(state().wallets.some((w) => w.id === 'w1')).toBe(true)
    expect(h.order).toEqual([])
  })

  it('wallets that changed under the dialog: refused with the changed message', async () => {
    mount()
    fireEvent.click(key())
    expect(dialog().textContent).toContain(REMOVE_SIBLING)
    useAppStore.setState({ wallets: [W, OTHER] } as never) // the sibling went: the body is now "sole"
    fireEvent.click(confirm())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.remove).not.toHaveBeenCalled()
    expect(h.error).toHaveBeenCalledWith('The wallets on this device changed. Open Remove again to see what it does now.')
  })

  it('the keystore throws: the finally still tears down, re-picks the Active Wallet and leaves, with an error', async () => {
    h.remove.mockRejectedValue(new Error('boom'))
    h.list.mockImplementation(async () => state().wallets.filter((w) => w.id !== 'w1')) // the vault no longer lists it
    mount()
    fireEvent.click(key())
    fireEvent.click(confirm())
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(REMOVE_FAILED))
    expect(state().activeWalletId).not.toBe('w1')
    expect(h.order).toEqual(['leave:3'])
    expect(h.success).not.toHaveBeenCalled()
  })

  it('an unreadable vault after a throw: the wallet stays in the store, only its data is shed, an error shows', async () => {
    h.remove.mockRejectedValue(new Error('boom'))
    h.list.mockRejectedValue(new Error('unreadable'))
    mount()
    fireEvent.click(key())
    fireEvent.click(confirm())
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(REMOVE_FAILED))
    expect(state().wallets.map((w) => w.id)).toEqual(['w1', 'w1b', 'w2'])
    expect(state().activeWalletId).toBe('w1')
    expect(h.order).toEqual(['leave:3'])
  })

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('%s closes with nothing removed and focus returns to the Remove key', async (_n, dismiss) => {
    mount()
    fireEvent.click(key())
    dismiss()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(key()))
    expect(h.remove).not.toHaveBeenCalled()
  })

  it('a double press on confirm removes once', async () => {
    vaultWithout('w1')
    mount()
    fireEvent.click(key())
    const go = confirm()
    fireEvent.click(go)
    fireEvent.click(go)
    await waitFor(() => expect(state().wallets.map((w) => w.id)).toEqual(['w1b', 'w2']))
    expect(h.remove).toHaveBeenCalledTimes(1)
  })
})
