/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WalletCard } from '../WalletCard'
import { NOT_SYNCED } from '@/lib/wallet-kind-words'
import type { WalletCardData } from '@/store/wallet-groups'

/**
 * OS-FR-1: the chooser card shows the Wallet's kind in words, first in the Network
 * row, locked or open (a record field, not an Account read: UX owner ruling
 * 2026-11-08). A Transmitter card shows P-5 in place of an address.
 */
const ADDRESS = 'rKINDCARDaddressXXXXXXXXXXXX'
type Kind = WalletCardData['kind']
const card = (kind: Kind, state: 'locked' | 'open', network: 'testnet' | 'mainnet' = 'testnet'): WalletCardData =>
  state === 'locked'
    ? { state, walletId: 'w', lockId: 'L', label: 'Savings', address: ADDRESS, network, kind }
    : { state, walletId: 'w', lockId: 'L', label: 'Savings', address: ADDRESS, network, kind, allowsLock: true, hasNode: false }

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

    it(`${state}: Transmitter, [Transmitter] TESTNET and "Not synced", never the address`, () => {
      const li = mount(card('transmitter', state))
      expect(networkRow(li)).toEqual(['Transmitter', 'Testnet'])
      expect(within(li).getByText(NOT_SYNCED)).toBeTruthy()
      expect(li.textContent).not.toContain(ADDRESS)
      expect(li.querySelector('a')).toBeNull()
    })
  }

  it('the stamp is the outline badge, a word and not a colour', () => {
    const li = mount(card('offline', 'locked'))
    const stamp = within(li).getByText('Offline')
    expect(stamp.className).toContain('border-input')
    expect(stamp.className).toContain('bg-transparent')
  })
})
