/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Transmitter answers a Data-to-Sign Request on Transmit (story 6; OS-FR-15,
 * EXPERIENCE "Transmitter answer"), then expects the answered Account at the
 * Transmit step (OS-FR-9). Real: the codec, the preview checks on real signed
 * blobs, the words. Faked: `answerRequest` (its reads are pinned in
 * `answer-request.test.ts`) and the ledger call `transmitSignedTransaction`.
 */
const h = vi.hoisted(() => ({ transmit: vi.fn(), answer: vi.fn() }))
vi.mock('@/lib/xrpl/writes', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/xrpl/writes')>()
  return { ...real, transmitSignedTransaction: (...a: unknown[]) => h.transmit(...a) }
})
vi.mock('@/lib/answer-request', () => ({ answerRequest: (...a: unknown[]) => h.answer(...a) }))
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))

import { TransmitScreen } from '../TransmitScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { encodeDataToSign, encodeSigned } from '@/lib/qr-codec'
import { requestText } from '@/lib/offline-round'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import * as R from '@/lib/offline-round-words'
import { CONFIRM_ACCOUNT, UNSIGNED_ON_TRANSMIT } from '@/lib/transmitter-words'

// Signed once in Node by xrpl.js (see transmit-screen.test.tsx): 1 XRP to DEST, LastLedgerSequence 4321.
const master = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const other = 'rJZdUusLDtY9NEsGea7ijqhVrXv98rYBYN'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const GOOD =
  '1200002400000003201B000010E16140000000000F424068400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F0744085895826BF15591F51D68AB0BA5E43E18DCF56CD48E5E3F7A00F16CBEF24EC8F6A28C73F0E19554BBA7FC7941868B23F0665C551266BD3BA83A180A85DA00F088114A6070B8A1822E3322676A99F0C804EE2D15B82708314F667B0CA50CC7709A220B0561B85E53A48461FA8'
const BY_OTHER =
  '1200002400000003201B000010E16140000000000F424068400000000000000C7321EDD3993CDC6647896C455F136648B7750723B011475547AF60691AA3D7438E021D7440FBFA388AC03A5BEF5884208B078D6E13B49F6BDCCE9E44211F29098406F27711FA6B655257006CBCDF42888F79D7CDED86B6464FEF009F0A622963DEA0CD3E048114C0A5ABEF242802EFED4B041E8F2D4A8CC86AE3D18314F667B0CA50CC7709A220B0561B85E53A48461FA8'

const unsynced: TransmitterMeta = { id: 't', seedId: 't', lockId: 'L', label: 'Carrier', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: null }
const REQUEST = requestText('testnet', { type: 'payment', account: master, destination: DEST, amountDrops: '1000000' }, 'a'.repeat(32))
const DATA = encodeDataToSign({ network: 'testnet', requestId: 'a'.repeat(32), buildHash: 'b'.repeat(64), sequence: 3, fee: '12', ledgerIndex: 4000 }).text
const answered = (over: Record<string, unknown> = {}) => ({
  status: 'answered',
  text: DATA,
  account: master,
  values: { sequence: 3, fee: '12', ledgerIndex: 4000 },
  checks: { tagSupplied: false, destinationExists: true },
  ...over,
})

function mount(wallet: TransmitterMeta = unsynced) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TransmitScreen wallet={wallet} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}
function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/Or paste the text of a code/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' }))
}

beforeEach(() => {
  h.transmit.mockReset()
  h.answer.mockReset()
})
afterEach(cleanup)

describe('Transmit answers a Data-to-Sign Request (OS-FR-15)', () => {
  it('shows what was checked on its Network, then the Data to Sign QR, its heading focused', async () => {
    h.answer.mockResolvedValue(answered())
    mount()
    paste(REQUEST)
    const heading = await screen.findByRole('heading', { name: R.DATA_PLATE_LINE })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(screen.getByText('Checked on Testnet')).toBeTruthy()
    for (const v of [R.CHECK_RESULT.found, R.CHECK_RESULT.sufficient, R.CHECK_RESULT.underFeeLimit]) expect(screen.getByText(v)).toBeTruthy()
    expect(screen.queryByText(R.CHECK_RESULT.supplied)).toBeNull()
    expect(screen.getByRole('button', { name: R.MAKE_THE_CODE_LARGER })).toBeTruthy()
    // The request it answered is the decoded one, for this Wallet.
    expect(h.answer.mock.calls[0][0]).toBe(unsynced)
    expect(h.answer.mock.calls[0][1]).toMatchObject({ account: master, request_id: 'a'.repeat(32) })
  })

  it('a destination not on the ledger: online Send\'s warning, and still the QR', async () => {
    h.answer.mockResolvedValue(answered({ checks: { tagSupplied: true, destinationExists: false } }))
    mount()
    paste(REQUEST)
    expect(await screen.findByText(R.SHIPPED.destinationNotActivated)).toBeTruthy()
    expect(screen.getByText(R.CHECK_RESULT.supplied)).toBeTruthy()
    expect(screen.getByRole('heading', { name: R.DATA_PLATE_LINE })).toBeTruthy()
  })

  it('a refusal is an alert with no QR', async () => {
    h.answer.mockResolvedValue({ status: 'refused', reason: R.SHIPPED.tagRequired })
    mount()
    paste(REQUEST)
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent === R.SHIPPED.tagRequired)).toBe(true))
    expect(screen.queryByRole('heading', { name: R.DATA_PLATE_LINE })).toBeNull()
  })

  it('a failed read: P-28 and no QR; "Read again" asks again', async () => {
    h.answer.mockResolvedValueOnce({ status: 'read-failed' }).mockResolvedValueOnce(answered())
    mount()
    paste(REQUEST)
    expect(await screen.findByText(R.ANSWER_READ_FAILED)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: R.DATA_PLATE_LINE })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: R.READ_AGAIN }))
    expect(await screen.findByRole('heading', { name: R.DATA_PLATE_LINE })).toBeTruthy()
    expect(h.answer).toHaveBeenCalledTimes(2)
  })

  it('a Data to Sign scanned here is the offline wallet\'s: P-36\'s Transmit line', async () => {
    mount()
    paste(DATA)
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent === UNSIGNED_ON_TRANSMIT)).toBe(true))
    expect(h.answer).not.toHaveBeenCalled()
  })
})

describe('after an answer, the Transmit step expects the request\'s Account (OS-FR-9)', () => {
  it('an unsynced Transmitter shows the Account line, not P-27, and sends for that Account', async () => {
    h.answer.mockResolvedValue(answered())
    h.transmit.mockResolvedValue({ status: 'validated', hash: 'H', resultCode: 'tesSUCCESS', ledgerIndex: 4001 })
    mount()
    paste(REQUEST)
    await screen.findByRole('heading', { name: R.DATA_PLATE_LINE })
    paste(encodeSigned({ network: 'testnet', txBlob: GOOD }).text)
    expect(await screen.findByText(`Account: ${master}, correct`)).toBeTruthy()
    expect(screen.queryByText(CONFIRM_ACCOUNT.replace('{address}', master))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.transmit).toHaveBeenCalled())
    expect(h.transmit.mock.calls[0][2]).toBe(master)
  })

  it('a signed code for another Account than the answered request is refused (P-26)', async () => {
    h.answer.mockResolvedValue(answered())
    mount()
    paste(REQUEST)
    await screen.findByRole('heading', { name: R.DATA_PLATE_LINE })
    paste(encodeSigned({ network: 'testnet', txBlob: BY_OTHER }).text)
    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes(`The account ${other} signed this transaction. The correct account is ${master}.`))).toBe(true),
    )
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })
})
