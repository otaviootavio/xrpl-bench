/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Offline signing story 5 (OS-FR-5, OS-FR-6, OS-FR-7): the Wallet kind plate, the
 * two change screens, and the landing after a change. Real: Gate, Main, every kind
 * shell, Local settings, the task screens, the route, the app store. Faked: the
 * pool (any ledger read is counted), the two live hooks, the vault and the
 * keystore's change functions. Harness: `wallet-kind-screens.test.tsx`.
 */
const h = vi.hoisted(() => ({
  getXrplClient: vi.fn(),
  verifyNode: vi.fn(),
  retire: vi.fn(),
  hookArgs: vi.fn(),
  wallets: [] as unknown[],
  restored: [] as Array<{ lockId: string; key: unknown; autoLockMinutes: number }>,
  toOffline: vi.fn(),
  toOnline: vi.fn(),
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({
  getXrplClient: h.getXrplClient,
  holdXrplClient: h.getXrplClient,
  disconnectAllClients: vi.fn(),
  retireNode: vi.fn(),
  retireNetworkClient: h.retire,
  verifyNode: h.verifyNode,
}))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => <div>onboarding</div> }))
vi.mock('@/pages/Unlock', () => ({ Unlock: ({ wallet }: { wallet: { label: string } }) => <div>{`locked:${wallet.label}`}</div> }))
vi.mock('@/hooks/useIncomingPaymentNotifications', () => ({ useIncomingPaymentNotifications: (...a: unknown[]) => h.hookArgs('notify', ...a) }))
vi.mock('@/hooks/useAccountLiveUpdates', () => ({ useAccountLiveUpdates: (...a: unknown[]) => h.hookArgs('live', ...a) }))
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ updateReady: false, declined: false }) }))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/lib/crypto/transmitter-unlock', () => ({ proveTransmitterUnlock: async () => true }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  restoreOpenLocks: async () => h.restored,
  extendLockSession: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
  hasAppPin: async () => true,
}))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/keystore', async () => {
  const actual = await vi.importActual<typeof import('@/lib/crypto/keystore')>('@/lib/crypto/keystore')
  return {
    listWallets: async () => h.wallets,
    changeToOfflineWallet: h.toOffline,
    changeToOnlineWallet: h.toOnline,
    describeCheckFailure: actual.describeCheckFailure,
    KindChangeRefusedError: actual.KindChangeRefusedError,
  }
})

import App from '../App'
import { useAppStore } from '@/store/app-store'
import { KIND_WORDS } from '@/lib/wallet-kind-words'
import {
  CHANGE_TO_OFFLINE,
  CHANGE_TO_ONLINE,
  NOW_OFFLINE,
  NOW_ONLINE,
  ONLINE_PHRASE_LABEL,
  SHARED_SEED_NO_CHANGE,
  WALLET_KIND,
  PASSKEY_SEED_NOT_OFFLINE,
  SAME_ADDRESS_ON_NETWORK,
  TEXT_C,
  TEXT_D,
  WAS_ONLINE,
  WAS_ONLINE_WHY,
} from '@/lib/kind-change-words'
import { SAME_ADDRESS_TRANSMITTER_HERE } from '@/lib/transmitter-words'
import { fill } from '@/lib/transmit-words'
import { peekKindChanged } from '@/lib/kind-change-result'

const ADDRESS = 'rALPHAaddress'
const keyMeta = (o: Record<string, unknown> = {}) => ({
  id: 'w1',
  seedId: 'w1',
  lockId: 'X',
  label: 'Alpha',
  address: ADDRESS,
  keyAddress: ADDRESS,
  createdAt: 1,
  network: 'testnet',
  algorithm: 'ed25519',
  seedMethod: 'stored',
  openCheck: 'pin',
  signingCheck: 'standard',
  kind: 'online',
  ...o,
})
const transmitter = (address: string | null) => ({ id: 't1', seedId: 't1', lockId: 'T', label: 'Carrier', address, createdAt: 2, network: 'testnet', openCheck: 'pin', kind: 'transmitter' })

/** The app on `path` with `wallets`, every lock open. On a task screen there are no tabs: wait for its heading. */
async function openApp(wallets: unknown[], path = '/wallets/w1') {
  h.wallets = wallets
  h.restored = [{ lockId: 'X', key: {}, autoLockMinutes: 5 }, { lockId: 'T', key: {}, autoLockMinutes: 5 }]
  window.history.replaceState(null, '', path)
  render(<App />)
  if (path.endsWith('/to-offline') || path.endsWith('/to-online')) {
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Change to an/ })).toBeTruthy())
  } else await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0))
}

