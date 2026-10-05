import { useEffect, useState } from 'react'
import { isValidClassicAddress } from 'xrpl'
import { useDestinationInfo } from './useDestinationInfo'
import { DESTINATION_CHECK_FRESHNESS_MS } from '@/lib/xrpl/query-reads'
import type { NetworkId } from '@/lib/xrpl/networks'

/**
 * The Send form's destination check, with its freshness window: whether a read
 * of this destination SUCCEEDED for the `(network, destination, asset)` on
 * screen now and is still young enough to authorise a payment.
 *
 * Three facts, kept apart, because each one says something different to the
 * operator:
 *
 * - `ok` — the send guard, stated positively: a read succeeded for the input
 *   on screen now and is still fresh. Not "no failure seen": a failed refetch
 *   that kept an earlier answer, an answer about a different address or asset
 *   while the new read is in flight, and a successful answer older than its
 *   window all fail it. Each of those would otherwise satisfy
 *   `!info?.requireDestTag`, label the tag "(optional)", and let a tagless
 *   payment go to an address that requires one — credited to nobody,
 *   unrecoverable from here (docs/decisions.md §12 rule 1).
 * - `stale` — a check that succeeded for this input and then aged out. It did
 *   not FAIL, and must not say it did (AD-15); it is out of date, and
 *   re-readable.
 * - `pending` — nothing is known yet for what is in the field: the read is in
 *   flight, or has not started, or the retained answer is about a different
 *   input.
 *
 * A failed read is none of the three; `query.isError` is that fact.
 */
export function useDestinationCheck(network: NetworkId, destination: string, asset: string) {
  /** The last clock reading the form has actually taken, written only by the
   * timer below. Rendering never calls `Date.now()` itself: a render that reads
   * the clock answers differently each time it runs, and a guard that cannot be
   * reasoned about or pinned by a test is not a guard. It starts at mount time
   * rather than 0, so an answer restored from the cache already older than the
   * window is refused on the FIRST render rather than on the timer's. */
  const [observedNow, setObservedNow] = useState(Date.now)

  // Ledger reads go through a query hook, never an onBlur handler (§4).
  const query = useDestinationInfo(network, destination, asset)
  const info = query.data
  const destinationValid = isValidClassicAddress(destination)

  const matchesInput =
    !!info && info.network === network && info.destination === destination && info.asset === asset
  /** When the answer on screen was read; `0` for no answer. The confirm
   * intent is pinned to this, so an intent formed against one reading can
   * never be honoured against a newer one. */
  const checkedAt = query.dataUpdatedAt || 0
  const expiresAt = matchesInput && checkedAt > 0 ? checkedAt + DESTINATION_CHECK_FRESHNESS_MS : null
  const fresh = expiresAt !== null && observedNow < expiresAt

  const ok = !query.isError && matchesInput && fresh
  const stale = !query.isError && matchesInput && !fresh
  const pending = destinationValid && !query.isError && !matchesInput

  // Take one clock reading when this check expires — and immediately, if it was
  // already old when it arrived from the cache. No fetch and no interval: the
  // app does not re-read on going stale and does not poll to keep the answer
  // warm; this only stops the screen claiming a permission it no longer has.
  //
  // The reading is the LATEST of the three moments known here, never just
  // `Date.now()`: a browser that fires a backgrounded timeout late gives a
  // clock later than the expiry, and a fake or coarsened clock that reports
  // the callback as early still cannot un-expire a check whose own expiry
  // moment has arrived. `setObservedNow` takes the previous reading too, so
  // this clock only ever moves forward.
  useEffect(() => {
    if (expiresAt === null) return
    const timer = setTimeout(
      () => setObservedNow((prev) => Math.max(prev, expiresAt, Date.now())),
      Math.max(0, expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [expiresAt])

  // The other way the clock moves: the tab coming back into view.
  //
  // A `setTimeout` is not a promise that it fires. A hidden tab that the
  // browser froze, or whose timers it throttled, can outlive the freshness
  // window, and the form would then render an expired check as permission
  // until the timeout eventually ran. This catches exactly one moment — the
  // tab becoming visible again — and claims no more: a machine resuming with
  // this tab already in view fires no `visibilitychange` and is left to the
  // timeout.
  //
  // That one moment survives `useAutoLock`'s own 30 s background grace, so it
  // is not dead code behind the lock: hidden at t=25 s and visible again at
  // t=45 s is 20 s away — too short to lock the app — while the check is 45 s
  // old and its timer never fired.
  //
  // Event-driven, so there is still no interval and still no read: this only
  // takes a reading (docs/decisions.md §12).
  useEffect(() => {
    function readClockOnReturn() {
      if (document.visibilityState !== 'visible') return
      setObservedNow((prev) => Math.max(prev, Date.now()))
    }
    document.addEventListener('visibilitychange', readClockOnReturn)
    return () => document.removeEventListener('visibilitychange', readClockOnReturn)
  }, [])

  return { query, info, destinationValid, checkedAt, ok, stale, pending }
}
