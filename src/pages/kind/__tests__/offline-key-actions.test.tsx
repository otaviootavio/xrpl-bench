/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Offline Wallet's New transaction, story 8: trust lines, Regular Key and master
 * key on the Offline-builds route (OS-FR-13 to OS-FR-16, OS-FR-21; EXPERIENCE "Offline
 * round", "Approved strings" W4 and W5). Real: the codec, the Data to Sign judgement, the
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
import { TooltipProvider } from '@/components/ui/tooltip'
import type { KeyWalletMeta } from '@/lib/crypto/keystore'
import { buildHashOf, resetRounds, roundOf } from '@/lib/offline-round'
import * as W from '@/lib/offline-round-words'
import { encodeDataToSign, encodeSigned, type KeyState } from '@/lib/qr-codec'
import { LEDGER_FLOORS } from '@/lib/offline-window'

const ACCOUNT = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const OTHER = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
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

function mount(w: KeyWalletMeta = wallet) {
  render(
    <TooltipProvider>
      <OfflineNewTransaction wallet={w} />
    </TooltipProvider>,
  )
}
function paste(text: string) {
  fireEvent.change(screen.getByLabelText(/Or paste the text of a code/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Use the pasted text' }))
}
function keptRequest() {
  const r = roundOf(wallet.id)!
  if (r.phase.name !== 'request') throw new Error('not on the request')
  return { requestId: r.phase.requestId, buildHash: buildHashOf(r.build) }
}
const dataFor = (k: { requestId: string; buildHash: string }, over: Partial<{ network: 'testnet' | 'mainnet'; keyState: KeyState }> = {}) =>
  encodeDataToSign({
    network: over.network ?? 'testnet',
    requestId: k.requestId,
    buildHash: k.buildHash,
    sequence: 9,
    fee: '12',
    ledgerIndex: INDEX,
    ...(over.keyState !== undefined ? { keyState: over.keyState } : {}),
  }).text
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


const SIGNED = { text: encodeSigned({ network: 'testnet', txBlob: 'ABCD' }).text, hash: 'A'.repeat(64), sequence: 9, fee: '12', lastLedgerSequence: INDEX + 150, signedAt: 1_700_000_000_000 }
const pick = (type: string) => fireEvent.click(screen.getByRole('radio', { name: type }))
const review = () => fireEvent.click(screen.getByRole('button', { name: W.SHIPPED_KEYS.review }))
const showRequest = () => fireEvent.click(screen.getByRole('button', { name: W.SHOW_THE_REQUEST }))
const P29 = 'Unknown. The app cannot read this value.'
async function sign() {
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))
  })
}

describe('the type list (P-62, "Type of transaction")', () => {
  it('offers Payment, Trust line, Regular Key and Master key; Payment first and chosen', () => {
    mount()
    const radios = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).name === 'off-type')
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual([W.PAYMENT, W.TRUST_LINE, W.REGULAR_KEY_TYPE, W.MASTER_KEY_TYPE])
    expect((radios[0] as HTMLInputElement).checked).toBe(true)
  })
})

