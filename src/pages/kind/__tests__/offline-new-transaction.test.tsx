/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Offline Wallet's New transaction (story 6; OS-FR-11, OS-FR-13 to OS-FR-16,
 * EXPERIENCE "Offline round"). Real: the codec, the Data to Sign judgement, the
 * round store, the words. Faked: the keystore's record reads, and `signRound`,
 * whose real signature and decoded blob are pinned in
 * `lib/crypto/__tests__/offline-round-sign.test.ts` (jsdom cannot run xrpl.js's signer).
 */
const h = vi.hoisted(() => ({
  sign: vi.fn(),
  seen: null as null | { index: number; at: number },
  noted: [] as Array<[string, number]>,
  getXrplClient: vi.fn(),
  holdXrplClient: vi.fn(),
}))
vi.mock('@/lib/xrpl/client', () => ({ getXrplClient: h.getXrplClient, holdXrplClient: h.holdXrplClient }))
vi.mock('@/lib/crypto/keystore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/crypto/keystore')>()
  return {
    ...real,
    ledgerSeenOf: async () => h.seen,
    noteLedgerSeen: async (id: string, index: number) => void h.noted.push([id, index]),
  }
})
vi.mock('@/lib/offline-round', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/offline-round')>()
  return { ...real, signRound: (...a: unknown[]) => h.sign(...a) }
})
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))

import { OfflineNewTransaction } from '../OfflineNewTransaction'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { KeyWalletMeta } from '@/lib/crypto/keystore'
import { SigningCheckError } from '@/lib/crypto/keystore'
import { buildHashOf, eraseRoundsOfLocks, resetRounds, roundOf } from '@/lib/offline-round'
import * as W from '@/lib/offline-round-words'
import { encodeDataToSign, encodeSigned } from '@/lib/qr-codec'

const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const wallet: KeyWalletMeta = {
  id: 'off',
  seedId: 'off',
  lockId: 'L',
  label: 'Savings',
  createdAt: 1,
  network: 'testnet',
  openCheck: 'pin',
  kind: 'offline',
  address: ACCOUNT,
  keyAddress: ACCOUNT,
  algorithm: 'ed25519',
  seedMethod: 'stored',
  signingCheck: 'standard',
}

function mount() {
  render(
    <TooltipProvider>
      <OfflineNewTransaction wallet={wallet} />
    </TooltipProvider>,
  )
}
function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/Or paste the text of a code/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' }))
}
/** Builds a 2 XRP payment with tag 7 and opens the request. */
function toRequest() {
  fireEvent.change(screen.getByLabelText(W.SHIPPED.destinationAddress), { target: { value: DEST } })
  fireEvent.change(screen.getByLabelText(W.SHIPPED.destinationTagUnknown), { target: { value: '7' } })
  fireEvent.change(screen.getByLabelText(W.SHIPPED.amount), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: W.SHIPPED.reviewPayment }))
  fireEvent.click(screen.getByRole('button', { name: W.SHOW_THE_REQUEST }))
}
function keptRequest() {
  const r = roundOf(wallet.id)!
  if (r.phase.name !== 'request') throw new Error('not on the request')
  return { requestId: r.phase.requestId, buildHash: buildHashOf(r.build) }
}
const dataFor = (k: { requestId: string; buildHash: string }, over: Partial<{ network: 'testnet' | 'mainnet'; fee: string; ledgerIndex: number }> = {}) =>
  encodeDataToSign({ network: over.network ?? 'testnet', requestId: k.requestId, buildHash: k.buildHash, sequence: 9, fee: over.fee ?? '12', ledgerIndex: over.ledgerIndex ?? 5000 }).text
const alertText = () => screen.getAllByRole('alert').map((a) => a.textContent).join(' ')

beforeEach(() => {
  resetRounds()
  h.sign.mockReset()
  h.seen = null
  h.noted = []
  h.getXrplClient.mockReset()
  h.holdXrplClient.mockReset()
})
afterEach(cleanup)

