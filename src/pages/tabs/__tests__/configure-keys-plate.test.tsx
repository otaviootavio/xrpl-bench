/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 11 (OS-FR-21, CAP-14): the Online Wallet's key plate, driven through Local settings.
 * Titled with the approved "Key state"; P-47's four keys; every warning before the Signing
 * Check and none blocks; no app refusal whatever the key state; master key off held on
 * Mainnet until the phrase is typed; the test in place or P-50; the outcome in today's words
 * with P-31's reason; P-54 after a validated set. The writes are `key-actions.ts` (mocked
 * here; `key-actions.test.ts` pins them on signed blobs). Also: the FR-75 plate keeps only
 * its note and "Let another wallet sign" until story 12.
 */
const h = vi.hoisted(() => ({
  account: { isError: false, data: undefined as unknown },
  signers: { isError: false, data: null as unknown },
  run: vi.fn(),
  test: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ getLockInfo: async () => ({ id: 'l', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => h.account }))
vi.mock('@/hooks/useSignerList', () => ({ useSignerList: () => h.signers }))
vi.mock('@/hooks/usePrompts', () => ({
  usePrompts: () => ({ pin: async () => null }),
  useYieldingPrompts: () => ({ prompts: { pin: async () => null }, promptOpen: false }),
}))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))
vi.mock('@/store/app-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/app-store')>()
  return { ...actual, useWalletOpenKey: () => null }
})
vi.mock('@/lib/key-actions', () => ({
  runKeyAction: (...a: unknown[]) => h.run(...a),
  testRegularKey: (...a: unknown[]) => h.test(...a),
}))

import { WalletTab } from '@/pages/tabs/WalletTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'
import * as W from '@/lib/offline-round-words'
import { NONE, VALUE_UNKNOWN } from '@/lib/transmitter-words'
import { SET_IT_ELSEWHERE } from '@/lib/signs-for-words'

