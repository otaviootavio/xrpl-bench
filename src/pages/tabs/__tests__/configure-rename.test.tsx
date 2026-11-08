/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** Rename as a section of Configure (story 1): the real name rule, a mocked keystore write. */
const h = vi.hoisted(() => ({
  rename: vi.fn(),
  success: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'lockA', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/notify', () => ({ notify: { success: (m: string) => h.success(m), error: () => {}, warning: () => {} }, toast: { error: () => {}, success: () => {}, warning: () => {} } }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  listWallets: async () => [],
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: () => 'locked',
  renameWallet: (id: string, name: string) => h.rename(id, name),
}))

import { WalletTab } from '@/pages/tabs/WalletTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RENAME_ERRORS, RENAME_HELP, RENAME_WRITE_FAILED } from '@/components/wallet/rename-copy'
import { useAppStore } from '@/store/app-store'

const base = { lockId: 'lockA', createdAt: 1, network: 'mainnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', kind: 'online' }
const W = { ...base, id: 'w1', seedId: 's1', label: 'Savings', address: 'rA' }
const SIBLING = { ...base, id: 'w1b', seedId: 's1', label: 'Savings', address: 'rA2', network: 'testnet' }
const OTHER = { ...base, id: 'w2', seedId: 's2', label: 'Travel', address: 'rB' }

function Screen() {
  const wallet = useAppStore((s) => s.wallets.find((w) => w.id === 'w1'))
  return <WalletTab wallet={wallet as never} />
}

function mount(fixed = false) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        {fixed ? <WalletTab wallet={W as never} /> : <Screen />}
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const field = () => within(screen.getByRole('dialog')).getByLabelText('Name') as HTMLInputElement
const save = () => screen.getByRole('button', { name: 'Save name' }) as HTMLButtonElement
const type = (v: string) => fireEvent.change(field(), { target: { value: v } })
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Rename Savings' }))
const namePlate = () => document.querySelector('[data-configure-plate="name"]') as HTMLElement

