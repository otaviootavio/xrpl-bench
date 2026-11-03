/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ getXrplClient: vi.fn(), plate: vi.fn(), activeWallet: vi.fn(), activeNode: vi.fn(), wipeVault: vi.fn(async () => {}) }))
vi.mock('@/lib/crypto/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/crypto/auth')>()), wipeVault: h.wipeVault }))
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

const t = vi.hoisted(() => ({ fail: false }))
vi.mock('@/lib/teardown', async (orig) => {
  const real = await orig<typeof import('@/lib/teardown')>()
  return { ...real, tearDownLock: vi.fn((...a: Parameters<typeof real.tearDownLock>) => { if (t.fail) throw new Error('boom'); return real.tearDownLock(...a) }) }
})

import { readFileSync } from 'node:fs'
import { tearDownLock } from '@/lib/teardown'
import { Chooser } from '../Chooser'
import { announceAdded, consumeAdded } from '@/lib/chooser-signals'
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
const cards = () => Array.from(document.querySelectorAll<HTMLElement>('li[data-wallet-id]'))
const names = () => screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  useAppStore.setState({
    wallets: [
      W('a', 'a', 'LA', 'Alpha', 'mainnet', 1),
      W('b', 'b', 'LB', 'Beta', 'testnet', 2),
      W('c', 'c', 'LC', 'Gamma', 'testnet', 3),
      W('c2', 'c', 'LC', 'Delta', 'devnet', 4),
      W('c3', 'c', 'LC', 'Epsilon', 'mainnet', 5),
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

  it('every address link goes to its own card\'s explorer, locked or open, whatever network is active', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
      useAppStore.setState({ network: 'testnet' } as never)
    })
    mount()
    for (const [id, network] of [['c', 'testnet'], ['c2', 'devnet'], ['c3', 'mainnet']] as const) {
      const address = `r${id.toUpperCase()}ADDRESS${'x'.repeat(12)}`
      const link = document.querySelector<HTMLAnchorElement>(`a[href="${accountExplorerUrl(network, address)}"]`)
      expect(link, `${network} card`).not.toBeNull()
    }
  })

  it('locked cards link each address to their own explorer too', () => {
    mount()
    for (const [id, network] of [['a', 'mainnet'], ['b', 'testnet'], ['c2', 'devnet']] as const) {
      const address = `r${id.toUpperCase()}ADDRESS${'x'.repeat(12)}`
      expect(document.querySelector(`a[href="${accountExplorerUrl(network, address)}"]`), `${network} locked card`).not.toBeNull()
    }
  })
})

