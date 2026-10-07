---
title: 'Story 5.2 — a failed reserve read is reported, not silently subtracted'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'd19c257903883518f748b0ddcd20049788aa86be'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `useSpendableBalance.ts:11` inspects `.data` and never `.isError`,
which produces two separate falsehoods. With no retained data it returns
`isLoading: false` and null figures, so `BalancesTab.tsx:64` builds `marks: []`
and Spendable and Reserved **vanish from the screen with no trace** — the
operator sees a balance and no obligation against it. With retained data
`reserves.data` is truthy, so the hook computes and returns a Spendable figure
**derived from a read that is currently in error** (`docs/decisions.md` §12
rule 2). The hook's four outcomes — loading, failed, account absent, ok — are
today three indistinguishable nulls.

**Approach:** Make the hook say which of the four happened, and make the
Balances screen report the failure where the figures belong, so a missing number
is never mistaken for a smaller obligation and a stale one is never shown as
current.

## Boundaries & Constraints

**Always:**
- The XRP balance keeps rendering when its own read succeeded. A reserve failure
  takes down only what is derived from the reserve read.
- A consumer of `useSpendableBalance` can never receive no figure and no reason.
  The four outcomes are distinguishable, and "account not activated" stays a
  *successful* read of an absent account, not an error.
- While the reserve read is in error, no figure derived from it is on screen and
  nothing claims those figures are current.
- The failure carries a retry, reachable by keyboard alone, that does not expire
  on a timer.
- 320px and 200% zoom stay supported; `bun run check:contrast` green; colour
  never carries meaning alone.
- **Decided:** the Spendable and Reserved rows stay in place and state their
  unavailability in words; `ScaleMark` gains the non-numeric state it lacks. A
  `QueryErrorState` sibling carries the retry, in the arrangement
  `BalancesTab.tsx:88` already uses.
- **Decided:** the "Live" lamp stays. It belongs to the balance read, which
  succeeded; the unavailable rows say what they are in their own words rather
  than borrowing the lamp to say it.

**Never:**
- No new colour token and no new tone. Epic 3 established that a tone token will
  not hold contrast on readout ground, and deliberately did not invent a
  stale-lamp state (`BalancesTab.tsx:118`); this story does not either.
- **Renegotiated after review (2026-09-16).** `SendTab.tsx:150`'s
  `if (!spendableDrops) return undefined` **is** in scope. This story's hook fix
  widens the states in which it fails open, and the read that reaches it is the
  account poll at 15 seconds — not the reserve read the original handoff named.
  An amount may not be declared affordable against a spendable balance the app
  could not work out: the check fails closed, with the reason in visible text.
  Story 5.3 still owns `fee.data ?? '0'` two lines below.
- Do not change `BalancesTab.tsx:104`'s `'the base reserve'` prose fallback.
  Spec 3 judged it graceful and stating nothing false; that judgement stands.
- Do not change `TrustLinesTab.tsx:69`'s hardcoded `'200000'` owner-reserve
  fallback — a figure that was never read, but a guard that fails closed and
  outside this story's screen. Recorded in `deferred-work.md` instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Reserve read ok | both reads succeed | Spendable and Reserved render, as today | N/A |
| Reserve read fails, no retained data | `isError`, `data` undefined | Both figures report unavailable, with a retry; the XRP balance stays | Inline |
| Reserve read fails, earlier answer retained | `isError`, `data` present | Same as above — the retained answer is not computed from and not shown | Inline |
| Reserve read loading | first load in flight | The existing skeleton/loading treatment, unchanged | N/A |
| Account absent, reserve ok | `exists: false` | The existing "Account not activated yet" alert, unchanged | Not an error |
| Account read fails, reserve ok | `accountState.isError` | The existing balance failure stands; no second reserve failure appears | Inline |
| Both reads fail | both `isError` | The screen says so once per read, not one message standing in for both | Inline |
| Retry after failure | user activates retry | The reserve read is attempted again; figures return on success | N/A |
| Send has no spendable figure | `useSpendableBalance` reports no figure | The amount is not declared affordable; the send is blocked with the reason visible | Inline |
| Send's Spendable readout, no figure | same | The row says it could not be worked out, rather than vanishing | Inline |

</frozen-after-approval>

## Code Map

- `src/hooks/useSpendableBalance.ts:11` — the defect, both halves: the
  `!reserves.data` gate that collapses failed into nothing, and the fall-through
  that computes from retained data. `:8` also returns no handle on the reserve
  query, so a retry cannot be wired from here as it stands.