async function openSettings() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Local settings' }))
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Local settings/ })).toBeTruthy())
}

/** The Wallet kind plate (title approved 2026-11-09). */
function kindPlate(): HTMLElement {
  const plate = [...document.querySelectorAll<HTMLElement>('[data-slot="config-plate"]')].find((p) => p.querySelector('h2')?.textContent === WALLET_KIND)
  if (!plate) throw new Error('no Wallet kind plate')
  return plate
}
/** The stamps at the top of the plate, in order. */
const stamps = () => [...(kindPlate().querySelector('h2')?.nextElementSibling?.children ?? [])].map((e) => e.textContent)

const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent)

beforeEach(() => {
  useAppStore.setState({ openLocks: {}, wallets: [], activeWalletId: null })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the Wallet kind plate (OS-FR-1, OS-FR-5 to OS-FR-7)', () => {
  it('Online: the kind stamp as its heading and "Change to an offline wallet", after This wallet', async () => {
    await openApp([keyMeta()])
    await openSettings()
    const plate = kindPlate()
    expect(stamps()).toEqual([KIND_WORDS.online])
    expect(within(plate).getByRole('button', { name: CHANGE_TO_OFFLINE }).getAttribute('aria-disabled')).toBeNull()
    expect(plate.previousElementSibling?.querySelector('h2')?.textContent).toBe('This wallet')
    expect(plate.textContent).not.toContain(WAS_ONLINE)
  })

  it('a Passkey-Derived Seed Wallet keeps the key, aria-disabled, with P-63 as its visible reason (OS-FR-8)', async () => {
    await openApp([keyMeta({ seedMethod: 'passkey-derived', signingCheck: 'passkey' })])
    await openSettings()
    const key = within(kindPlate()).getByRole('button', { name: CHANGE_TO_OFFLINE })
    expect(key.getAttribute('aria-disabled')).toBe('true')
    const reason = within(kindPlate()).getByText(PASSKEY_SEED_NOT_OFFLINE)
    expect(key.getAttribute('aria-describedby')).toBe(reason.id)
    fireEvent.click(key)
    expect(window.location.pathname).toBe('/wallets/w1')
  })

  it('a marked Offline Wallet: [Offline] [Was online], P-4, and "Change to an online wallet" as a danger key', async () => {
    await openApp([keyMeta({ kind: 'offline', wasOnline: true })])
    await openSettings()
    const plate = kindPlate()
    expect(stamps()).toEqual([KIND_WORDS.offline, WAS_ONLINE])
    expect(within(plate).getByText(WAS_ONLINE_WHY)).toBeTruthy()
    expect(within(plate).getByRole('button', { name: CHANGE_TO_ONLINE }).className).toContain('destructive')
  })

  it('a Seed with more than one Wallet: the key is aria-disabled with the approved reason (2026-11-09)', async () => {
    await openApp([keyMeta(), keyMeta({ id: 'w2', address: 'rOTHERaccount', createdAt: 2 })])
    await openSettings()
    const key = within(kindPlate()).getByRole('button', { name: CHANGE_TO_OFFLINE })
    expect(key.getAttribute('aria-disabled')).toBe('true')
    expect(key.getAttribute('aria-describedby')).toBe(within(kindPlate()).getByText(SHARED_SEED_NO_CHANGE).id)
    fireEvent.click(key)
    expect(window.location.pathname).toBe('/wallets/w1')
  })

  it('an unmarked Offline Wallet shows no Was-online stamp', async () => {
    await openApp([keyMeta({ kind: 'offline' })])
    await openSettings()
    expect(kindPlate().textContent).not.toContain(WAS_ONLINE)
  })

  it('a Transmitter: its stamp and no change key (it never changes kind)', async () => {
    await openApp([transmitter(null)], '/wallets/t1')
    await openSettings()
    const plate = kindPlate()
    expect(stamps()).toEqual([KIND_WORDS.transmitter])
    expect(within(plate).queryByRole('button')).toBeNull()
  })

  it.each([
    ['an Offline Wallet on the to-offline screen', keyMeta({ kind: 'offline' }), '/wallets/w1/to-offline', '/wallets/w1'],
    ['an Online Wallet on the to-online screen', keyMeta(), '/wallets/w1/to-online', '/wallets/w1'],
    ['a Transmitter on the to-online screen', transmitter(null), '/wallets/t1/to-online', '/wallets/t1'],
  ])('%s is sent back to its shell', async (_name, wallet, path, shell) => {
    h.wallets = [wallet]
    h.restored = [{ lockId: 'X', key: {}, autoLockMinutes: 5 }, { lockId: 'T', key: {}, autoLockMinutes: 5 }]
    window.history.replaceState(null, '', path)
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe(shell))
    expect(screen.queryByRole('heading', { level: 1, name: /Change to an/ })).toBeNull()
  })
})