describe('Trust line (story 8, the online trust-line fields)', () => {
  it('P-1 in place of the current lines (P-56), the owner reserve and the fee; the online add line', () => {
    mount()
    pick(W.TRUST_LINE)
    expect(screen.getByText(W.SHIPPED_KEYS.trustLines).nextElementSibling?.textContent).toBe(W.FROM_TRANSMITTER)
    expect(screen.getByText(W.SHIPPED_KEYS.ownerReserve).nextElementSibling?.textContent).toBe(W.FROM_TRANSMITTER)
    expect(screen.getByText(W.SHIPPED.networkFee).nextElementSibling?.textContent).toBe(W.FROM_TRANSMITTER)
    expect(screen.getByText(W.SHIPPED_KEYS.addLine)).toBeTruthy()
    expect((screen.getByLabelText(W.SHIPPED_KEYS.trustLimit) as HTMLInputElement).value).toBe('1000000000')
  })

  it('refuses a bad issuer and a bad currency (XRP too) in the online words; Review stays off', () => {
    mount()
    pick(W.TRUST_LINE)
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.issuerAddress), { target: { value: 'rNope' } })
    expect(screen.getByText(W.SHIPPED.invalidAddress)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.currencyCode), { target: { value: 'XRP' } })
    expect(screen.getByText(W.SHIPPED_KEYS.currencyError)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.currencyCode), { target: { value: '0000000000000000000000005553440000000000' } })
    expect(screen.getByText(W.SHIPPED_KEYS.currencyError)).toBeTruthy()
    expect((screen.getByRole('button', { name: W.SHIPPED_KEYS.review }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('add: the code as typed and the canonical limit are the Build; the review names the type and its flag', async () => {
    mount()
    pick(W.TRUST_LINE)
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.issuerAddress), { target: { value: DEST } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.currencyCode), { target: { value: 'usd' } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.trustLimit), { target: { value: '0100.50' } })
    review()
    expect(roundOf(wallet.id)!.build).toEqual({ type: 'trust-line', account: ACCOUNT, currency: 'usd', issuer: DEST, limit: '100.5' })
    expect(await screen.findByRole('heading', { name: W.TRUST_LINE })).toBeTruthy()
    expect(screen.getByText('tfSetNoRipple')).toBeTruthy()
    expect(screen.getByText(`100.5 usd ${DEST}`)).toBeTruthy()
    expect(screen.queryByText('[object Object]')).toBeNull()
  })

  it('edit asks for the new limit; close has no limit and builds "0"; a zero limit is not an add', () => {
    mount()
    pick(W.TRUST_LINE)
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.issuerAddress), { target: { value: DEST } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.currencyCode), { target: { value: 'EUR' } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.trustLimit), { target: { value: '0' } })
    expect((screen.getByRole('button', { name: W.SHIPPED_KEYS.review }) as HTMLButtonElement).disabled).toBe(true)
    pick(W.SHIPPED_KEYS.editTrustLineLimit)
    expect(screen.getByLabelText(W.SHIPPED_KEYS.newLimit)).toBeTruthy()
    expect(screen.queryByText(W.SHIPPED_KEYS.ownerReserve)).toBeNull()
    pick(W.SHIPPED_KEYS.closeTrustLine)
    expect(screen.queryByLabelText(W.SHIPPED_KEYS.newLimit)).toBeNull()
    review()
    expect(roundOf(wallet.id)!.build).toEqual({ type: 'trust-line', account: ACCOUNT, currency: 'EUR', issuer: DEST, limit: '0' })
  })
})

describe('Regular Key (story 8, P-47; OS-FR-21)', () => {
  it('the key state is a reading (P-1); no W5 on the Build; set with a typed address, or remove', () => {
    mount()
    pick(W.REGULAR_KEY_TYPE)
    expect(screen.getAllByText(W.FROM_TRANSMITTER)).toHaveLength(2)
    expect(screen.queryByText(W.W5_SENTENCE)).toBeNull()
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.regularKeyAddress), { target: { value: 'rNope' } })
    expect(screen.getByText(W.SHIPPED.invalidAddress)).toBeTruthy()
    expect((screen.getByRole('button', { name: W.SHIPPED_KEYS.review }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.regularKeyAddress), { target: { value: OTHER } })
    review()
    expect(roundOf(wallet.id)!.build).toEqual({ type: 'regular-key', account: ACCOUNT, regularKey: OTHER })
  })

  it('remove builds a SetRegularKey with no key', () => {
    mount()
    pick(W.REGULAR_KEY_TYPE)
    pick(W.REMOVE_THE_REGULAR_KEY)
    expect(screen.queryByLabelText(W.SHIPPED_KEYS.regularKeyAddress)).toBeNull()
    review()
    expect(roundOf(wallet.id)!.build).toEqual({ type: 'regular-key', account: ACCOUNT, regularKey: null })
  })

  it('"Scan an address with the camera" (P-57) fills the field on this device; no camera, no key', async () => {
    mount()
    pick(W.REGULAR_KEY_TYPE)
    expect(screen.queryByRole('button', { name: W.SCAN_AN_ADDRESS })).toBeNull()
    cleanup()
    const g = globalThis as Record<string, unknown>
    g.BarcodeDetector = class {
      async detect() {
        return [{ rawValue: 'ur:xrplbench-request/not-an-address' }, { rawValue: `ripple:${OTHER}` }]
      }
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [] }) } })
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = () => Promise.resolve()
    try {
      mount()
      pick(W.REGULAR_KEY_TYPE)
      fireEvent.click(screen.getByRole('button', { name: W.SCAN_AN_ADDRESS }))
      expect(screen.getByRole('button', { name: W.STOP_THE_CAMERA })).toBeTruthy()
      await waitFor(() => expect((screen.getByLabelText(W.SHIPPED_KEYS.regularKeyAddress) as HTMLInputElement).value).toBe(OTHER))
      expect(screen.getByRole('button', { name: W.SCAN_AN_ADDRESS })).toBeTruthy()
    } finally {
      delete g.BarcodeDetector
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
      HTMLMediaElement.prototype.play = play
    }
  })
})

