import { NETWORK_IDS, type NetworkId } from '@/lib/xrpl/networks'

/**
 * The Address Book entry, and the one answer to "are these the same
 * counterparty?" (AD-6, Epic 9, Epic 9 retro items 28/29).
 *
 * An entry's identity is the `(network, address, destination tag)` triple,
 * never the address alone. An exchange deposit address is one address with a
 * different tag per customer; two accounts there are two counterparties, and a
 * check that compares addresses treats a never-used tag as familiar. A classic
 * address is the same string on Mainnet and Testnet, so a Testnet rehearsal is
 * not a Mainnet payment.
 *
 * An entry with no recorded network was saved before entries carried one (or
 * round-tripped through a build that drops the field). It is kept and listed,
 * but it silences the first-send warning on no network; and when it also has
 * no tag, its tag reads as "not recorded", never as "tagless" — a pre-Epic-9
 * send to `(EXCHANGE, tag 5)` stored only `{ address: EXCHANGE }`.
 *
 * Every call site that decides identity goes through `sameCounterparty`,
 * `counterpartyKey` or `suppressesFirstSendWarning` below. Comparing
 * `.address` directly to decide whether two entries are the same is the
 * defect this module exists to prevent.
 */

export interface AddressBookEntry {
  /** Classic address, `r…`. */
  address: string
  /**
   * The network the payment that recorded this entry was submitted on, or
   * `undefined` when that was not recorded (every entry saved before this
   * field existed). Only an entry with a recorded network can silence the
   * first-send warning, and only on that network.
   */
  network?: NetworkId
  /**
   * The destination tag, as canonical decimal digits (no leading zeros except
   * `"0"` itself), or `undefined` for no tag.
   *
   * A string, never a number: a destination tag is an identifier, not a
   * quantity, and nothing here does arithmetic on it. Absence is its own
   * identity — a tagless entry is not a wildcard matching any tag. On an entry
   * with no recorded network, absence means "tag not recorded" instead.
   */
  destinationTag?: string
  /** A human label, only when a human gave one. Never derived from the
   * address: a truncated address shown as a name is a fabricated fact. */
  label?: string
}

type Identity = Pick<AddressBookEntry, 'network' | 'address' | 'destinationTag'>

/** The pair a send would pay, on the network it would be submitted on. */
export type SendPair = Pick<AddressBookEntry, 'address' | 'destinationTag'> & { network: NetworkId }

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

/** Whether this entry's tag is unknown rather than absent: no tag on an entry
 * that also has no recorded network. Such an entry may stand for a payment
 * made with a tag that was never stored, so it is never read as tagless. */
export function tagNotRecorded(e: Identity): boolean {
  return e.network === undefined && e.destinationTag === undefined
}

/** The identity of an entry, as a string: unique per
 * `(network, address, tag)` triple and therefore usable as a React key.
 *
 * Tokens: network `?` = not recorded; tag `-` = none, `?` = not recorded
 * (network absent and no tag). `|` never occurs in a base58 address or a
 * network id, and neither `-` nor `?` is a canonical tag or a network id, so
 * no two triples share a key — in particular a tagless entry and one tagged
 * `"0"` do not, a legacy entry never shares one with a recorded entry, and
 * entries on two networks never share one. */
export function counterpartyKey(e: Identity): string {
  const tag = e.destinationTag ?? (tagNotRecorded(e) ? '?' : '-')
  return `${e.network ?? '?'}|${e.address}|${tag}`
}

/** Are these the same counterparty? Same network, same address AND same tag,
 * where "no tag" equals only "no tag" and "not recorded" equals only "not
 * recorded". */
export function sameCounterparty(a: Identity, b: Identity): boolean {
  return counterpartyKey(a) === counterpartyKey(b)
}

/**
 * Whether the book silences FR-21's first-send warning for `pair`: true only
 * when an entry with a RECORDED network equal to the pair's is the same
 * counterparty. An entry with no recorded network silences nothing, on any
 * network, with or without a tag.
 */
export function suppressesFirstSendWarning(book: readonly Identity[], pair: SendPair): boolean {
  return book.some((e) => e.network !== undefined && e.network === pair.network && sameCounterparty(e, pair))
}

/**
 * The book with `entry` written: an entry for the same counterparty is
 * replaced in place, a different one is appended.
 *
 * A replacement without a label keeps the label already there. Nothing writes
 * labels today, but the automatic save after a send must never erase one a
 * future editor lets the operator give.
 *
 * Re-recording a legacy entry's pair appends the recorded one beside it: the
 * keys differ, and a legacy entry is never dropped automatically.
 */
export function upsertAddressBookEntry(book: AddressBookEntry[], entry: AddressBookEntry): AddressBookEntry[] {
  const existing = book.find((e) => sameCounterparty(e, entry))
  const label = entry.label ?? existing?.label
  // Built field by field, so an absent network, tag or label is an absent key
  // rather than one holding `undefined`.
  const next: AddressBookEntry = { address: entry.address }
  if (entry.network !== undefined) next.network = entry.network
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
 * - The pre-Epic-9 shape `{ address, label }` reads as an entry with no
 *   recorded network and its tag not recorded; it silences no warning.
 * - `network` is kept only if it names a network this build knows
 *   (`NETWORK_IDS`). Any other value (a future `devnet`, a typo) reads as not
 *   recorded, and the entry is kept.
 * - A label equal to `address.slice(0, 8)` is dropped: that is exactly the
 *   label the old Send screen fabricated on every send, and keeping it would
 *   go on showing a truncated address as a name. Any other label is kept.
 * - A tag is kept only if it is canonical-able digits; one stored as a number
 *   (never written by this app) is read through its decimal text.
 * - Two entries that turn out to be the same counterparty collapse into one,
 *   so the list never holds two rows with one identity. A legacy entry never
 *   collapses into a recorded one, and entries on two networks never collapse
 *   into one: their keys differ.
 */
export function migrateAddressBook(raw: unknown): AddressBookEntry[] {
  if (!Array.isArray(raw)) return []
  let book: AddressBookEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { address, label, destinationTag, network } = item as Record<string, unknown>
    if (typeof address !== 'string' || address.length === 0) continue
    const entry: AddressBookEntry = { address }
    const knownNetwork = NETWORK_IDS.find((id) => id === network)
    if (knownNetwork !== undefined) entry.network = knownNetwork
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
 * Whether the book holds this address, recorded on the pair's network, under
 * some OTHER tag — a different tag, or a tag where `pair` has none (or none
 * where it has one).
 *
 * Not an identity test, and never a reason to skip the first-send warning: it
 * only chooses that warning's words, so the operator is pointed at the part
 * that is new (the tag) rather than told to re-check an address they have
 * already used. Only recorded entries on the network being sent on count: a
 * legacy entry or one from another network could make "You have paid this
 * address before" false, and that sentence is reassuring. And while any entry
 * with no recorded network exists at the address, the answer is false: what
 * it stands for is unknown, so the tag-specific half of the sentence could be
 * false too.
 */
export function addressKnownUnderOtherTag(book: readonly Identity[], pair: SendPair): boolean {
  // An unrecorded entry at this address may stand for a payment on this
  // network with exactly this tag (or with none), which would make "but not
  // with this destination tag" / "but only with a destination tag" false.
  if (book.some((e) => e.network === undefined && e.address === pair.address)) return false
  return book.some(
    (e) => e.network !== undefined && e.network === pair.network && e.address === pair.address && !sameCounterparty(e, pair),
  )
}
