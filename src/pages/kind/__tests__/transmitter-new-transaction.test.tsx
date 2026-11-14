/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Synced Transmitter's New transaction (story 9; OS-FR-17, EXPERIENCE
 * "Transmitter-builds round"). Real: the codec, the Transmit step's preview checks
 * on a blob really signed by xrpl.js, the words. Faked: the live read hooks of the
 * form, `makeUnsigned` (its pre-flight and decoded Unsigned code are pinned in
 * `lib/__tests__/transmitter-build.test.ts`) and the one call that would reach the
 * ledger, `transmitSignedTransaction`.
 */
const h = vi.hoisted(() => ({
  make: vi.fn(),
  transmit: vi.fn(),
  accountError: false,
  dest: { exists: true, requireDestTag: false } as { exists: boolean; requireDestTag: boolean; hasTrustLine?: boolean },
}))
vi.mock('@/lib/transmitter-build', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/transmitter-build')>()
  return { ...real, makeUnsigned: (...a: unknown[]) => h.make(...a) }
})
vi.mock('@/lib/xrpl/writes', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/xrpl/writes')>()
  return { ...real, transmitSignedTransaction: (...a: unknown[]) => h.transmit(...a) }
})
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))
vi.mock('@/hooks/useSpendableBalance', () => ({ useSpendableBalance: () => ({ status: 'ok', spendableDrops: '50000000', reservedDrops: '1000000', reserveFailed: false }) }))
vi.mock('@/hooks/useRecommendedFee', () => ({ useRecommendedFee: () => ({ data: '12', isError: false }) }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => ({ data: [], isError: false, isLoading: false }) }))
vi.mock('@/hooks/useServerReserves', () => ({ useServerReserves: () => ({ data: { baseReserveDrops: '1000000', ownerReserveDrops: '200000' }, isError: false }) }))
vi.mock('@/hooks/useSignerList', () => ({ useSignerList: () => ({ data: null, isError: false }) }))
vi.mock('@/hooks/useAccountState', () => ({
  useAccountState: (_n: string, address: string) =>
    h.accountError
      ? { data: undefined, isError: true }
      : { data: { exists: true, address, balanceDrops: '50000000', ownerCount: 0, sequence: 3, requireDestTag: false, disableMasterKey: false, regularKey: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv' }, isError: false },
}))
vi.mock('@/hooks/useDestinationCheck', () => ({
  useDestinationCheck: (network: string, destination: string, asset: string) => {
    const valid = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destination)
    return {
      query: { isFetching: false, isError: false },
      info: valid ? { network, destination, asset, ...h.dest } : undefined,
      destinationValid: valid,
      checkedAt: 1,
      ok: valid,
      stale: false,
      pending: false,
    }
  },
}))

import { TransmitterNewTransaction } from '../TransmitterNewTransaction'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { encodeSigned, encodeUnsigned } from '@/lib/qr-codec'
import * as W from '@/lib/offline-round-words'
import { LEDGER_UNREAD, fill } from '@/lib/transmit-words'
import { UNSIGNED_ON_TRANSMIT } from '@/lib/transmitter-words'
import { SHIPPED } from '@/lib/offline-round-words'

/** The blob of `transmit-screen.test.tsx`: 1 XRP from rG31… to rPT1…, Fee 12, Sequence 3, LastLedgerSequence 4321, signed by rG31…'s key. */
const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const GOOD =
  '1200002400000003201B000010E16140000000000F424068400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F0744085895826BF15591F51D68AB0BA5E43E18DCF56CD48E5E3F7A00F16CBEF24EC8F6A28C73F0E19554BBA7FC7941868B23F0665C551266BD3BA83A180A85DA00F088114A6070B8A1822E3322676A99F0C804EE2D15B82708314F667B0CA50CC7709A220B0561B85E53A48461FA8'
const wallet: TransmitterMeta = { id: 't', seedId: 't', lockId: 'L', label: 'Daily', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: ACCOUNT }
const tx = { TransactionType: 'Payment', Account: ACCOUNT, Destination: DEST, Amount: '1000000', Fee: '12', Sequence: 3, LastLedgerSequence: 4321 }
const MADE = {
  status: 'made',
  text: encodeUnsigned({ network: 'testnet', tx, ledgerIndex: 4171 }).text,
  tx,
  ledgerIndex: 4171,
  checks: { type: 'payment', tagSupplied: false, destinationExists: true },
}

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TransmitterNewTransaction wallet={wallet} address={ACCOUNT} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}
function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/Or paste the text of a code/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' }))
}
const alertText = () => screen.getAllByRole('alert').map((a) => a.textContent).join(' ')
function fillPayment() {
  fireEvent.change(screen.getByLabelText(SHIPPED.destinationAddress), { target: { value: DEST } })
  fireEvent.change(screen.getByLabelText(SHIPPED.amount), { target: { value: '1' } })
}

