---
title: 'Story 5.3 — a fee that could not be read does not become a fee of zero'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '656d3078fa38575ad6101358ef4a448c342b001d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `SendTab.tsx:174` passes `fee.data ?? '0'` into the XRP
affordability check, so a fee read that failed — or has not landed yet — is
substituted with a fee of zero and an amount that does not fit is declared
affordable. The same read is reported twice more as something other than a
failure: `:469` renders `'…'`, which is the pending treatment, and `:534` tells
the operator the send costs "the current rate". `useRecommendedFee` has no
`refetchInterval`, so a failed read stays failed with nothing on screen
admitting it and no way to re-read.

**Approach:** Treat the fee read as three distinct outcomes — in flight,
failed, succeeded — at all three sites, and fail the XRP funds check closed on
the first two, exactly as story 5.2 did for the spendable figure. The readout
row keeps its place and states unavailability in words with a retry beside it.
No fee value is ever fabricated, floored, or ceilinged.

**Accepted consequence:** while the fee read is failing, every XRP amount is
refused with the reason in visible text. That is the intended reading of "a
guard on a money-moving action fails closed"; the retry is what makes it
recoverable. The submitted fee is unaffected either way — `writes.ts:61` lets
`client.autofill` attach it, so no code path signs a zero fee.

**Decided (human, at approval):** a token send is **not** blocked by a failed
fee read. No arithmetic on a token send uses the fee figure, so nothing is
decided against a fabricated one; the confirm dialog states that the fee could
not be read and the send proceeds. Blocking it would refuse sends whose
affordability never depended on the fee — a user-visible change beyond this
story.

## Boundaries & Constraints

**Always:**
- The three states are worded differently. Collapsing *in flight* into *failed*
  is the defect story 5.2's review round already caught once.
- The funds check fails closed: no fee figure, no claim that an amount fits.
- The fee row stays where it is and states unavailability; a screen with fewer
  numbers on it than before is the defect, not the fix.
- Reuse `QueryErrorState` and the `text-readout-muted` pair `check-contrast.mjs`
  already measures. No new tone token, no new colour, no `check-contrast` edit.
- Money stays a string end to end; nothing `Number()`s a drops value.

**Never:**
- Never substitute a "safe" upper-bound or fallback fee. That re-fabricates the
  figure this story exists to remove.
- Never change `useRecommendedFee`'s shape. It returns the raw query, so
  `isError`, `isLoading` and `refetch` are already in reach at the call site;
  5.2's hook rewrite was needed because that hook derived a value, and this one
  does not.
- Never touch `writes.ts`, `money.ts`, `amountPlusFeeFits`, or the autofill cap.
- Never widen the destination-check guard, the spendable-balance wording, or
  anything story 5.1 and 5.2 settled.
