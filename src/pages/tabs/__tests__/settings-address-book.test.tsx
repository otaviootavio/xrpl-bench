/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 9.2, moved by Epic 23 story 23.2 — the Address Book plate in the Wallet tab (AD-50).
 *
 * - A row renders the address once, through `AddressLink`, plus the tag when
 *   there is one; a label only when a human gave one. Nothing renders a
 *   truncated address as though it were a name.
 * - Two entries at one address are two rows with two React keys, derived from
 *   the identity function — a duplicate key is the defect this change would
 *   otherwise introduce.
 *
 * Real: `AddressBookPlate` and the app store. Faked: the persistence sink and the
 * modules Settings needs but this list does not (same set as
 * `settings-full-reset.test.tsx`).
 */

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  listWallets: async () => [],
  removeWallet: async () => {},
  revealSeed: async () => '',
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false,
    applying: false,
    applyUpdate: () => {},
    checking: false,
    checkError: null,
    checkForUpdate: () => {},
    pendingRelease: null,
    blockedReason: null,
    declined: false,
    declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
  formatBuiltAt: () => '',
}))

import { AddressBookPlate, ADDRESS_BOOK_CAP } from '@/components/wallet/AddressBookPlate'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'
import { accountExplorerUrl } from '@/lib/xrpl/networks'

const EXCHANGE = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const OTHER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <AddressBookPlate walletId="w1" />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

/** The Address Book card's own subtree, so a stray match elsewhere in
 * Settings cannot satisfy an assertion about the list. */
function addressBookCard(): HTMLElement {
  return screen.getByRole('region', { name: 'Address Book' })
}

/** Each `dt` legend with the text of the value it names. */
function legendsIn(root: Element): [string | null, string | null | undefined][] {
  return [...root.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  useAppStore.setState({ addressBook: {}, wallets: [], activeWalletId: null, network: 'testnet' } as never)
})

afterEach(() => {
  cleanup()
  consoleError.mockRestore()
})

