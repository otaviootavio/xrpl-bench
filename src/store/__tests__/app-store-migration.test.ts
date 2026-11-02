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
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))

import { APP_STATE_STORAGE_KEY, useAppStore } from '../app-store'
import { suppressesFirstSendWarning } from '../address-book'
import { selectAddressBook } from '../app-store'

const EXCHANGE = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const OTHER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const WALLETS = [{ id: 'w1', label: 'Savings', address: 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR' }]
/** Story 12.1: read into the per-Wallet shape — the persisted app-wide network
 * ('mainnet' in this blob) becomes the Wallet's network; nothing else changes. */
const NORMALISED_WALLETS = [
  { ...WALLETS[0], seedId: 'w1', keyAddress: WALLETS[0].address, lockId: 'legacy', network: 'mainnet', algorithm: 'unresolved', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard' },
]

/** A blob whose Address Book holds `list` under wallet w1 (AD-50). */
const legacyBlob = (list: unknown) => blobWith({ w1: list })

/** A blob with `addressBook` stored exactly as given (old array, malformed map, ...). */
function blobWith(addressBook: unknown) {
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
  useAppStore.setState({ network: 'testnet', wallets: [], activeWalletId: null, addressBook: {}, autoLockMinutes: 5, declinedUpdateVersions: [] })
})

describe('app store — the persisted per-Wallet Address Book (AD-50)', () => {
  it('reads every old entry as one with no recorded network or tag, and drops the fabricated labels', async () => {
    h.idb.set(
      APP_STATE_STORAGE_KEY,
      legacyBlob([
        { address: EXCHANGE, label: EXCHANGE.slice(0, 8) },
        { address: OTHER, label: OTHER.slice(0, 8) },
      ]),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual({ w1: [{ address: EXCHANGE }, { address: OTHER }] })
  })

  it('carries every other persisted field through untouched', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob([{ address: EXCHANGE, label: EXCHANGE.slice(0, 8) }]))

    await useAppStore.persist.rehydrate()

    const s = useAppStore.getState()
    expect(s.wallets).toEqual(NORMALISED_WALLETS)
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

    useAppStore.getState().addAddressBookEntry('w1', { address: EXCHANGE, destinationTag: '9' })
    await new Promise((r) => setTimeout(r, 0))

    const stored = JSON.parse(h.idb.get(APP_STATE_STORAGE_KEY)!)
    expect(stored.version).toBe(0)
    expect(stored.state.addressBook).toEqual({ w1: [{ address: EXCHANGE }, { address: EXCHANGE, destinationTag: '9' }] })
    expect(stored.state.wallets).toEqual(NORMALISED_WALLETS)
  })

  it('reads what this build wrote back unchanged — the migration is idempotent', async () => {
    const current = [{ address: EXCHANGE, destinationTag: '1' }, { address: EXCHANGE }, { address: OTHER, label: 'Landlord' }]
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob(current))

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual({ w1: current })
  })

  it('with nothing stored, leaves the in-memory book alone', async () => {
    useAppStore.setState({ addressBook: { w1: [{ address: OTHER }] } })
    h.idb.delete(APP_STATE_STORAGE_KEY)

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual({ w1: [{ address: OTHER }] })
  })

  it.each([
    ['an old array-shaped book', [{ address: EXCHANGE }]],
    ['a string', 'not-a-map'],
    ['null', null],
    ['a number', 7],
  ])('%s reads as empty and does not take the wallets down with it', async (_name, stored) => {
    h.idb.set(APP_STATE_STORAGE_KEY, blobWith(stored))

    await useAppStore.persist.rehydrate()

    const s = useAppStore.getState()
    expect(s.addressBook).toEqual({})
    expect(s.wallets).toEqual(NORMALISED_WALLETS)
  })

  it('an old array on disk is replaced by the next write, not migrated', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, blobWith([{ address: EXCHANGE }]))
    await useAppStore.persist.rehydrate()
    useAppStore.getState().addAddressBookEntry('w1', { address: OTHER })
    await new Promise((r) => setTimeout(r, 0))
    expect(JSON.parse(h.idb.get(APP_STATE_STORAGE_KEY)!).state.addressBook).toEqual({ w1: [{ address: OTHER }] })
  })

  it('a list that is not an array reads empty, an entry with no address is dropped, other lists are kept', async () => {
    h.idb.set(
      APP_STATE_STORAGE_KEY,
      blobWith({ w1: 'nope', w2: [{ label: 'no address' }, { address: OTHER }], w3: { address: EXCHANGE } }),
    )
    await useAppStore.persist.rehydrate()
    expect(useAppStore.getState().addressBook).toEqual({ w1: [], w2: [{ address: OTHER }], w3: [] })
  })

  it('skips a __proto__ key and never throws', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, '{"state":{"network":"testnet","wallets":[],"activeWalletId":null,"addressBook":{"__proto__":[{"address":"rX"}],"w1":[{"address":"' + OTHER + '"}]},"autoLockMinutes":5,"declinedUpdateVersions":[]},"version":0}')
    await useAppStore.persist.rehydrate()
    const book = useAppStore.getState().addressBook
    expect(Object.keys(book)).toEqual(['w1'])
    expect(Object.getPrototypeOf(book)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).address).toBeUndefined()
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
    expect(useAppStore.getState().addressBook).toEqual({ w1: current })

    useAppStore.getState().addAddressBookEntry('w1', { network: 'testnet', address: EXCHANGE })
    await new Promise((r) => setTimeout(r, 0))

    const stored = JSON.parse(h.idb.get(APP_STATE_STORAGE_KEY)!)
    expect(stored.version).toBe(0)
    // The legacy entry is never dropped when its pair is re-recorded.
    expect(stored.state.addressBook).toEqual({ w1: [...current, { address: EXCHANGE, network: 'testnet' }] })
  })

  it('keeps an entry whose network this build does not know, as not recorded', async () => {
    h.idb.set(APP_STATE_STORAGE_KEY, legacyBlob([{ address: EXCHANGE, network: 'signet', destinationTag: '4' }]))
    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().addressBook).toEqual({ w1: [{ address: EXCHANGE, destinationTag: '4' }] })
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
      const book = useAppStore.getState().addressBook.w1
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

    useAppStore.getState().addAddressBookEntry('w1', { address: EXCHANGE, destinationTag: '12345' })

    expect(useAppStore.getState().addressBook).toEqual({ w1: [{ address: EXCHANGE }, { address: EXCHANGE, destinationTag: '12345' }] })
  })
})