describe('Master key (story 8, P-47; W4)', () => {
  it('off: "Test the Regular Key" says where to test (P-50), then W4\'s sentence; on: neither', () => {
    mount()
    pick(W.MASTER_KEY_TYPE)
    expect((screen.getByRole('radio', { name: W.TURN_OFF_THE_MASTER_KEY }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(W.W4_SENTENCE)).toBeTruthy()
    expect(screen.queryByText(W.TEST_ELSEWHERE)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: W.TEST_THE_REGULAR_KEY }))
    expect(screen.getAllByRole('status').some((s) => s.textContent === W.TEST_ELSEWHERE)).toBe(true)
    review()
    expect(roundOf(wallet.id)!.build).toEqual({ type: 'master-key', account: ACCOUNT, enable: false })
    expect(screen.getByText('asfDisableMaster')).toBeTruthy()
  })

  it('on builds ClearFlag; no test, no W4', () => {
    mount()
    pick(W.MASTER_KEY_TYPE)
    pick(W.TURN_ON_THE_MASTER_KEY)
    expect(screen.queryByText(W.W4_SENTENCE)).toBeNull()
    expect(screen.queryByRole('button', { name: W.TEST_THE_REGULAR_KEY })).toBeNull()
    review()
    expect(roundOf(wallet.id)!.build).toEqual({ type: 'master-key', account: ACCOUNT, enable: true })
  })
})

/** Builds a Regular Key set to OTHER and opens the request. */
function regularKeyRequest() {
  pick(W.REGULAR_KEY_TYPE)
  fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.regularKeyAddress), { target: { value: OTHER } })
  review()
  showRequest()
}
function masterOffRequest() {
  pick(W.MASTER_KEY_TYPE)
  review()
  showRequest()
}

