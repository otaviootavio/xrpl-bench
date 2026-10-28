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

const t = vi.hoisted(() => ({ fail: false }))
vi.mock('@/lib/teardown', async (orig) => {
  const real = await orig<typeof import('@/lib/teardown')>()
  return { ...real, tearDownLock: vi.fn((...a: Parameters<typeof real.tearDownLock>) => { if (t.fail) throw new Error('boom'); return real.tearDownLock(...a) }) }
})

const k = vi.hoisted(() => ({ rename: vi.fn() }))
vi.mock('@/lib/crypto/keystore', async (orig) => ({ ...(await orig<typeof import('@/lib/crypto/keystore')>()), renameWallet: k.rename }))

import { readFileSync } from 'node:fs'
import { waitFor } from '@testing-library/react'
import { useNoticeStore } from '@/store/notice-store'
import { RENAME_ERRORS, RENAME_HELP, RENAME_WRITE_FAILED } from '@/components/wallet/rename-copy'
import { tearDownLock } from '@/lib/teardown'
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
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open', 'Rename'])
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
    const key = within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' })
    expect(key.textContent).toBe('Lock')
    fireEvent.click(key)
    expect(tearDownLock).toHaveBeenCalledWith(expect.anything(), 'LA')
    expect(within(card('Alpha')).getByText('Locked.')).toBeTruthy()
    expect(within(card('Alpha')).queryByRole('button', { name: /^Lock / })).toBeNull()
    expect(status()).toBe('Alpha: Locked.')
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma'])
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
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' }))
    expect(within(card('Beta')).getByText('Locked.')).toBeTruthy()
    expect(screen.getByText('Locking Alpha also locked Beta: they share one lock.')).toBeTruthy()
    expect(status()).toBe('Alpha: Locked. Beta: Locked.')
  })

  it('no Open Check: no key, the reason is shown; a locked card shows neither', () => {
    useAppStore.setState({ wallets: [W('a', 'a', 'LA', 'Alpha', 'mainnet', 1, { openCheck: 'none' }), W('b', 'b', 'LB', 'Beta', 'testnet', 2)] })
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    expect(within(card('Alpha')).queryByRole('button', { name: /^Lock / })).toBeNull()
    expect(within(card('Alpha')).getByText('No Open Check: this wallet opens itself, so there is nothing to lock.')).toBeTruthy()
    expect(within(card('Beta')).queryByText(/No Open Check/)).toBeNull()
    // Rename is on every card, whatever its Open Check.
    expect(within(card('Alpha')).getByRole('button', { name: 'Rename Alpha' })).toBeTruthy()
  })

  it('a failed teardown keeps the card open with persistent text', () => {
    act(() => {
      useAppStore.getState().openLock('LA', KEY, 5)
      useAppStore.getState().openLock('LB', KEY, 5)
    })
    mount()
    t.fail = true
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' }))
    expect(within(card('Alpha')).getByRole('alert').textContent).toBe('Could not lock this wallet. It is still open.')
    expect(within(card('Beta')).queryByRole('alert')).toBeNull()
    expect(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' })).toBeTruthy()
    expect(status()).toBe('')
  })

  it('a failed Lock clears when the Lock is retried and succeeds', () => {
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    t.fail = true
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' }))
    expect(within(card('Alpha')).getByRole('alert')).toBeTruthy()
    t.fail = false
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failure does not come back when its card flips and is opened again', () => {
    act(() => useAppStore.getState().openLock('LA', KEY, 5))
    mount()
    t.fail = true
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' }))
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
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' }))
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
    fireEvent.click(within(card('Alpha')).getByRole('button', { name: 'Lock Alpha' }))
    expect(screen.getByText(/Locking Alpha also locked Beta/)).toBeTruthy()
    fireEvent.click(within(card('Gamma')).getByRole('button', { name: 'Lock Gamma' }))
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


describe('the Rename key and dialog', () => {
  const card = (n: string) => screen.getByRole('heading', { level: 2, name: n }).closest('li') as HTMLElement
  const field = () => screen.getByLabelText('Name') as HTMLInputElement
  const save = () => screen.getByRole('button', { name: 'Save name' }) as HTMLButtonElement
  const type = (v: string) => fireEvent.change(field(), { target: { value: v } })
  const okRename = (seedId: string) => async (_id: string, name: string) => ({
    ok: true as const,
    metas: useAppStore.getState().wallets.filter((w) => w.seedId === seedId).map((w) => ({ ...w, label: name })),
  })
  beforeEach(() => {
    k.rename.mockReset()
    useNoticeStore.setState({ notices: [] } as never)
  })

  it('every card has Rename: after Open when locked, between the network rows and Lock when open', () => {
    act(() => useAppStore.getState().openLock('LC', KEY, 5))
    mount()
    const names = (n: string) => within(card(n)).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names('Alpha')).toEqual(['Open Alpha', 'Rename Alpha'])
    expect(names('Gamma')).toEqual(['Open Gamma on Testnet', 'Open Gamma on Devnet', 'Open Gamma on Mainnet', 'Rename Gamma', 'Lock Gamma'])
    expect(within(card('Alpha')).getByRole('button', { name: 'Rename Alpha' }).textContent).toBe('Rename')
  })

  it('opens a titled dialog with the always-visible help, Cancel and Save name; needs no lock', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }))
    expect(screen.getByRole('dialog', { name: 'Rename wallet' })).toBeTruthy()
    expect(field().value).toBe('Alpha')
    expect(screen.getByText(RENAME_HELP)).toBe(screen.getByText('Only on this device. Never sent to the ledger.'))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(save().disabled).toBe(true) // unchanged
    expect(useAppStore.getState().openLocks).toEqual({})
  })

  it.each([
    ['   ', RENAME_ERRORS.empty, 'Give this wallet a name.'],
    ['x'.repeat(41), RENAME_ERRORS['too-long'], 'Use 40 characters or fewer.'],
    ['  bETA ', RENAME_ERRORS.duplicate, 'Another wallet on this device already has that name.'],
  ])('shows %j as visible text tied to the field, on blur, and disables Save', (value, text, literal) => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }))
    type(value)
    expect(screen.queryByText(literal)).toBeNull() // not before blur or submit
    fireEvent.blur(field())
    expect(text).toBe(literal)
    const err = screen.getByText(literal)
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(field().getAttribute('aria-describedby')).toContain(err.id)
    expect(field().getAttribute('aria-describedby')).toContain(screen.getByText(RENAME_HELP).id)
    expect(save().disabled).toBe(true)
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(k.rename).not.toHaveBeenCalled()
  })

  it('Enter on an invalid name shows the error; a sibling view\'s name is never a collision', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Gamma' }))
    type(' ')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(screen.getByText(RENAME_ERRORS.empty)).toBeTruthy()
    type('gamma ') // its own name: valid (unchanged), not a duplicate
    expect(screen.queryByText(RENAME_ERRORS.duplicate)).toBeNull()
  })

  it('an unchanged name closes silently with no write', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }))
    type('  Alpha ')
    fireEvent.keyDown(field(), { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(k.rename).not.toHaveBeenCalled()
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('a grandfathered duplicate left unchanged shows no error and closes silently', async () => {
    useAppStore.setState({ wallets: [W('a', 'a', 'LA', 'Twin', 'testnet', 1), W('b', 'b', 'LB', 'twin', 'testnet', 2)] })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Twin' }))
    fireEvent.blur(field())
    expect(screen.queryByText(RENAME_ERRORS.duplicate)).toBeNull()
    fireEvent.keyDown(field(), { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(k.rename).not.toHaveBeenCalled()
  })

  it('Enter that confirms an IME composition does not submit', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Gamma' }))
    type('Savings')
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    expect(k.rename).not.toHaveBeenCalled()
  })

  it('saves a valid name: normalised, notice, closes, every row shows it, focus returns to Rename, order kept', async () => {
    act(() => useAppStore.getState().openLock('LC', KEY, 5))
    k.rename.mockImplementation(okRename('c'))
    mount()
    const key = screen.getByRole('button', { name: 'Rename Gamma' })
    key.focus()
    fireEvent.click(key)
    type('  Savings   account ')
    expect(save().disabled).toBe(false)
    fireEvent.click(save())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(k.rename).toHaveBeenCalledWith('c', 'Savings account')
    expect(useNoticeStore.getState().notices.some((n) => JSON.stringify(n).includes('Wallet renamed.'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Open Savings account on Devnet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Savings account on Mainnet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Savings account on Testnet' })).toBeTruthy()
    expect(useAppStore.getState().wallets.filter((w) => w.seedId === 'c').map((w) => w.label)).toEqual(['Savings account', 'Savings account', 'Savings account'])
    expect(names()).toEqual(['Alpha', 'Beta', 'Savings account'])
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename Savings account' })))
  })

  it('works on a locked card with no lock', async () => {
    k.rename.mockImplementation(okRename('a'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }))
    type('Zeta')
    fireEvent.click(save())
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Zeta' })).toBeTruthy())
    expect(useAppStore.getState().openLocks).toEqual({})
  })

  it('a keystore refusal (cross-tab duplicate) shows the duplicate error and keeps the dialog', async () => {
    k.rename.mockResolvedValue({ ok: false, reason: 'duplicate' })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }))
    type('Zeta')
    fireEvent.click(save())
    await waitFor(() => expect(screen.getByText(RENAME_ERRORS.duplicate)).toBeTruthy())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(field().value).toBe('Zeta')
  })

  it('a failed write keeps the dialog open with the typed name and the exact message; the store is unchanged', async () => {
    k.rename.mockResolvedValue({ ok: false, reason: 'write-failed' })
    mount()
    const before = useAppStore.getState().wallets
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }))
    type('Zeta')
    fireEvent.click(save())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(RENAME_WRITE_FAILED))
    expect(RENAME_WRITE_FAILED).toBe('Could not rename the wallet. Nothing was changed.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(field().value).toBe('Zeta')
    expect(useAppStore.getState().wallets).toBe(before)
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('Cancel closes without a write', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }))
    type('Zeta')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(k.rename).not.toHaveBeenCalled()
  })

  it('the dialog and renameWallet share the one rule, and the UI never builds a label', () => {
    const dialog = readFileSync('src/components/wallet/RenameDialog.tsx', 'utf8')
    const store = readFileSync('src/pages/Chooser.tsx', 'utf8')
    const keystore = readFileSync('src/lib/crypto/keystore.ts', 'utf8')
    expect(dialog).toMatch(/validateWalletName\(/)
    expect(keystore).toMatch(/validateWalletName\(/)
    expect(store).not.toMatch(/label:/)
    expect(dialog + store).not.toMatch(/outline-none|:focus\b/)
  })
})