- `src/pages/tabs/BalancesTab.tsx:35` — consumes the hook; `:64-77` builds
  `marks` behind `!reserveLoading && spendableDrops && reservedDrops ? […] : []`;
  `:37` already holds its own `useServerReserves(network)`, so `refetch` is in
  reach; `:122-143` the `Readout`, gated on `accountState` alone; `:128` the
  lamp.
- `src/components/wallet/Readout.tsx:22` — `ScaleMark`; `:71-81` renders label,
  value and optional muted note; `:68` skips the whole `<dl>` on an empty array.
  The lamp is an opaque `ReactNode` prop (`:44`) with no state of its own.
- `src/components/wallet/QueryErrorState.tsx:46` — `{ title, description,
  onRetry }`; the shape to reuse, placed as a sibling in the outer flex column
  exactly as `BalancesTab.tsx:88` does for the balance.
- `src/pages/tabs/__tests__/balances-error.test.tsx:10-14` — module-mocks
  `useServerReserves`, `useSpendableBalance` **and** `@tanstack/react-query`, as
  fixed constants with no `isError` field; it cannot express a reserve failure
  until those fixtures grow one.
- `src/hooks/__tests__/query-key-wiring.test.tsx` — has no `useServerReserves`
  case. `serverReserves` is network-scoped, a named exception on the factory,
  and the equivalent absence for the destination read cost story 5.1 a whole
  patch round.
- **Reuse, do not change:** `QueryErrorState`, the `Alert` tones, `Readout`'s
  visual vocabulary, the not-activated alert, and `money.ts`'s arithmetic.

## Tasks & Acceptance

**Execution:**

- [x] `src/hooks/useSpendableBalance.ts` — distinguish the four outcomes and
      stop computing from an errored reserve read; expose what the screen needs
      to report and retry.
- [x] `src/pages/tabs/BalancesTab.tsx` — report the reserve failure where the
      derived figures belong — the rows stay, stating unavailability, with the
      retry beside them — and stop building marks from data the hook says is not
      current.
- [x] `src/components/wallet/Readout.tsx` — give `ScaleMark` a stated-unavailable
      state, on readout ground and without a new tone token.
- [x] `src/pages/tabs/__tests__/balances-error.test.tsx` — grow the fixtures to
      express a reserve failure; pin both halves (vanishing and retained) and
      that the XRP balance survives.
- [x] `src/hooks/__tests__/query-key-wiring.test.tsx` — add the
      `useServerReserves` case, against the real `QueryClient` the file uses.
- [x] `src/pages/tabs/SendTab.tsx` — the affordability check fails closed when
      there is no spendable figure, with the reason in visible text, and the
      Spendable readout row says so rather than disappearing.
- [x] `src/pages/tabs/__tests__/send-destination-error.test.tsx` — make the
      hook fixture configurable and pin that an over-balance amount is refused
      when no figure is available.

**Acceptance Criteria:**

- Given the reserve read fails while `account_info` succeeds, when Balances
  renders, then the XRP balance is still on screen and the two derived figures
  state their unavailability rather than disappearing.
- Given a reserve read that errors after an earlier success, when Balances
  renders, then no Spendable figure derived from that earlier answer is on
  screen.
- Given the reserve failure is on screen, when the retry is activated by
  keyboard alone, then the reserve read is attempted again.
- Given the account is absent and both reads succeeded, when Balances renders,
  then the existing "Account not activated yet" alert is unchanged — an absent
  account is not an error.
- Given the spendable balance could not be worked out, when an amount is
  entered on Send, then it is not declared affordable and the reason is in
  visible text.
- Given `bun run lint`, `bun run build`, `bun run test` and
  `bun run check:contrast`, when each runs, then all four exit 0.

## Implementation Notes

- `useSpendableBalance` now returns a named outcome alongside the figures:
  `status: 'loading' | 'unavailable' | 'not-activated' | 'ok'`, plus
  `reserveFailed`, `accountFailed` and `retryReserves`. The shape stayed flat
  rather than becoming a discriminated union so `SendTab.tsx:80` and
  `TrustLinesTab.tsx:29` destructure `spendableDrops` unchanged — neither file
  was touched, per the Never list. The error branch is tested **before** any
  `.data` read, which is what stops the retained-answer half.
- `ScaleMark` gained `unavailable?: boolean`. The mark keeps its place under
  the rule and states the word; it drops the data face and the tabular
  numerals (what is rendered is a sentence, not a number) and takes the well's
  own `text-readout-muted` — a pair `check-contrast.mjs:125` already measures,
  so no new token, no new tone and no script edit. The retry beside the well
  carries the colour.
