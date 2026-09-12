---
title: 'Epic 3 — a failed ledger read is reported, not silent'
type: 'bugfix'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3ca0917b60d1bdec17df9205463f517e11b04848'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A failed ledger read is not reported anywhere, and on one screen it
is reported falsely. `HistoryTab` renders "No transactions yet — Payments this
account sends or receives will appear here once the ledger validates them" when
the `account_tx` read *failed*, which states as fact something the app does not
know. `BalancesTab` and `TrustLinesTab` render nothing at all. `PRODUCT.md`
says silence about a limitation is a defect, and that a wallet pleasant but
wrong about money has failed completely. Separately, `lib/notify.tsx` and
`store/notice-store.ts` both import a UI component for the notice tone
vocabulary, and `useAppUpdate` reaches past the notice funnel to dismiss.

**Approach:** Make a failed read say so, on every screen that performs one, and
never let a failure be rendered as an empty result. Move the tone vocabulary
below the component layer so the funnel stops importing upward, and give
`notify` the dismiss it was missing.

## Boundaries & Constraints

**Always:**
- A failed read and an empty result are distinguishable on screen and to a
  screen reader. "Nothing there" is only ever said when the app actually knows it.
- Failure text never auto-dismisses, and a retry is reachable by keyboard alone.
- Where the failure belongs to data with a place on screen, it renders in that
  place; anything the user initiated keeps reporting through the Annunciator.
- 320px and 200% zoom stay supported: `bun run check:contrast` green, nothing
  clipped, no colour carrying meaning alone.
- Every query key comes from `lib/xrpl/query-keys.ts`.

**Never:**
- No new runtime dependency, no new colour token, no change to the panel's
  visual vocabulary. Reuse the existing `Alert` tones.
- Do not route failed reads into the Annunciator. A read that fails repeatedly
  on a 15-second refetch would flood a band that never auto-dismisses.
- Do not change what a *successful* screen looks like.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Balance read fails | `account_info` rejects | The screen says the balance could not be read, with a retry | Never a blank panel |
| History read fails | `account_tx` rejects | The screen says the history could not be read | Never "No transactions yet" |
| History genuinely empty | read succeeds, zero items | "No transactions yet", as today | N/A |
| Trust-line read fails | `account_lines` rejects | The screen says the trust lines could not be read | Never a silent blank |
| Trust lines genuinely empty | read succeeds, zero lines | The existing empty state, as today | N/A |
| Unfunded account | read succeeds, account absent | The existing "not activated yet" state, unchanged | Not an error |
| Retry after failure | user activates retry | The read is attempted again and the failure clears on success | N/A |
| Imperative action fails | a send, unlock or faucet request throws | Reports through the Annunciator, as today, and does not auto-dismiss | N/A |
| Dismissing a notice | update notice declined | Goes through `notify`, not the store | N/A |

</frozen-after-approval>

## Code Map

**The defect.** `useQuery`'s error state is rendered nowhere:

- `src/pages/tabs/HistoryTab.tsx:21` destructures only `data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage` — no error. At `:42` the empty state fires on `!isLoading && items.length === 0`, which is also true when the read **failed**, so a failed `account_tx` renders "No transactions yet — Payments this account sends or receives will appear here once the ledger validates them." That is a false statement about the ledger and the worst of the three.
- `src/pages/tabs/BalancesTab.tsx` renders `accountState.isLoading && <Skeleton/>`, then branches on `accountState.data`. On error both are falsy, so the screen renders nothing.
- `src/pages/tabs/TrustLinesTab.tsx:144-155` renders `trustLines.isLoading && <Skeleton/>`, then `trustLines.data?.length === 0` (which is `undefined === 0`, i.e. false, on error) and `trustLines.data?.map(...)`. On error: nothing.

**The reads that can fail:** `useAccountState`, `useAccountTxHistory`, `useTrustLines`, `useServerReserves`, `useRecommendedFee` — all in `src/hooks/`, all thin `useQuery` wrappers, each exposing `isError`/`error`/`refetch`. `src/App.tsx:25-27` sets `retry: 1`, so a failure is already two attempts old by the time it surfaces.

**The tone vocabulary (AD-1):**
- `src/components/ui/alert.tsx:39-46` defines `NOTICE_TONE` and exports `type NoticeTone`.
- `src/lib/notify.tsx:2` imports it as a **value** dependency for the `TONE` map at `:16-21`; `src/store/notice-store.ts:2` imports it as a type. Both are `lib`/`store` importing from `components`, which AD-1 forbids.
- `src/lib/notify.tsx` exports `notify` (aliased `toast`) with `success`/`info`/`error`/`warning`. It has **no dismiss**, which is why `src/hooks/useAppUpdate.ts:7,169` imports `useNoticeStore` directly.