describe('app store — a Passkey-Derived Wallet keeps its Seed Method across a reload', () => {
  it('rehydrates seedMethod "passkey-derived" as it was persisted, and reads anything else as stored', async () => {
    const derived = { id: 'd1', label: 'Derived', address: OTHER, seedMethod: 'passkey-derived' }
    const odd = { id: 'o1', label: 'Odd', address: EXCHANGE, seedMethod: 'something-else' }
    h.idb.set(
      APP_STATE_STORAGE_KEY,
      JSON.stringify({ state: { network: 'testnet', wallets: [derived, odd], activeWalletId: 'd1', addressBook: {}, autoLockMinutes: 5, declinedUpdateVersions: [] }, version: 0 }),
    )
    await useAppStore.persist.rehydrate()
    const bySeed = Object.fromEntries(useAppStore.getState().wallets.map((w) => [w.id, w.seedMethod]))
    expect(bySeed).toEqual({ d1: 'passkey-derived', o1: 'stored' })
  })
})

describe('app store — Address Book actions and the selector', () => {
  const wallet = (id: string) => ({ id, label: id, address: 'r' + id }) as never
  beforeEach(() => {
    useAppStore.setState({ wallets: [wallet('a'), wallet('b')], addressBook: {} })
  })

  it('saves under the sender only, and another wallet\'s entry does not appear in the sender\'s list', () => {
    const { addAddressBookEntry } = useAppStore.getState()
    addAddressBookEntry('a', { network: 'testnet', address: EXCHANGE })
    const s = useAppStore.getState()
    expect(s.addressBook).toEqual({ a: [{ network: 'testnet', address: EXCHANGE }] })
    expect(selectAddressBook('b')(s)).toEqual([])
    expect(suppressesFirstSendWarning(selectAddressBook('b')(s), { network: 'testnet', address: EXCHANGE })).toBe(false)
    expect(suppressesFirstSendWarning(selectAddressBook('a')(s), { network: 'testnet', address: EXCHANGE })).toBe(true)
  })

  it('ignores a write for a wallet that is no longer there (no resurrected key)', () => {
    useAppStore.getState().addAddressBookEntry('gone', { address: EXCHANGE })
    expect(useAppStore.getState().addressBook).toEqual({})
  })

  it('the selector returns one shared frozen empty list for no list, no id and prototype names', () => {
    const s = useAppStore.getState()
    const none = selectAddressBook('a')(s)
    expect(none).toBe(selectAddressBook('b')(s))
    expect(none).toBe(selectAddressBook(null)(s))
    expect(none).toBe(selectAddressBook(undefined)(s))
    expect(none).toBe(selectAddressBook('constructor')(s))
    expect(none).toBe(selectAddressBook('__proto__')(s))
    expect(Object.isFrozen(none)).toBe(true)
  })

  it('removeAddressBook deletes only that key and never throws for an absent one', () => {
    const { addAddressBookEntry, removeAddressBook } = useAppStore.getState()
    addAddressBookEntry('a', { address: EXCHANGE })
    addAddressBookEntry('b', { address: OTHER })
    removeAddressBook('a')
    expect(useAppStore.getState().addressBook).toEqual({ b: [{ address: OTHER }] })
    expect(() => removeAddressBook('nope')).not.toThrow()
    expect(useAppStore.getState().addressBook).toEqual({ b: [{ address: OTHER }] })
  })
})