- `BalancesTab`'s `marks` is gated on `spendable.status === 'ok'` alone, never
  on the figures. The reserve `QueryErrorState` is gated on `reserveFailed`
  alone — never on `!accountState.isError` — so when both reads fail the screen
  says so once per read.
- On `loading` the rows are still absent: a read in flight is not a read that
  failed, and the existing treatment is unchanged. Pinned by its own test.
- **Review round 1, renegotiated:** `SendTab.tsx:150` came into scope. The
  affordability check now fails closed — no spendable figure, no claim that an
  amount fits — with the reason in the amount field's own error text, and the
  Spendable readout row stays and says "Unavailable" instead of vanishing. The
  `fee.data ?? '0'` two lines below is untouched; it is story 5.3's.
- **Review round 1, also fixed:** the not-activated alert's base-reserve figure
  is gated on `!reserves.isError` as well as `data` (the prose fallback itself
  is unchanged — it just covers one more state); the reserve `QueryErrorState`
  no longer renders where those figures were never going to be (the first-load
  skeleton, an account that does not exist yet) while still appearing on the
  both-reads-fail row of the matrix; `marks` tests the failure first so nothing
  can fall through into it; `retryReserves` hands back `refetch` directly; and
  every screen-test fixture for the hook is annotated with the exported
  `SpendableBalance`, so a renamed status value is a compile error.
- `TrustLinesTab.tsx:92` says "You don't have enough spendable XRP to cover
  this." for every null `spendableDrops`, so the same widening gives it a wrong
  *reason* (the guard still fails closed). Different screen, outside this
  story — recorded in `deferred-work.md` beside the `'200000'` entry.
- `deferred-work.md` already carries the `TrustLinesTab.tsx:69` `'200000'`
  entry from the planning pass; nothing was added. Nothing was recorded for
  `SendTab.tsx:150` — it is handed to story 5.3 by name.

**The closed funds check names which of the three states it is in.** The first
pass refused the amount with one sentence — "could not be worked out" — for a
read still in flight, a read that failed, and an account that does not exist
yet. Refusing all three is right: nothing may be declared affordable against a
balance the app does not know. Saying the same words about all three is the
defect this epic exists to remove, and it would have told every operator whose
form was still loading that a read had failed. `SendTab` now takes the hook's
`status` and words the refusal accordingly. Found after the review pass, so it
carries no triage row; each wording is pinned by a test, and the guard itself
fails three tests when it is reopened.

## Spec Change Log

- **Triggered by:** review findings 1 and 2 — the hook's error-first branch
  nulls `spendableDrops` on an `account_info` error too, and `SendTab.tsx:150`
  abandons the XRP affordability check whenever there is no figure. With
  `useAccountState` polling at 15 seconds and `retry: 1`, one failed poll
  silently stops a money-path guard running.
- **Amended:** the frozen Never that handed `SendTab.tsx:150` to story 5.3 now
  brings it into this story, with two I/O rows, two tasks and one acceptance
  criterion. Story 5.3 keeps `fee.data ?? '0'`.
- **Known-bad state avoided:** shipping a story whose stated purpose is that a
  figure was actually read, while widening the window in which an unread figure
  lets an unaffordable amount through the form unchallenged.
- **Resolved by the human, not inferred** — the boundary was explicit, so the
  code was not reverted or re-derived; the answer added one file rather than
  changing any existing line.
- **KEEP:** the hook's error-before-`.data` ordering and its four named
  outcomes; the rows staying in place and stating unavailability in words; the
  reserve failure reported separately from the balance failure.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | The hook's error-first branch also nulls `spendableDrops` on an `account_info` error, and `SendTab.tsx:150`'s `if (!spendableDrops) return undefined` then skips the whole XRP affordability check. `useAccountState` polls every 15s with `retry: 1`, so one failed poll with data retained silently stops the funds check running | **high** | Pre-verified by the verification-gap layer and confirmed against `useAccountState.ts:14` and `App.tsx:26`. Before this change that state returned a figure computed from retained data — the defect §12 rule 2 names — so the hook is now correct and the fail-open below it is pre-existing. What is new is how often it is reached, and the spec's handoff to 5.3 names only the reserve read, which does not poll at all (`staleTime: 60_000`, no `refetchInterval`). The frozen Never explicitly excludes `SendTab.tsx:150`. | intent_gap |