**Reuse, do not change:** the `Alert` / `AlertTitle` / `AlertDescription` primitives and their four tones; `src/components/Annunciator.tsx`; `src/lib/xrpl/query-keys.ts`; the "Account not activated yet" state in `BalancesTab`, which is a successful read of an absent account, not an error.

## Tasks & Acceptance

**Execution:**

- [x] `src/components/wallet/QueryErrorState.tsx` (or similar) -- one small component: what failed, in plain words, plus a retry control -- so the three screens report a failure the same way instead of each inventing one.
- [x] `src/pages/tabs/HistoryTab.tsx` -- take the query's error state; render the failure instead of the empty state, and never claim "No transactions yet" when the read failed -- the false statement is the most serious defect here.
- [x] `src/pages/tabs/BalancesTab.tsx` -- render the failure where the readout would be, rather than nothing.
- [x] `src/pages/tabs/TrustLinesTab.tsx` -- same; note `data?.length === 0` is false on error, so the existing empty branch does not cover it.
- [x] `src/components/ui/notice-tone.ts` (or equivalent below the component layer) -- move `NOTICE_TONE` / `NoticeTone` so `lib` and `store` stop importing from `components`; `alert.tsx` imports it too -- AD-1.
- [x] `src/lib/notify.tsx` -- add `dismiss`; stop importing from `src/components`.
- [x] `src/hooks/useAppUpdate.ts` -- dismiss through `notify`, not `useNoticeStore` -- closes the one escape hatch past the funnel.
- [x] `src/components/wallet/__tests__/query-error-state.test.tsx` -- new; assert the failure text renders, the retry is reachable by keyboard, and nothing auto-dismisses.
- [x] `src/pages/tabs/__tests__/history-error.test.tsx` -- new; assert a failed history read never renders the empty-state copy -- this is the regression that must not come back.

**Acceptance Criteria:**

- Given `account_tx` fails, when History renders, then it says the history could not be read and does **not** say "No transactions yet".
- Given `account_tx` succeeds with zero items, when History renders, then it still says "No transactions yet", unchanged.
- Given `account_info` fails, when Balances renders, then the failure is visible rather than a blank panel.
- Given `account_lines` fails, when Trust Lines renders, then the failure is visible rather than a blank list.
- Given any of those failures, when a screen reader reads the screen, then the failure is announced and does not disappear on a timer.
- Given the retry control, when it is activated by keyboard alone, then the read is attempted again.
- Given `src/lib` and `src/store` are searched, then neither imports from `src/components`.
- Given the app at 320px and at 200% zoom, when each failure renders, then nothing is clipped and `bun run check:contrast` passes.

## Implementation Notes

- **`notice-tone` lives in `src/lib/notice-tone.ts`, not `src/components/ui/`.**
  The task line suggested the `ui` path, but Verification asks that
  `grep -rn "from '@/components" src/lib src/store` return nothing, and only a
  module under `lib` satisfies that. `components → lib` is the permitted
  direction in the spine, and `alert.tsx` already imports
  `@/components/ui/lamp`, so the "ui leaf imports `@/lib/utils` alone" line was
  already non-literal. `alert.tsx` and `Annunciator.tsx` now import the map
  from `lib`; `notice-store.ts` keeps an `import type`, so no runtime edge is
  added.
- **A second false-empty, not in the Code Map.** `BalancesTab`'s Tokens card
  rendered "No token balances yet" on `nonZeroLines.length === 0`, which is
  also true when `account_lines` *failed* — the same defect class as
  `HistoryTab`'s and forbidden by the same frozen line. It is gated on
  `isError` too.
- **A failed later page never takes away history already on screen.** In
  `HistoryTab` the error panel is a sibling of the empty block and `items.map`
  is untouched, so a `fetchNextPage` that fails with pages already loaded
  reports the failure above a list that stays. The `!isError` guard sits on the
  inner "No transactions yet" branch only: the outer "No {filter} transactions
  loaded yet" branch is accurate whether or not the read failed — rows *were*
  loaded and this filter matches none — and it carries the only control that
  gets the user back to "All", so suppressing it on error would strand them.
