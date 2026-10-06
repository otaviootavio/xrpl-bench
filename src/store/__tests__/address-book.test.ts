import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addressKnownUnderOtherTag,
  canonicalDestinationTag,
  counterpartyKey,
  migrateAddressBook,
  sameCounterparty,
  suppressesFirstSendWarning,
  tagNotRecorded,
  upsertAddressBookEntry,
  type AddressBookEntry,
  type SendPair,
} from '../address-book'

/**
 * AD-6 / Epic 9 (G-18): an Address Book entry's identity is the
 * `(address, destination tag)` pair. An exchange deposit address is one
 * address with a different tag per customer, so an identity on the address
 * alone overwrote the first account when the second was saved, and silenced
 * the first-send warning for a tag never used before.
 */

const EXCHANGE = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const OTHER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

describe('sameCounterparty — the one identity function', () => {
  it('two tags at one address are two counterparties', () => {
    expect(sameCounterparty({ address: EXCHANGE, destinationTag: '1' }, { address: EXCHANGE, destinationTag: '2' })).toBe(false)
  })

  it('absence of a tag is its own identity, not a wildcard', () => {
    expect(sameCounterparty({ address: EXCHANGE }, { address: EXCHANGE, destinationTag: '1' })).toBe(false)
    expect(sameCounterparty({ address: EXCHANGE, destinationTag: '1' }, { address: EXCHANGE })).toBe(false)
  })

  it('tag "0" is a real tag, distinct from no tag', () => {
    expect(sameCounterparty({ address: EXCHANGE }, { address: EXCHANGE, destinationTag: '0' })).toBe(false)
    expect(counterpartyKey({ address: EXCHANGE })).not.toBe(counterpartyKey({ address: EXCHANGE, destinationTag: '0' }))
  })

  it('the same pair is the same counterparty, tagged or not', () => {
    expect(sameCounterparty({ address: EXCHANGE, destinationTag: '42' }, { address: EXCHANGE, destinationTag: '42' })).toBe(true)
    expect(sameCounterparty({ address: EXCHANGE }, { address: EXCHANGE })).toBe(true)
  })

  it('a different address is a different counterparty even under the same tag', () => {
    expect(sameCounterparty({ address: EXCHANGE, destinationTag: '1' }, { address: OTHER, destinationTag: '1' })).toBe(false)
  })
})

describe('canonicalDestinationTag — text in, text out', () => {
  it('strips leading zeros so "007" and "7" are one tag, keeping "0"', () => {
    expect(canonicalDestinationTag('007')).toBe('7')
    expect(canonicalDestinationTag('0')).toBe('0')
    expect(canonicalDestinationTag('000')).toBe('0')
  })

  it('keeps the top of the UInt32 range exactly', () => {
    expect(canonicalDestinationTag('4294967295')).toBe('4294967295')
  })

  it('has no tag for empty or non-digit input', () => {
    expect(canonicalDestinationTag('')).toBeUndefined()
    expect(canonicalDestinationTag(undefined)).toBeUndefined()
    expect(canonicalDestinationTag('1e3')).toBeUndefined()
    expect(canonicalDestinationTag(' 5')).toBeUndefined()
  })

  it('never routes through Number — a digit run past 2^53 survives as written', () => {
    // A Number round-trip would print 9007199254740992 for this. The range
    // check belongs to the Send form; this function only canonicalises text.
    expect(canonicalDestinationTag('9007199254740993')).toBe('9007199254740993')
  })
})

