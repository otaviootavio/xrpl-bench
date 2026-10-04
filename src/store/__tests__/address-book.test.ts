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
  upsertAddressBookEntry,
  type AddressBookEntry,
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
  it('is true for a known address under a different tag, or with none', () => {
    const book = [{ address: EXCHANGE, destinationTag: '1' }]
    expect(addressKnownUnderOtherTag(book, { address: EXCHANGE, destinationTag: '2' })).toBe(true)
    expect(addressKnownUnderOtherTag(book, { address: EXCHANGE })).toBe(true)
  })

  it('is false for the same pair and for an unknown address', () => {
    const book = [{ address: EXCHANGE, destinationTag: '1' }]
    expect(addressKnownUnderOtherTag(book, { address: EXCHANGE, destinationTag: '1' })).toBe(false)
    expect(addressKnownUnderOtherTag(book, { address: OTHER, destinationTag: '1' })).toBe(false)
  })
})

describe('migrateAddressBook — no saved address is lost by the shape change', () => {
  it('reads every old-shape entry as a tagless entry', () => {
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