describe('Offline Wallet: build and request (OS-FR-13, OS-FR-14)', () => {
  it('shows P-1 in each reading\'s slot, never a figure', () => {
    mount()
    expect(screen.getAllByText(W.FROM_TRANSMITTER)).toHaveLength(3)
    expect(screen.getByText(W.SHIPPED.networkFee)).toBeTruthy()
    expect(screen.getByText(W.SHIPPED.spendable)).toBeTruthy()
    expect(screen.queryByText(/^0(\.0+)? XRP/)).toBeNull()
  })

  it('refuses a self-send and an invalid address in online words; Review stays off', () => {
    mount()
    fireEvent.change(screen.getByLabelText(W.SHIPPED.destinationAddress), { target: { value: ACCOUNT } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED.amount), { target: { value: '1' } })
    expect(screen.getByText(W.SHIPPED.selfSend)).toBeTruthy()
    expect((screen.getByRole('button', { name: W.SHIPPED.reviewPayment }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(W.SHIPPED.destinationAddress), { target: { value: 'rNope' } })
    expect(screen.getByText(W.SHIPPED.invalidAddress)).toBeTruthy()
  })

  it('review → the request QR plate, titled and focused, with P-9, P-10 and the scan plate', async () => {
    mount()
    toRequest()
    const title = await screen.findByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })
    await waitFor(() => expect(document.activeElement).toBe(title))
    for (const words of [W.REQUEST_LINE, W.CHANGE_RESTARTS, W.SCAN_DATA_TITLE, W.SCAN_DATA_LINE]) expect(screen.getByText(words)).toBeTruthy()
    expect(screen.getByText('Testnet')).toBeTruthy()
    // The request carries the Build as typed, once.
    const r = roundOf(wallet.id)!
    expect(r.build).toEqual({ type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '2000000', destinationTag: 7 })
  })

  it('"Change the transaction" goes back with every value kept, and the next request has a new ID', () => {
    mount()
    toRequest()
    const first = keptRequest().requestId
    fireEvent.click(screen.getByRole('button', { name: W.CHANGE_THE_TRANSACTION }))
    expect((screen.getByLabelText(W.SHIPPED.destinationAddress) as HTMLInputElement).value).toBe(DEST)
    expect((screen.getByLabelText(W.SHIPPED.destinationTagUnknown) as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText(W.SHIPPED.amount) as HTMLInputElement).value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: W.SHIPPED.reviewPayment }))
    fireEvent.click(screen.getByRole('button', { name: W.SHOW_THE_REQUEST }))
    expect(keptRequest().requestId).not.toBe(first)
  })
})

describe('Offline Wallet: Data to Sign (OS-FR-16)', () => {
  it.each([
    ['another request', () => dataFor({ requestId: 'b'.repeat(32), buildHash: keptRequest().buildHash }), W.DATA_REFUSAL.request],
    ['another Network', () => dataFor(keptRequest(), { network: 'mainnet' }), 'This transaction is for Mainnet. This wallet is for Testnet.'],
    ['a Fee over the cap', () => dataFor(keptRequest(), { fee: '10000000' }), W.DATA_REFUSAL.fee],
    ['another kind of code', () => encodeSigned({ network: 'testnet', txBlob: 'AB' }).text, W.DATA_REFUSAL.malformed],
  ])('refuses %s with P-16 and P-17; the request stays', async (_n, make, reason) => {
    mount()
    toRequest()
    paste(make())
    await waitFor(() => expect(alertText()).toContain(reason))
    expect(alertText()).toContain(W.NOT_SIGNED)
    expect(screen.getByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })).toBeTruthy()
    expect(h.noted).toEqual([])
  })

  it('accepts the answer: the signing review with the well focused, P-13, P-51, the complete fields', async () => {
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    const well = await screen.findByRole('heading', { name: 'You are signing for Testnet' })
    await waitFor(() => expect(document.activeElement).toBe(well))
    expect(screen.getByText(W.TIME_LIMIT_TEN_MINUTES)).toBeTruthy()
    expect(screen.getByText('Valid until ledger 5150')).toBeTruthy()
    for (const term of ['Account', 'Destination', 'DestinationTag', 'Amount', 'Fee', 'Sequence', 'LastLedgerSequence']) expect(screen.getByText(term)).toBeTruthy()
    expect(h.noted).toEqual([[wallet.id, 5000]])
    expect(screen.queryByText(W.LEDGER_LOWER)).toBeNull()
  })

  it('warns (P-14) on an index lower than the highest seen, and still offers Sign', async () => {
    h.seen = { index: 6000, at: Date.now() }
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    expect(await screen.findByText(W.LEDGER_LOWER)).toBeTruthy()
    expect(screen.getByText(W.CHECK_THE_TRANSMITTER)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign' })).toBeTruthy()
  })

  it('warns (P-14) on an index too high for the time since the last one', async () => {
    h.seen = { index: 4000, at: Date.now() }
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    expect(await screen.findByText(W.LEDGER_TOO_HIGH)).toBeTruthy()
  })

  it('"Do not sign" goes back to the request with P-34\'s result; nothing is signed', async () => {
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    fireEvent.click(await screen.findByRole('button', { name: W.DO_NOT_SIGN }))
    expect(await screen.findByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })).toBeTruthy()
    expect(screen.getAllByRole('status').some((s) => s.textContent === W.NOT_SIGNED)).toBe(true)
    expect(h.sign).not.toHaveBeenCalled()
  })
})

