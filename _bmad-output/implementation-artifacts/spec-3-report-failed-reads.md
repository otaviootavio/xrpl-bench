---
title: 'Epic 3 — a failed ledger read is reported, not silent'
type: 'bugfix'
created: '2026-09-12'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'PENDING'
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

- [ ] `src/components/wallet/QueryErrorState.tsx` (or similar) -- one small component: what failed, in plain words, plus a retry control -- so the three screens report a failure the same way instead of each inventing one.
- [ ] `src/pages/tabs/HistoryTab.tsx` -- take the query's error state; render the failure instead of the empty state, and never claim "No transactions yet" when the read failed -- the false statement is the most serious defect here.
- [ ] `src/pages/tabs/BalancesTab.tsx` -- render the failure where the readout would be, rather than nothing.
- [ ] `src/pages/tabs/TrustLinesTab.tsx` -- same; note `data?.length === 0` is false on error, so the existing empty branch does not cover it.
- [ ] `src/components/ui/notice-tone.ts` (or equivalent below the component layer) -- move `NOTICE_TONE` / `NoticeTone` so `lib` and `store` stop importing from `components`; `alert.tsx` imports it too -- AD-1.
- [ ] `src/lib/notify.tsx` -- add `dismiss`; stop importing from `src/components`.
- [ ] `src/hooks/useAppUpdate.ts` -- dismiss through `notify`, not `useNoticeStore` -- closes the one escape hatch past the funnel.
- [ ] `src/components/wallet/__tests__/query-error-state.test.tsx` -- new; assert the failure text renders, the retry is reachable by keyboard, and nothing auto-dismisses.
- [ ] `src/pages/tabs/__tests__/history-error.test.tsx` -- new; assert a failed history read never renders the empty-state copy -- this is the regression that must not come back.

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

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun run lint` -- expected: exit 0.
- `bun run build` -- expected: exit 0.
- `bun run test` -- expected: exit 0, with the new error-state suites passing.
- `bun run check:contrast` -- expected: exit 0. New markup, so this must stay green.
- `grep -rn "from '@/components" src/lib src/store` -- expected: no hits.

**Manual checks:**
- The three failure states at 320px and at 200% zoom, per `docs/agents/verifying-your-work.md`. This epic changes what the user sees, so the gates alone do not settle it.
