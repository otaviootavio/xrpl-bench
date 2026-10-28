/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ getXrplClient: vi.fn(), plate: vi.fn(), activeWallet: vi.fn(), activeNode: vi.fn() }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ getXrplClient: h.getXrplClient, holdXrplClient: vi.fn() }))
vi.mock('@/components/wallet/NetworkPlate', () => ({ NetworkPlate: () => (h.plate(), <div data-testid="network-plate" />) }))
vi.mock('@/store/app-store', async (orig) => {
  const real = await orig<typeof import('@/store/app-store')>()
  return {
    ...real,
    useActiveWallet: (...a: Parameters<typeof real.useActiveWallet>) => (h.activeWallet(), real.useActiveWallet(...a)),
    useActiveNode: (...a: Parameters<typeof real.useActiveNode>) => (h.activeNode(), real.useActiveNode(...a)),
  }
})

import { Chooser } from '../Chooser'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'
import { DEVNET_NOTICE } from '@/components/wallet/DevnetNotice'
import { accountExplorerUrl } from '@/lib/xrpl/networks'

type Net = 'mainnet' | 'testnet' | 'devnet'
const W = (id: string, seedId: string, lockId: string, label: string, network: Net, createdAt: number, extra = {}) =>
  ({ id, seedId, lockId, label, address: `r${id.toUpperCase()}ADDRESS${'x'.repeat(12)}`, createdAt, network, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', ...extra }) as never
const KEY = {} as CryptoKey

function mount() {
  const queryClient = new QueryClient()
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Chooser />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return { queryClient, ...utils }
}
const names = () => screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  useAppStore.setState({
    wallets: [
      W('a', 'a', 'LA', 'Alpha', 'mainnet', 1),
      W('b', 'b', 'LB', 'Beta', 'testnet', 2),
      W('c', 'c', 'LC', 'Gamma', 'testnet', 3),
      W('c2', 'c', 'LC', 'Gamma', 'devnet', 4),
      W('c3', 'c', 'LC', 'Gamma', 'mainnet', 5),
    ],
    activeWalletId: 'b',
    openLocks: {},
  })
})
afterEach(() => {
  cleanup()
  useAppStore.getState().closeAllLocks()
  vi.clearAllMocks()
})

describe('the chooser reads nothing from the ledger (AD-36)', () => {
  it('with several open locks: empty query cache, no client, no NetworkPlate, no active-wallet hook, no balance', () => {
    act(() => {
      useAppStore.getState().openLock('LA', KEY, 5)
      useAppStore.getState().openLock('LB', KEY, 5)
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    const { queryClient } = mount()
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(h.getXrplClient).not.toHaveBeenCalled()
    expect(h.plate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('network-plate')).toBeNull()
    expect(h.activeWallet).not.toHaveBeenCalled()
    expect(h.activeNode).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/balance|XRP\b/i)
  })

  it('every address link goes to its own row\'s explorer, whatever network is active', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
      useAppStore.setState({ network: 'testnet' } as never)
    })
    mount()
    for (const [id, network] of [['c', 'testnet'], ['c2', 'devnet'], ['c3', 'mainnet']] as const) {
      const address = `r${id.toUpperCase()}ADDRESS${'x'.repeat(12)}`
      const link = document.querySelector<HTMLAnchorElement>(`a[href="${accountExplorerUrl(network, address)}"]`)
      expect(link, `${network} row`).not.toBeNull()
    }
  })
})