describe('the signing review of a key change (OS-FR-16, OS-FR-21)', () => {
  it('shows the key state the Data to Sign carries, and W5 when a set key is replaced', async () => {
    mount()
    regularKeyRequest()
    paste(dataFor(keptRequest(), { keyState: { regular_key: DEST, master_key: 'on', signer_list: null } }))
    expect(await screen.findByRole('heading', { name: 'You are signing for Testnet' })).toBeTruthy()
    expect(screen.getByText(W.W5_SENTENCE)).toBeTruthy()
    expect(screen.getByText(W.SHIPPED_KEYS.masterKeyOn)).toBeTruthy()
    expect(screen.getAllByText(DEST).length).toBeGreaterThan(0)
    expect(screen.getByText('RegularKey').nextElementSibling?.textContent).toBe(OTHER)
  })

  it('no Regular Key set: "None.", no W5; an unknown state: P-29 twice, no W5', async () => {
    mount()
    regularKeyRequest()
    const k = keptRequest()
    paste(dataFor(k, { keyState: { regular_key: null, master_key: 'on', signer_list: null } }))
    await waitFor(() => expect(screen.getAllByText('None.')).toHaveLength(2))
    expect(screen.queryByText(W.W5_SENTENCE)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: W.DO_NOT_SIGN }))
    paste(dataFor(k, { keyState: 'unknown' }))
    await waitFor(() => expect(screen.getAllByText(P29)).toHaveLength(3))
    expect(screen.queryByText(W.W5_SENTENCE)).toBeNull()
  })

  it('a key change without a key state, or a trust line with one, is malformed (P-17)', async () => {
    mount()
    regularKeyRequest()
    paste(dataFor(keptRequest()))
    await waitFor(() => expect(alertText()).toContain(W.DATA_REFUSAL.malformed))
    cleanup()
    resetRounds()
    mount()
    pick(W.TRUST_LINE)
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.issuerAddress), { target: { value: DEST } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.currencyCode), { target: { value: 'USD' } })
    review()
    showRequest()
    paste(dataFor(keptRequest(), { keyState: { regular_key: null, master_key: 'on', signer_list: null } }))
    await waitFor(() => expect(alertText()).toContain(W.DATA_REFUSAL.malformed))
  })

  it('master key off on Testnet: W4\'s sentence above Sign; no phrase; Sign signs', async () => {
    h.sign.mockResolvedValue(SIGNED)
    mount()
    masterOffRequest()
    paste(dataFor(keptRequest(), { keyState: { regular_key: OTHER, master_key: 'on', signer_list: null } }))
    expect(await screen.findByText(W.W4_SENTENCE)).toBeTruthy()
    expect(screen.queryByLabelText(W.SHIPPED_KEYS.offPhraseLabel)).toBeNull()
    await sign()
    expect(h.sign).toHaveBeenCalledTimes(1)
    expect(h.sign.mock.calls[0][1]).toEqual({ type: 'master-key', account: ACCOUNT, enable: false })
  })

  it('master key off on Mainnet: Sign is held until "turn off" is typed (irreversible-class), then signs', async () => {
    h.sign.mockResolvedValue({ ...SIGNED, text: encodeSigned({ network: 'mainnet', txBlob: 'ABCD' }).text })
    const main = { ...wallet, network: 'mainnet' as const }
    mount(main)
    masterOffRequest()
    const r = roundOf(wallet.id)!
    if (r.phase.name !== 'request') throw new Error('not on the request')
    paste(
      encodeDataToSign({
        network: 'mainnet', requestId: r.phase.requestId, buildHash: buildHashOf(r.build), sequence: 9, fee: '12',
        ledgerIndex: LEDGER_FLOORS.mainnet.index + 10, keyState: { regular_key: OTHER, master_key: 'on', signer_list: null },
      }).text,
    )
    const phrase = await screen.findByLabelText(W.SHIPPED_KEYS.offPhraseLabel)
    expect(screen.getByText(W.W4_SENTENCE).compareDocumentPosition(phrase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const signKey = screen.getByRole('button', { name: 'Sign' })
    expect(signKey.getAttribute('aria-disabled')).toBe('true')
    await sign()
    expect(h.sign).not.toHaveBeenCalled()
    fireEvent.change(phrase, { target: { value: '  Turn   OFF ' } })
    expect(signKey.getAttribute('aria-disabled')).toBeNull()
    await sign()
    expect(h.sign).toHaveBeenCalledTimes(1)
  })

  it('master key on: no W4, no phrase', async () => {
    mount({ ...wallet, network: 'testnet' })
    pick(W.MASTER_KEY_TYPE)
    pick(W.TURN_ON_THE_MASTER_KEY)
    review()
    showRequest()
    paste(dataFor(keptRequest(), { keyState: { regular_key: OTHER, master_key: 'off', signer_list: null } }))
    expect(await screen.findByText(W.SHIPPED_KEYS.masterKeyOff)).toBeTruthy()
    expect(screen.queryByText(W.W4_SENTENCE)).toBeNull()
  })
})

describe('Same Build and the retry table work for every type (OS-FR-16)', () => {
  it('a Regular Key typed again shows P-19 with the earlier record', async () => {
    h.signed = [{ buildHash: buildHashOf({ type: 'regular-key', account: ACCOUNT, regularKey: OTHER }), sequence: 9, hash: 'B'.repeat(64), lastLedgerSequence: INDEX + 150, ledgerIndex: INDEX, signedAt: 1 }]
    mount()
    pick(W.REGULAR_KEY_TYPE)
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.regularKeyAddress), { target: { value: OTHER } })
    review()
    expect(await screen.findByText(W.SIGNED_BEFORE)).toBeTruthy()
  })
})

it.each([
  ['a trust line', () => {
    pick(W.TRUST_LINE)
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.issuerAddress), { target: { value: DEST } })
    fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.currencyCode), { target: { value: 'USD' } })
    review()
    showRequest()
  }, undefined],
  ['a Regular Key', regularKeyRequest, { regular_key: null, master_key: 'on', signer_list: null } as KeyState],
  ['master key off', masterOffRequest, { regular_key: OTHER, master_key: 'on', signer_list: null } as KeyState],
])('no ledger client is ever asked for during a round of %s (OS-FR-13)', async (_n, toRequestOf, keyState) => {
  h.sign.mockResolvedValue(SIGNED)
  mount()
  toRequestOf()
  paste(dataFor(keptRequest(), keyState ? { keyState } : {}))
  await sign()
  await screen.findByText(W.KEPT_TITLE)
  expect(h.getXrplClient).not.toHaveBeenCalled()
  expect(h.holdXrplClient).not.toHaveBeenCalled()
})