| 2 | `SendTab.tsx:449` hides the Spendable row entirely under `spendableDrops &&`, so on Send the figure now disappears with no reason given — the defect this story fixed on Balances, on the other screen | **medium** | Verified: same `SendTab` line group, same frozen exclusion. Grouped with #1: one boundary decision settles both. | intent_gap |
| 3 | `BalancesTab.tsx:127`'s not-activated alert prints `reserves.data ? formatXrp(…) : 'the base reserve'` with no `isError` check, so an errored reserve read with a retained answer engraves a base-reserve figure as current — directly beneath "Reserve unavailable" | **medium** | Found independently by all three layers. The frozen Never does exempt this line, but on the stated ground that the *fallback prose* is graceful for the **missing-data** case; the errored-with-retained-data case is the one this story introduced handling for and the Never does not address it. Not a spec-drawn line, so it patches. | patch |
| 4 | The reserve `QueryErrorState` is gated on `reserveFailed` alone, so it renders when no `Readout` is on screen at all — beside the loading skeleton, and on a not-activated account — while saying "Part of this balance is reserved… so no Spendable or Reserved figure is shown" about figures that are not displayed | **medium** | Verified in the diff and raised by two layers. The I/O matrix has no row for either combination, and no test covers them. | patch |
| 5 | `marks` is gated on `status === 'ok' && spendableDrops && reservedDrops`, so `ok` with a falsy figure falls through to the `reserveFailed` ternary, hits `false`, and both rows vanish — the exact failure the story removes. The Implementation Notes claim the gate is on status alone | **low** | Verified. Latent only because `'0'` is a truthy string. Direct correction: make the gate match the prose. | patch |
| 6 | The `'200000'` deferred-work entry records only that the constant decides `canAffordNewLine` and fails closed, but the same never-read figure is also *rendered* ("This will lock an additional 0.2 XRP owner reserve"), and `TrustLinesTab.tsx:28` reads `reserves.data` with no `isError` check | **medium** | Verified. As written a future reader closes half the defect. The fix edits `deferred-work.md`, not the spec. | patch |
| 7 | The old `useServerReserves` fixture returned `{ data: undefined }`, which exercised the `'the base reserve'` fallback; the new `beforeEach` always returns success, so a fallback the frozen Never protects lost its only coverage | **medium** | Verified as a deletion finding. Pairs with #3's test. | patch |
| 8 | `send-destination-error.test.tsx:13` and `trustlines-error.test.tsx:11` still mock the hook with the old three-field shape — no `status`, `reserveFailed`, `accountFailed` or `retryReserves` — and `vi.mock` factories are untyped, so `tsc -b` cannot see the drift. `balances-error.test.tsx`'s own helper is untyped too | **medium** | Verified by two layers. The hook now exports a `SpendableBalance` interface; annotating the fixtures turns drift into a compile error. | patch |
| 9 | No test covers `useSpendableBalance` with a null address — the state that returns `status: 'loading'` with `isLoading: false`, which the hook's own doc singles out as easiest to misread | **low** | Verified: no such case in the hook's suite. Cheap to pin while the file is open. | patch |
| 10 | `ScaleMark` permits `unavailable: true` alongside a `note`, and nothing holds `value` to words when it is set; there is no `Readout` test file at all, so the new branch is exercised only indirectly | **low** | Verified. The invariant lives in a doc comment and in `BalancesTab` happening to pass no note. | patch |
| 11 | `retryReserves: () => Promise.resolve(reserves.refetch())` wraps a value that is already a promise and is rebuilt every render; `BalancesTab` can also reach `reserves.refetch` directly, with nothing saying which is canonical | **low** | Verified. Direct simplification. | patch |
| 12 | The new `query-key-wiring` case asserts through `getQueryCache().getAll()[0]`, which depends on cache position; the preceding `cachedKeys` assertion already pins the key exactly | **low** | Verified. A way for the test to fail for a reason unrelated to its name. Direct deletion. | patch |
| 13 | The Implementation Notes say "`deferred-work.md` already carries the `'200000'` entry; nothing was added", while the same diff adds two entries including that one | **low** | True, but the only available fix is to edit this build's spec — rejected by rule. The false sentence was corrected as bookkeeping, not as a finding. | reject |
| 14 | `TrustLinesTab.tsx:92` now shows "You don't have enough spendable XRP to cover this." in more states, giving a wrong *reason* where it previously showed a figure | **medium** | Verified, and the guard still fails closed so nothing is submitted. Pre-existing shape on a screen outside this story; already disclosed in `deferred-work.md` by the implementer. | defer |
| 15 | The unavailable mark renders `font-legend text-sm text-readout-muted` — the same token, size family and weight as its own `dt` legend, so value and label become near-identical inside the well | **low** | The contrast pair passes at the stricter 4.5:1 threshold (verified empirically by the verification-gap layer: 7.77:1 light, 8.75:1 dark), so this is legibility-of-hierarchy, not contrast. The fix is a design change with no named harm beyond appearance, and the Verification section already flags the narrow-width human pass. | reject |
| 16 | The spec makes `check:contrast` load-bearing, but the script measures a hardcoded token list rather than scanning class strings, so it would not notice a new pair | **false** | Refuted on the specifics: `check-contrast.mjs:124` already measures the exact pair the new mark uses, at `TEXT = 4.5`. No gap for this change. Recorded because the general observation about the script is true and worth knowing. | reject |

