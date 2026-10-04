/**
 * The Address Book entry, and the one answer to "are these the same
 * counterparty?" (AD-6, Epic 9).
 *
 * An entry's identity is the `(address, destination tag)` pair, never the
 * address alone. An exchange deposit address is one address with a different
 * tag per customer; two accounts there are two counterparties, and a check
 * that compares addresses treats a never-used tag as familiar.
 *
 * Every call site that decides identity goes through `sameCounterparty` or
 * `counterpartyKey` below. Comparing `.address` directly to decide whether two
 * entries are the same is the defect this module exists to prevent.
 */

export interface AddressBookEntry {
  /** Classic address, `r…`. */
  address: string
  /**
   * The destination tag, as canonical decimal digits (no leading zeros except
   * `"0"` itself), or `undefined` for no tag.
   *
   * A string, never a number: a destination tag is an identifier, not a
   * quantity, and nothing here does arithmetic on it. Absence is its own
   * identity — a tagless entry is not a wildcard matching any tag.
   */
  destinationTag?: string
  /** A human label, only when a human gave one. Never derived from the
   * address: a truncated address shown as a name is a fabricated fact. */
  label?: string
}

/**
 * A destination tag in its canonical form, by string operations only — or
 * `undefined` when `raw` is empty or is not a run of decimal digits.
 *
 * `"007"` and `"7"` are the same tag on the ledger (it is a UInt32), so they
 * must be the same identity here. Leading zeros are stripped as text, keeping
 * `"0"`; the value is never passed through `Number`.
 *
 * Range (≤ 4294967295) is not checked here: the Send form refuses an
 * out-of-range tag before anything reaches the Address Book.
 */
export function canonicalDestinationTag(raw: string | undefined): string | undefined {
  if (raw === undefined || !/^[0-9]+$/.test(raw)) return undefined
  return raw.replace(/^0+(?=[0-9])/, '')
}

/** The identity of an entry, as a string: unique per `(address, tag)` pair
 * and therefore usable as a React key. `|` never occurs in a base58 address,
 * and `-` never occurs in a canonical tag, so no two pairs share a key — in
 * particular a tagless entry and one tagged `"0"` do not. */
export function counterpartyKey(e: Pick<AddressBookEntry, 'address' | 'destinationTag'>): string {
  return `${e.address}|${e.destinationTag ?? '-'}`
}

/** Are these the same counterparty? Same address AND same tag, where "no tag"
 * equals only "no tag". */
export function sameCounterparty(
  a: Pick<AddressBookEntry, 'address' | 'destinationTag'>,
  b: Pick<AddressBookEntry, 'address' | 'destinationTag'>,
): boolean {
  return counterpartyKey(a) === counterpartyKey(b)
}

/**
 * The book with `entry` written: an entry for the same counterparty is
 * replaced in place, a different one is appended.
 *
 * A replacement without a label keeps the label already there. Nothing writes
 * labels today, but the automatic save after a send must never erase one a
 * future editor lets the operator give.
 */
export function upsertAddressBookEntry(book: AddressBookEntry[], entry: AddressBookEntry): AddressBookEntry[] {
  const existing = book.find((e) => sameCounterparty(e, entry))
  const label = entry.label ?? existing?.label
  // Built field by field, so an absent tag or label is an absent key rather
  // than one holding `undefined`.
  const next: AddressBookEntry = { address: entry.address }
  if (entry.destinationTag !== undefined) next.destinationTag = entry.destinationTag
  if (label !== undefined) next.label = label
  if (!existing) return [...book, next]
  return book.map((e) => (e === existing ? next : e))
}

/**
 * Reads a persisted Address Book of any earlier shape into the current one.
 * Total over `unknown`: it never throws, because a migration that throws
 * leaves the store on its in-memory defaults, and the next write would then
 * replace every saved address with an empty list.
 *
 * - Not an array: an empty book (there was nothing readable to keep).
 * - An entry without a string `address`: dropped — it names no counterparty
 *   and could not be sent to or shown. This is the only drop.
 * - The pre-Epic-9 shape `{ address, label }` reads as a tagless entry.
 * - A label equal to `address.slice(0, 8)` is dropped: that is exactly the
 *   label the old Send screen fabricated on every send, and keeping it would
 *   go on showing a truncated address as a name. Any other label is kept.
 * - A tag is kept only if it is canonical-able digits; one stored as a number
 *   (never written by this app) is read through its decimal text.
 * - Two entries that turn out to be the same counterparty collapse into one,
 *   so the list never holds two rows with one identity.
 */
export function migrateAddressBook(raw: unknown): AddressBookEntry[] {
  if (!Array.isArray(raw)) return []
  let book: AddressBookEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { address, label, destinationTag } = item as Record<string, unknown>
    if (typeof address !== 'string' || address.length === 0) continue
    const entry: AddressBookEntry = { address }
    const tagText =
      typeof destinationTag === 'string'
        ? destinationTag
        : typeof destinationTag === 'number' && Number.isSafeInteger(destinationTag) && destinationTag >= 0
          ? destinationTag.toString(10)
          : undefined
    const tag = canonicalDestinationTag(tagText)
    if (tag !== undefined) entry.destinationTag = tag
    if (typeof label === 'string' && label.length > 0 && label !== address.slice(0, 8)) entry.label = label
    book = upsertAddressBookEntry(book, entry)
  }
  return book
}

/**
 * Whether the book holds this address under some OTHER identity — a different
 * tag, or a tag where `entry` has none (or none where it has one).
 *
 * Not an identity test, and never a reason to skip the first-send warning: it
 * only chooses that warning's words, so the operator is pointed at the part
 * that is new (the tag) rather than told to re-check an address they have
 * already used.
 */
export function addressKnownUnderOtherTag(
  book: readonly Pick<AddressBookEntry, 'address' | 'destinationTag'>[],
  entry: Pick<AddressBookEntry, 'address' | 'destinationTag'>,
): boolean {
  return book.some((e) => e.address === entry.address && !sameCounterparty(e, entry))
}
