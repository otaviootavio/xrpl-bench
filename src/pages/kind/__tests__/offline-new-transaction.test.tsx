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
import type { SignedRecord } from '@/lib/signed-list'
const h = vi.hoisted(() => ({
  sign: vi.fn(),
  seen: null as null | { index: number; at: number },
  noted: [] as Array<[string, number]>,
  /** The signed list as stored; `null` makes its read fail. */
  signed: [] as SignedRecord[] | null,
  written: [] as SignedRecord[],
  writeFails: false,
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
    signedListOf: async () => {
      if (h.signed === null) throw new Error('unreadable')
      return [...h.signed]
    },
    noteSigned: async (_id: string, record: SignedRecord) => {
      if (h.writeFails) throw new Error('quota')
      h.written.push(record)
      h.signed?.push(record)
    },
  }
})
vi.mock('@/lib/offline-round', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/offline-round')>()
  return { ...real, signRound: (...a: unknown[]) => h.sign(...a) }
})
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))

import { OfflineNewTransaction } from '../OfflineNewTransaction'
import { OfflineSigned } from '../OfflineSigned'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { KeyWalletMeta } from '@/lib/crypto/keystore'
import { SigningCheckError } from '@/lib/crypto/keystore'
import { buildHashOf, eraseRoundsOfLocks, resetRounds, roundOf } from '@/lib/offline-round'
import * as W from '@/lib/offline-round-words'
import { encodeDataToSign, encodeSigned } from '@/lib/qr-codec'
import { touchLock, useAppStore } from '@/store/app-store'
import { LEDGER_FLOORS } from '@/lib/offline-window'

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
const dataFor = (k: { requestId: string; buildHash: string }, over: Partial<{ network: 'testnet' | 'mainnet'; fee: string; ledgerIndex: number; sequence: number }> = {}) =>
  encodeDataToSign({ network: over.network ?? 'testnet', requestId: k.requestId, buildHash: k.buildHash, sequence: over.sequence ?? 9, fee: over.fee ?? '12', ledgerIndex: over.ledgerIndex ?? INDEX }).text
/** An index the Testnet floor accepts as current (no P-14). */
const INDEX = LEDGER_FLOORS.testnet.index + 10
const alertText = () => screen.getAllByRole('alert').map((a) => a.textContent).join(' ')

beforeEach(() => {
  resetRounds()
  h.sign.mockReset()
  h.seen = null
  h.noted = []
  h.signed = []
  h.written = []
  h.writeFails = false
  h.getXrplClient.mockReset()
  h.holdXrplClient.mockReset()
})
afterEach(cleanup)