describe('the cards', () => {
  it('is titled Wallets with its description', () => {
    mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeTruthy()
    expect(screen.getByText('Choose a wallet to open.')).toBeTruthy()
  })

  it('a locked card shows name, Locked once, address link, Network word and one Open key', () => {
    mount()
    const card = screen.getByRole('heading', { level: 2, name: 'Beta' }).closest('li') as HTMLElement
    expect(within(card).getByText('Locked', { selector: 'span' })).toBeTruthy()
    expect(within(card).queryByText('Locked.')).toBeNull()
    expect(within(card).getAllByText('Locked')).toHaveLength(1)
    expect(within(card).getByText('Testnet')).toBeTruthy()
    expect(card.querySelector('a')?.getAttribute('href')).toBe(accountExplorerUrl('testnet', `rBADDRESS${'x'.repeat(12)}`))
    expect(card.textContent).not.toMatch(/real funds|not stable/i)
    const open = within(card).getByRole('button', { name: 'Open Beta on Testnet' })
    expect(open.textContent).toBe('Open')
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open'])
  })

  it('a locked Mainnet card says Real funds as text and a locked Devnet card says Not stable with its notice', () => {
    mount()
    const alpha = screen.getByRole('heading', { level: 2, name: 'Alpha' }).closest('li') as HTMLElement
    expect(within(alpha).getByText('Mainnet')).toBeTruthy()
    expect(within(alpha).getByText('Real funds')).toBeTruthy()
    const delta = screen.getByRole('heading', { level: 2, name: 'Delta' }).closest('li') as HTMLElement
    expect(within(delta).getByText('Devnet')).toBeTruthy()
    expect(within(delta).getByText('Not stable')).toBeTruthy()
    expect(within(delta).getByText(DEVNET_NOTICE)).toBeTruthy()
  })

  it('one Seed with three Networks is three cards, no network rows', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    expect(cards()).toHaveLength(5)
    const gamma = screen.getByRole('heading', { level: 2, name: 'Gamma' }).closest('li') as HTMLElement
    expect(within(gamma).queryAllByRole('listitem')).toEqual([])
    expect(within(gamma).getByText('Open', { selector: 'span' })).toBeTruthy()
    const delta = screen.getByRole('heading', { level: 2, name: 'Delta' }).closest('li') as HTMLElement
    expect(within(delta).getByText('Not stable')).toBeTruthy()
    expect(within(delta).getByText(DEVNET_NOTICE)).toBeTruthy()
    const eps = screen.getByRole('heading', { level: 2, name: 'Epsilon' }).closest('li') as HTMLElement
    expect(within(eps).getByText('Real funds')).toBeTruthy()
    expect(within(eps).getByRole('button', { name: 'Open Epsilon on Mainnet' })).toBeTruthy()
    expect(within(eps).getByRole('button', { name: 'Lock Epsilon on Mainnet' })).toBeTruthy()
  })

  it('card order follows creation and never changes with lock state', () => {
    mount()
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'])
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'])
    act(() => {
      useAppStore.getState().openLock('LA', KEY, 5)
    })
    act(() => {
      useAppStore.setState({ activeWalletId: 'c3' })
    })
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'])
  })

  it('the active wallet\'s card says Active and its Open key is aria-current', () => {
    mount()
    expect(screen.getAllByText('Active')).toHaveLength(1)
    const beta = screen.getByRole('heading', { name: 'Beta' }).closest('li') as HTMLElement
    expect(within(beta).getByText('Active')).toBeTruthy()
    expect(within(beta).getByRole('button', { name: 'Open Beta on Testnet' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Open Alpha on Mainnet' }).hasAttribute('aria-current')).toBe(false)
  })

  it('on a Seed\'s cards only the active Wallet\'s card is current', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    act(() => {
      useAppStore.setState({ activeWalletId: 'c2' })
    })
    mount()
    expect(screen.getAllByText('Active')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open Delta on Devnet' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Open Epsilon on Mainnet' }).hasAttribute('aria-current')).toBe(false)
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
    expect(within(card).queryByText('Locked.')).toBeNull()
    expect(within(card).getAllByText('Locked')).toHaveLength(1)
    expect(within(card).getByText('Real funds')).toBeTruthy() // the Network stays on a locked card
    expect(window.location.pathname).toBe('/')
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'])
  })
})

describe('Open', () => {
  it('on a locked card selects and enters that Wallet', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha on Mainnet' }))
    expect(useAppStore.getState().activeWalletId).toBe('a')
    expect(window.location.pathname).toBe('/wallets/a')
  })

  it('on a card of a shared Seed enters exactly that Wallet', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open Delta on Devnet' }))
    expect(useAppStore.getState().activeWalletId).toBe('c2')
    expect(window.location.pathname).toBe('/wallets/c2')
  })

  it('on an open card enters that Wallet directly, no prompt', () => {
    act(() => {
      useAppStore.getState().openLock('LA', KEY, 5)
    })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open Alpha on Mainnet' }))
    expect(useAppStore.getState().activeWalletId).toBe('a')
    expect(window.location.pathname).toBe('/wallets/a')
  })

  it('on a key-holder and a controlled Wallet of one Seed, each Open enters its own card', () => {
    act(() => {
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open Gamma on Testnet' }))
    expect(useAppStore.getState().activeWalletId).toBe('c')
    expect(window.location.pathname).toBe('/wallets/c')
    fireEvent.click(screen.getByRole('button', { name: 'Open Epsilon on Mainnet' }))
    expect(useAppStore.getState().activeWalletId).toBe('c3')
    expect(window.location.pathname).toBe('/wallets/c3')
  })
})