describe('the cards', () => {
  it('is titled Wallets with its description', () => {
    mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeTruthy()
    expect(screen.getByText('Choose a wallet to open. Each one has its own lock.')).toBeTruthy()
  })

  it('a locked card shows its name, the Locked lamp word, `Locked.` and Open; no address, network or stamp', () => {
    mount()
    const card = screen.getByRole('heading', { level: 2, name: 'Alpha' }).closest('li') as HTMLElement
    expect(within(card).getByText('Locked', { selector: 'span' })).toBeTruthy()
    expect(within(card).getByText('Locked.')).toBeTruthy()
    const open = within(card).getByRole('button', { name: 'Open Alpha' })
    expect(open.textContent).toBe('Open')
    expect(card.textContent).not.toMatch(/mainnet|testnet|devnet|real funds|not stable/i)
    expect(card.textContent).not.toContain('ADDRESS') // the fixture address of every wallet carries it
    expect(card.querySelector('a')).toBeNull()
    expect(within(card).getAllByRole('button')).toHaveLength(1)
  })

  it('a locked Mainnet card renders exactly like a locked Testnet card', () => {
    const render1 = (network: Net) => {
      useAppStore.setState({ wallets: [W('x', 'x', 'LX', 'Same', network, 1)], activeWalletId: null })
      const { container, unmount } = mount()
      const html = container.innerHTML
      unmount()
      return html
    }
    expect(render1('mainnet')).toBe(render1('testnet'))
  })

  it('an open card has a row per view in view order with word, stamp and notice', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    const card = screen.getByRole('heading', { level: 2, name: 'Gamma' }).closest('li') as HTMLElement
    expect(within(card).getByText('Open', { selector: 'span' })).toBeTruthy()
    const rows = within(card).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('span')?.textContent)).toEqual(['Testnet', 'Devnet', 'Mainnet'])
    expect(within(rows[0]).queryByText(/real funds|not stable/i)).toBeNull()
    expect(within(rows[1]).getByText('Not stable')).toBeTruthy()
    expect(within(rows[1]).getByText(DEVNET_NOTICE)).toBeTruthy()
    expect(within(rows[2]).getByText('Real funds')).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Open Gamma on Mainnet' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Open Gamma on Devnet' }).textContent).toBe('Open')
    expect(within(card).queryByRole('button', { name: 'Open Gamma' })).toBeNull()
  })

  it('card order follows creation and never changes with lock state', () => {
    mount()
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma'])
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma'])
    act(() => {
      useAppStore.getState().openLock('LA', KEY, 5)
    })
    act(() => {
      useAppStore.setState({ activeWalletId: 'c3' })
    })
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('the active wallet\'s card says Active and its entry Open key is aria-current', () => {
    mount()
    expect(screen.getAllByText('Active')).toHaveLength(1)
    const beta = screen.getByRole('heading', { name: 'Beta' }).closest('li') as HTMLElement
    expect(within(beta).getByText('Active')).toBeTruthy()
    expect(within(beta).getByRole('button', { name: 'Open Beta' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Open Alpha' }).hasAttribute('aria-current')).toBe(false)
  })

  it('on an open card only the active view\'s row is current', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    act(() => {
      useAppStore.setState({ activeWalletId: 'c2' })
    })
    mount()
    expect(screen.getAllByText('Active')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open Gamma on Devnet' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Open Gamma on Mainnet' }).hasAttribute('aria-current')).toBe(false)
  })

  it('a lock that expires flips its card to Locked in place and moves nobody', () => {
    act(() => {
      useAppStore.getState().openLock('LA', KEY, 5)
    })
    mount()
    expect(within(screen.getByRole('heading', { name: 'Alpha' }).closest('li') as HTMLElement).getByText('Open', { selector: 'span' })).toBeTruthy()
    act(() => {
      useAppStore.getState().closeLock('LA')
    })
    const card = screen.getByRole('heading', { name: 'Alpha' }).closest('li') as HTMLElement
    expect(within(card).getByText('Locked.')).toBeTruthy()
    expect(card.textContent).not.toMatch(/mainnet|real funds/i)
    expect(window.location.pathname).toBe('/')
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
})

describe('Open', () => {
  it('on a locked card selects and enters the Seed\'s entry view', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha' }))
    expect(useAppStore.getState().activeWalletId).toBe('a')
    expect(window.location.pathname).toBe('/wallets/a')
  })

  it('on a network row enters exactly that view', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open Gamma on Devnet' }))
    expect(useAppStore.getState().activeWalletId).toBe('c2')
    expect(window.location.pathname).toBe('/wallets/c2')
  })
})