- Never add the missing XRP-fee affordability check for *token* sends — it has
  never existed, it is a different defect, and it goes to `deferred-work.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Fee read succeeds | `fee.data = '12'`, spendable known | Row shows the fee; amount checked against amount+fee | N/A |
| Fee read in flight | `fee.isLoading`, XRP asset, amount entered | Amount refused, wording says the fee is still being read; row shows the pending treatment, not a failure | Not an error — no `QueryErrorState` |
| Fee read failed | `fee.isError`, XRP asset, amount entered | Amount refused, wording says the fee could not be read; row states unavailability in words with a retry beside it | Inline via `QueryErrorState`, never the notice band |
| Fee failed, retry activated by keyboard | `fee.isError`, retry focused, Enter | `refetch` is called | N/A |
| Fee failed, amount within balance anyway | `fee.isError`, amount well under spendable | Still refused — absence of a prohibition is not permission | N/A |
| Fee failed and spendable failed | both error | Each read reports its own failure once; the spendable wording from 5.2 is unchanged | Two inline reports |
| Fee failed, confirm dialog | `fee.isError`, XRP | Dialog unreachable: `canSend` is false via `fundsError` | N/A |
| Fee failed, token send | `fee.isError`, asset is a token | Send is NOT blocked; the dialog states the fee could not be read instead of naming a rate | Stated, not guarded |

</frozen-after-approval>

## Code Map

- `src/pages/tabs/SendTab.tsx:174` — the defect. `fee.data ?? '0'` inside
  `fundsError`. `:97` the hook call; `:277` `canSend` already includes
  `!fundsError` and `:197` `doSend()` re-asserts `!canSend`, so widening
  `fundsError` hardens the submit path with no second guard needed.
- `src/pages/tabs/SendTab.tsx:91-96` — `spendableUnknownReason`, the
  three-state wording 5.2 established. Mirror its shape; do not edit it.
- `src/pages/tabs/SendTab.tsx:466-470` — the `panel-well` `<dl>`. The fee is a
  bespoke `<dt>/<dd>` pair, **not** a `ScaleMark`, so 5.2's `unavailable` prop
  does not apply here — mirror its wording and its `text-readout-muted`
  treatment instead. `:469` is the `'…'` that hides the failure.
- `src/pages/tabs/SendTab.tsx:533-535` — the confirm-dialog copy. Resolution
  depends on the Open Question.
- `src/components/wallet/QueryErrorState.tsx:48` — `{ title, description,
  onRetry }`. Place it as a sibling in the outer flex column, as `:322` and
  `:359` already do on this screen.
- `src/hooks/useRecommendedFee.ts:6` — raw `useQuery`, `staleTime` 10s, **no**
  `refetchInterval`. Read only; the retry is the sole recovery path.
- `src/pages/tabs/__tests__/send-destination-error.test.tsx:12` — mocks
  `useRecommendedFee` as the fixed constant `{ data: '12' }`; cannot express a
  fee failure until the fixture becomes configurable, the way 5.2 made the
  spendable fixture configurable in this same file.
- `src/hooks/__tests__/query-key-wiring.test.tsx` — has no `recommendedFee`
  case. `serverReserves` is the same network-scoped shape and its absence cost
  story 5.1 a patch round.
- **Reuse, do not change:** `QueryErrorState`, `money.ts`, `amountPlusFeeFits`,
  `writes.ts`, the `Alert` tones, `spendableUnknownReason`.

## Tasks & Acceptance

**Execution:**
- [x] `src/pages/tabs/SendTab.tsx` — name the fee's three states and stop
      passing a fabricated fee into `amountPlusFeeFits`; the funds check fails
      closed on loading and on error with wording distinct to each.
- [x] `src/pages/tabs/SendTab.tsx` — report the failed fee read where the
      figure belongs: the row keeps its place and states unavailability, with a
      `QueryErrorState` retry; the pending treatment stays for a read in
      flight.
- [x] `src/pages/tabs/SendTab.tsx` — the confirm-dialog copy states that the
      fee could not be read rather than naming "the current rate"; the token
      send itself stays permitted.
- [x] `src/pages/tabs/__tests__/send-destination-error.test.tsx` — make the
      `useRecommendedFee` fixture configurable; pin each matrix row, including
      that a within-balance amount is still refused and that loading and error
      do not share wording.
- [x] `src/hooks/__tests__/query-key-wiring.test.tsx` — add the
      `recommendedFee` case against the real `QueryClient` the file uses.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — record that a
      token send never checks it can afford its XRP network fee.

**Acceptance Criteria:**
- Given the fee read has failed, when an XRP amount inside the spendable
  balance is entered, then it is not declared affordable and the reason names
  the fee, not the balance.
- Given the fee read is in flight, when an amount is entered, then the refusal
  says the fee is still being read and no failure is reported anywhere on
  screen.
- Given the fee read has failed, when Send renders, then the Network fee row is
  still present and says so in words, and the retry works by keyboard alone.
- Given the fee read succeeds, when an amount is entered, then behaviour is
  exactly as before this story.
- Given the fee read has failed, when a token amount is entered, then the send
  is still permitted and the confirm dialog says the fee could not be read.
- Given `bun run lint`, `bun run build`, `bun run test` and
  `bun run check:contrast`, when each runs, then all four exit 0.

## Implementation Notes

- The fee's three states are derived as `feeDrops = !fee.isError && fee.data ? fee.data : null`
  rather than from `fee.isLoading`. The hook has no `enabled`, so "no data and
  no error" genuinely is a read in flight; deriving it this way also drops a
  value retained across a failed refetch, which §12 rule 2 requires and an
  `isLoading` test would not have caught.
- The fee check sits *after* the spendable check inside the `asset === 'XRP'`
  branch of `fundsError`, so when both reads fail the amount field carries the
  spendable wording story 5.2 settled and the fee reports itself on its own row
  and panel. Keeping it inside that branch is also what keeps the token path
  clear of the XRP-fee check this story is forbidden to add.
- The `QueryErrorState` renders whenever the fee read has failed, not only for
  an XRP asset: the Network fee row is not asset-gated either, and a panel that
  appeared and vanished with the asset picker would be a second thing the
  screen says about one read. Its wording therefore states the hold as applying
  to XRP and explicitly says a token send is not held, so it is true on both.
- The confirm dialog carries all three wordings even though an XRP send cannot
  reach it without a fee figure — the reachable case is a token send, and the
  in-flight sentence keeps *pending* from borrowing *failed*'s words there too.
- `send-destination-error.test.tsx` now mocks `@/components/ui/select` as a
  native `<select>`. Radix's Select needs pointer capture jsdom does not
  implement; the asset picker is the means to the token-send assertions, not
  their subject.

## Spec Change Log

## Review Triage Log

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Fee query succeeds with `data === undefined` (missing `open_ledger_fee`) leaves `…` forever, no retry, XRP send held (edge-case; blind-hunter filed the same claim) | `false` | Probed TanStack Query v5.102 directly: a `queryFn` resolving `undefined` throws `data is undefined` and the query lands in `status: 'error'`. Success-with-no-value is not representable, so `fee.isError` is true and the row already says *Unavailable* with a retry. The cited outcome cannot occur. | rejected |
| 2 | Offline `fetchStatus: 'paused'` is a fourth state with no rendering: says "still being read", offers no retry, holds XRP sends indefinitely (blind-hunter + edge-case, same root cause) | `medium` | Real. `App.tsx:24` builds the client with no `networkMode`, so the default `'online'` pauses. Confirmed no screen in `src/` branches on `fetchStatus`/`isPaused` — the gap is every ledger read's, not this diff's, and 5.2's spendable wording has it identically. What this change altered offline is that an XRP send is now refused instead of declared affordable at a fee of zero, which is the improvement. | defer |
| 3 | Confirm dialog's "still being read" branch is reachable (token send, fee in flight) but no test pins it (verification-gap; blind-hunter filed the same claim) | `medium` | Pre-verified by the gap layer and corroborated: deleting the branch leaves 51/51 green. Reachable because a token send is deliberately unblocked. It is the pending-vs-failed collapse the epic exists to remove. | patch (entry A) |
| 4 | The success fee figure is unasserted at both render sites — row and dialog (verification-gap) | `medium` | Pre-verified: replacing the row's success branch with `…` and the dialog's figure with `formatXrp('999999999')` ships 40/40 green. Only the *absence* of failure wordings is checked, which the new three-branch chains satisfy in several wrong ways. Bites this spec's own AC "behaviour is exactly as before this story". | patch (entry A) |
| 5 | Recovery is asserted only up to the `refetch` call; nothing pins that a successful re-read restores the figure and reopens the guard (blind-hunter) | `low` | Confirmed at `send-destination-error.test.tsx:661-674`: the test asserts `refetch` was called once and stops. No test re-points the mock at success. The `QueryErrorState` description promises "held until this read succeeds"; that half is unpinned. | patch (entry A) |
| 6 | `expect(screen.getAllByText('Unavailable')).toHaveLength(2)` couples the fee test to the Spendable row's wording (blind-hunter; the implementation agent flagged it too) | `low` | Confirmed at `:687`. Correct today only because the Spendable row also renders `Unavailable`; it pins a rendering this story does not own and will mislead whoever rewords that row. | patch (entry B) |
| 7 | The Spendable row renders `Unavailable` for *loading* and *not-activated* as well as *failed* (blind-hunter) | `medium` | Confirmed: `SendTab.tsx:511-514` branches on `spendableDrops` alone, and `useSpendableBalance.ts:64,70,78` returns null for `unavailable`, `loading` **and** `not-activated`. A read in flight and a successful read of an absent account both render as the failure word — the distinction epic 5 exists to keep. Written by story 5.2, not by this diff; the guard still fails closed, so it is a wrong word, not a wrong permission. | defer |
| 8 | `deferred-work.md` names `tecUNFUNDED_FEE`, which is not a real result code (blind-hunter) | `low` | Confirmed against `ripple-binary-codec` `definitions.json`: `tecINSUFF_FEE` (136) and `terINSUF_FEE_B` (-97) exist; `tecUNFUNDED_FEE` does not. This diff wrote that line, and a false result code in the project's own record is the kind of statement this repo refuses to make. | patch (entry C) |
| 9 | `feeRead()` fixture computes `isSuccess`/`isLoading`, which the component never reads and which are inconsistent for `{ data: '12', isError: true }` (blind-hunter) | `low` | Confirmed at `:126-130`; `SendTab` branches only on `data`, `isError`, `refetch`. Harm is developer-facing and named: a reader may infer the component keys off `isLoading`, which the Implementation Notes say it must not. Fix is a deletion. | patch (entry D) |
| 10 | The keyboard criterion is verified by proxy (`tagName`/`disabled` + `fireEvent.click`), not by a real key press (blind-hunter) | `low` | Real as stated, but the repo has no `user-event` dependency, jsdom does not synthesise a click from Enter on a button, and story 5.1's retry test at `:332` uses the identical proxy. Adding a dependency to close it is more than a direct correction, and the proxy's reasoning (a real enabled `<button>` with `onClick` is Enter-activatable) is sound. | rejected |
| 11 | The `@/components/ui/select` mock is file-global and strips the picker's accessible name (blind-hunter) | `low` | Overstated on checking: no pre-existing test in the file ever drove the asset picker — `:221` switches assets by re-mocking `useDestinationInfo`, not by touching the control — so the mock replaces a rendered-but-undriven component and removes no existing coverage. `vi.mock` is file-hoisted, so scoping it to one `describe` is more than a direct correction. | rejected |
| 12 | Spec hygiene: Code Map line numbers are stale after this change; Verification lists commands with no recorded results (blind-hunter) | `low` | The cited staleness is real (the defect moved from `:174` to `:198`, the row to `:493-502`). Rejected by rule: the fix is an edit to this build's spec. | rejected |


## Verification

**Commands:**
- `bun run lint` — expected: exit 0
- `bun run build` — expected: exit 0, `tsc -b` clean
- `bun run test` — expected: exit 0, new fee cases passing
- `bun run check:contrast` — expected: exit 0, no new token measured