describe('the Lock key', () => {
  const card = (n: string) => screen.getByRole('heading', { level: 2, name: n }).closest('li') as HTMLElement
  const status = () => screen.getByRole('status').textContent
  beforeEach(() => {
    t.fail = false
    vi.mocked(tearDownLock).mockClear()
  })

  it('goes through tearDownLock with the group lockId, flips the card, announces, focuses the h1', () => {
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    expect(status()).toBe('')
    const key = within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' })
    expect(key.textContent).toBe('Lock')
    fireEvent.click(key)
    expect(tearDownLock).toHaveBeenCalledWith(expect.anything(), 'LA')
    expect(within(card('Alpha')).getAllByText('Locked')).toHaveLength(1)
    expect(within(card('Alpha')).queryByRole('button', { name: /^Lock / })).toBeNull()
    expect(status()).toBe('Alpha: Locked.')
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'])
  })

  it('the Chooser never closes a lock or clears the cache inline', () => {
    const src = readFileSync('src/pages/Chooser.tsx', 'utf8') + readFileSync('src/components/wallet/WalletCard.tsx', 'utf8')
    expect(src).toMatch(/tearDownLock\(/)
    expect(src).not.toMatch(/closeLock|queryClient\.clear|\.clear\(/)
    expect(src).not.toMatch(/aria-live="polite">\s*(Open|Locked)/)
  })

  it('a shared lock flips both cards and names the other', () => {
    useAppStore.setState({ wallets: [W('a', 'a', 'LS', 'Alpha', 'mainnet', 1), W('b', 'b', 'LS', 'Beta', 'testnet', 2)] })
    act(() => useAppStore.getState().openLock('LS', KEY, 5))
    mount()
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' }))
    expect(within(card('Beta')).getAllByText('Locked')).toHaveLength(1)
    expect(screen.getByText('Locking Alpha also locked Beta: they share one lock.')).toBeTruthy()
    expect(status()).toBe('Alpha: Locked. Beta: Locked.')
  })

  it('locking a card whose Seed has sibling cards on the same lock names them and announces each', () => {
    act(() => useAppStore.getState().openLock('LC', KEY, 5))
    mount()
    fireEvent.click(within(card('Gamma')).getByRole('button', { name: 'Lock Gamma on Testnet' }))
    expect(screen.getByText('Locking Gamma also locked Delta, Epsilon: they share one lock.')).toBeTruthy()
    expect(status()).toBe('Gamma: Locked. Delta: Locked. Epsilon: Locked.')
  })

  it('no Open Check: no Lock key, the reason is shown; a locked card shows neither', () => {
    useAppStore.setState({ wallets: [W('a', 'a', 'LA', 'Alpha', 'mainnet', 1, { openCheck: 'none' }), W('b', 'b', 'LB', 'Beta', 'testnet', 2)] })
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    expect(within(card('Alpha')).queryByRole('button', { name: /^Lock / })).toBeNull()
    expect(within(card('Alpha')).getByText('No authentication required to open the wallet. This wallet opens itself, so there is nothing to lock.')).toBeTruthy()
    expect(within(card('Beta')).queryByText(/No authentication required to open the wallet/)).toBeNull()
  })

  it('a failed teardown keeps the card open with persistent text', () => {
    act(() => {
      useAppStore.getState().openLock('LA', KEY, 5)
      useAppStore.getState().openLock('LB', KEY, 5)
    })
    mount()
    t.fail = true
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' }))
    expect(within(card('Alpha')).getByRole('alert').textContent).toBe('Could not lock this wallet. It is still open.')
    expect(within(card('Beta')).queryByRole('alert')).toBeNull()
    expect(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' })).toBeTruthy()
    expect(status()).toBe('')
  })

  it('a failed Lock clears when the Lock is retried and succeeds', () => {
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    t.fail = true
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' }))
    expect(within(card('Alpha')).getByRole('alert')).toBeTruthy()
    t.fail = false
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failure does not come back when its card flips and is opened again', () => {
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    t.fail = true
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' }))
    expect(within(card('Alpha')).getByRole('alert')).toBeTruthy()
    act(() => useAppStore.getState().closeLock('LA'))
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failed Lock on a shared lock names nobody and does not take focus', () => {
    useAppStore.setState({ wallets: [W('a', 'a', 'LS', 'Alpha', 'mainnet', 1), W('b', 'b', 'LS', 'Beta', 'testnet', 2)] })
    act(() => useAppStore.getState().openLock('LS', KEY, 5))
    mount()
    t.fail = true
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' }))
    expect(screen.queryByText(/also locked/)).toBeNull()
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('the shared-lock line is replaced by the next Lock', () => {
    useAppStore.setState({
      wallets: [W('a', 'a', 'LS', 'Alpha', 'mainnet', 1), W('b', 'b', 'LS', 'Beta', 'testnet', 2), W('c', 'c', 'LC', 'Gamma', 'testnet', 3)],
    })
    act(() => {
      useAppStore.getState().openLock('LS', KEY, 5)
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha on Mainnet' }))
    expect(screen.getByText(/Locking Alpha also locked Beta/)).toBeTruthy()
    fireEvent.click(within(card('Gamma')).getByRole('button', { name: 'Lock Gamma on Testnet' }))
    expect(screen.queryByText(/also locked/)).toBeNull()
  })

  it('announces an auto-lock style close with no note line', () => {
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    act(() => useAppStore.getState().closeLock('LA'))
    expect(status()).toBe('Alpha: Locked.')
    expect(screen.queryByText(/also locked/)).toBeNull()
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    expect(status()).toBe('Alpha: Open.')
  })
})


describe('a card holds only Open and Lock (Configure story 3, FR-92)', () => {
  const labels = (el: HTMLElement) => within(el).queryAllByRole('button').map((b) => b.getAttribute('aria-label'))

  it('no card variant renders a Configure, Rename or Remove control, or the locked-card remove reason', () => {
    useAppStore.setState({
      wallets: [
        W('a', 'a', 'LA', 'Alpha', 'mainnet', 1), // locked
        W('b', 'b', 'LB', 'Beta', 'testnet', 2, { openCheck: 'none' }), // open, no Open Check
        W('c', 'c', 'LC', 'Gamma', 'testnet', 3), // open, three views
        W('c2', 'c', 'LC', 'Delta', 'devnet', 4),
        W('c3', 'c', 'LC', 'Epsilon', 'mainnet', 5),
      ],
    })
    act(() => {
      useAppStore.getState().openLock('LB', KEY, 5)
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    expect(cards()).toHaveLength(5)
    for (const name of ['Configure', 'Rename', 'Remove']) {
      expect(screen.queryAllByRole('button', { name: new RegExp(`^${name}`) }), name).toEqual([])
    }
    expect(document.body.textContent).not.toContain('Open this wallet to remove it')
    expect(document.querySelector('[data-rename-seed]')).toBeNull()
    expect(document.querySelector('[aria-disabled="true"]')).toBeNull()
  })

  it('a locked card has exactly one key, Open', () => {
    mount()
    expect(cards().map(labels)).toEqual([['Open Alpha on Mainnet'], ['Open Beta on Testnet'], ['Open Gamma on Testnet'], ['Open Delta on Devnet'], ['Open Epsilon on Mainnet']])
    expect(within(cards()[0]).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open'])
  })

  it('an open card has Open then Lock, one card per Wallet; with no Open Check, Open only', () => {
    useAppStore.setState({
      wallets: [
        W('b', 'b', 'LB', 'Beta', 'testnet', 2, { openCheck: 'none' }),
        W('c', 'c', 'LC', 'Gamma', 'testnet', 3),
        W('c2', 'c', 'LC', 'Delta', 'devnet', 4),
      ],
    })
    act(() => {
      useAppStore.getState().openLock('LB', KEY, 5)
      useAppStore.getState().openLock('LC', KEY, 5)
    })
    mount()
    const [beta, gamma, delta] = cards()
    expect(labels(beta)).toEqual(['Open Beta on Testnet'])
    expect(labels(gamma)).toEqual(['Open Gamma on Testnet', 'Lock Gamma on Testnet'])
    expect(labels(delta)).toEqual(['Open Delta on Devnet', 'Lock Delta on Devnet'])
  })

  it('the locked path names no Node, Open Check or balance in the card source', () => {
    const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const src = code('src/components/wallet/WalletCard.tsx') + code('src/pages/Chooser.tsx')
    expect(src).not.toMatch(/\.node\b|\bnode:|openCheck|balance/i)
  })

  it('the card source holds no Configure, Rename or Remove handler and no dialog host', () => {
    const src = readFileSync('src/components/wallet/WalletCard.tsx', 'utf8') + readFileSync('src/pages/Chooser.tsx', 'utf8')
    expect(src).not.toMatch(/configureWallet|RenameDialog|RemoveDialog|confirmRemoveWallet|renameWallet|REMOVE_LOCKED_REASON|onRename|onRemove/)
    expect(src).not.toMatch(/outline-none|:focus\b/)
  })
})

describe('Add wallet from the chooser (chooser story 11)', () => {
  it('the Add wallet key opens /wallets/new, and works with every card locked', () => {
    mount()
    expect(screen.getAllByRole('button', { name: /^Open / }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Add wallet' }))
    expect(window.location.pathname).toBe('/wallets/new')
    expect(window.location.search + window.location.hash).toBe('')
  })

  it('focuses the h2 of the card Add wallet announced, once; a cold start moves nothing', () => {
    const first = mount()
    expect(document.activeElement).toBe(document.body)
    first.unmount()
    act(() => announceAdded('b'))
    mount()
    const card = document.querySelector('[data-wallet-id="b"]')
    expect(card).not.toBeNull()
    expect(document.activeElement).toBe(card?.querySelector('h2'))
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    expect(consumeAdded()).toBeNull()
  })

  it('Add wallet announces the card it made, so the Chooser can focus it', () => {
    expect(readFileSync('src/components/wallet/AddWalletScreen.tsx', 'utf8')).toMatch(/announceAdded/)
  })
})
