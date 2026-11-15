/** @vitest-environment jsdom */
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { hashes } from 'xrpl'
import { PinPromptProvider } from '../PinPromptDialog'
import { usePrompts, useYieldingPrompts } from '@/hooks/usePrompts'
import type { Prompts, WalletMeta } from '@/lib/crypto/keystore'
import { useAppStore } from '@/store/app-store'
import type { SignedForReview } from '@/lib/xrpl/writes'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {} }))

/**
 * "Show the signed transaction before sending" (OS-FR-10, EXPERIENCE "Transmit
 * step"). The screen answers on every exit, because the write's in-flight depth
 * stays raised until it does: Send is yes; Do not send, the close control, a
 * lock, leaving and unmounting are no.
 */

// A real blob, signed outside jsdom by the test seed `sEdTM1uX8pu2do5XvTnutH6HsouMaM2`:
// 1 XRP to rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe, Fee 12, Sequence 1, LastLedgerSequence 70.
const BLOB =
  '12000022000000002400000001201B000000466140000000000F424068400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F07440B482A4CBE8A2076AD7CF51268F097151D4182BDBEE1DEE6BBA82E3DA0BF8F99AE246E5D95834C3E177AB9821A282E7E93453F9A856AA09A67707110C2CFCA00A8114A6070B8A1822E3322676A99F0C804EE2D15B82708314F667B0CA50CC7709A220B0561B85E53A48461FA8'
const SIGNED: SignedForReview = { txBlob: BLOB, hash: hashes.hashSignedTx(BLOB), network: 'testnet', lastLedgerSequence: 70 }
const WARNING = 'WARNING: This signed transaction is valid until ledger 70. Until then, a person who has it can send it.'

const captured: { prompts?: Prompts; open?: boolean } = {}
function Probe({ yielding }: { yielding?: boolean }) {
  const plain = usePrompts()
  const y = useYieldingPrompts()
  const current = yielding ? y.prompts : plain
  useEffect(() => {
    captured.prompts = current
    captured.open = y.promptOpen
  })
  return null
}
const mount = (yielding = false) =>
  render(
    <PinPromptProvider>
      <Probe yielding={yielding} />
    </PinPromptProvider>,
  )

function ask(): Promise<boolean> {
  let answer!: Promise<boolean>
  act(() => {
    answer = captured.prompts!.reviewSignedTransaction!(SIGNED)
  })
  return answer
}

beforeEach(() => {
  useAppStore.setState({
    wallets: [{ id: 'w', lockId: 'L', network: 'testnet', address: 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL', kind: 'online' } as WalletMeta],
    activeWalletId: 'w',
    openLocks: { L: { key: {} as CryptoKey, autoLockMinutes: 5 } },
  })
  window.history.replaceState(null, '', '/wallets/w')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the show-before-sending screen (OS-FR-10)', () => {
  it('shows the hash and the decoded fields in the ledger names, and focuses the question, never Send', async () => {
    mount()
    void ask()
    expect(await screen.findByText('Transaction hash')).toBeTruthy()
    expect(screen.getByText(SIGNED.hash)).toBeTruthy()
    for (const name of ['TransactionType', 'Account', 'Destination', 'Amount', 'Fee', 'Sequence', 'LastLedgerSequence']) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    expect(screen.getByText('1 XRP')).toBeTruthy()
    expect(screen.getByText('0.000012 XRP')).toBeTruthy()
    const question = screen.getByRole('heading', { name: 'Send it to the ledger?' })
    expect(document.activeElement).toBe(question)
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Do not send' })).toBeTruthy()
  })

  it('Send answers yes, and the blob leaves the screen', async () => {
    mount()
    const answer = ask()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    })
    expect(await answer).toBe(true)
    expect(screen.queryByText(SIGNED.hash)).toBeNull()
  })

  it('Do not send answers no', async () => {
    mount()
    const answer = ask()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Do not send' }))
    })
    expect(await answer).toBe(false)
  })

  it('the close control answers no', async () => {
    mount()
    const answer = ask()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    })
    expect(await answer).toBe(false)
  })

  it('Copy puts the blob on the clipboard and shows P-24 in a status, and it stays', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount()
    void ask()
    expect(screen.queryByText(WARNING)).toBeNull()
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))
    })
    expect(writeText).toHaveBeenCalledWith(BLOB)
    const status = screen.getByText(WARNING).closest('[role="status"]')
    expect(status).not.toBeNull()
    expect(screen.getByText(WARNING)).toBeTruthy()
  })

  it('a lock while the screen is open answers no', async () => {
    mount()
    const answer = ask()
    await screen.findByText('Transaction hash')
    await act(async () => useAppStore.setState({ openLocks: {} }))
    expect(await answer).toBe(false)
    await waitFor(() => expect(screen.queryByText('Transaction hash')).toBeNull())
  })

  it('leaving the screen answers no', async () => {
    mount()
    const answer = ask()
    await screen.findByText('Transaction hash')
    await act(async () => {
      window.history.pushState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(await answer).toBe(false)
  })

  it('unmounting answers no', async () => {
    const view = mount()
    const answer = ask()
    await screen.findByText('Transaction hash')
    view.unmount()
    expect(await answer).toBe(false)
  })

  it('a sheet that started the send yields while the screen is open', async () => {
    mount(true)
    expect(captured.open).toBe(false)
    const answer = ask()
    await screen.findByText('Transaction hash')
    expect(captured.open).toBe(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Do not send' }))
    })
    expect(await answer).toBe(false)
    expect(captured.open).toBe(false)
  })
})