describe('Change to an offline wallet (OS-FR-5)', () => {
  it('shows Text C in full, then a plain confirm; after it the Offline shell opens on Local settings with P-43 and the steps', async () => {
    await openApp([keyMeta({ node: 'wss://node.example' })])
    await openSettings()
    fireEvent.click(within(kindPlate()).getByRole('button', { name: CHANGE_TO_OFFLINE }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_OFFLINE })).toBeTruthy())
    expect(window.location.pathname).toBe('/wallets/w1/to-offline')
    // Reads made by the Online Local settings before the press are not this screen's.
    h.getXrplClient.mockClear()
    for (const line of TEXT_C.lines) expect(screen.getByText(line)).toBeTruthy()
    expect(screen.getByText(TEXT_C.keyWarning.title)).toBeTruthy()
    expect(screen.getByText(TEXT_C.keyWarning.body)).toBeTruthy()
    expect(screen.getByText(TEXT_C.stepsLead)).toBeTruthy()
    expect([...document.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual([...TEXT_C.steps])
    expect(screen.getByText(TEXT_C.offlineWarning.title)).toBeTruthy()
    expect(screen.queryByText(SAME_ADDRESS_TRANSMITTER_HERE)).toBeNull()
    // The screen reads nothing from the ledger.
    await new Promise((r) => setTimeout(r, 20))
    expect(h.getXrplClient).not.toHaveBeenCalled()

    h.toOffline.mockResolvedValue(keyMeta({ kind: 'offline', wasOnline: true }))
    h.hookArgs.mockClear()
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_OFFLINE }))
    await waitFor(() => expect(screen.getByText(fill(NOW_OFFLINE, 'Testnet'))).toBeTruthy())
    expect(h.toOffline).toHaveBeenCalledWith('w1')
    expect(window.location.pathname).toBe('/wallets/w1')
    expect(tabNames()).toEqual(['New transaction', 'Sign', 'Receive', 'Signed', 'Local settings'])
    // The result: P-43 and Text C's steps again, focused, above the plates.
    const result = screen.getByText(fill(NOW_OFFLINE, 'Testnet')).closest('section') as HTMLElement
    expect(document.activeElement).toBe(result)
    expect([...result.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual([...TEXT_C.steps])
    expect(stamps()).toEqual([KIND_WORDS.offline, WAS_ONLINE])
    // The Wallet stopped touching the ledger: its custom Node's socket is retired and no live hook remounted.
    expect(h.retire).toHaveBeenCalledWith('testnet', 'wss://node.example')
    expect(h.hookArgs).not.toHaveBeenCalled()
    await waitFor(() => expect(peekKindChanged('w1')).toBeNull())
  })

  it('warns with P-8\'s second form when a Transmitter here is synced to this address; still allowed', async () => {
    await openApp([keyMeta(), transmitter(ADDRESS)], '/wallets/w1/to-offline')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_OFFLINE })).toBeTruthy())
    expect(screen.getByText(SAME_ADDRESS_TRANSMITTER_HERE.split('. ')[0] + '.')).toBeTruthy()
    expect(screen.getByRole('button', { name: CHANGE_TO_OFFLINE }).getAttribute('aria-disabled')).toBeNull()
  })

  it('entered by its URL, the change lands on the new shell; a throw after the write shows what the vault stores', async () => {
    await openApp([keyMeta()], '/wallets/w1/to-offline')
    // The write landed, then something after it threw: the vault is read again.
    h.toOffline.mockRejectedValue(new Error('read failed after the write'))
    h.wallets = [keyMeta({ kind: 'offline', wasOnline: true })]
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_OFFLINE }))
    await waitFor(() => expect(screen.getByText(fill(NOW_OFFLINE, 'Testnet'))).toBeTruthy())
    expect(window.location.pathname).toBe('/wallets/w1')
    expect(tabNames()).toEqual(['New transaction', 'Sign', 'Receive', 'Signed', 'Local settings'])
  })

  it('a keystore refusal changes nothing and says so (shipped words)', async () => {
    await openApp([keyMeta()], '/wallets/w1/to-offline')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_OFFLINE })).toBeTruthy())
    h.toOffline.mockRejectedValue(new Error('refused'))
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_OFFLINE }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Nothing was changed.'))
    expect(window.location.pathname).toBe('/wallets/w1/to-offline')
    expect(h.retire).not.toHaveBeenCalled()
  })
})