const ACCT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const KEY = 'rGWrZyQqhTp9Xu7G5Pkayo7bXjH4k4QYpf'
const UNHELD = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const HOLE = 'rrrrrrrrrrrrrrrrrrrrBZbvji'
const base = { seedId: 's', lockId: 'l', createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'online' } as const
const MASTER = { ...base, id: 'm', label: 'Vault', address: ACCT, keyAddress: ACCT }
const PHONE = { ...base, id: 'k', seedId: 's2', lockId: 'l2', label: 'Phone', address: KEY, keyAddress: KEY }
const PHONE_FOR = { ...PHONE, id: 'kf', address: ACCT }
const MAINNET = { ...MASTER, id: 'mm', network: 'mainnet' }
const state = (extra: Record<string, unknown> = {}) => ({
  exists: true, address: ACCT, balanceDrops: '1', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...extra,
})
const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const mount = (w: unknown) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <WalletTab wallet={w as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
const plate = () => screen.getByRole('region', { name: W.KEY_STATE })
const key = (name: string) => within(plate()).getAllByRole('button', { name })
const opener = (name: string) => key(name)[0]
const confirm = (name: string) => key(name).at(-1)!
const type = (label: string | RegExp, value: string) => fireEvent.change(within(plate()).getByLabelText(label), { target: { value } })

beforeEach(() => {
  useAppStore.setState({ wallets: [MASTER, PHONE, MAINNET], openLocks: { l: { key: {} as CryptoKey, autoLockMinutes: 5 } }, activeWalletId: 'm' } as never)
  h.account = { isError: false, data: state() }
  h.signers = { isError: false, data: null }
  h.run.mockReset()
  h.test.mockReset()
})
afterEach(cleanup)

describe('the Online key plate (story 11)', () => {
  it('sits after Signs for and before Node (the FR-75 plate is retired, story 12); titled "Key state" with the live rows and P-47\'s four keys', () => {
    mount(MASTER)
    const titles = screen.getAllByRole('heading', { level: 2 }).map((e) => e.textContent)
    expect(titles.indexOf(W.KEY_STATE)).toBe(titles.indexOf('This key signs for another account') + 1)
    expect(titles.indexOf('Node')).toBe(titles.indexOf(W.KEY_STATE) + 1)
    expect(titles).not.toContain('Operating another account')
    const p = plate()
    expect(within(p).getByText(W.REGULAR_KEY_TYPE)).toBeTruthy()
    expect(within(p).getAllByText(NONE)).toHaveLength(2)
    expect(within(p).getByText(W.SHIPPED_KEYS.masterKeyOn)).toBeTruthy()
    for (const k of [W.SET_A_REGULAR_KEY, W.REMOVE_THE_REGULAR_KEY, W.TURN_OFF_THE_MASTER_KEY, W.TURN_ON_THE_MASTER_KEY]) {
      expect(opener(k).hasAttribute('aria-disabled')).toBe(false)
    }
    // One master key control on the screen: the FR-75 plate and its key are gone.
    expect(screen.queryByRole('button', { name: 'Let another wallet sign' })).toBeNull()
    expect(screen.queryByTestId('master-key-control')).toBeNull()
  })

  it('a failed read is P-29 in each row and refuses nothing; a pending read claims nothing', async () => {
    h.account = { isError: true, data: undefined }
    mount(MASTER)
    expect(within(plate()).getAllByText(VALUE_UNKNOWN)).toHaveLength(3)
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    expect(within(plate()).getByText(W.W4_SENTENCE)).toBeTruthy()
    cleanup()
    h.account = { isError: false, data: undefined }
    mount(MASTER)
    expect(within(plate()).queryByText(VALUE_UNKNOWN)).toBeNull()
    expect(within(plate()).queryByText(NONE)).toBeNull()
  })

  it('Set: W1 for an unheld key, P-30 for a key Wallet here, W2 for a black hole, W5 when a set key is replaced; then it signs that address', async () => {
    h.account = { isError: false, data: state({ regularKey: UNHELD }) }
    h.run.mockResolvedValue({ kind: 'outcome', outcome: { status: 'validated', hash: 'AB', resultCode: 'tesSUCCESS' }, regularKeySet: { account: ACCT, regularKey: KEY, network: 'testnet' } })
    mount(MASTER)
    await click(opener(W.SET_A_REGULAR_KEY))
    expect(confirm(W.SET_A_REGULAR_KEY).getAttribute('aria-disabled')).toBe('true')
    type(W.SHIPPED_KEYS.regularKeyAddress, HOLE)
    expect(within(plate()).getByText(W.W1_SENTENCE)).toBeTruthy()
    expect(within(plate()).getByText(W.W2_SENTENCE)).toBeTruthy()
    expect(within(plate()).getByText(W.W5_SENTENCE)).toBeTruthy()
    type(W.SHIPPED_KEYS.regularKeyAddress, KEY)
    expect(within(plate()).getByText('This key is the wallet Phone on this device.')).toBeTruthy()
    expect(within(plate()).queryByText(W.W1_SENTENCE)).toBeNull()
    expect(within(plate()).queryByText(W.W2_SENTENCE)).toBeNull()
    expect(h.run).not.toHaveBeenCalled()
    await click(confirm(W.SET_A_REGULAR_KEY))
    await waitFor(() => expect(h.run).toHaveBeenCalledTimes(1))
    expect(h.run.mock.calls[0][0]).toMatchObject({ id: 'm' })
    expect(h.run.mock.calls[0][1]).toEqual({ type: 'set', regularKey: KEY })
    // P-54 after a validated set, on this plate (story 10's deferred entry).
    expect(await screen.findByText('Validated')).toBeTruthy()
    expect(within(plate()).getByText(SET_IT_ELSEWHERE)).toBeTruthy()
  })

  it('Set to the Account\'s own address is not refused by the app; temBAD_REGKEY reads as a failed outcome with P-31', async () => {
    h.run.mockResolvedValue({ kind: 'outcome', outcome: { status: 'failed', hash: 'AB', resultCode: 'temBAD_REGKEY' } })
    mount(MASTER)
    await click(opener(W.SET_A_REGULAR_KEY))
    type(W.SHIPPED_KEYS.regularKeyAddress, ACCT)
    await click(confirm(W.SET_A_REGULAR_KEY))
    expect(h.run.mock.calls[0][1]).toEqual({ type: 'set', regularKey: ACCT })
    expect(await screen.findByText(W.LEDGER_REFUSAL.temBAD_REGKEY)).toBeTruthy()
  })

  it('Remove: W5 only when a key is set; claimed tecNO_ALTERNATIVE_KEY shows P-31 and the fee sentence', async () => {
    h.run.mockResolvedValue({ kind: 'outcome', outcome: { status: 'claimed', hash: 'AB', resultCode: 'tecNO_ALTERNATIVE_KEY' } })
    mount(MASTER)
    await click(opener(W.REMOVE_THE_REGULAR_KEY))
    expect(within(plate()).queryByText(W.W5_SENTENCE)).toBeNull()
    cleanup()
    h.account = { isError: false, data: state({ regularKey: KEY, disableMasterKey: true }) }
    mount(MASTER)
    await click(opener(W.REMOVE_THE_REGULAR_KEY))
    expect(within(plate()).getByText(W.W5_SENTENCE)).toBeTruthy()
    await click(confirm(W.REMOVE_THE_REGULAR_KEY))
    expect(h.run.mock.calls[0][1]).toEqual({ type: 'remove' })
    const reason = await screen.findByText(new RegExp(W.LEDGER_REFUSAL.tecNO_ALTERNATIVE_KEY))
    // P-31's approved claimed sentence, verbatim (review): not the Transmit step's "for this attempt".
    expect(reason.textContent).toBe(`${W.LEDGER_REFUSAL.tecNO_ALTERNATIVE_KEY} The network fee was still charged.`)
  })

  it('Turn off with no Regular Key is sent (the ledger answers): test points elsewhere (P-50), W4, no phrase off Mainnet', async () => {
    h.run.mockResolvedValue({ kind: 'outcome', outcome: { status: 'claimed', hash: 'AB', resultCode: 'tecNO_ALTERNATIVE_KEY' } })
    mount(MASTER)
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    expect(within(plate()).getByText(W.W4_SENTENCE)).toBeTruthy()
    expect(within(plate()).queryByLabelText(/Type “turn off”/)).toBeNull()
    await click(within(plate()).getByRole('button', { name: W.TEST_THE_REGULAR_KEY }))
    expect(within(plate()).getByText(W.TEST_ELSEWHERE)).toBeTruthy()
    expect(h.test).not.toHaveBeenCalled()
    await click(confirm(W.TURN_OFF_THE_MASTER_KEY))
    expect(h.run.mock.calls[0][1]).toEqual({ type: 'master', enable: false })
  })

  it('Turn off with a black-hole Regular Key: W2 before W4', async () => {
    h.account = { isError: false, data: state({ regularKey: HOLE }) }
    mount(MASTER)
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    const text = plate().textContent!
    expect(text.indexOf(W.W2_SENTENCE)).toBeGreaterThan(-1)
    expect(text.indexOf(W.W2_SENTENCE)).toBeLessThan(text.indexOf(W.W4_SENTENCE))
  })

  it('Test the Regular Key runs in place with the open Online Wallet that holds the key and signs for this Account', async () => {
    useAppStore.setState({ wallets: [MASTER, PHONE_FOR], openLocks: { l: { key: {} as CryptoKey, autoLockMinutes: 5 }, l2: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
    h.account = { isError: false, data: state({ regularKey: KEY }) }
    h.test.mockResolvedValue({ kind: 'outcome', outcome: { status: 'validated', hash: 'CD', resultCode: 'tesSUCCESS' } })
    mount(MASTER)
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    await click(within(plate()).getByRole('button', { name: W.TEST_THE_REGULAR_KEY }))
    await waitFor(() => expect(h.test).toHaveBeenCalledTimes(1))
    expect(h.test.mock.calls[0][0]).toMatchObject({ id: 'm' })
    expect(h.test.mock.calls[0][1]).toMatchObject({ id: 'kf' })
    expect(await within(plate()).findByText('Validated')).toBeTruthy()
    expect(within(plate()).queryByText(W.TEST_ELSEWHERE)).toBeNull()
    expect(h.run).not.toHaveBeenCalled()
  })

  it('Mainnet holds turn off until the phrase is typed', async () => {
    h.run.mockResolvedValue({ kind: 'outcome', outcome: { status: 'validated', hash: 'AB', resultCode: 'tesSUCCESS' } })
    mount(MAINNET)
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    expect(confirm(W.TURN_OFF_THE_MASTER_KEY).getAttribute('aria-disabled')).toBe('true')
    await click(confirm(W.TURN_OFF_THE_MASTER_KEY))
    expect(h.run).not.toHaveBeenCalled()
    type(/Type “turn off”/, '  Turn   OFF ')
    await click(confirm(W.TURN_OFF_THE_MASTER_KEY))
    await waitFor(() => expect(h.run).toHaveBeenCalledTimes(1))
  })

  it('Turn on signs from a Regular Key Wallet; tecNEED_MASTER_KEY reads in P-31; a refusal before sending is its own words', async () => {
    useAppStore.setState({ wallets: [MASTER, PHONE_FOR] } as never)
    h.run.mockResolvedValueOnce({ kind: 'outcome', outcome: { status: 'claimed', hash: 'AB', resultCode: 'tecNEED_MASTER_KEY' } })
    mount(PHONE_FOR)
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    await click(confirm(W.TURN_OFF_THE_MASTER_KEY))
    expect(h.run.mock.calls[0][0]).toMatchObject({ id: 'kf' })
    expect(await screen.findByText(new RegExp(W.LEDGER_REFUSAL.tecNEED_MASTER_KEY))).toBeTruthy()
    h.run.mockResolvedValueOnce({ kind: 'refused', text: W.NOT_SIGNED })
    await click(opener(W.TURN_ON_THE_MASTER_KEY))
    await click(confirm(W.TURN_ON_THE_MASTER_KEY))
    expect(h.run.mock.calls[1][1]).toEqual({ type: 'master', enable: true })
    expect((await within(plate()).findByRole('alert')).textContent).toBe(W.NOT_SIGNED)
  })
})

describe('the FR-75 plate is retired (story 12)', () => {
  it('a Signs-for wallet shows the Key state plate and no FR-75 plate, note or key', () => {
    h.account = { isError: false, data: state({ regularKey: KEY }) }
    useAppStore.setState({ wallets: [MASTER, PHONE_FOR] } as never)
    mount(PHONE_FOR)
    expect(plate()).toBeTruthy()
    expect(screen.queryByText('Operating another account')).toBeNull()
    expect(screen.queryByTestId('controlled-note')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Let another wallet sign' })).toBeNull()
  })
})

describe('story 11 review: no key changes before the warnings can show', () => {
  it('while the account read is pending every signing key is held and signs nothing', async () => {
    h.account = { isError: false, data: undefined }
    mount(MASTER)
    await click(opener(W.REMOVE_THE_REGULAR_KEY))
    expect(confirm(W.REMOVE_THE_REGULAR_KEY).getAttribute('aria-disabled')).toBe('true')
    await click(confirm(W.REMOVE_THE_REGULAR_KEY))
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    expect(confirm(W.TURN_OFF_THE_MASTER_KEY).getAttribute('aria-disabled')).toBe('true')
    await click(confirm(W.TURN_OFF_THE_MASTER_KEY))
    await click(opener(W.TURN_ON_THE_MASTER_KEY))
    await click(confirm(W.TURN_ON_THE_MASTER_KEY))
    await click(opener(W.SET_A_REGULAR_KEY))
    type(W.SHIPPED_KEYS.regularKeyAddress, KEY)
    expect(confirm(W.SET_A_REGULAR_KEY).getAttribute('aria-disabled')).toBe('true')
    await click(confirm(W.SET_A_REGULAR_KEY))
    expect(h.run).not.toHaveBeenCalled()
  })

  it('W5 and W2 come from the account read alone, while the signer list is still pending', async () => {
    h.signers = { isError: false, data: undefined }
    h.account = { isError: false, data: state({ regularKey: 'rrrrrrrrrrrrrrrrrrrrBZbvji' }) }
    mount(MASTER)
    await click(opener(W.REMOVE_THE_REGULAR_KEY))
    expect(within(plate()).getByText(W.W5_SENTENCE)).toBeTruthy()
    expect(confirm(W.REMOVE_THE_REGULAR_KEY).hasAttribute('aria-disabled')).toBe(false)
    await click(opener(W.TURN_OFF_THE_MASTER_KEY))
    expect(within(plate()).getByText(W.W2_SENTENCE)).toBeTruthy()
  })
})

describe('owner 2026-11-15: black-hole Regular Key with the master key off', () => {
  const HOLE = 'rrrrrrrrrrrrrrrrrrrrBZbvji'
  it('Mainnet: the typed phrase holds Set; off Mainnet, or with the master key on, no phrase', async () => {
    h.account = { isError: false, data: state({ regularKey: KEY, disableMasterKey: true }) }
    h.run.mockResolvedValue({ kind: 'outcome', outcome: { status: 'validated', hash: 'AB', resultCode: 'tesSUCCESS' } })
    mount(MAINNET)
    await click(opener(W.SET_A_REGULAR_KEY))
    type(W.SHIPPED_KEYS.regularKeyAddress, HOLE)
    expect(confirm(W.SET_A_REGULAR_KEY).getAttribute('aria-disabled')).toBe('true')
    await click(confirm(W.SET_A_REGULAR_KEY))
    expect(h.run).not.toHaveBeenCalled()
    type(/Type “turn off”/, 'turn off')
    await click(confirm(W.SET_A_REGULAR_KEY))
    await waitFor(() => expect(h.run).toHaveBeenCalledTimes(1))
    cleanup()
    mount(MASTER)
    await click(opener(W.SET_A_REGULAR_KEY))
    type(W.SHIPPED_KEYS.regularKeyAddress, HOLE)
    expect(within(plate()).queryByLabelText(/Type “turn off”/)).toBeNull()
    cleanup()
    h.account = { isError: false, data: state({ regularKey: KEY }) }
    mount(MAINNET)
    await click(opener(W.SET_A_REGULAR_KEY))
    type(W.SHIPPED_KEYS.regularKeyAddress, HOLE)
    expect(within(plate()).queryByLabelText(/Type “turn off”/)).toBeNull()
  })
})
