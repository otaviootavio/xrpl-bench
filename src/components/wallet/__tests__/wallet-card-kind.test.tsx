/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WalletCard } from '../WalletCard'
import { NOT_SYNCED } from '@/lib/wallet-kind-words'
import { WAS_ONLINE, WAS_ONLINE_WHY } from '@/lib/kind-change-words'
import type { WalletCardData } from '@/store/wallet-groups'
import { WALLET_SIGNS_FOR } from '@/lib/signs-for-words'
import { fill } from '@/lib/transmit-words'

/**
 * OS-FR-1: the chooser card shows the Wallet's kind in words, first in the Network
 * row, locked or open (a record field, not an Account read: UX owner ruling
 * 2026-11-08). A Transmitter card shows P-5 in place of an address.
 */
const ADDRESS = 'rKINDCARDaddressXXXXXXXXXXXX'
type Kind = WalletCardData['kind']
// A Transmitter's card address is its Synced address or null (story 4); the other kinds carry their Account.
const card = (kind: Kind, state: 'locked' | 'open', network: 'testnet' | 'mainnet' = 'testnet', address: string | null = kind === 'transmitter' ? null : ADDRESS, wasOnline = false, signsFor: string | null = null): WalletCardData =>
  state === 'locked'
    ? { state, walletId: 'w', lockId: 'L', label: 'Savings', address, signsFor, network, kind, wasOnline }
    : { state, walletId: 'w', lockId: 'L', label: 'Savings', address, signsFor, network, kind, wasOnline, allowsLock: true, hasNode: false }

function mount(data: WalletCardData) {
  render(
    <TooltipProvider>
      <ul>
        <WalletCard card={data} activeWalletId={null} onLock={vi.fn()} />
      </ul>
    </TooltipProvider>,
  )
  return screen.getByRole('listitem')
}

/** The Network row's words, in order. */
function networkRow(li: HTMLElement): string[] {
  const label = within(li).getByText(/^(Testnet|Mainnet)$/)
  return [...(label.parentElement as HTMLElement).children].map((e) => e.textContent ?? '')
}

afterEach(cleanup)

describe('chooser card, per kind (OS-FR-1)', () => {
  for (const state of ['locked', 'open'] as const) {
    it(`${state}: Online, the kind stamp then the Network, and the address link`, () => {
      const li = mount(card('online', state, 'mainnet'))
      expect(networkRow(li)).toEqual(['Online', 'Mainnet', 'Real funds'])
      expect(within(li).getByRole('heading', { name: 'Savings' })).toBeTruthy()
      expect(li.querySelector(`a[href*="${ADDRESS}"]`)).not.toBeNull()
    })

    it(`${state}: Offline, [Offline] TESTNET and the address link`, () => {
      const li = mount(card('offline', state))
      expect(networkRow(li)).toEqual(['Offline', 'Testnet'])
      expect(li.querySelector(`a[href*="${ADDRESS}"]`)).not.toBeNull()
    })

    it(`${state}: a marked Offline Wallet, [Offline] [Was online] TESTNET, then P-4 under the row (OS-FR-7)`, () => {
      const li = mount(card('offline', state, 'testnet', ADDRESS, true))
      expect(networkRow(li)).toEqual(['Offline', WAS_ONLINE, 'Testnet'])
      const why = within(li).getByText(WAS_ONLINE_WHY)
      // The sentence follows the row it explains.
      const row = within(li).getByText(WAS_ONLINE).parentElement as HTMLElement
      expect(row.nextElementSibling).toBe(why)
      // A caution stamp: the warning pair, never a colour alone.
      expect(within(li).getByText(WAS_ONLINE).className).toContain('bg-warning')
    })

    it(`${state}: an unmarked Offline Wallet shows no Was-online stamp and no P-4`, () => {
      const li = mount(card('offline', state))
      expect(li.textContent).not.toContain(WAS_ONLINE)
      expect(li.textContent).not.toContain(WAS_ONLINE_WHY)
    })

    it(`${state}: Transmitter, [Transmitter] TESTNET and "Not synced", never the address`, () => {
      const li = mount(card('transmitter', state))
      expect(networkRow(li)).toEqual(['Transmitter', 'Testnet'])
      expect(within(li).getByText(NOT_SYNCED)).toBeTruthy()
      expect(li.textContent).not.toContain(ADDRESS)
      expect(li.querySelector('a')).toBeNull()
    })

    it(`${state}: a Synced Transmitter shows its Synced address link (OS-FR-4)`, () => {
      const li = mount(card('transmitter', state, 'testnet', ADDRESS))
      expect(networkRow(li)).toEqual(['Transmitter', 'Testnet'])
      expect(li.querySelector(`a[href*="${ADDRESS}"]`)).not.toBeNull()
      expect(li.textContent).not.toContain(NOT_SYNCED)
    })
  }

  it('the stamp is the outline badge, a word and not a colour', () => {
    const li = mount(card('offline', 'locked'))
    const stamp = within(li).getByText('Offline')
    expect(stamp.className).toContain('border-input')
    expect(stamp.className).toContain('bg-transparent')
  })

  it('a key Wallet that Signs for another Account shows P-17\'s sentence with it, locked or open, and nothing when it signs for itself (OS-FR-20)', () => {
    for (const kind of ['online', 'offline'] as const) {
      for (const state of ['locked', 'open'] as const) {
        const li = mount(card(kind, state, 'testnet', ADDRESS, false, 'rSIGNSFORaccountXXXXXXXXXXXX'))
        expect(within(li).getByText(fill(WALLET_SIGNS_FOR, 'rSIGNSFORaccountXXXXXXXXXXXX'))).toBeTruthy()
        cleanup()
        const plain = mount(card(kind, state))
        expect(within(plain).queryByText(/This wallet signs for/)).toBeNull()
        cleanup()
      }
    }
  })
})