describe('Offline Wallet: build and request (OS-FR-13, OS-FR-14)', () => {
  it('shows P-1 in each reading\'s slot, never a figure, under "Type of transaction"', () => {
    mount()
    expect(screen.getByRole('group', { name: W.TYPE_OF_TRANSACTION })).toBeTruthy()
    expect((screen.getByRole('radio', { name: W.PAYMENT }) as HTMLInputElement).checked).toBe(true)
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
    for (const words of [W.REQUEST_LINE, W.CHANGE_RESTARTS, W.SCAN_DATA_TITLE, W.SCAN_DATA_LINE, 'Scan 1 of 3', 'Scan 2 of 3']) expect(screen.getByText(words)).toBeTruthy()
    expect(await screen.findByAltText('QR code: data to sign needed for Testnet')).toBeTruthy()
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
    ['a signed code (P-36)', () => encodeSigned({ network: 'testnet', txBlob: 'AB' }).text, 'This code is a signed transaction. This screen needs a data to sign.'],
    ['a ledger index past the UInt32 window', () => dataFor(keptRequest(), { ledgerIndex: 4294967295 - 149 }), W.DATA_REFUSAL.malformed],
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
    expect(screen.getByText(`Valid until ledger ${INDEX + 150}`)).toBeTruthy()
    for (const term of ['Account', 'Destination', 'DestinationTag', 'Amount', 'Fee', 'Sequence', 'LastLedgerSequence']) expect(screen.getByText(term)).toBeTruthy()
    // Saved only once signed with (story 6 review).
    expect(h.noted).toEqual([])
    expect(screen.queryByText(W.LEDGER_LOWER)).toBeNull()
    expect(screen.queryByText(W.LEDGER_TOO_HIGH)).toBeNull()
    expect(screen.getByText(W.SIGNING_KEY)).toBeTruthy()
    expect(screen.getByText(W.SIGNING_KEY).nextElementSibling?.textContent).toBe(wallet.keyAddress)
  })

  it('warns (P-14) on an index lower than the highest seen, and still offers Sign', async () => {
    h.seen = { index: INDEX + 1000, at: Date.now() }
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    expect(await screen.findByText(W.LEDGER_LOWER)).toBeTruthy()
    expect(screen.getByText(W.CHECK_THE_TRANSMITTER)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign' })).toBeTruthy()
  })

  it('warns (P-14) on an index too high for the time since the last one', async () => {
    h.seen = { index: INDEX - 1000, at: Date.now() }
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
    // A declined answer never moves the highest seen (story 6 review).
    expect(h.noted).toEqual([])
  })
})

describe('Offline Wallet: signed (OS-FR-11, OS-FR-13)', () => {
  const SIGNED = { text: encodeSigned({ network: 'testnet', txBlob: 'ABCD' }).text, hash: 'A'.repeat(64), sequence: 9, fee: '12', lastLedgerSequence: INDEX + 150, signedAt: new Date(2026, 10, 10, 14, 5).getTime() }

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
    expect(data).toMatchObject({ sequence: 9, fee: '12', ledger_index: INDEX, network: 'testnet' })
    const heading = await screen.findByRole('heading', { name: W.SIGNED_TRANSACTION_TITLE })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(screen.getByText(W.SIGNED_NOT_SENT)).toBeTruthy()
    expect(screen.getByText(new RegExp(`^This transaction is valid until ledger ${INDEX + 150}\\. That is approximately 10 minutes after `))).toBeTruthy()
    expect(screen.getByText('Scan 3 of 3')).toBeTruthy()
    // Signed: the highest seen is saved, and the Kept plate shows the signed Fee and Sequence.
    expect(h.noted).toEqual([[wallet.id, INDEX]])
    expect(screen.getByText('0.000012 XRP')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.queryByText(W.FROM_TRANSMITTER)).toBeNull()
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
    expect(screen.getByText(`Erase the kept transaction? The signed transaction is valid until ledger ${INDEX + 150}.`)).toBeTruthy()
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
    await act(async () => finish({ text: 'x', hash: 'A'.repeat(64), sequence: 9, fee: '12', lastLedgerSequence: 1, signedAt: 0 }))
    expect(roundOf(wallet.id)).toBeNull()
    expect(screen.queryByRole('heading', { name: W.SIGNED_TRANSACTION_TITLE })).toBeNull()
  })
})

