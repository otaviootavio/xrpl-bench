/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Transmit (story 4; OS-FR-9, OS-FR-10, EXPERIENCE "Transmit step"). Real: the
 * codec, the preview checks on blobs really signed by xrpl.js, the words. Faked:
 * the one call that would reach the ledger, `transmitSignedTransaction`, whose
 * arguments are pinned (the Network is the envelope's, the Account the expected one).
 */
const h = vi.hoisted(() => ({ transmit: vi.fn(), review: vi.fn() }))
vi.mock('@/lib/xrpl/writes', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/xrpl/writes')>()
  return { ...real, transmitSignedTransaction: (...a: unknown[]) => h.transmit(...a) }
})
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null, reviewSignedTransaction: h.review }) }))

import { TransmitScreen } from '../TransmitScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { encodeSigned, encodeUnsigned } from '@/lib/qr-codec'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { CONFIRM_ACCOUNT, TRANSMIT_SCANNER_LINE, UNSIGNED_ON_TRANSMIT } from '@/lib/transmitter-words'
import { TransmitDeclinedError, TransmitRefusedError } from '@/lib/xrpl/writes'

/**
 * Blobs really signed by xrpl.js (jsdom cannot run its signer, so they were signed
 * once in Node from the seeds below and pasted here; verification runs live):
 * a Payment of 1 XRP to rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe, Fee 12, Sequence 3,
 * LastLedgerSequence 4321. `good` by sEdTM1uX8pu2do5XvTnutH6HsouMaM2 for its own
 * Account; `byOther` by sEd7rBGm5kxzauRTAV2hbsNz7N45X91 for its own Account.
 */
const master = { address: 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL' }
const other = { address: 'rJZdUusLDtY9NEsGea7ijqhVrXv98rYBYN' }
const GOOD = {
  tx_blob:
    '1200002400000003201B000010E16140000000000F424068400000000000000C7321EDA57EBBCB502C2009EFE17229E8DC865DCCB192C52D7888D624DC9EBADDB815F0744085895826BF15591F51D68AB0BA5E43E18DCF56CD48E5E3F7A00F16CBEF24EC8F6A28C73F0E19554BBA7FC7941868B23F0665C551266BD3BA83A180A85DA00F088114A6070B8A1822E3322676A99F0C804EE2D15B82708314F667B0CA50CC7709A220B0561B85E53A48461FA8',
  hash: '91FD583869DA09DF6ACE171F34F10AFD2036F425D2629508A7E1987C4C0F7CB2',
}
const BY_OTHER = {
  tx_blob:
    '1200002400000003201B000010E16140000000000F424068400000000000000C7321EDD3993CDC6647896C455F136648B7750723B011475547AF60691AA3D7438E021D7440FBFA388AC03A5BEF5884208B078D6E13B49F6BDCCE9E44211F29098406F27711FA6B655257006CBCDF42888F79D7CDED86B6464FEF009F0A622963DEA0CD3E048114C0A5ABEF242802EFED4B041E8F2D4A8CC86AE3D18314F667B0CA50CC7709A220B0561B85E53A48461FA8',
  hash: '093A23ADA48B22649DADFE0A61E6CB4A33E1D55A1FE582D4A3392E3FD03D38C1',
}
const code = (blob: string, network: 'testnet' | 'mainnet' = 'testnet') => (encodeSigned({ network, txBlob: blob }) as { text: string }).text

const transmitter = (over: Partial<TransmitterMeta> = {}): TransmitterMeta => ({
  id: 't',
  seedId: 't',
  lockId: 'L',
  label: 'Send',
  createdAt: 1,
  network: 'testnet',
  openCheck: 'pin',
  kind: 'transmitter',
  address: master.address,
  ...over,
})

function mount(wallet: TransmitterMeta) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TransmitScreen wallet={wallet} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

/** Pastes a code into the scanner's text field, as a camera read would hand it up. */
function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/Or paste the text of a code/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' }))
}

beforeEach(() => {
  h.transmit.mockReset()
  h.review.mockReset()
})
afterEach(cleanup)