describe('Change to an online wallet (OS-FR-6)', () => {
  it('Testnet: Text D, a Node, no typed phrase; no ledger read until the commit; then the Online shell on Local settings', async () => {
    await openApp([keyMeta({ kind: 'offline', wasOnline: true })])
    await openSettings()
    fireEvent.click(within(kindPlate()).getByRole('button', { name: CHANGE_TO_ONLINE }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_ONLINE })).toBeTruthy())
    await new Promise((r) => setTimeout(r, 20))
    for (const line of TEXT_D.lines) expect(screen.getByText(line)).toBeTruthy()
    for (const w of TEXT_D.warnings) {
      expect(screen.getByText(w.title)).toBeTruthy()
      expect(screen.getByText(w.body)).toBeTruthy()
    }
    expect(screen.getByRole('heading', { level: 2, name: 'Node' })).toBeTruthy()
    expect(screen.queryByLabelText(ONLINE_PHRASE_LABEL)).toBeNull()
    expect(h.getXrplClient).not.toHaveBeenCalled()
    expect(h.verifyNode).not.toHaveBeenCalled()

    h.toOnline.mockResolvedValue({ status: 'ok', value: keyMeta() })
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_ONLINE }))
    await waitFor(() => expect(tabNames()).toEqual(['Balances', 'Send', 'Receive', 'History', 'Tokens', 'Local settings']))
    expect(h.toOnline).toHaveBeenCalledWith('w1', { stillOpen: expect.any(Function) }, expect.objectContaining({ prompts: expect.any(Object) }))
    expect(h.toOnline.mock.calls[0][1].stillOpen()).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: /Local settings/ })).toBeTruthy()
    // The result (approved 2026-11-09) takes focus.
    const result = screen.getByText(fill(NOW_ONLINE, 'Testnet')).closest('section') as HTMLElement
    await waitFor(() => expect(document.activeElement).toBe(result))
  })

  it('Mainnet: the confirm is held until P-39 is typed', async () => {
    await openApp([keyMeta({ kind: 'offline', network: 'mainnet' })], '/wallets/w1/to-online')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_ONLINE })).toBeTruthy())
    const field = screen.getByLabelText(ONLINE_PHRASE_LABEL)
    const key = screen.getByRole('button', { name: CHANGE_TO_ONLINE })
    expect(key.getAttribute('aria-disabled')).toBe('true')
    expect(key.getAttribute('aria-describedby')).toBe(field.id)
    fireEvent.click(key)
    expect(h.toOnline).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '  Change  to ONLINE ' } })
    expect(key.getAttribute('aria-disabled')).toBeNull()
    h.toOnline.mockResolvedValue({ status: 'cancelled' })
    fireEvent.click(key)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Cancelled. Nothing was signed.'))
    expect(window.location.pathname).toBe('/wallets/w1/to-online')
  })

  it('shows the keystore\'s P-35 refusal and stays', async () => {
    await openApp([keyMeta({ kind: 'offline' })], '/wallets/w1/to-online')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_ONLINE })).toBeTruthy())
    const reason = fill(SAME_ADDRESS_ON_NETWORK, 'Testnet')
    h.toOnline.mockResolvedValue({ status: 'refused', reason })
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_ONLINE }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(reason))
    expect(window.location.pathname).toBe('/wallets/w1/to-online')
  })

  it('a custom Node not tested is refused with the quiz\'s words; a tested one is passed on', async () => {
    await openApp([keyMeta({ kind: 'offline' })], '/wallets/w1/to-online')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_ONLINE })).toBeTruthy())
    fireEvent.click(screen.getByRole('radio', { name: /A Node you choose/ }))
    const url = screen.getByLabelText('Node address (wss://)')
    fireEvent.change(url, { target: { value: 'wss://mine.example' } })
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_ONLINE }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Test the custom Node first, or use the built-in Nodes.'))
    expect(h.toOnline).not.toHaveBeenCalled()
    h.verifyNode.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Test this Node' }))
    await waitFor(() => expect(h.verifyNode).toHaveBeenCalledWith('testnet', 'wss://mine.example'))
    await waitFor(() => expect(screen.getByText('This Node answers for this network and will be used.')).toBeTruthy())
    h.toOnline.mockResolvedValue({ status: 'refused', reason: 'x' })
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_ONLINE }))
    await waitFor(() => expect(h.toOnline).toHaveBeenCalledWith('w1', { node: 'wss://mine.example', stillOpen: expect.any(Function) }, expect.anything()))
  })
})
