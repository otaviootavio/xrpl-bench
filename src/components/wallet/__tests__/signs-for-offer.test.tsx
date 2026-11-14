/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P-54 at the Transmit step's outcome (offline signing story 10; OS-FR-20): after a
 * validated Regular Key change, the key's Wallet here is offered "Set it" · "Not now";
 * a key elsewhere gets the second form. Faked: the keystore write.
 */
const h = vi.hoisted(() => ({ setSignsFor: vi.fn() }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/keystore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto/keystore')>()
  return { ...actual, setSignsFor: (...a: unknown[]) => h.setSignsFor(...a) }
})

import { ResultView } from '../TransmitStep'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'
import { SignsForRefusedError, type KeyWalletMeta } from '@/lib/crypto/keystore'
import type { StepResult } from '@/lib/transmit-step'

const K = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const X = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const keyWallet = (address = K): KeyWalletMeta =>
  ({ id: 'k', seedId: 'k', lockId: 'L', label: 'Cold key', address, keyAddress: K, createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'offline' }) as KeyWalletMeta
const validated = (regularKeySet?: { account: string; regularKey: string; network: 'testnet' }): StepResult => ({
  kind: 'outcome',
  outcome: { status: 'validated', hash: 'A'.repeat(64), resultCode: 'tesSUCCESS' } as never,
  ...(regularKeySet ? { regularKeySet } : {}),
})

function mount(result: StepResult) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ResultView result={result} headingRef={createRef()} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.setSignsFor.mockReset()
})
afterEach(cleanup)

describe('P-54 (OS-FR-20)', () => {
  it('the key is a Wallet here: "Set the wallet {name} to sign for this account?"; Set it sets it and the offer closes', async () => {
    useAppStore.setState({ wallets: [keyWallet()] } as never)
    h.setSignsFor.mockResolvedValue(keyWallet(X))
    mount(validated({ account: X, regularKey: K, network: 'testnet' }))
    expect(screen.getByText('Set the wallet Cold key to sign for this account?')).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Set it' })))
    expect(h.setSignsFor).toHaveBeenCalledWith('k', X)
    await waitFor(() => expect(screen.queryByText(/Set the wallet/)).toBeNull())
    expect(useAppStore.getState().wallets[0]).toMatchObject({ address: X })
  })

  it('Not now closes it and writes nothing', () => {
    useAppStore.setState({ wallets: [keyWallet()] } as never)
    mount(validated({ account: X, regularKey: K, network: 'testnet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/Set the wallet/)).toBeNull()
    expect(h.setSignsFor).not.toHaveBeenCalled()
  })

  it('a refusal by FR-93 shows P-35 and keeps the offer', async () => {
    useAppStore.setState({ wallets: [keyWallet()] } as never)
    h.setSignsFor.mockImplementation(async () => {
      throw new SignsForRefusedError('duplicate', 'Another wallet on this device has this address on Testnet.')
    })
    mount(validated({ account: X, regularKey: K, network: 'testnet' }))
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Set it' })))
    expect(screen.getByRole('alert').textContent).toBe('Another wallet on this device has this address on Testnet.')
    expect(screen.getByRole('button', { name: 'Set it' })).toBeTruthy()
  })

  it('the key is elsewhere: the second form, with no keys', () => {
    useAppStore.setState({ wallets: [] } as never)
    mount(validated({ account: X, regularKey: K, network: 'testnet' }))
    expect(screen.getByText('In the wallet that has this key, set the key to sign for this account.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('no offer for any other outcome', () => {
    useAppStore.setState({ wallets: [keyWallet()] } as never)
    mount(validated())
    expect(screen.queryByText(/sign for this account/)).toBeNull()
  })
})