beforeEach(() => {
  h.rename.mockReset()
  h.success.mockReset()
  useAppStore.setState({ wallets: [W, SIBLING, OTHER], activeWalletId: 'w1', network: 'mainnet', openLocks: { lockA: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
})
afterEach(cleanup)

describe('Configure Name plate', () => {
  it('sits after This wallet and Account, above Checks, and shows the name', () => {
    mount()
    const titles = screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)
    expect(titles[2]).toBe('Name')
    expect(titles.indexOf('Name')).toBeLessThan(titles.indexOf('Checks'))
    expect(within(namePlate()).getByText('Savings')).toBeTruthy()
  })

  it('saves a valid name: no lock prompt, every row of the Seed renamed, toast, focus on the plate', async () => {
    h.rename.mockImplementation(async (seedId: string, name: string) => ({
      ok: true,
      metas: useAppStore.getState().wallets.filter((w) => w.seedId === seedId).map((w) => ({ ...w, label: name })),
    }))
    mount()
    open()
    type('  Rainy day ')
    fireEvent.click(save())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.rename).toHaveBeenCalledWith('s1', 'Rainy day')
    expect(useAppStore.getState().wallets.filter((w) => w.seedId === 's1').map((w) => w.label)).toEqual(['Rainy day', 'Rainy day'])
    expect(useAppStore.getState().wallets.find((w) => w.id === 'w2')?.label).toBe('Travel')
    expect(h.success).toHaveBeenCalledWith('Wallet renamed.')
    expect(within(namePlate()).getByText('Rainy day')).toBeTruthy()
    expect(screen.getAllByText('Rainy day').length).toBeGreaterThan(1) // plate and subtitle
    expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['lockA'])
    await waitFor(() => expect(document.activeElement).toBe(namePlate()))
  })

  it.each([
    ['   ', 'empty'],
    ['x'.repeat(41), 'too-long'],
    ['  tRAVEL ', 'duplicate'],
  ] as const)('refuses %j with its reason and never writes', (value, reason) => {
    mount()
    open()
    type(value)
    fireEvent.blur(field())
    expect(screen.getByText(RENAME_ERRORS[reason])).toBeTruthy()
    expect(save().disabled).toBe(true)
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(h.rename).not.toHaveBeenCalled()
  })

  it('does not count its own Seed\'s other rows as a collision', () => {
    mount()
    open()
    type('savings ') // its own name, differing in case and spacing: unchanged, not a duplicate
    fireEvent.blur(field())
    expect(screen.queryByText(RENAME_ERRORS.duplicate)).toBeNull()
  })

  it('shows the keystore\'s reason and keeps the dialog open', async () => {
    h.rename.mockResolvedValue({ ok: false, reason: 'duplicate' })
    mount()
    open()
    type('Fresh')
    fireEvent.click(save())
    await screen.findByText(RENAME_ERRORS.duplicate)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(h.success).not.toHaveBeenCalled()
  })

  it('on a failed write keeps the typed name and leaves the store unchanged', async () => {
    h.rename.mockResolvedValue({ ok: false, reason: 'write-failed' })
    mount()
    open()
    type('Fresh')
    fireEvent.click(save())
    expect((await screen.findByRole('alert')).textContent).toBe(RENAME_WRITE_FAILED)
    expect(field().value).toBe('Fresh')
    expect(useAppStore.getState().wallets.find((w) => w.id === 'w1')?.label).toBe('Savings')
  })

  it('does not bring back a Seed removed while the save was running', async () => {
    let finish: (v: unknown) => void = () => {}
    h.rename.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    mount(true) // the screen keeps its wallet, so the removal can only show in the store
    open()
    type('Fresh')
    fireEvent.click(save())
    useAppStore.setState({ wallets: [OTHER] } as never)
    finish({ ok: true, metas: [{ ...W, label: 'Fresh' }, { ...SIBLING, label: 'Fresh' }] })
    await waitFor(() => expect(h.rename).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(useAppStore.getState().wallets.filter((w) => w.seedId === 's1')).toEqual([])
    expect(useAppStore.getState().wallets.map((w) => w.id)).toEqual(['w2'])
  })

  it('an unchanged name closes without writing', async () => {
    mount()
    open()
    fireEvent.keyDown(field(), { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.rename).not.toHaveBeenCalled()
  })

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('%s closes and focus returns to the Name plate', async (_n, dismiss) => {
    mount()
    open()
    dismiss()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(namePlate()))
    expect(h.rename).not.toHaveBeenCalled()
  })

  // Ported from the chooser card's Rename tests (Configure story 3): the same rules, on the surface that now owns them.
  it('opens a titled dialog with the always-visible help, Cancel and Save name', () => {
    mount()
    open()
    expect(screen.getByRole('dialog', { name: 'Rename wallet' })).toBeTruthy()
    expect(field().value).toBe('Savings')
    expect(screen.getByText(RENAME_HELP)).toBe(screen.getByText('Only on this device. Never sent to the ledger.'))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(save().disabled).toBe(true) // unchanged
  })

  it('an error is visible text tied to the field, and the help stays tied too', () => {
    mount()
    open()
    type('   ')
    expect(screen.queryByText(RENAME_ERRORS.empty)).toBeNull() // not before blur or submit
    fireEvent.blur(field())
    const err = screen.getByText(RENAME_ERRORS.empty)
    expect(RENAME_ERRORS.empty).toBe('Give this wallet a name.')
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(field().getAttribute('aria-describedby')).toContain(err.id)
    expect(field().getAttribute('aria-describedby')).toContain(screen.getByText(RENAME_HELP).id)
  })

  it('Enter on an invalid name shows the error without a blur', () => {
    mount()
    open()
    type(' ')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(screen.getByText(RENAME_ERRORS.empty)).toBeTruthy()
    expect(h.rename).not.toHaveBeenCalled()
  })

  it('a grandfathered duplicate left unchanged shows no error and closes silently', async () => {
    const TWIN = { ...base, id: 'w3', seedId: 's3', label: 'savings', address: 'rC', network: 'devnet' }
    useAppStore.setState({ wallets: [W, TWIN] } as never)
    mount()
    open()
    fireEvent.blur(field())
    expect(screen.queryByText(RENAME_ERRORS.duplicate)).toBeNull()
    fireEvent.keyDown(field(), { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.rename).not.toHaveBeenCalled()
    expect(h.success).not.toHaveBeenCalled()
  })

  it('Enter that confirms an IME composition does not submit', () => {
    mount()
    open()
    type('Fresh')
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    expect(h.rename).not.toHaveBeenCalled()
  })

  it('the dialog and renameWallet share the one rule, and the UI never builds a label', () => {
    const dialog = readFileSync('src/components/wallet/RenameDialog.tsx', 'utf8')
    const configure = readFileSync('src/pages/tabs/WalletTab.tsx', 'utf8')
    const keystore = readFileSync('src/lib/crypto/keystore.ts', 'utf8')
    expect(dialog).toMatch(/validateWalletName\(/)
    expect(keystore).toMatch(/validateWalletName\(/)
    expect(dialog + configure).not.toMatch(/outline-none|:focus\b/)
  })
})