describe('Wallet tab — the Address Book plate', () => {
  it('lists only this wallet\'s own entries, never another wallet\'s', () => {
    useAppStore.setState({ addressBook: { w1: [{ address: EXCHANGE }], w2: [{ address: OTHER }] } } as never)
    renderSettings()
    expect(within(addressBookCard()).getByText(EXCHANGE)).toBeTruthy()
    expect(within(addressBookCard()).queryByText(OTHER)).toBeNull()
  })

  it('shows the first 10 and "Show all N" for 14; pressing it lists all 14 and offers "Show first 10"', () => {
    const entries = Array.from({ length: 14 }, (_, i) => ({ address: EXCHANGE, destinationTag: String(i + 1) }))
    useAppStore.setState({ addressBook: { w1: entries } } as never)
    renderSettings()
    expect(addressBookCard().querySelectorAll('dl')).toHaveLength(ADDRESS_BOOK_CAP)
    const key = within(addressBookCard()).getByRole('button', { name: 'Show all 14' })
    expect(key.getAttribute('aria-expanded')).toBe('false')
    // The first 10 in stored order.
    expect([...addressBookCard().querySelectorAll('dl')].map((dl) => legendsIn(dl).find(([t]) => t === 'Destination tag')?.[1])).toEqual(
      entries.slice(0, 10).map((e) => e.destinationTag),
    )
    fireEvent.click(key)
    expect(addressBookCard().querySelectorAll('dl')).toHaveLength(14)
    const back = within(addressBookCard()).getByRole('button', { name: 'Show first 10' })
    expect(back.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(back)
    expect(addressBookCard().querySelectorAll('dl')).toHaveLength(10)
  })

  it.each([10, 0])('has no Show all key for %i entries', (n) => {
    useAppStore.setState({ addressBook: { w1: Array.from({ length: n }, (_, i) => ({ address: EXCHANGE, destinationTag: String(i) })) } } as never)
    renderSettings()
    expect(within(addressBookCard()).queryByRole('button')).toBeNull()
  })

  it('shows all 11 behind the key', () => {
    useAppStore.setState({ addressBook: { w1: Array.from({ length: 11 }, (_, i) => ({ address: EXCHANGE, destinationTag: String(i) })) } } as never)
    renderSettings()
    expect(addressBookCard().querySelectorAll('dl')).toHaveLength(10)
    expect(within(addressBookCard()).getByRole('button', { name: 'Show all 11' })).toBeTruthy()
  })

  it('renders two entries at one address as two rows with unique keys', () => {
    useAppStore.setState({
      addressBook: { w1: [{ address: EXCHANGE, destinationTag: '1' }, { address: EXCHANGE, destinationTag: '2' }, { address: EXCHANGE }] },
    } as never)
    renderSettings()

    const card = addressBookCard()
    expect(within(card).getAllByText(EXCHANGE)).toHaveLength(3)
    expect(within(card).getByText('1')).toBeTruthy()
    expect(within(card).getByText('2')).toBeTruthy()
    // React renders both rows even when keys collide, so the row count alone
    // proves nothing. What a collision does leave behind is this warning.
    const duplicateKey = consoleError.mock.calls.some((args: unknown[]) => args.some((a) => typeof a === 'string' && /same key/i.test(a)))
    expect(duplicateKey).toBe(false)
  })

  it('shows the address once, in full, and no label invented from it', () => {
    useAppStore.setState({ addressBook: { w1: [{ address: EXCHANGE }] } } as never)
    renderSettings()

    const card = addressBookCard()
    expect(within(card).getAllByText(EXCHANGE)).toHaveLength(1)
    expect(within(card).queryByText(EXCHANGE.slice(0, 8))).toBeNull()
    expect(within(card).queryByText('Label')).toBeNull()
  })

  it('names the tag in words, so it is told apart from the address by more than colour', () => {
    useAppStore.setState({ addressBook: { w1: [{ address: EXCHANGE, destinationTag: '12345' }] } } as never)
    renderSettings()

    const card = addressBookCard()
    const tag = within(card).getByText('12345')
    // The legend is the tag's own <dt>, read as the term for that value.
    expect(tag.closest('div')?.querySelector('dt')?.textContent).toBe('Destination tag')
  })

  it('shows no tag legend for a tagless entry recorded on a network', () => {
    useAppStore.setState({ addressBook: { w1: [{ address: OTHER, network: 'testnet' }] } } as never)
    renderSettings()

    expect(within(addressBookCard()).queryByText('Destination tag')).toBeNull()
    expect(within(addressBookCard()).queryByText('Not recorded')).toBeNull()
  })

  it('says "Not recorded" for both the network and the tag of an entry saved before networks were recorded', () => {
    useAppStore.setState({ addressBook: { w1: [{ address: OTHER }] } } as never)
    renderSettings()

    expect(legendsIn(addressBookCard())).toContainEqual(['Network', 'Not recorded'])
    expect(legendsIn(addressBookCard())).toContainEqual(['Destination tag', 'Not recorded'])
  })

  it('an entry with a tag but no recorded network shows its tag and "Network: Not recorded"', () => {
    useAppStore.setState({ addressBook: { w1: [{ address: OTHER, destinationTag: '1' }] } } as never)
    renderSettings()

    const legends = legendsIn(addressBookCard())
    expect(legends).toContainEqual(['Network', 'Not recorded'])
    expect(legends).toContainEqual(['Destination tag', '1'])
    expect(legends).not.toContainEqual(['Destination tag', 'Not recorded'])
  })

  it("lists every network's entries, each with its Network legend and its own explorer link", () => {
    useAppStore.setState({
      network: 'mainnet',
      addressBook: { w1: [{ address: EXCHANGE }, { address: EXCHANGE, network: 'testnet' }, { address: EXCHANGE, network: 'mainnet' }] },
    } as never)
    renderSettings()

    const rows = [...addressBookCard().querySelectorAll('dl')]
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => legendsIn(row).find(([dt]) => dt === 'Network')?.[1])).toEqual(['Not recorded', 'Testnet', 'Mainnet'])
    // A Testnet row viewed on Mainnet links to the Testnet explorer; an
    // unrecorded row falls back to the active network.
    expect(rows.map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual([
      accountExplorerUrl('mainnet', EXCHANGE),
      accountExplorerUrl('testnet', EXCHANGE),
      accountExplorerUrl('mainnet', EXCHANGE),
    ])
    expect(accountExplorerUrl('testnet', EXCHANGE)).not.toBe(accountExplorerUrl('mainnet', EXCHANGE))
    const duplicateKey = consoleError.mock.calls.some((args: unknown[]) => args.some((a) => typeof a === 'string' && /same key/i.test(a)))
    expect(duplicateKey).toBe(false)
  })

  it('shows a human label when there is one', () => {
    useAppStore.setState({ addressBook: { w1: [{ address: OTHER, label: 'Landlord' }] } } as never)
    renderSettings()

    expect(within(addressBookCard()).getByText('Landlord')).toBeTruthy()
  })

  it('keeps the empty-state copy that says addresses are saved automatically', () => {
    renderSettings()

    expect(within(addressBookCard()).getByText(/saved here automatically/)).toBeTruthy()
  })
})