it('a 40-hex currency shows in full on the review (story 8 review round two)', async () => {
  const hex = '0158415500000000C1F76FF6ECB0BAC600000000'
  mount()
  pick(W.TRUST_LINE)
  fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.issuerAddress), { target: { value: DEST } })
  fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.currencyCode), { target: { value: hex } })
  review()
  expect(await screen.findByText(new RegExp(` ${hex} ${DEST}$`))).toBeTruthy()
})

it('the signing review of a key change has the "Key state" heading and the signer list', async () => {
  mount()
  regularKeyRequest()
  paste(dataFor(keptRequest(), { keyState: { regular_key: null, master_key: 'on', signer_list: { signers: 4, quorum: 3 } } }))
  expect(await screen.findByRole('heading', { name: W.KEY_STATE })).toBeTruthy()
  expect(screen.getByText('4 signers, quorum 3')).toBeTruthy()
})


describe('story 11: W1, P-30 and W2 on the Offline route (OS-FR-21, EXPERIENCE Flow 7 step 2)', () => {
  const HOLE = 'rrrrrrrrrrrrrrrrrrrrrhoLvTp'
  const typeKey = (v: string) => fireEvent.change(screen.getByLabelText(W.SHIPPED_KEYS.regularKeyAddress), { target: { value: v } })

  it('the Build: W1 for a key no Wallet here holds, P-30 for one that is, W2 for a black hole; none blocks Review', async () => {
    const { useAppStore } = await import('@/store/app-store')
    useAppStore.setState({ wallets: [wallet, { ...wallet, id: 'k', seedId: 'k', label: 'Hot key', kind: 'online', address: DEST, keyAddress: DEST }] } as never)
    mount()
    pick(W.REGULAR_KEY_TYPE)
    expect(screen.queryByText(W.W1_SENTENCE)).toBeNull()
    typeKey(OTHER)
    expect(screen.getByText(W.W1_SENTENCE)).toBeTruthy()
    expect(screen.queryByText(W.W2_SENTENCE)).toBeNull()
    typeKey(DEST)
    expect(screen.getByText('This key is the wallet Hot key on this device.')).toBeTruthy()
    expect(screen.queryByText(W.W1_SENTENCE)).toBeNull()
    typeKey(HOLE)
    expect(screen.getByText(W.W1_SENTENCE)).toBeTruthy()
    expect(screen.getByText(W.W2_SENTENCE)).toBeTruthy()
    expect(screen.queryByText(W.W5_SENTENCE)).toBeNull()
    review()
    expect(roundOf(wallet.id)!.build).toEqual({ type: 'regular-key', account: ACCOUNT, regularKey: HOLE })
    useAppStore.setState({ wallets: [] } as never)
  })

  it('the signing review: W5 when the set key is removed; W2 above W4 when master key off and the state names a black hole', async () => {
    mount()
    pick(W.REGULAR_KEY_TYPE)
    pick(W.REMOVE_THE_REGULAR_KEY)
    review()
    showRequest()
    paste(dataFor(keptRequest(), { keyState: { regular_key: DEST, master_key: 'on', signer_list: null } }))
    expect(await screen.findByText(W.W5_SENTENCE)).toBeTruthy()
    cleanup()
    resetRounds()
    mount()
    masterOffRequest()
    paste(dataFor(keptRequest(), { keyState: { regular_key: HOLE, master_key: 'on', signer_list: null } }))
    const w2 = await screen.findByText(W.W2_SENTENCE)
    expect(w2.compareDocumentPosition(screen.getByText(W.W4_SENTENCE)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()
    resetRounds()
    mount()
    masterOffRequest()
    paste(dataFor(keptRequest(), { keyState: { regular_key: OTHER, master_key: 'on', signer_list: null } }))
    expect(await screen.findByText(W.W4_SENTENCE)).toBeTruthy()
    expect(screen.queryByText(W.W2_SENTENCE)).toBeNull()
  })
})
