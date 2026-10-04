---
title: 'Epic 8 — the ledger connection closes what it opens'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '3ac02fc'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

## Intent

**Problem:** `lib/xrpl/client.ts` opens sockets that nothing closes, and that
happens on three paths. First, when the primary endpoint refuses or hangs, the
failover loop moves on to the backup. The failed primary is only unreferenced,
and a connect that lost to the 10s timeout can still open later. Second, a
cached client whose socket dropped is overwritten, but xrpl.js has already
scheduled its own reconnect for it. Third (G-23), `getXrplClient` has no
in-flight dedupe, so every query that fires at mount runs its own failover loop.
Each one opens a socket, and all but the last are dropped while still connected
(G-22). On a phone with a patchy connection, these sockets cost battery and
data.

**Approach:** Route every abandonment through a single fire-and-forget
`abandon(client)` helper that never throws. Close the failed connection when
the connect race is lost, and close it again if it opens late. Close a cached
client that has dropped before replacing it. Keep one connect attempt per
network in an `inflight` map. That map is cleared when an attempt settles, using
an identity check, so a failed attempt is never handed to a later caller.

## Boundaries & Constraints

**Always:**
- The failover order (primary, then backup), the 10s connect timeout, and the
  single error that names both endpoints all stay unchanged. The existing
  failover tests pass unedited.
- `resetXrplClients` stays synchronous, never disconnects anything, and remains
  AD-12's seam.
- `disconnectAllClients` (the production teardown path) does not change.

**Never:**
- `resetXrplClients` must not gain a disconnect. This is the epic-level
  non-goal.
- An abandon is never awaited inside the failover loop. In xrpl.js 5.1.0,
  calling `disconnect()` on a socket still in CONNECTING waits for a `close`
  event, and `onConnectionFailed` may already have removed that event's
  listener. Awaiting it could hang the loop.
- No new dependency. No UI, copy, or token change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error handling |
|---|---|---|---|
| Primary refuses | connect rejects on primary | Backup returned; primary `disconnect()`ed; backup not | N/A |
| Both refuse | both reject | One error naming both URLs; both disconnected | Throws, as before |
| Primary hangs | no settle within 10s | Backup returned; primary disconnected | N/A |
| Primary opens after the timeout | its connect resolves late | Disconnected again on resolution; never cached | Late rejection swallowed |
| Cached client dropped | cached `isConnected()` false | Removed from cache and disconnected; a new one connects | N/A |
| Cached client connected | — | Returned; nothing disconnected; nothing built | N/A |
| N concurrent cold callers | same network | One construction; all get the same client | All reject together |
| Shared attempt fails | both endpoints down | Every caller rejects; the next call rebuilds from the primary | Promise discarded |
| Two networks concurrently | testnet + mainnet | Two separate attempts | N/A |
| `resetXrplClients` with an attempt in flight | — | Next caller starts its own attempt; the stale one never writes the cache or evicts the new one | N/A |
| `disconnectAllClients` | cached clients | Each connected one disconnected; cache cleared | Unchanged |

## Code Map

- `src/lib/xrpl/client.ts`: `abandon()`. `connectWithTimeout` closes the losing
  connection and closes it again if it opens late. `getXrplClient` now uses the
  `inflight` map and is no longer `async`, but it still returns
  `Promise<Client>`. The failover loop moved into `connectNetwork`, which
  closes a replaced cached client and guards its cache write with
  `generation`. `resetXrplClients` also clears `inflight` and bumps
  `generation`.
- `src/lib/xrpl/__tests__/client.test.ts`: the fake counts `disconnect()`
  calls, and three new `describe` blocks were added. One existing test changed
  (see below).

## Tasks & Acceptance

**8.1: a connection the app has stopped using is closed**
- Given the failover loop, when the primary fails and the loop falls through,
  then the failed client is disconnected. *Test: "disconnects the primary it
  fell through from…", "disconnects both endpoints…"*
- Given the timeout wins the race, then the losing connection is closed, and
  if it opens later it is closed again. *Tests: "closes the connection that
  lost to the timeout…", "closes a connect abandoned at the timeout that opens
  afterwards".*
- Given a cached client that has dropped, when it is replaced, then it is
  disconnected first. This is the cache-miss path, and it has its own test:
  "disconnects a cached client that dropped before replacing it".
- Given the non-goal, then `resetXrplClients` returns `undefined` (nothing to
  await), disconnects nothing, and still drops the cached client. *Test:
  "resetXrplClients is synchronous…".*