describe('Transmit on a Synced Transmitter (OS-FR-9)', () => {
  it('shows P-42, then P-25 and the fields of a good signed code, and sends nothing until Send', async () => {
    mount(transmitter())
    expect(screen.getByText(TRANSMIT_SCANNER_LINE)).toBeTruthy()
    const signed = GOOD
    paste(code(signed.tx_blob))
    expect(await screen.findByText('Signature: correct')).toBeTruthy()
    expect(screen.getByText(`Account: ${master.address}, correct`)).toBeTruthy()
    expect(screen.getByText('Network: Testnet')).toBeTruthy()
    expect(screen.getByText('Time limit: valid until ledger 4321')).toBeTruthy()
    expect(screen.getByText(signed.hash)).toBeTruthy()
    expect(screen.getByText('Destination')).toBeTruthy()
    expect(h.transmit).not.toHaveBeenCalled()
    // Focus is on the plate heading, never on Send.
    expect(document.activeElement?.textContent).toBe('Transaction hash')
    h.transmit.mockResolvedValue({ status: 'validated', hash: signed.hash, resultCode: 'tesSUCCESS', ledgerIndex: 9 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(h.transmit).toHaveBeenCalledTimes(1)
    const [network, sent, expected, node, review] = h.transmit.mock.calls[0]
    expect(network).toBe('testnet')
    expect(sent).toEqual({ txBlob: signed.tx_blob, network: 'testnet' })
    expect(expected).toBe(master.address)
    expect(node).toBeUndefined()
    expect(review).toBeUndefined()
    expect(await screen.findByText('Validated')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('passes the Network the envelope names, so a Mainnet code is refused, with no Send', async () => {
    mount(transmitter())
    paste(code(GOOD.tx_blob, 'mainnet'))
    expect((await screen.findByRole('alert')).textContent).toBe('The app did not send the transaction. This transaction is for Mainnet. This wallet sends on Testnet.')
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('refuses a code signed for another Account than the Synced one', async () => {
    mount(transmitter())
    paste(code(BY_OTHER.tx_blob))
    expect((await screen.findByRole('alert')).textContent).toContain(`The account ${other.address} signed this transaction. The correct account is ${master.address}.`)
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('answers an Unsigned Transaction with P-36, and a signed code with no Network (an older build) with the codec version words', async () => {
    mount(transmitter())
    paste((encodeUnsigned({ network: 'testnet', tx: { TransactionType: 'Payment', Account: master.address } }) as { text: string }).text)
    expect((await screen.findByRole('alert')).textContent).toBe(UNSIGNED_ON_TRANSMIT)
    const noNetwork = 'xrplbench:1:s:' + btoa(JSON.stringify({ v: 1, tx_blob: 'AB' })).replace(/=+$/, '')
    paste(noNetwork)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That code is from a version of XRPL Bench this one does not understand.'))
  })

  it('with the setting on, Send goes through the reviewer; a decline is a caution status, nothing sent', async () => {
    mount(transmitter({ showBeforeSending: true }))
    paste(code(GOOD.tx_blob))
    await screen.findByText('Signature: correct')
    h.transmit.mockImplementation(async (_n, _s, _e, _node, review) => {
      expect(typeof review).toBe('function')
      await review({ txBlob: 'x', hash: 'y', network: 'testnet', lastLedgerSequence: 4321 })
      throw new TransmitDeclinedError(4321)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(h.review).toHaveBeenCalledTimes(1)
    expect((await screen.findByRole('status')).textContent).toBe(
      'WARNING: This signed transaction is valid until ledger 4321. Until then, a person who has it can send it. The app did not send the transaction.',
    )
  })

  it('a submit that throws is never "not sent": it may have been sent', async () => {
    mount(transmitter())
    paste(code(GOOD.tx_blob))
    await screen.findByText('Signature: correct')
    h.transmit.mockRejectedValue(new Error('socket closed'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(await screen.findByText(/may have been sent/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('a failure before any submission is a refusal, not "may have been sent"', async () => {
    mount(transmitter())
    paste(code(GOOD.tx_blob))
    await screen.findByText('Signature: correct')
    h.transmit.mockRejectedValue(new TransmitRefusedError('ledger-unread', 'The app did not send the transaction. The app cannot read the ledger.'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('The app did not send the transaction. The app cannot read the ledger.')
    expect(screen.queryByText(/may have been sent/)).toBeNull()
  })

  it('an expired outcome reads "Expired. Nothing was sent."', async () => {
    mount(transmitter())
    paste(code(GOOD.tx_blob))
    await screen.findByText('Signature: correct')
    h.transmit.mockResolvedValue({ status: 'expired', hash: 'H' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(await screen.findByText('Expired. Nothing was sent.')).toBeTruthy()
  })
})

describe('Transmit on an unsynced Transmitter (OS-FR-4, P-27)', () => {
  it('shows P-27 in place of the Account line, and Send confirms the blob\'s own Account', async () => {
    mount(transmitter({ address: null }))
    const signed = BY_OTHER
    paste(code(signed.tx_blob))
    expect(await screen.findByText(CONFIRM_ACCOUNT.replace('{address}', other.address))).toBeTruthy()
    expect(screen.queryByText(/, correct$/)).toBeNull()
    h.transmit.mockResolvedValue({ status: 'validated', hash: signed.hash, resultCode: 'tesSUCCESS' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    expect(h.transmit.mock.calls[0][2]).toBe(other.address)
  })
})
