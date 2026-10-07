---
title: 'Invalidating account-scoped data goes through one named group'
type: 'bugfix'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ebd10e775ac8e3f065e3b7fe42e863d9e3a70bc0'
context:
  - '{project-root}/docs/agents/ledger-io.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The four places that discard cached account data each discard a different subset:

| Site | Keys invalidated |
|---|---|
| `useAccountLiveUpdates` | all four |
| `SendTab` | three (no `incomingPaymentWatch`) |
| `TrustLinesTab` | two (`trustLines`, `accountState`) |
| `BalancesTab` faucet | one (`accountState`) |

So after a trust-line change the history stays stale, and after a send the incoming-payment watch does, unless the live subscription happens to fire. A member missing from a site can only be found by comparing four call sites.

**Approach:** The key factory exposes one function that invalidates the whole account-scoped group for a network and address. It builds the set from the same `accountScoped` table the read keys come from, so adding an account-scoped key adds it to the group. All four sites call that function and pass no query key.

## Boundaries & Constraints

**Always:**
- The group is derived from `accountScoped` in `query-keys.ts`, never from a second hand-written list.
- The function performs the invalidation itself (the factory owns the loop) and resolves when every member's invalidation has resolved, so `await` at a call site keeps its meaning.
- Network-scoped (`serverReserves`, `recommendedFee`), destination-scoped (`destinationInfo`) and device-scoped keys stay out of the group.
- Another wallet's or another network's entries are not touched.

**Never:**
- No export that hands a key list or set back for call sites to iterate. That shape was explicitly rejected (architecture, epic 5 context): a variable-bound key at four sites is invisible to `check-query-keys.mjs`.
- No change to any read key's shape or to `check-query-keys.mjs`. The guard's blind spot for variable-bound keys is story 10.1.
- No change to what a site does besides the invalidation: toasts, `setBusy`, error handling and ordering stay as they are.

</frozen-after-approval>

## Code Map

- `src/lib/xrpl/query-keys.ts:39-51` — `accountScoped`, the four builders; it is not exported, only spread into `queryKeys`. Add the group function here beside it. The factory's doc comment (`:3-20`) should name the new function as the only invalidation path for account-scoped data.
  - A type-only import of `QueryClient` from `@tanstack/react-query` is fine: `check-layering.mjs` only forbids `lib` → `components`/`pages`.
- **The four sites**, each passing `(queryClient, network, address)`:
  - `src/hooks/useAccountLiveUpdates.ts:28-33` — `invalidateAccountQueries()`, called without `await` from a stream handler; keep it fire-and-forget.
  - `src/pages/tabs/SendTab.tsx:453-455` — three sequential `await`s after the submit result.
  - `src/pages/tabs/TrustLinesTab.tsx:60-61` — two `await`s.
  - `src/pages/tabs/BalancesTab.tsx:48` — one `await` after the faucet.
- `src/lib/xrpl/__tests__/query-key-invalidation.test.ts` — has `seededClient()` and `isInvalidated()`, which asserts the entry exists first so negatives cannot pass vacuously. Its header comment describes the old per-site subsets; update it.
- **Tab tests** mock `useQueryClient` as `{ invalidateQueries: vi.fn() }`, in `balances-error.test.tsx:14`, `trustlines-error.test.tsx:25` and `send-destination-error.test.tsx:34`. A function that calls `client.invalidateQueries` keeps them working unchanged.
- `src/lib/__tests__/layering-guard.test.ts` — the pattern for a test that scans source files; reuse it for the "no site passes a key" check.
- **Reuse, do not change:** every read key, `queryKeys` exceptions, `check-query-keys.mjs`, `check-layering.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/xrpl/query-keys.ts` — add `invalidateAccountScoped(client, network, address)`: loops `accountScoped`, returns `Promise<void>`, and has a doc comment saying why it is a function and not a list.
- [x] `src/hooks/useAccountLiveUpdates.ts`, `src/pages/tabs/SendTab.tsx`, `src/pages/tabs/TrustLinesTab.tsx`, `src/pages/tabs/BalancesTab.tsx` — replace each site's `invalidateQueries` calls with the one group call, keeping `await` where there was one.
- [x] `src/lib/xrpl/__tests__/query-key-invalidation.test.ts` — the group invalidates all four members for the address, leaves another address, another network and the network-scoped entries untouched, and resolves only after all members; update the header comment.
- [x] `src/lib/xrpl/__tests__/` (new or existing file) — a source scan asserting that no file under `src/` outside `query-keys.ts` and tests calls `invalidateQueries` with an account-scoped key.

**Acceptance Criteria:**
- Given any of the four sites runs, when it discards account data, then `accountState`, `accountTx`, `trustLines` and `incomingPaymentWatch` for the active network and address are all invalidated.
- Given a fifth builder is added to `accountScoped`, when the group runs, then it is invalidated too, with no call site edited.
- Given the group runs, when another wallet or network, `serverReserves`, `recommendedFee` or `destinationInfo` has cached entries, then none is invalidated.
- Given the source tree, when the scan test runs, then no site outside the factory passes an account-scoped key to `invalidateQueries`.
- Given the four gates, when each runs, then all exit 0.

## Implementation Notes

- `invalidateAccountScoped` runs the members with `Promise.all`, so the three/two awaited invalidations at SendTab/TrustLinesTab now run concurrently rather than one after another; the call still resolves only after all have.
- The scan lives in `src/lib/xrpl/__tests__/account-invalidation-sites.test.ts`. It reads the account-scoped names off `queryKeys` by key shape (arity 2, `[name, network, address]`), flags any `invalidateQueries(` argument naming one, and flags a file that both calls `invalidateQueries` and builds an account-scoped key (the variable-bound case). It does not change `check-query-keys.mjs`.
- Mutation checks run: skipping `incomingPaymentWatch` in the loop fails three group tests; restoring a direct `accountState` invalidation in BalancesTab fails the scan.
- The manual Testnet browser pass has not been run.