it('no ledger client is ever asked for during a round (OS-FR-1, OS-FR-13)', async () => {
  h.sign.mockResolvedValue({ text: encodeSigned({ network: 'testnet', txBlob: 'ABCD' }).text, hash: 'A'.repeat(64), sequence: 9, fee: '12', lastLedgerSequence: 5150, signedAt: Date.now() })
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

describe('P-58 before an auto-lock during a round (EXPERIENCE "Round timing")', () => {
  afterEach(() => useAppStore.setState({ wallets: [], openLocks: {} } as never))
  it('shows "This wallet locks in 1 minute…" with "Keep it unlocked" once a minute or less is left', async () => {
    useAppStore.setState({ wallets: [wallet], openLocks: { L: { key: {} as CryptoKey, autoLockMinutes: 1 } } } as never)
    touchLock(wallet.id)
    mount()
    expect(screen.queryByText(W.LOCKS_SOON)).toBeNull()
    toRequest()
    expect(await screen.findByText(W.LOCKS_SOON)).toBeTruthy()
    expect(screen.getByRole('button', { name: W.KEEP_IT_UNLOCKED })).toBeTruthy()
  })

  it('says nothing while more than a minute is left', async () => {
    useAppStore.setState({ wallets: [wallet], openLocks: { L: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
    touchLock(wallet.id)
    mount()
    toRequest()
    await screen.findByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })
    expect(screen.queryByText(W.LOCKS_SOON)).toBeNull()
  })
})

describe('retry without paying twice (story 7; OS-FR-16)', () => {
  /** The Build `toRequest` types: 2 XRP to DEST, tag 7. */
  const BUILD = { type: 'payment' as const, account: ACCOUNT, destination: DEST, amountDrops: '2000000', destinationTag: 7 }
  const earlier = (over: Partial<SignedRecord> = {}): SignedRecord => ({
    buildHash: buildHashOf(BUILD),
    sequence: 9,
    hash: 'E'.repeat(64),
    lastLedgerSequence: INDEX + 50,
    ledgerIndex: INDEX - 100,
    signedAt: new Date(2026, 10, 10, 14, 2).getTime(),
    ...over,
  })
  const SIGNED = { text: encodeSigned({ network: 'testnet', txBlob: 'ABCD' }).text, hash: 'B'.repeat(64), sequence: 9, fee: '12', lastLedgerSequence: INDEX + 150, signedAt: Date.now() }
  const signedSequence = () => (h.sign.mock.calls[0][2] as { sequence: number }).sequence
  function toReview() {
    fireEvent.change(screen.getByLabelText(W.SHIPPED.destinationAddress), { target: { value: DEST } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED.destinationTagUnknown), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED.amount), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: W.SHIPPED.reviewPayment }))
  }
  async function sign() {
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    })
  }

  it('a Same Build at review (typed again, as after a lock) shows P-19 and the earlier-signing record', async () => {
    h.signed = [earlier()]
    mount()
    toReview()
    expect(await screen.findByText(W.SIGNED_BEFORE)).toBeTruthy()
    for (const term of Object.values(W.RECORD_TERMS)) expect(screen.getByText(term)).toBeTruthy()
    expect(screen.getByText('E'.repeat(64))).toBeTruthy()
    expect(screen.getByText(String(INDEX + 50))).toBeTruthy()
  })

  it('a signed list that cannot be read shows P-16 at review, never silence (the Data to Sign is then refused)', async () => {
    h.signed = null
    mount()
    toReview()
    expect(await screen.findByText(W.NOT_SIGNED)).toBeTruthy()
    expect(screen.queryByText(W.SIGNED_BEFORE)).toBeNull()
  })

  it('another Build shows no notice', async () => {
    h.signed = [earlier({ buildHash: 'f'.repeat(64) })]
    mount()
    toReview()
    await screen.findByRole('button', { name: W.SHOW_THE_REQUEST })
    await act(async () => {})
    expect(screen.queryByText(W.SIGNED_BEFORE)).toBeNull()
  })

  it('case (a), a higher Sequence: P-20 focused with the record, nothing signed; "Check first" goes back to the request', async () => {
    h.signed = [earlier()]
    mount()
    toRequest()
    paste(dataFor(keptRequest(), { sequence: 10 }))
    const heading = await screen.findByRole('heading', { name: W.RETRY_HIGHER })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(screen.getByText('E'.repeat(64))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: W.CHECK_FIRST }))
    expect(await screen.findByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })).toBeTruthy()
    expect(h.sign).not.toHaveBeenCalled()
  })

  it('case (a): "This is a new payment" goes to the signing review and signs with the received Sequence', async () => {
    h.signed = [earlier()]
    h.sign.mockResolvedValue({ ...SIGNED, sequence: 10 })
    mount()
    toRequest()
    paste(dataFor(keptRequest(), { sequence: 10 }))
    fireEvent.click(await screen.findByRole('button', { name: W.THIS_IS_A_NEW_PAYMENT }))
    expect(await screen.findByRole('heading', { name: 'You are signing for Testnet' })).toBeTruthy()
    expect(screen.queryByText(W.RETRY_PASSED)).toBeNull()
    expect(screen.queryByText(W.RETRY_SAME_SEQUENCE)).toBeNull()
    await sign()
    expect(signedSequence()).toBe(10)
  })

  it('case (b), the earlier window reached: P-21 on the signing review, the received Sequence', async () => {
    h.signed = [earlier({ lastLedgerSequence: INDEX })]
    h.sign.mockResolvedValue(SIGNED)
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    expect(await screen.findByText(W.RETRY_PASSED)).toBeTruthy()
    await sign()
    expect(signedSequence()).toBe(9)
  })

  it('case (c), the earlier one still valid: P-22, the earlier Sequence, and no "This is a new payment"', async () => {
    h.signed = [earlier()]
    h.sign.mockResolvedValue(SIGNED)
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    expect(await screen.findByText(W.RETRY_SAME_SEQUENCE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: W.THIS_IS_A_NEW_PAYMENT })).toBeNull()
    await sign()
    expect(signedSequence()).toBe(9)
  })

  it('a lower Sequence with the earlier window open signs with the earlier Sequence (P-22)', async () => {
    h.signed = [earlier({ sequence: 12 })]
    h.sign.mockResolvedValue({ ...SIGNED, sequence: 12 })
    mount()
    toRequest()
    paste(dataFor(keptRequest(), { sequence: 9 }))
    expect(await screen.findByText(W.RETRY_SAME_SEQUENCE)).toBeTruthy()
    await sign()
    expect(signedSequence()).toBe(12)
  })

  it('a signed list that cannot be read signs nothing: P-16 alone, no signing review', async () => {
    h.signed = null
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    await waitFor(() => expect(alertText()).toContain(W.NOT_SIGNED))
    expect(screen.queryByRole('heading', { name: 'You are signing for Testnet' })).toBeNull()
    expect(screen.getByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })).toBeTruthy()
  })

  it('each signing is written to the list before its QR shows; a failed write shows no QR and says P-16', async () => {
    h.sign.mockResolvedValue(SIGNED)
    mount()
    toRequest()
    paste(dataFor(keptRequest()))
    h.writeFails = true
    await sign()
    await waitFor(() => expect(alertText()).toContain(W.NOT_SIGNED))
    expect(screen.queryByRole('heading', { name: W.SIGNED_TRANSACTION_TITLE })).toBeNull()
    h.writeFails = false
    await sign()
    expect(await screen.findByRole('heading', { name: W.SIGNED_TRANSACTION_TITLE })).toBeTruthy()
    expect(h.written).toEqual([
      { buildHash: buildHashOf(BUILD), sequence: 9, hash: 'B'.repeat(64), lastLedgerSequence: INDEX + 150, ledgerIndex: INDEX, signedAt: SIGNED.signedAt, account: BUILD.account },
    ])
  })

  it('"Start the request again": a new request ID for the same Build, P-19 and the Kept plate stay; then case (a) and "I know the result" ends it (Flow 4)', async () => {
    h.sign.mockResolvedValue(SIGNED)
    mount()
    toRequest()
    const first = keptRequest().requestId
    paste(dataFor(keptRequest()))
    await sign()
    fireEvent.click(await screen.findByRole('button', { name: W.START_THE_REQUEST_AGAIN }))
    const title = await screen.findByRole('heading', { name: W.DATA_TO_SIGN_NEEDED })
    await waitFor(() => expect(document.activeElement).toBe(title))
    expect(keptRequest().requestId).not.toBe(first)
    expect(roundOf(wallet.id)!.build).toEqual(BUILD)
    expect(await screen.findByText(W.SIGNED_BEFORE)).toBeTruthy()
    expect(screen.getByText(W.KEPT_TITLE)).toBeTruthy()
    // The earlier one applied: the Transmitter now answers with Sequence 10.
    paste(dataFor(keptRequest(), { sequence: 10 }))
    await screen.findByRole('heading', { name: W.RETRY_HIGHER })
    fireEvent.click(screen.getByRole('button', { name: W.CHECK_FIRST }))
    fireEvent.click(await screen.findByRole('button', { name: W.I_KNOW_THE_RESULT }))
    fireEvent.click(screen.getByRole('button', { name: W.ERASE }))
    expect(roundOf(wallet.id)).toBeNull()
    expect(h.sign).toHaveBeenCalledTimes(1)
  })
})