describe('upsertAddressBookEntry', () => {
  it('keeps both entries when they share an address but differ by tag', () => {
    let book: AddressBookEntry[] = []
    book = upsertAddressBookEntry(book, { address: EXCHANGE, destinationTag: '1' })
    book = upsertAddressBookEntry(book, { address: EXCHANGE, destinationTag: '2' })
    expect(book).toEqual([
      { address: EXCHANGE, destinationTag: '1' },
      { address: EXCHANGE, destinationTag: '2' },
    ])
  })

  it('keeps a tagless and a tagged entry for one address apart', () => {
    let book: AddressBookEntry[] = []
    book = upsertAddressBookEntry(book, { address: EXCHANGE })
    book = upsertAddressBookEntry(book, { address: EXCHANGE, destinationTag: '1' })
    expect(book).toHaveLength(2)
  })

  it('replaces rather than duplicates the same pair', () => {
    let book: AddressBookEntry[] = []
    book = upsertAddressBookEntry(book, { address: EXCHANGE, destinationTag: '1' })
    book = upsertAddressBookEntry(book, { address: EXCHANGE, destinationTag: '1' })
    expect(book).toEqual([{ address: EXCHANGE, destinationTag: '1' }])
  })

  it('a replacement without a label keeps the human label already there', () => {
    const book = upsertAddressBookEntry([{ address: EXCHANGE, destinationTag: '1', label: 'Exchange — savings' }], {
      address: EXCHANGE,
      destinationTag: '1',
    })
    expect(book).toEqual([{ address: EXCHANGE, destinationTag: '1', label: 'Exchange — savings' }])
  })

  it('writes no key for an absent tag or label', () => {
    const [entry] = upsertAddressBookEntry([], { address: EXCHANGE, destinationTag: undefined, label: undefined })
    expect(Object.keys(entry)).toEqual(['address'])
  })
})

describe('addressKnownUnderOtherTag — chooses words, never silences the warning', () => {
  it('is true for a known address under a different tag, or with none, on the same network', () => {
    const book: AddressBookEntry[] = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: EXCHANGE, destinationTag: '2' })).toBe(true)
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: EXCHANGE })).toBe(true)
  })

  it('is false for the same pair and for an unknown address', () => {
    const book: AddressBookEntry[] = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: EXCHANGE, destinationTag: '1' })).toBe(false)
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: OTHER, destinationTag: '1' })).toBe(false)
  })

  it('ignores an entry recorded on another network — "You have paid this address before" would be false here', () => {
    const book: AddressBookEntry[] = [{ address: EXCHANGE, network: 'mainnet', destinationTag: '1' }]
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: EXCHANGE, destinationTag: '2' })).toBe(false)
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: EXCHANGE })).toBe(false)
  })

  it('is false while an unrecorded entry exists at the address, even beside a recorded one here', () => {
    // The legacy entry may be a tagless payment (or one with tag 2) on this
    // network: "only with a destination tag" / "not with this tag" could be false.
    const book: AddressBookEntry[] = [{ address: EXCHANGE }, { address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: EXCHANGE })).toBe(false)
    expect(addressKnownUnderOtherTag(book, { network: 'testnet', address: EXCHANGE, destinationTag: '2' })).toBe(false)
    // An unrecorded entry at a different address does not block it.
    const other: AddressBookEntry[] = [{ address: OTHER }, { address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    expect(addressKnownUnderOtherTag(other, { network: 'testnet', address: EXCHANGE })).toBe(true)
  })

  it('ignores an entry with no recorded network, tagged or not', () => {
    expect(addressKnownUnderOtherTag([{ address: EXCHANGE }], { network: 'testnet', address: EXCHANGE, destinationTag: '5' })).toBe(false)
    expect(addressKnownUnderOtherTag([{ address: EXCHANGE }], { network: 'testnet', address: EXCHANGE })).toBe(false)
    expect(
      addressKnownUnderOtherTag([{ address: EXCHANGE, destinationTag: '1' }], { network: 'testnet', address: EXCHANGE, destinationTag: '2' }),
    ).toBe(false)
  })
})

/**
 * Epic 9 retro items 28/29: identity is (network, address, tag). An entry with
 * no recorded network (everything saved before this change) is kept and
 * listed but silences the first-send warning on no network; with no tag as
 * well, its tag reads "not recorded", never "tagless".
 */