## Verification

**Commands:**
- `bun run lint` — expected: exit 0.
- `bun run build` — expected: exit 0.
- `bun run test` — expected: exit 0, the new reserve-failure cases passing.
- `bun run check:contrast` — expected: exit 0. New markup, so this must stay green.

**Manual checks:**
- Both failure states at 320px and 200% zoom, per
  `docs/agents/verifying-your-work.md`. If they cannot be reached in a browser,
  say so explicitly rather than letting the gates stand in for the observation.

**Result (2026-09-16):** `bun run lint`, `bun run build`, `bun run test` (216
passing) and `bun run check:contrast` all exit 0. A mutation check was run
rather than trusting the green: reverting the hook's error-first branch and the
screen's `status === 'ok'` gate fails four of the new tests, so they are
load-bearing.

**Not verified:** the two failure states were **not** observed in a browser at
320px or 200% zoom. Reaching them needs a created-and-unlocked wallet plus a
`server_info` read that fails while `account_info` succeeds, which this machine
could not induce against a live endpoint. The layout risk is small — the
unavailable rows reuse the existing `<dl>` flex-wrap marks and the error reuses
`QueryErrorState` as a sibling in the same outer column as the balance failure
— but it is unobserved, and the gates do not stand in for it. The word
`Unavailable` is longer than the figures it replaces, so a narrow-width
inspection of the two marks is the one thing still worth a human eye.

**Browser pass, 2026-10-04 — RUN (Epic 5 retro item 6).** This closes the "Not verified" note above.

Setup:
- Code under test: `dev` at `3ac02fc` (before epic 8, #33) plus the code diff of branch `fix/retro-5-items-3-5-9` (PR for retro items 3, 5, 9). The reserve handling is unchanged there from `dev`.
- Playwright Chromium 1148, a fresh isolated context, and a CDP virtual authenticator per `docs/agents/verifying-your-work.md`.
- Vite on port 5174, Testnet, with a throwaway wallet funded by the in-app faucet (100 XRP; Spendable 99, Reserved 1 before the fault).
- The reserve read was forced to fail by answering every `server_state` request with an error at the websocket (`page.routeWebSocket`). No app code was changed, and `account_info` was left alone, which is exactly the "reserve fails while `account_info` succeeds" state this story is about. Every screenshot was opened.

| Criterion | Exercised | Observed | Met |
|---|---|---|---|
| The reserve read fails while `account_info` succeeds → the XRP balance still renders | Balances, 390 px light | "100 XRP" with its Live lamp (the lamp belongs to the balance read; see Decided above) | yes |
| Spendable and Reserved report the failure rather than disappearing; the failure goes through `QueryErrorState` | Same | Both rows read "Unavailable"; a "Reserve unavailable" panel with Try again sits under the balance plate | yes |
| After an earlier success, the derived Spendable figure is not left on screen | Spendable was 99 before the fault | Replaced by "Unavailable" | yes |
| Narrow and wide, both themes | 320 px dark, 1280 px dark, 390 px light | "Unavailable" fits beside each label; the panel text wraps; Try again is reachable; nothing clipped | yes |
| Send with the reserve failed | Send, 390 px light, valid destination, tag and amount | Spendable row "Unavailable"; under Amount: "Your spendable balance could not be read, so this amount cannot be checked against it."; Review payment disabled | yes |
| Recovery | Fault removed, Try again on Balances | The figure returns: Send then showed "Spendable 99 XRP" (seen on Send, not re-captured on Balances) | yes |

Not run: 200% zoom. Send has no retry control of its own for the reserve; that is already recorded in the 5.3 pass.