- **The failure renders beside the readout, never inside it.** `BalancesTab`'s
  own note says the tone token will not hold contrast on readout ground, so the
  failure takes the same `Alert variant="destructive"` arrangement on card
  ground that "Account not activated yet" uses — an existing tone, an existing
  shape, no new token.
- **The underlying `error` is never rendered.** A transport message is no more
  meant for a person than a raw `tec` code is; the test asserts it does not
  reach the DOM.
- **The retry label flips on its own every 15 seconds.** `useAccountState` and
  `useTrustLines` carry `refetchInterval: 15_000`, which keeps firing on an
  errored query, so `isRetrying` — and with it the "Retrying…" label and
  `aria-busy` — goes true periodically with no user action. It is an accurate
  report of what the app is doing, not a bug; recorded so it is not later read
  as one.

- **Retained data is part of the failure case, not a separate one.** TanStack
  keeps the previous data across a failed refetch, and every one of these reads
  polls on 15 seconds — so `data` and `isError` arrive together far more often
  than `isError` alone. `BalancesTab` therefore steps the `Readout` (and its
  "Live" lamp), the not-activated prompt and the token rows aside on `isError`
  rather than showing a stale figure beside "could not be read";
  `TrustLinesTab`'s empty branch is gated the same way. Rows that did load stay:
  a list that is merely behind is not a false claim, a number labelled live is.
- **"Retrying…" belongs to the user's own attempt.** `QueryErrorState` owns that
  state and awaits the promise `onRetry` returns, instead of reading the query's
  `isFetching` — which the 15-second poll flips on its own, rewriting the
  accessible name of a control the user may have focused.
- **Two screens outside the Code Map had the same defect and are fixed here.**
  `SendTab`: a failed `useDestinationInfo` left `destInfo` undefined, which
  *satisfied* `!destInfo?.requireDestTag` and labelled the field "(optional)" —
  a tagless payment to an address that requires a tag, authorised by a read that
  never succeeded. The failure is now reported, the label says "requirement
  unknown", and `canSend` is false until the check succeeds. `ReceiveTab`:
  `?? false` made a failed read indistinguishable from "no tag required", so the
  warning silently vanished; the failure is reported instead.
- **AD-1 now has a gate.** `scripts/check-layering.mjs`, in the idiom of
  `check-query-keys.mjs` / `check-sw-register.mjs`, fails when anything under
  `src/lib` or `src/store` imports from `src/components` or `src/pages` — alias
  or relative path, `import type` included. Wired into `bun run lint` and
  `bun run check:layering`, with its own fixture suite in
  `src/lib/__tests__/layering-guard.test.ts`. Without it the whole point of the
  `notice-tone` move passes all four gates on the next edit that undoes it.

**Reported, not fixed — outside this spec's task list and I/O matrix:**

- `src/hooks/useSpendableBalance.ts:13` — when `useServerReserves` fails while
  `account_info` succeeds, the hook returns `spendableDrops: null` /
  `reservedDrops: null` with `isLoading: false`. `BalancesTab` then builds
  `marks: []` and the `Readout` renders the XRP balance with **Spendable and
  Reserved silently absent** — no skeleton, no failure text. That is the same
  defect class this epic exists to close, on the same screen, and the screen was
  *not* swept clean of it. It needs its own decision (a per-mark failure state,
  or a reserve fallback) rather than being folded in here unasked.
- `useRecommendedFee` in `SendTab` — a failed fee read has no reported state.
  The confirm dialog falls back to "the current rate", which is vague but not
  false.
- `useServerReserves`' `'the base reserve'` text fallback in the not-activated
  alert is already graceful and states nothing false. No change wanted.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | A failed destination check *relaxes* the send guard: `destInfo` is `undefined`, so `(!destInfo?.requireDestTag \|\| destTag.length > 0)` is satisfied and the send is enabled tagless, labelled "(optional)" | **high** | Verified at `SendTab.tsx:142` and `:195`. A payment to a destination that requires a tag can be sent without one on a read that never succeeded — a money-loss path. Pre-existing, but squarely inside this epic's stated intent ("a failed read must never be rendered as an empty result"), so it is not deferred. | patch |