- Given `disconnectAllClients`, then it still disconnects every connected
  cached client and clears the cache. *Test: "disconnectAllClients closes
  every cached connection…" pins the behaviour, and the code is untouched.*

**8.2: concurrent callers share one connection attempt**
- Given several concurrent callers for one network, then they share one
  attempt and exactly one `Client` is constructed. *Test: "constructs exactly
  one client for several concurrent callers".*
- Given the shared attempt rejects, then it is discarded, and the next call
  runs the failover loop again from the primary. *Test: "discards a failed
  attempt…".*
- Given two networks requested concurrently, then they do not share an
  attempt. *Test: "does not share an attempt across networks".*
- The existing failover tests pass unchanged.

**One existing test changed, as the story requires:** "gives concurrent
callers a connected client each" (in the *connection reuse* block, not the
*failover* block) asserted `built === 3` and stated outright that no dedupe
existed. It now asserts `built === 1` and that all three callers get the same
client.

## Decisions (made unattended, for Otavio to check)

1. **`resetXrplClients` also clears the in-flight map and bumps a generation
   counter.** The acceptance criteria say it is "unchanged", but the
   in-flight map is new state. Without this, an attempt one test left hanging
   (the timeout test's primary, for example) would be handed to the next test.
   The function stays synchronous, still disconnects nothing, and still drops
   connections, so the non-goal holds. A stale attempt settles for its own
   callers but never writes the cache, and it never evicts a newer attempt from
   the map.
2. **Abandons are fire-and-forget, not awaited.** "Disconnected first" means
   `disconnect()` is called before the replacement is built, not that the
   close has completed. Awaiting it could hang the loop (see Never) and would
   add latency to failover.
3. **A connect that loses to the timeout is closed twice:** once immediately
   and once more if it resolves later. The second close is what makes "cannot
   leave a socket that opens afterwards" true even if the first `disconnect()`
   raced the open.
4. **A cached client that has dropped is deleted from the cache at the start of
   the attempt, not when it succeeds.** If the attempt fails, the cache is left
   empty rather than holding a dead client. The behaviour a caller sees is the
   same either way: they get a rejection and the next call retries.
5. **`connect()` is now called one microtask later**
   (`Promise.resolve().then(() => client.connect())`). This turns a
   synchronous throw from `connect()` into a rejection, so the same abandon
   path handles it. The 10s timer still starts synchronously.

## Verification

- All four gates are green: `bun run lint`, `bun run build`, `bun run test`
  (32 files, 381 tests, re-run after rebasing onto `3ac02fc`), and `bun run check:contrast`.
- **Mutation check.** I removed each guard on its own and ran
  `client.test.ts`. Every mutation turned at least one test red:

  | Guard removed | Tests failed |
  |---|---|
  | immediate abandon | 3 |
  | late-open abandon | 1 |
  | replacement abandon | 1 |
  | dedupe | 4 |
  | forget-on-settle | 4 |
  | identity check | 1 |
  | reset clears in-flight | 3 |
  | generation guard | 1 |
  | per-network keying | 1 |
  | reset gaining a disconnect | 1 |

- No browser pass was done, because no UI changed.
- **Gap:** nothing here was verified against a real flaky endpoint. Every test
  uses the AD-12 factory seam. The claims about xrpl.js internals (that
  `disconnect()` cancels its reconnect timer, and that there is no
  re-subscribe) come from reading `node_modules/xrpl/src/client/connection.ts`
  at 5.1.0, not from observing it.

## Review triage

| Finding | Disposition |
|---|---|
| An attempt still in flight during `disconnectAllClients` repopulates the cache after teardown | **Deferred.** Pre-existing, and the acceptance criteria freeze the teardown path. Recorded in `deferred-work.md`. |
| `useAccountLiveUpdates` keeps a listener on a replaced client and never re-subscribes | **Deferred.** Pre-existing: xrpl.js 5.1.0 does not re-subscribe on its own reconnect either. Recorded in `deferred-work.md`. |
| A stale (pre-reset) attempt's client is neither cached nor closed | **Accepted.** This only happens through the test seam, which by contract never disconnects. |
| `disconnect()` on a fake or a client that throws synchronously | **Handled.** `abandon` wraps the call in `Promise.resolve().then(...)` with a `.catch`. |
| The shared promise rejects for every caller | **Intended.** Each caller already handled its own rejection, and the error object is the same. |