describe('Offline Wallet: signed (OS-FR-11, OS-FR-13)', () => {
  const SIGNED = { text: encodeSigned({ network: 'testnet', txBlob: 'ABCD' }).text, hash: 'H', lastLedgerSequence: 5150, signedAt: new Date(2026, 10, 10, 14, 5).getTime() }

  it('Sign signs the kept Build plus the Data to Sign, then shows the signed QR, P-12 and the Kept transaction plate; no Send key', async () => {
    h.sign.mockResolvedValue(SIGNED)
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    })
    const [w, build, data] = h.sign.mock.calls[0]
    expect(w).toBe(wallet)
    expect(build).toEqual({ type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '2000000', destinationTag: 7 })
    expect(data).toMatchObject({ sequence: 9, fee: '12', ledger_index: 5000, network: 'testnet' })
    const heading = await screen.findByRole('heading', { name: W.SIGNED_NOT_SENT })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(screen.getByText(/^This transaction is valid until ledger 5150\. That is approximately 10 minutes after /)).toBeTruthy()
    expect(screen.getByText(W.KEPT_TITLE)).toBeTruthy()
    expect(screen.getByText(W.KEPT_LINE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
  })

  it('a dismissed Signing Check signs nothing and says so in the shipped words', async () => {
    h.sign.mockRejectedValue(new SigningCheckError({ status: 'cancelled' }))
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    })
    await waitFor(() => expect(alertText()).toContain('Cancelled. Nothing was signed.'))
    expect(screen.getByRole('heading', { name: 'You are signing for Testnet' })).toBeTruthy()
  })

  it.each([W.I_KNOW_THE_RESULT, W.CANCEL_THIS_TRANSACTION])('"%s" asks P-61 first: Keep it keeps, Erase empties the form', async (key) => {
    h.sign.mockResolvedValue(SIGNED)
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    })
    fireEvent.click(await screen.findByRole('button', { name: key }))
    expect(screen.getByText('Erase the kept transaction? The signed transaction is valid until ledger 5150.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: W.KEEP_IT }))
    expect(screen.getByText(W.KEPT_TITLE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: key }))
    fireEvent.click(screen.getByRole('button', { name: W.ERASE }))
    expect(roundOf(wallet.id)).toBeNull()
    expect((screen.getByLabelText(W.SHIPPED.destinationAddress) as HTMLInputElement).value).toBe('')
  })
})

describe('a lock erases the round (OS-FR-13, OS-FR-16)', () => {
  it('at the request, the Build and request ID go; the screen opens on an empty form', () => {
    mount()
    toRequest()
    act(() => eraseRoundsOfLocks(['L']))
    expect(roundOf(wallet.id)).toBeNull()
    expect(screen.queryByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })).toBeNull()
    expect((screen.getByLabelText(W.SHIPPED.destinationAddress) as HTMLInputElement).value).toBe('')
  })

  it('a lock during the Signing Check: the signed QR is never shown', async () => {
    let finish: (v: unknown) => void = () => {}
    h.sign.mockImplementation(() => new Promise((r) => (finish = r)))
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    act(() => eraseRoundsOfLocks(['L']))
    await act(async () => finish({ text: 'x', hash: 'H', lastLedgerSequence: 1, signedAt: 0 }))
    expect(roundOf(wallet.id)).toBeNull()
    expect(screen.queryByRole('heading', { name: W.SIGNED_NOT_SENT })).toBeNull()
  })
})

it('no ledger client is ever asked for during a round (OS-FR-1, OS-FR-13)', async () => {
  h.sign.mockResolvedValue({ text: encodeSigned({ network: 'testnet', txBlob: 'ABCD' }).text, hash: 'H', lastLedgerSequence: 5150, signedAt: Date.now() })
  mount()
  toRequest()
  paste(dataFor(keptRequest()))
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
  })
  await screen.findByText(W.KEPT_TITLE)
  expect(h.getXrplClient).not.toHaveBeenCalled()
  expect(h.holdXrplClient).not.toHaveBeenCalled()
})
