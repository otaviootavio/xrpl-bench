/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Offline Wallet's Sign screen (story 9; OS-FR-18, OS-FR-21 W1/W3/W4, EXPERIENCE
 * "Transmitter-builds round"). Real: the codec, the judgement, the words, the
 * store. Faked: the keystore's record reads and writes, and `signJudged`, whose real
 * signature and decoded blob are pinned in `lib/crypto/__tests__/transmitter-builds-sign.test.ts`
 * (jsdom cannot run xrpl.js's signer). No ledger client is ever asked for.
 */
import type { SignedRecord } from '@/lib/signed-list'
const h = vi.hoisted(() => ({
  sign: vi.fn(),
  seen: null as null | { index: number; at: number },
  noted: [] as Array<[string, number]>,
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
vi.mock('@/lib/unsigned-judge', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/unsigned-judge')>()
  return { ...real, signJudged: (...a: unknown[]) => h.sign(...a) }
})
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))

import { OfflineSign } from '../OfflineSign'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { KeyWalletMeta } from '@/lib/crypto/keystore'
import { SigningCheckError } from '@/lib/crypto/keystore'
import * as W from '@/lib/offline-round-words'
import { fill } from '@/lib/transmit-words'
import { encodeSigned, encodeUnsigned } from '@/lib/qr-codec'
import { buildHashOf } from '@/lib/offline-round'
import { LEDGER_FLOORS } from '@/lib/offline-window'
import { useAppStore } from '@/store/app-store'
import { AccountSetAsfFlags } from 'xrpl'

const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const OTHER_KEY = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
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
const INDEX = LEDGER_FLOORS.testnet.index + 10
const base = { Account: ACCOUNT, Fee: '12', Sequence: 41, LastLedgerSequence: INDEX + 150 }
const payment = { TransactionType: 'Payment', ...base, Destination: DEST, Amount: '3000000' }
const unsigned = (tx: Record<string, unknown>, over: { network?: 'testnet' | 'mainnet'; ledgerIndex?: number } = {}) =>
  encodeUnsigned({ network: over.network ?? 'testnet', tx, ledgerIndex: over.ledgerIndex ?? INDEX }).text

function mount(w: KeyWalletMeta = wallet) {
  return render(
    <TooltipProvider>
      <OfflineSign wallet={w} />
    </TooltipProvider>,
  )
}
function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/Or paste the text of a code/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' }))
}
const alertText = () => screen.getAllByRole('alert').map((a) => a.textContent).join(' ')
const signedResult = (over: Partial<{ sequence: number; lastLedgerSequence: number }> = {}) => ({
  text: encodeSigned({ network: 'testnet', txBlob: 'ABCD' }).text,
  hash: 'A'.repeat(64),
  sequence: 41,
  fee: '12',
  lastLedgerSequence: INDEX + 150,
  signedAt: 1_700_000_000_000,
  ...over,
})