beforeEach(() => {
  h.make.mockReset()
  h.transmit.mockReset()
  h.accountError = false
  h.dest = { exists: true, requireDestTag: false }
})
afterEach(cleanup)

describe('Synced Transmitter: New transaction (OS-FR-17)', () => {
  it('offers the four types that hold every online write; no "Other transactions"', () => {
    mount()
    expect(screen.getByRole('group', { name: W.TYPE_OF_TRANSACTION })).toBeTruthy()
    for (const t of [W.PAYMENT, W.TRUST_LINE, W.REGULAR_KEY_TYPE, W.MASTER_KEY_TYPE]) expect(screen.getByRole('radio', { name: t })).toBeTruthy()
    expect(screen.queryByText('Other transactions')).toBeNull()
    expect(screen.getAllByRole('radio', { name: /./ }).filter((r) => (r as HTMLInputElement).name === 'tx-type')).toHaveLength(4)
  })

  it('Payment: live readings, online errors; P-38 makes the Unsigned Transaction for the Synced address', async () => {
    h.make.mockResolvedValue(MADE)
    mount()
    expect(screen.getByText(SHIPPED.networkFee)).toBeTruthy()
    expect(screen.getByText(SHIPPED.spendable)).toBeTruthy()
    const make = screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }) as HTMLButtonElement
    expect(make.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(SHIPPED.destinationAddress), { target: { value: ACCOUNT } })
    expect(screen.getByText(SHIPPED.selfSend)).toBeTruthy()
    fillPayment()
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    await waitFor(() => expect(h.make).toHaveBeenCalledTimes(1))
    expect(h.make.mock.calls[0][0]).toMatchObject({ id: 't', address: ACCOUNT, network: 'testnet' })
    expect(h.make.mock.calls[0][1]).toEqual({ type: 'payment', destination: DEST, amountDrops: '1000000' })
    // The Unsigned plate: P-33 heads it (focused), the code on Testnet, what was made and checked.
    const heading = await screen.findByRole('heading', { name: W.UNSIGNED_LINE })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(await screen.findByAltText('QR code: unsigned transaction for Testnet')).toBeTruthy()
    expect(screen.getByText(fill(W.CHECKED_ON, 'Testnet'))).toBeTruthy()
    expect(screen.getByText(W.SCAN_SIGNED_TITLE)).toBeTruthy()
    expect(screen.queryByText(/Scan \d of/)).toBeNull()
  })

  it('a refusal is said in its online words under the form; a failed read offers "Read again"', async () => {
    h.make.mockResolvedValueOnce({ status: 'refused', reason: 'You only hold 10 USD.' }).mockResolvedValueOnce({ status: 'read-failed' }).mockResolvedValueOnce(MADE)
    mount()
    fillPayment()
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    await waitFor(() => expect(alertText()).toContain('You only hold 10 USD.'))
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    expect(await screen.findByText(LEDGER_UNREAD)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: W.READ_AGAIN }))
    expect(await screen.findByRole('heading', { name: W.UNSIGNED_LINE })).toBeTruthy()
    expect(h.make).toHaveBeenCalledTimes(3)
  })

  it('the signed code enters the Transmit step: checks with the Synced address, Send on the envelope\'s Network', async () => {
    h.make.mockResolvedValue(MADE)
    h.transmit.mockResolvedValue({ status: 'validated', hash: 'H', resultCode: 'tesSUCCESS', ledgerIndex: 4200 })
    mount()
    fillPayment()
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    await screen.findByRole('heading', { name: W.UNSIGNED_LINE })
    paste(MADE.text)
    await waitFor(() => expect(alertText()).toContain(UNSIGNED_ON_TRANSMIT))
    paste(encodeSigned({ network: 'testnet', txBlob: GOOD }).text)
    expect(await screen.findByText(`Account: ${ACCOUNT}, correct`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(h.transmit).toHaveBeenCalledTimes(1))
    expect(h.transmit.mock.calls[0][0]).toBe('testnet')
    expect(h.transmit.mock.calls[0][1]).toEqual({ txBlob: GOOD, network: 'testnet' })
    expect(h.transmit.mock.calls[0][2]).toBe(ACCOUNT)
    expect(await screen.findByText(/validated/i)).toBeTruthy()
  })

  it('past the window: "Expired. Nothing was sent." and P-38 makes it again with new values', async () => {
    h.make.mockResolvedValue(MADE)
    h.transmit.mockResolvedValue({ status: 'expired', hash: 'H' })
    mount()
    fillPayment()
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    await screen.findByRole('heading', { name: W.UNSIGNED_LINE })
    paste(encodeSigned({ network: 'testnet', txBlob: GOOD }).text)
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Expired. Nothing was sent.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    await waitFor(() => expect(h.make).toHaveBeenCalledTimes(2))
    expect(h.make.mock.calls[1][1]).toEqual(h.make.mock.calls[0][1])
  })

  it('"Change the transaction" goes back to the form with its values', async () => {
    h.make.mockResolvedValue(MADE)
    mount()
    fillPayment()
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    await screen.findByRole('heading', { name: W.UNSIGNED_LINE })
    fireEvent.click(screen.getByRole('button', { name: W.CHANGE_THE_TRANSACTION }))
    expect((screen.getByLabelText(SHIPPED.destinationAddress) as HTMLInputElement).value).toBe(DEST)
    expect((screen.getByLabelText(SHIPPED.amount) as HTMLInputElement).value).toBe('1')
  })

  it('Regular Key: P-48\'s line, the live key state, W5 when the set key is replaced', () => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name: W.REGULAR_KEY_TYPE }))
    expect(screen.getByText(W.KEY_CHANGE_UNSIGNED)).toBeTruthy()
    expect(screen.getByText(W.KEY_STATE)).toBeTruthy()
    expect(screen.getByText('rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.regularKeyAddress), { target: { value: DEST } })
    expect(screen.getByText(W.W5_SENTENCE)).toBeTruthy()
  })

  it('Master key off: "Test the Regular Key" → P-50, then W4; a failed account read is P-29, never safe', () => {
    h.accountError = true
    mount()
    fireEvent.click(screen.getByRole('radio', { name: W.MASTER_KEY_TYPE }))
    expect(screen.getAllByText('Unknown. The app cannot read this value.').length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: W.TEST_THE_REGULAR_KEY }))
    expect(screen.getByText(W.TEST_ELSEWHERE)).toBeTruthy()
    expect(screen.getByText(W.W4_SENTENCE)).toBeTruthy()
  })

  it('a token Payment\'s warnings from the pre-flight are online Send\'s, on the Unsigned plate', async () => {
    h.make.mockResolvedValue({ ...MADE, checks: { type: 'token-payment', tagSupplied: false, destinationExists: false, warnings: ['destination-not-activated', 'no-trust-line'] } })
    mount()
    fillPayment()
    fireEvent.click(screen.getByRole('button', { name: W.MAKE_THE_UNSIGNED }))
    await screen.findByRole('heading', { name: W.UNSIGNED_LINE })
    expect(screen.getByText(W.SHIPPED_SEND.notActivatedTitle)).toBeTruthy()
    expect(screen.getByText(W.SHIPPED_SEND.noTrustLineTitle)).toBeTruthy()
  })
})
