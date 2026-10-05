/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 9.2 — the Address Book list in Settings.
 *
 * - A row renders the address once, through `AddressLink`, plus the tag when
 *   there is one; a label only when a human gave one. Nothing renders a
 *   truncated address as though it were a name.
 * - Two entries at one address are two rows with two React keys, derived from
 *   the identity function — a duplicate key is the defect this change would
 *   otherwise introduce.
 *
 * Real: the Settings tab and the app store. Faked: the persistence sink and the
 * modules Settings needs but this list does not (same set as
 * `settings-full-reset.test.tsx`).
 */

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {}, endSession: async () => {} }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  generateAndStoreWallet: async () => {},
  importAndStoreWallet: async () => {},
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

import { SettingsTab } from '../SettingsTab'
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
        <SettingsTab />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

/** The Address Book card's own subtree, so a stray match elsewhere in
 * Settings cannot satisfy an assertion about the list. */
function addressBookCard(): HTMLElement {
  return screen.getByText('Address book').closest('[data-slot="card"]') as HTMLElement
}

/** Each `dt` legend with the text of the value it names. */
function legendsIn(root: Element): [string | null, string | null | undefined][] {
  return [...root.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  useAppStore.setState({ addressBook: [], wallets: [], activeWalletId: null, network: 'testnet' } as never)
})

afterEach(() => {
  cleanup()
  consoleError.mockRestore()
})

describe('Settings — the Address Book list', () => {
  it('renders two entries at one address as two rows with unique keys', () => {
    useAppStore.setState({
      addressBook: [{ address: EXCHANGE, destinationTag: '1' }, { address: EXCHANGE, destinationTag: '2' }, { address: EXCHANGE }],
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
    useAppStore.setState({ addressBook: [{ address: EXCHANGE }] } as never)
    renderSettings()

    const card = addressBookCard()
    expect(within(card).getAllByText(EXCHANGE)).toHaveLength(1)
    expect(within(card).queryByText(EXCHANGE.slice(0, 8))).toBeNull()
    expect(within(card).queryByText('Label')).toBeNull()
  })

  it('names the tag in words, so it is told apart from the address by more than colour', () => {
    useAppStore.setState({ addressBook: [{ address: EXCHANGE, destinationTag: '12345' }] } as never)
    renderSettings()

    const card = addressBookCard()
    const tag = within(card).getByText('12345')
    // The legend is the tag's own <dt>, read as the term for that value.
    expect(tag.closest('div')?.querySelector('dt')?.textContent).toBe('Destination tag')
  })

  it('shows no tag legend for a tagless entry recorded on a network', () => {
    useAppStore.setState({ addressBook: [{ address: OTHER, network: 'testnet' }] } as never)
    renderSettings()

    expect(within(addressBookCard()).queryByText('Destination tag')).toBeNull()
    expect(within(addressBookCard()).queryByText('Not recorded')).toBeNull()
  })

  it('says "Not recorded" for both the network and the tag of an entry saved before networks were recorded', () => {
    useAppStore.setState({ addressBook: [{ address: OTHER }] } as never)
    renderSettings()

    expect(legendsIn(addressBookCard())).toContainEqual(['Network', 'Not recorded'])
    expect(legendsIn(addressBookCard())).toContainEqual(['Destination tag', 'Not recorded'])
  })

  it('an entry with a tag but no recorded network shows its tag and "Network: Not recorded"', () => {
    useAppStore.setState({ addressBook: [{ address: OTHER, destinationTag: '1' }] } as never)
    renderSettings()

    const legends = legendsIn(addressBookCard())
    expect(legends).toContainEqual(['Network', 'Not recorded'])
    expect(legends).toContainEqual(['Destination tag', '1'])
    expect(legends).not.toContainEqual(['Destination tag', 'Not recorded'])
  })

  it("lists every network's entries, each with its Network legend and its own explorer link", () => {
    useAppStore.setState({
      network: 'mainnet',
      addressBook: [{ address: EXCHANGE }, { address: EXCHANGE, network: 'testnet' }, { address: EXCHANGE, network: 'mainnet' }],
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
    useAppStore.setState({ addressBook: [{ address: OTHER, label: 'Landlord' }] } as never)
    renderSettings()

    expect(within(addressBookCard()).getByText('Landlord')).toBeTruthy()
  })

  it('keeps the empty-state copy that says addresses are saved automatically', () => {
    renderSettings()

    expect(within(addressBookCard()).getByText(/saved here automatically/)).toBeTruthy()
  })
})