## Spec Change Log

## Review Triage Log

Pass 1, 2026-09-29. Three layers (blind hunter, edge-case hunter, verification gap), 19 findings.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | No test runs any of the four sites and observes what they invalidate; the tab mocks' `invalidateQueries: vi.fn()` are anonymous (verification gap) | medium | Pre-verified by the layer. Passing `destination`, gating the call on `validated`, or dropping the stream call would all pass. The send path moves money. | patch |
| 2 | The ordering test flushes two microtasks, too few to see an early settle (edge case) | low | A partial `await` settles after more than two ticks, so the test would still pass. Test-only fix. | patch |
| 3 | The ordering test asserts an exact four-name list, contradicting "a fifth builder joins unedited" (blind) | low | Adding a builder breaks this test while its neighbour claims no edit is needed. Direct correction. | patch |
| 4 | The scan watches only `invalidateQueries`, not `refetchQueries`/`resetQueries`/`removeQueries` (edge case + blind) | low | No site uses them today. Widening the regex is a direct correction. | patch |
| 5 | The scan's limits (destructured or aliased builder, cross-module key, `queryKeys[name]`, `)` inside a string) are real but undocumented; the doc comment implies full coverage (edge case ×3 + blind) | low | Closing each hole adds parsing complexity for cases unlikely in this codebase, so rejected as code changes. Stating the limits is a comment edit. | patch (comment only) |
| 6 | The factory header names only `check-query-keys.mjs`, so the new rule's enforcement is unfindable (blind) | low | The rule lives in a vitest scan the header never mentions. One-line comment. | patch |
| 7 | A `submit*` throw (timeout, unknown outcome) invalidates nothing, though the tx may have applied (blind) | medium | Real, but pre-existing: before this story the `catch` also invalidated nothing. Not caused by 5.5. | defer |
| 8 | `Promise.all` rejects fast, so "resolves once each member has resolved" fails on error (blind) | false | `refetchQueries` wraps each fetch in `.catch(noop)` unless `throwOnError` (`@tanstack/query-core` `queryClient.js:147-157`), so `invalidateQueries` never rejects. | rejected |
| 9 | Send and trust-line `setBusy` now waits for an extra `account_tx` refetch (the watch); each event makes two `account_tx` requests (edge case + blind) | low | Real cost, but refreshing the watch after a send is frozen AC 1 and the story's purpose. The live path already made both requests. | rejected |
| 10 | Builder detection infers membership from key shape (`Function.length`) and is duplicated across two test files (edge case + blind) | low | A defaulted-parameter builder is hypothetical. The fix (exporting member names) adds public surface. | rejected |
| 11 | `address: string | null` admits a null address (blind) | low | Every site passes a non-null address; `useAccountLiveUpdates` returns early on null. Narrowing needs a cast at that site. | rejected |
| 12 | `docs/decisions.md` §4 and the agent rules don't record the new rule (blind) | low | Real. Fix edits agent-context and decision docs. | defer |
| 13 | The first `invalidateAccountScoped` test duplicates the builder-driven one (blind) | false | It pins the four named members by name, which the shape-derived test cannot do if detection itself regresses. Not redundant. | rejected |

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` — expected: all exit 0.
- Mutation check: drop one builder from the loop (e.g. skip `incomingPaymentWatch`); the group test must fail.

**Manual checks:**
- On Testnet, check that balance, history, trust lines and the incoming-payment watch all refresh after each of: a completed send, a trust-line change, the faucet, and a payment arriving on the live path. A browser with a virtual authenticator works; see the 5.3/5.4 browser pass.

**Result, 2026-09-29:** all four gates exit 0 (340 tests, 32 files). Mutation checks, run by this session:

| Mutation | Result |
|---|---|
| `incomingPaymentWatch` skipped in the loop | 3 group tests fail |
| A TrustLinesTab invalidation bound to a variable | the scan fails |
| SendTab invalidates for `destination` | 2 send tests fail |
| `handleTransaction` no longer invalidates | the live-update test fails |

**Manual check, 2026-09-29: RUN, ALL FOUR PASS.** Build `48845cd`, Playwright Chromium with a CDP virtual authenticator, Testnet. Every websocket frame the page sent was logged, and reads were counted per action. `account_tx` serves both history and the incoming-payment watch; an inactive history query is invalidated and re-read on the next visit.

| Action | Reads after it (`account_info` / `account_lines` / `account_tx`) | On screen |
|---|---|---|
| Faucet | 2 / 2 / 2 (1 stream event) | balance 99.999964 → 199.999964; History, on visit, re-reads and shows the 100 XRP payment on top |
| Trust-line limit 1000 → 900 | 4 / 3 / 2 (1 stream event) | Tokens shows 900; History shows the TrustSet on top |
| Send 1 XRP | 3 / 2 / 2 (1 stream event) | outcome Validated; balance 199.999952 → 198.99994; History shows the send on top |
| Live payment, 5 EUR from a script, app idle | 1 / 1 / 2 | EUR 80 → 85 with no user action; History shows it on top |

The doubled counts are the site's own group call plus the live stream's, as intended.

**Found during the pass, not caused by 5.5:** one page load opened six sockets to the primary Testnet node and one to the backup (stories 8.1/8.2). The backup, `testnet.xrpl-labs.com`, holds about 1,700 recent ledgers. When it answers `account_tx`, History renders "No transactions yet", or a truncated list (1 row where there were 6), as fact. Recorded in `deferred-work.md`.
