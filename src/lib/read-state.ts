/**
 * What a screen knows about one ledger read, in one value.
 *
 * Four facts, never collapsed into each other by the type:
 *
 * - `ok` — the read SUCCEEDED and is not in error now; `value` is what it said.
 * - `pending` — nothing is known yet: the read is in flight, or has not
 *   started. It has not failed, and must not be painted or announced as if it
 *   had (story 5.3 AC 2).
 * - `failed` — the read is in error. Any value TanStack retained from an
 *   earlier success is dropped: while a read is in error, nothing from an
 *   earlier success stays on screen (docs/decisions.md §12 rule 2).
 * - `not-activated` — the reads succeeded and say the account does not exist
 *   on-ledger. A fact about the ledger, not a failure.
 *
 * Every consumer that refuses on anything but `ok` fails closed by
 * construction: absence of a prohibition is not permission (§12 rule 1).
 */
export type ReadState<T> =
  | { status: 'ok'; value: T }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'not-activated' }

/**
 * The read state of one query, from the two fields every query result has.
 *
 * Error first, and before any look at `data`: a query keeps its previous
 * answer across a failed refetch, so `data` and `isError` are true together on
 * the poll — and that retained answer is exactly what must not be reported as
 * current. Only these two fields are read, so a query result, or anything
 * shaped like one, maps the same way.
 *
 * `data` is tested for truthiness, as the screens it replaced did: an empty
 * string is not a figure.
 */
export function readStateOf<T>(query: { data?: T | null; isError?: boolean }): ReadState<T> {
  if (query.isError) return { status: 'failed' }
  if (!query.data) return { status: 'pending' }
  return { status: 'ok', value: query.data }
}