describe('the network is part of identity, and an unrecorded entry silences nothing', () => {
  it('pre-epic-9 entry: warns for a tagless send and for a tagged one', () => {
    const book = migrateAddressBook([{ address: EXCHANGE, label: 'rHb9CJAW' }])
    expect(suppressesFirstSendWarning(book, { network: 'testnet', address: EXCHANGE })).toBe(false)
    expect(suppressesFirstSendWarning(book, { network: 'testnet', address: EXCHANGE, destinationTag: '5' })).toBe(false)
    expect(suppressesFirstSendWarning(book, { network: 'mainnet', address: EXCHANGE })).toBe(false)
  })

  it('a pair that arrives without a network still matches no unrecorded entry', () => {
    // The type requires `network`; this is the defence for a caller that
    // builds a pair from untyped data. Its key would equal a legacy entry's.
    const networkless = { address: EXCHANGE } as unknown as SendPair
    expect(suppressesFirstSendWarning([{ address: EXCHANGE }], networkless)).toBe(false)
    const networklessTagged = { address: EXCHANGE, destinationTag: '1' } as unknown as SendPair
    expect(suppressesFirstSendWarning([{ address: EXCHANGE, destinationTag: '1' }], networklessTagged)).toBe(false)
  })

  it('recorded elsewhere: a Mainnet entry does not silence Testnet, nor the reverse', () => {
    const mainnet: AddressBookEntry[] = [{ address: EXCHANGE, network: 'mainnet' }]
    const testnet: AddressBookEntry[] = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    expect(suppressesFirstSendWarning(mainnet, { network: 'testnet', address: EXCHANGE })).toBe(false)
    expect(suppressesFirstSendWarning(testnet, { network: 'mainnet', address: EXCHANGE, destinationTag: '1' })).toBe(false)
  })

  it('recorded here: the same triple silences the warning', () => {
    expect(suppressesFirstSendWarning([{ address: EXCHANGE, network: 'testnet' }], { network: 'testnet', address: EXCHANGE })).toBe(true)
    expect(
      suppressesFirstSendWarning([{ address: EXCHANGE, network: 'mainnet', destinationTag: '1' }], {
        network: 'mainnet',
        address: EXCHANGE,
        destinationTag: '1',
      }),
    ).toBe(true)
  })

  it('recorded here, tagless, does not silence a tagged send (absence is still not a wildcard)', () => {
    expect(
      suppressesFirstSendWarning([{ address: EXCHANGE, network: 'testnet' }], { network: 'testnet', address: EXCHANGE, destinationTag: '0' }),
    ).toBe(false)
  })

  it('an epic-9 tagged entry is kept as its tag with no network, and warns for every pair', () => {
    const book = migrateAddressBook([{ address: EXCHANGE, destinationTag: '1' }])
    expect(book).toEqual([{ address: EXCHANGE, destinationTag: '1' }])
    for (const network of ['mainnet', 'testnet'] as const) {
      expect(suppressesFirstSendWarning(book, { network, address: EXCHANGE, destinationTag: '1' })).toBe(false)
      expect(suppressesFirstSendWarning(book, { network, address: EXCHANGE })).toBe(false)
    }
  })

  it('a tagless entry with no network reads as "tag not recorded", never as tagless', () => {
    expect(tagNotRecorded({ address: EXCHANGE })).toBe(true)
    expect(tagNotRecorded({ address: EXCHANGE, destinationTag: '1' })).toBe(false)
    expect(tagNotRecorded({ address: EXCHANGE, network: 'testnet' })).toBe(false)
    // Not the same counterparty as the recorded tagless pair on either network.
    expect(sameCounterparty({ address: EXCHANGE }, { address: EXCHANGE, network: 'testnet' })).toBe(false)
    expect(sameCounterparty({ address: EXCHANGE }, { address: EXCHANGE, network: 'mainnet' })).toBe(false)
  })

  it('the key spells each state with its own token: `?` not recorded, `-` no tag', () => {
    // The `?` tag token is redundant with the `?` network token today; it is
    // pinned so the key never reads an unrecorded tag as "no tag".
    expect(counterpartyKey({ address: EXCHANGE })).toBe(`?|${EXCHANGE}|?`)
    expect(counterpartyKey({ address: EXCHANGE, destinationTag: '1' })).toBe(`?|${EXCHANGE}|1`)
    expect(counterpartyKey({ address: EXCHANGE, network: 'testnet' })).toBe(`testnet|${EXCHANGE}|-`)
    expect(counterpartyKey({ address: EXCHANGE, network: 'mainnet', destinationTag: '0' })).toBe(`mainnet|${EXCHANGE}|0`)
  })

  it('every network/tag state has its own key', () => {
    const keys = [
      { address: EXCHANGE },
      { address: EXCHANGE, destinationTag: '0' },
      { address: EXCHANGE, network: 'testnet' as const },
      { address: EXCHANGE, network: 'testnet' as const, destinationTag: '0' },
      { address: EXCHANGE, network: 'mainnet' as const },
      { address: EXCHANGE, network: 'mainnet' as const, destinationTag: '0' },
    ].map(counterpartyKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('re-recording a legacy pair appends the recorded entry and keeps the legacy one', () => {
    const book = upsertAddressBookEntry(migrateAddressBook([{ address: EXCHANGE }]), { network: 'testnet', address: EXCHANGE })
    expect(book).toEqual([{ address: EXCHANGE }, { address: EXCHANGE, network: 'testnet' }])
  })

  it('the same pair on two networks is two entries with two keys', () => {
    let book: AddressBookEntry[] = []
    book = upsertAddressBookEntry(book, { network: 'testnet', address: EXCHANGE, destinationTag: '1' })
    book = upsertAddressBookEntry(book, { network: 'mainnet', address: EXCHANGE, destinationTag: '1' })
    expect(book).toEqual([
      { address: EXCHANGE, network: 'testnet', destinationTag: '1' },
      { address: EXCHANGE, network: 'mainnet', destinationTag: '1' },
    ])
    expect(counterpartyKey(book[0])).not.toBe(counterpartyKey(book[1]))
    expect(
      migrateAddressBook([
        { address: EXCHANGE, network: 'testnet', destinationTag: '1' },
        { address: EXCHANGE, network: 'mainnet', destinationTag: '1' },
      ]),
    ).toHaveLength(2)
  })

  it('the migration never collapses a legacy entry into a recorded one', () => {
    expect(
      migrateAddressBook([
        { address: EXCHANGE },
        { address: EXCHANGE, network: 'testnet' },
        { address: EXCHANGE, destinationTag: '1' },
        { address: EXCHANGE, network: 'testnet', destinationTag: '1' },
      ]),
    ).toHaveLength(4)
  })

  it('keeps a known network, and reads an unknown network value as not recorded without dropping the entry', () => {
    expect(migrateAddressBook([{ address: EXCHANGE, network: 'mainnet' }])).toEqual([{ address: EXCHANGE, network: 'mainnet' }])
    expect(migrateAddressBook([{ address: EXCHANGE, network: 'devnet' }])).toEqual([{ address: EXCHANGE }])
    expect(migrateAddressBook([{ address: EXCHANGE, network: 7 }, { address: OTHER, network: null }])).toEqual([
      { address: EXCHANGE },
      { address: OTHER },
    ])
  })

  it('writes the network key only when there is one', () => {
    expect(Object.keys(upsertAddressBookEntry([], { address: EXCHANGE, network: undefined })[0])).toEqual(['address'])
    expect(upsertAddressBookEntry([], { address: EXCHANGE, network: 'mainnet' })[0]).toEqual({ address: EXCHANGE, network: 'mainnet' })
  })
})

describe('migrateAddressBook — no saved address is lost by the shape change', () => {
  it('reads every old-shape entry as one with no network and its tag not recorded', () => {
    const old = [
      { address: EXCHANGE, label: EXCHANGE.slice(0, 8) },
      { address: OTHER, label: OTHER.slice(0, 8) },
    ]
    expect(migrateAddressBook(old)).toEqual([{ address: EXCHANGE }, { address: OTHER }])
  })

  it('drops only the label the old Send screen fabricated, and keeps a human one', () => {
    expect(migrateAddressBook([{ address: EXCHANGE, label: 'Landlord' }])).toEqual([{ address: EXCHANGE, label: 'Landlord' }])
    expect(migrateAddressBook([{ address: EXCHANGE, label: EXCHANGE.slice(0, 8) }])).toEqual([{ address: EXCHANGE }])
  })

  it('keeps tagged entries apart and canonicalises their tags', () => {
    expect(
      migrateAddressBook([
        { address: EXCHANGE, destinationTag: '007' },
        { address: EXCHANGE, destinationTag: 8 },
        { address: EXCHANGE },
      ]),
    ).toEqual([{ address: EXCHANGE, destinationTag: '7' }, { address: EXCHANGE, destinationTag: '8' }, { address: EXCHANGE }])
  })

  it('collapses two entries that turn out to be one counterparty', () => {
    expect(migrateAddressBook([{ address: EXCHANGE, destinationTag: '07' }, { address: EXCHANGE, destinationTag: '7' }])).toEqual([
      { address: EXCHANGE, destinationTag: '7' },
    ])
  })

  it('never throws on garbage, and drops only what names no address', () => {
    expect(migrateAddressBook(undefined)).toEqual([])
    expect(migrateAddressBook('nope')).toEqual([])
    expect(migrateAddressBook({ address: EXCHANGE })).toEqual([])
    expect(migrateAddressBook([null, 3, 'x', { label: 'no address' }, { address: 12 }, { address: EXCHANGE, extra: true }])).toEqual([
      { address: EXCHANGE },
    ])
  })
})

/**
 * "No call site compares `.address` directly to decide identity." A scan,
 * because the next call site is the one that will forget: any Address Book
 * read outside `store/address-book.ts` that compares an entry's `.address` with
 * `===`/`!==` fails here.
 */
describe('identity is never re-derived at a call site', () => {
  const SRC = fileURLToPath(new URL('../..', import.meta.url))
  function* walk(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') yield* walk(p)
      } else if (/\.(ts|tsx)$/.test(name)) yield p
    }
  }

  // `addressBook.some((e) => e.address === destination)` — the defect's own
  // shape: an array method on the book whose callback compares its entry's
  // `.address`, on either side of `===`/`!==`.
  const DIRECT = /addressBook\s*\.\s*(?:some|find|findIndex|filter|every)\s*\(\s*\(?\s*(\w+)[^=]*=>([^\n]*)/g
  function offendersIn(text: string): boolean {
    for (const m of text.matchAll(DIRECT)) {
      const [, param, body] = m
      if (new RegExp(`\\b${param}\\.address\\s*[!=]==|[!=]==\\s*${param}\\.address\\b`).test(body)) return true
    }
    return false
  }

  it('the scan recognises the shape it guards against', () => {
    expect(offendersIn('const k = addressBook.some((e) => e.address === destination)')).toBe(true)
    expect(offendersIn('s.addressBook.filter((entry) => destination !== entry.address)')).toBe(true)
    expect(offendersIn('addressBook.some((e) => sameCounterparty(e, counterparty))')).toBe(false)
  })

  it('no source file compares an Address Book entry address directly', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (file.endsWith(join('store', 'address-book.ts'))) continue
      if (offendersIn(readFileSync(file, 'utf8'))) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