beforeEach(() => {
  h.sign.mockReset()
  h.seen = null
  h.noted = []
  h.signed = []
  h.written = []
  h.writeFails = false
  h.getXrplClient.mockReset()
  h.holdXrplClient.mockReset()
  useAppStore.setState({ wallets: [wallet], openLocks: { L: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
})
afterEach(() => {
  cleanup()
  useAppStore.setState({ wallets: [], openLocks: {} } as never)
})

describe('Offline Sign screen: the signing review (OS-FR-18)', () => {
  it('has P-3 as its title and a scanner; reads nothing from the ledger', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Sign a transaction from your Transmitter wallet' })).toBeTruthy()
    expect(screen.getByLabelText(/Or paste the text of a code/)).toBeTruthy()
    expect(h.getXrplClient).not.toHaveBeenCalled()
    expect(h.holdXrplClient).not.toHaveBeenCalled()
  })

  it('shows the Network large (focused), the window in ledgers, P-51, every field, the signing key', async () => {
    mount()
    paste(unsigned(payment))
    const well = await screen.findByRole('heading', { name: fill(W.SIGNING_FOR, 'Testnet') })
    await waitFor(() => expect(document.activeElement).toBe(well))
    expect(screen.getByText(fill(W.TIME_LIMIT_LEDGERS, 150))).toBeTruthy()
    expect(screen.getByText(fill(W.VALID_UNTIL_LEDGER, INDEX + 150))).toBeTruthy()
    for (const name of ['TransactionType', 'Account', 'Destination', 'Amount', 'Fee', 'Sequence', 'LastLedgerSequence']) expect(screen.getByText(name)).toBeTruthy()
    expect(screen.getByText('3 XRP')).toBeTruthy()
    expect(screen.getByText(W.SIGNING_KEY)).toBeTruthy()
    // Usual window, current index: neither P-15 nor P-14.
    expect(screen.queryByText(/more time than usual/)).toBeNull()
    expect(screen.queryByText(W.LEDGER_LOWER)).toBeNull()
    expect(h.getXrplClient).not.toHaveBeenCalled()
  })

  it('P-15 for a window longer than usual; P-14 for an index below the highest seen', async () => {
    h.seen = { index: INDEX + 1000, at: Date.now() }
    mount()
    paste(unsigned({ ...payment, LastLedgerSequence: INDEX + 900 }))
    await screen.findByRole('heading', { name: fill(W.SIGNING_FOR, 'Testnet') })
    expect(screen.getByText(fill(W.LONGER_THAN_USUAL, 900))).toBeTruthy()
    expect(screen.getByText(fill(W.TIME_LIMIT_LEDGERS, 900))).toBeTruthy()
    expect(screen.getByText(W.LEDGER_LOWER)).toBeTruthy()
    expect(screen.getByText(W.CHECK_THE_TRANSMITTER)).toBeTruthy()
  })

  it('a memo shows P-53 under the Memos row', async () => {
    mount()
    paste(unsigned({ ...payment, Memos: [{ Memo: { MemoData: '72656E74' } }] }))
    await screen.findByRole('heading', { name: fill(W.SIGNING_FOR, 'Testnet') })
    expect(screen.getByText('This transaction has a memo. All persons can read the memo on the ledger: rent.')).toBeTruthy()
  })

  it('a SetRegularKey it did not build: W3 above the new key; W1 when no Wallet here holds it, P-30 when one does', async () => {
    const view = mount()
    paste(unsigned({ TransactionType: 'SetRegularKey', ...base, RegularKey: OTHER_KEY }))
    await screen.findByRole('heading', { name: fill(W.SIGNING_FOR, 'Testnet') })
    const w3 = screen.getByText(W.W3_SENTENCE)
    const keyRow = screen.getByText('RegularKey')
    expect(w3.compareDocumentPosition(keyRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(W.W1_SENTENCE)).toBeTruthy()
    view.unmount()
    useAppStore.setState({ wallets: [wallet, { ...wallet, id: 'k', label: 'Spare key', address: OTHER_KEY, keyAddress: OTHER_KEY, kind: 'online' }] } as never)
    mount()
    paste(unsigned({ TransactionType: 'SetRegularKey', ...base, RegularKey: OTHER_KEY }))
    await screen.findByRole('heading', { name: fill(W.SIGNING_FOR, 'Testnet') })
    expect(screen.getByText(fill(W.KEY_IS_WALLET_HERE, 'Spare key'))).toBeTruthy()
    expect(screen.queryByText(W.W1_SENTENCE)).toBeNull()
  })

  it('master key off on Mainnet: W4\'s sentence, and Sign is held until "turn off" is typed', async () => {
    const mainnet = { ...wallet, network: 'mainnet' as const }
    useAppStore.setState({ wallets: [mainnet] } as never)
    h.sign.mockResolvedValue(signedResult())
    mount(mainnet)
    paste(unsigned({ TransactionType: 'AccountSet', ...base, LastLedgerSequence: LEDGER_FLOORS.mainnet.index + 160, SetFlag: AccountSetAsfFlags.asfDisableMaster }, { network: 'mainnet', ledgerIndex: LEDGER_FLOORS.mainnet.index + 10 }))
    await screen.findByRole('heading', { name: fill(W.SIGNING_FOR, 'Mainnet') })
    expect(screen.getByText(W.W4_SENTENCE)).toBeTruthy()
    const sign = screen.getByRole('button', { name: 'Sign' })
    expect(sign.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(sign)
    expect(h.sign).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.offPhraseLabel), { target: { value: 'turn off' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
    await waitFor(() => expect(h.sign).toHaveBeenCalledTimes(1))
  })

  it('an unreadable signed list: P-16 stands alone, no Sign key', async () => {
    h.signed = null
    mount()
    paste(unsigned(payment))
    await screen.findByRole('heading', { name: fill(W.SIGNING_FOR, 'Testnet') })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull())
    expect(screen.getByText(W.NOT_SIGNED)).toBeTruthy()
  })
  it('P-19 and the record when the same payment was signed before by the other route', async () => {
    h.signed = [{ buildHash: buildHashOf({ type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '3000000' }), sequence: 30, hash: 'B'.repeat(64), lastLedgerSequence: 99, ledgerIndex: 1, signedAt: 1 }]
    mount()
    paste(unsigned(payment))
    expect(await screen.findByText(W.SIGNED_BEFORE)).toBeTruthy()
    expect(screen.getByText('B'.repeat(64))).toBeTruthy()
  })
})

describe('Offline Sign screen: refusals (OS-FR-18)', () => {
  it.each([
    ['another Network', unsigned(payment, { network: 'mainnet' }), fill(W.DATA_REFUSAL.network, 'Mainnet', 'Testnet')],
    ['a pre-set signature', unsigned({ ...payment, TxnSignature: 'AB' }), W.SIGN_REFUSAL.presigned],
    ['a partial payment', unsigned({ ...payment, Flags: 0x00020000 }), W.SIGN_REFUSAL.partialPayment],
    ['a type it cannot show', unsigned({ TransactionType: 'OfferCreate', ...base, TakerGets: '1', TakerPays: '1' }), fill(W.SIGN_REFUSAL.cannotShow, 'OfferCreate')],
    ['a signed code', encodeSigned({ network: 'testnet', txBlob: 'AB' }).text, 'This code is a signed transaction. This screen needs a unsigned transaction.'],
  ])('%s: P-16 and P-17 under the scanner, no review, nothing signed', async (_n, text, reason) => {
    mount()
    paste(text)
    await waitFor(() => expect(alertText()).toContain(reason))
    expect(alertText()).toContain(W.NOT_SIGNED)
    expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull()
    expect(screen.getByLabelText(/Or paste the text of a code/)).toBeTruthy()
    expect(h.sign).not.toHaveBeenCalled()
  })
})

describe('Offline Sign screen: sign, decline, lock (OS-FR-18, OS-FR-16)', () => {
  it('Sign: record first, then the signed QR with P-12 and the window in minutes; the highest seen after', async () => {
    h.sign.mockResolvedValue(signedResult())
    mount()
    paste(unsigned(payment))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    const title = await screen.findByRole('heading', { name: W.SIGNED_TRANSACTION_TITLE })
    await waitFor(() => expect(document.activeElement).toBe(title))
    expect(screen.getByText(W.SIGNED_NOT_SENT)).toBeTruthy()
    expect(screen.getByText(new RegExp(`valid until ledger ${INDEX + 150}\\. That is approximately 10 minutes after`))).toBeTruthy()
    expect(h.written).toEqual([
      { buildHash: buildHashOf({ type: 'payment', account: ACCOUNT, destination: DEST, amountDrops: '3000000' }), sequence: 41, hash: 'A'.repeat(64), lastLedgerSequence: INDEX + 150, ledgerIndex: INDEX, signedAt: 1_700_000_000_000 },
    ])
    await waitFor(() => expect(h.noted).toEqual([['off', INDEX]]))
    // The judged transaction is what is signed.
    expect(h.sign.mock.calls[0][1].tx).toMatchObject({ ...payment })
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('a failed record write drops the blob: P-16, no QR', async () => {
    h.sign.mockResolvedValue(signedResult())
    h.writeFails = true
    mount()
    paste(unsigned(payment))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    await waitFor(() => expect(alertText()).toContain(W.NOT_SIGNED))
    expect(screen.queryByRole('heading', { name: W.SIGNED_TRANSACTION_TITLE })).toBeNull()
    expect(h.noted).toEqual([])
  })

  it('a dismissed Signing Check signs nothing and says so in the check\'s words', async () => {
    const err = new SigningCheckError({ status: 'cancelled' })
    h.sign.mockRejectedValue(err)
    mount()
    paste(unsigned(payment))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    await waitFor(() => expect(alertText()).toContain(err.message))
    expect(h.written).toEqual([])
    expect(screen.getByRole('button', { name: 'Sign' })).toBeTruthy()
  })

  it('Do not sign: P-34\'s result, back to the scanner', async () => {
    mount()
    paste(unsigned(payment))
    fireEvent.click(await screen.findByRole('button', { name: W.DO_NOT_SIGN }))
    expect(screen.getAllByRole('status').some((s) => s.textContent === W.NOT_SIGNED)).toBe(true)
    expect(screen.getByLabelText(/Or paste the text of a code/)).toBeTruthy()
    expect(h.sign).not.toHaveBeenCalled()
  })

  it('a lock drops the review; a signing that settles after a lock shows nothing', async () => {
    let resolve!: (v: unknown) => void
    h.sign.mockReturnValue(new Promise((r) => (resolve = r)))
    mount()
    paste(unsigned(payment))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
    act(() => useAppStore.setState({ openLocks: {} } as never))
    await act(async () => resolve(signedResult()))
    expect(screen.queryByRole('heading', { name: W.SIGNED_TRANSACTION_TITLE })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull()
    expect(h.written).toEqual([])
  })

})
