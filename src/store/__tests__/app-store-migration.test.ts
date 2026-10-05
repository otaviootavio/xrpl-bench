import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Story 9.1: "the persisted store already holds entries in the old shape —
 * existing entries read as tagless entries rather than throwing or vanishing,
 * and no saved address is lost by the shape change."
 *
 * The store is REAL, persist middleware and all; only its sink (`idb-keyval`)
 * is an in-memory map. Each case writes a blob exactly as the pre-Epic-9 build
 * wrote it — zustand stamps an unversioned store `version: 0` — and asks the
 * real store to rehydrate from it.
 */

const h = vi.hoisted(() => ({ idb: new Map<string, string>() }))

vi.mock('idb-keyval', () => ({
  get: async (k: string) => h.idb.get(k),
  set: async (k: string, v: string) => void h.idb.set(k, v),
  del: async (k: string) => void h.idb.delete(k),
}))
vi.mock('@/lib/crypto/auth', () => ({ endSession: async () => {} }))

import { APP_STATE_STORAGE_KEY, useAppStore } from '../app-store'
import { suppressesFirstSendWarning } from '../address-book'

const EXCHANGE = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const OTHER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const WALLETS = [{ id: 'w1', label: 'Savings', address: 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR' }]

/** A blob as the build before this change persisted it. */
function legacyBlob(addressBook: unknown) {
  return JSON.stringify({
    state: {
      network: 'mainnet',
      wallets: WALLETS,
      activeWalletId: 'w1',
      addressBook,
      autoLockMinutes: 15,
      declinedUpdateVersions: ['abc123'],
    },
    version: 0,
  })
}

beforeEach(() => {
  h.idb.clear()
  useAppStore.setState({ network: 'testnet', wallets: [], activeWalletId: null, addressBook: [], autoLockMinutes: 5, declinedUpdateVersions: [] })
})

describe('app store — a version-0 Address Book survives the shape change', () => {
  it('reads every old entry as one with no recorded network or tag, and drops the fabricated labels', async () => {
    h.idb.set(
      APP_STATE_STORAGE_KEY,
      legacyBlob([
        { address: EXCHANGE, label: EXCHANGE.slice(0, 8) },
        { address: OTHER, label: OTHER.slice(0, 8) },
      ]),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual([{ address: EXCHANGE }, { address: OTHER }])
  })

  it('carries every other persisted field through untouched', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob([{ address: EXCHANGE, label: EXCHANGE.slice(0, 8) }]))

    await useAppStore.persist.rehydrate()

    const s = useAppStore.getState()
    expect(s.wallets).toEqual(WALLETS)
    expect(s.activeWalletId).toBe('w1')
    expect(s.network).toBe('mainnet')
    expect(s.autoLockMinutes).toBe(15)
    expect(s.declinedUpdateVersions).toEqual(['abc123'])
  })

  it('keeps the stored version at 0, so a build from before this change still reads it', async () => {
    // Rollback safety. Every earlier build is version 0 with no `migrate`, and
    // zustand hydrates NOTHING from a stored version it does not expect — its
    // next write then puts defaults over the Address Book, network, auto-lock
    // and declined updates. The shape change must not move the version.
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob([{ address: EXCHANGE, label: EXCHANGE.slice(0, 8) }]))
    await useAppStore.persist.rehydrate()

    useAppStore.getState().addAddressBookEntry({ address: EXCHANGE, destinationTag: '9' })
    await new Promise((r) => setTimeout(r, 0))

    const stored = JSON.parse(h.idb.get(APP_STATE_STORAGE_KEY)!)
    expect(stored.version).toBe(0)
    expect(stored.state.addressBook).toEqual([{ address: EXCHANGE }, { address: EXCHANGE, destinationTag: '9' }])
    expect(stored.state.wallets).toEqual(WALLETS)
  })

  it('reads what this build wrote back unchanged — the migration is idempotent', async () => {
    const current = [{ address: EXCHANGE, destinationTag: '1' }, { address: EXCHANGE }, { address: OTHER, label: 'Landlord' }]
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob(current))

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual(current)
  })

  it('with nothing stored, leaves the in-memory book alone', async () => {
    useAppStore.setState({ addressBook: [{ address: OTHER }] })
    h.idb.delete(APP_STATE_STORAGE_KEY)

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual([{ address: OTHER }])
  })

  it('a malformed Address Book does not take the wallets down with it', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob('not-an-array'))

    await useAppStore.persist.rehydrate()

    const s = useAppStore.getState()
    expect(s.addressBook).toEqual([])
    expect(s.wallets).toEqual(WALLETS)
  })

  it('reads back a book with networks unchanged, and keeps writing version 0', async () => {
    const current = [
      { address: EXCHANGE },
      { address: EXCHANGE, network: 'testnet', destinationTag: '1' },
      { address: EXCHANGE, network: 'mainnet', destinationTag: '1' },
      { address: OTHER, network: 'mainnet' },
    ]
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob(current))
    await useAppStore.persist.rehydrate()
    expect(useAppStore.getState().addressBook).toEqual(current)

    useAppStore.getState().addAddressBookEntry({ network: 'testnet', address: EXCHANGE })
    await new Promise((r) => setTimeout(r, 0))

    const stored = JSON.parse(h.idb.get(APP_STATE_STORAGE_KEY)!)
    expect(stored.version).toBe(0)
    // The legacy entry is never dropped when its pair is re-recorded.
    expect(stored.state.addressBook).toEqual([...current, { address: EXCHANGE, network: 'testnet' }])
  })

  it('keeps an entry whose network this build does not know, as not recorded', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob([{ address: EXCHANGE, network: 'devnet', destinationTag: '4' }]))
    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual([{ address: EXCHANGE, destinationTag: '4' }])
  })

  it('a rollback round trip can only make entries unrecorded: more warnings, never fewer', async () => {
    // What the two older builds write over this build's
    // `[{A,1,testnet}, {A,1,mainnet}, {OTHER,testnet}]`: epic 9 rebuilds each
    // entry without `network` and its upsert merges the two networks' (A, 1)
    // into one; the pre-epic-9 build keeps one `{ address, label }` per address.
    const epic9RolledBack = [{ address: EXCHANGE, destinationTag: '1' }, { address: OTHER }]
    const preEpic9RolledBack = [
      { address: EXCHANGE, label: EXCHANGE.slice(0, 8) },
      { address: OTHER, label: OTHER.slice(0, 8) },
    ]
    for (const rolledBack of [epic9RolledBack, preEpic9RolledBack]) {
      h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob(rolledBack))
      await useAppStore.persist.rehydrate()
      const book = useAppStore.getState().addressBook
      expect(book).toHaveLength(2)
      expect(book.every((e) => e.network === undefined)).toBe(true)
      for (const network of ['mainnet', 'testnet'] as const) {
        expect(suppressesFirstSendWarning(book, { network, address: EXCHANGE, destinationTag: '1' })).toBe(false)
        expect(suppressesFirstSendWarning(book, { network, address: OTHER })).toBe(false)
      }
    }
  })

  it('after migrating, a second tag at a known address is kept beside the first', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob([{ address: EXCHANGE, label: EXCHANGE.slice(0, 8) }]))
    await useAppStore.persist.rehydrate()

    useAppStore.getState().addAddressBookEntry({ address: EXCHANGE, destinationTag: '12345' })

    expect(useAppStore.getState().addressBook).toEqual([{ address: EXCHANGE }, { address: EXCHANGE, destinationTag: '12345' }])
  })
})