describe('Signed by this wallet (story 7; OS-FR-16, P-49, P-56)', () => {
  const record = (sequence: number, signedAt: number): SignedRecord => ({
    buildHash: 'a'.repeat(64),
    sequence,
    hash: String(sequence).padStart(64, '0'),
    lastLedgerSequence: 1000 + sequence,
    ledgerIndex: 900,
    signedAt,
  })
  const mountSigned = () =>
    render(
      <TooltipProvider>
        <OfflineSigned wallet={wallet} />
      </TooltipProvider>,
    )

  it('empty: P-49 and P-56', async () => {
    mountSigned()
    expect(screen.getByRole('heading', { name: 'Signed by this wallet' })).toBeTruthy()
    expect(screen.getByText(W.SIGNED_LIST_LINE)).toBeTruthy()
    expect(await screen.findByText(W.SIGNED_LIST_EMPTY)).toBeTruthy()
  })

  it('lists each record, newest first, with the P-52 terms', async () => {
    h.signed = [record(4, 1000), record(5, 2000)]
    mountSigned()
    await screen.findByText('0'.repeat(63) + '5')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('0'.repeat(63) + '5')
    expect(items[1].textContent).toContain('0'.repeat(63) + '4')
    expect(screen.queryByText(W.SIGNED_LIST_EMPTY)).toBeNull()
  })

  it('a failed read is never shown as empty', async () => {
    h.signed = null
    mountSigned()
    await act(async () => {})
    expect(screen.getByText(W.SIGNED_LIST_LINE)).toBeTruthy()
    expect(screen.queryByText(W.SIGNED_LIST_EMPTY)).toBeNull()
  })
})