| 2 | A stale balance renders under a green "Live" lamp directly beneath "Balance unavailable" | **high** | Verified at `BalancesTab.tsx:112`. TanStack retains data across a failed refetch, so `data?.exists` and `isError` are both true. This is the epic's own sin committed on the headline number. | patch |
| 3 | The same retained-data interaction leaves stale token balances under "Token balances unavailable", and offers the faucet on data the app just said it could not read | **medium** | Confirmed by reading the same file. | patch |
| 4 | `TrustLinesTab`'s empty state is the one left unguarded, justified by a comment true only on a first read | **medium** | Verified at `:157`. With `refetchInterval: 15_000`, a failed refetch keeps prior data, so `data?.length === 0` stays true and both messages render together. | patch |
| 5 | `ReceiveTab` treats a failed read as "no destination tag required", silently dropping the warning | **medium** | Verified at `ReceiveTab.tsx:15` (`?? false`). Same falsehood class as the three the epic fixed. | patch |
| 6 | Two assertions in the error-state test are vacuous | **medium** | Confirmed: the fake-timer advance tests a component that registers no timer, so it passes for any component; `tabIndex >= 0` is also true for a disabled button. Same defect class as Epic 1's vacuous assertions. | patch |
| 7 | `BalancesTab` and `TrustLinesTab` changed and have no tests, so two of three acceptance criteria are unpinned | **medium** | Pre-verified: no test file imports either tab. Only the History criterion is enforced. | patch |
| 8 | `isRetrying={isFetching}` flips the retry control's accessible name to "Retrying…" every 15 seconds with no user action, and also while "Load more" is fetching | **medium** | Confirmed against `refetchInterval: 15_000`. A changing accessible name under a possibly-focused control. Retrying after a `fetchNextPage` error also calls `refetch`, clearing the error without fetching the missing page. | patch |
| 9 | `notify.dismiss`'s comment claims it closed the one escape hatch, but `raise()` still calls the store directly and `Annunciator` still imports it | **low** | Confirmed by reading the file. Direct correction to the comment. | patch |
| 10 | The AD-1 acceptance criterion (`lib`/`store` never import from `components`) has no automated check | **medium** | Confirmed: `lint` is oxlint plus two guard scripts, neither inspecting import direction, and `.oxlintrc.json` has no `no-restricted-imports`. The repo now has the guard-script pattern twice. | patch |
| 11 | Doc drift left by the `NOTICE_TONE` move — a stray blank line, and an `ANNUNCIATOR` comment giving a dependency-direction reason for an export | **low** | Confirmed. Direct correction. | patch |
| 12 | `useServerReserves` failing makes Spendable and Reserved vanish with no explanation; `useRecommendedFee` in `SendTab` likewise unreported | **medium** | Real, and found independently by the implementer. Outside this spec's task list and I/O matrix; the spendable figure is the number the operator acts on, so it warrants its own decision. Already recorded in `deferred-work.md`. | defer |
| 13 | The comment justifying the unguarded "Show all transactions" branch says it "carries the only way back to All", but the header tab does too | **low** | True — the premise is wrong even though keeping the branch is right (it is accurate whether or not the read failed). Subsumed by the #8 rework of that file. | reject |


## Verification

**Commands:**
- `bun run lint` -- expected: exit 0.
- `bun run build` -- expected: exit 0.
- `bun run test` -- expected: exit 0, with the new error-state suites passing.
- `bun run check:contrast` -- expected: exit 0. New markup, so this must stay green.
- `grep -rn "from '@/components" src/lib src/store` -- expected: no hits.

**Run on 2026-09-12, baseline `3ca0917`:**
- `bun run lint` — exit 0 (including `check-query-keys`, `check-sw-register`
  and the new `check-layering`).
- `bun run build` — exit 0.
- `bun run test` — exit 0, 23 files / 150 tests, including the two new suites.
- `bun run check:contrast` — exit 0, "All token pairs pass."
- `grep -rn "from '@/components" src/lib src/store` — no hits.

**Manual checks:**
- The three failure states at 320px and at 200% zoom, per `docs/agents/verifying-your-work.md`. This epic changes what the user sees, so the gates alone do not settle it.
- **Not performed.** Reaching these states in a browser means forcing three
  different ledger reads to reject, which this change does not provide a seam
  for. What can be said instead: every failure renders the exact arrangement
  already shipped in `BalancesTab`'s "Account not activated yet" —
  `Alert variant="destructive"` with `AlertDescription className="flex flex-col
  items-start gap-2"` and a `Button size="sm"` — with no `min-width`, no fixed
  width and no unbreakable string, and it reuses measured token pairs
  (`check:contrast` green). That is an argument from equivalence, not an
  observation, and this line is here so nobody reads the gates as settling it.
