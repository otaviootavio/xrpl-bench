---
title: 'Split SendTab: the destination check and the funds check leave the screen, and one read-state primitive feeds the readouts and the amount field'
type: 'refactor'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '434d69f'
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/money.md'
  - '{project-root}/docs/agents/ledger-io.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-retro-2026-09-30.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-retro-5-send-guards-fail-closed.md'
---

## Intent

**Problem:** Epic 5 retro action item 8 (findings A1, A2, P4). `src/pages/tabs/SendTab.tsx` held 13 responsibilities in one component, including a clock-driven freshness subsystem with two effects and the affordability check. Its "what do we know about this read" logic was hand-built once per consumer: the spendable reason, the fee reason, the trust-line reason, the fee row, the Spendable row and the dialog phrase. The retro traced four live defects (F1, F2, F4, F5) to the seams between those hand-built copies.

**Approach:** a refactor that preserves behaviour. Nothing the operator sees or can do changes.

- **`src/lib/read-state.ts`** (new): `ReadState<T>` = `ok` (with the value) / `pending` / `failed` / `not-activated`. `readStateOf(query)` maps any query result to it, checking the error before the data, so a value TanStack kept from an earlier success is never reported as current.
- **`src/lib/xrpl/funds-check.ts`** (new, pure): `spendableReadState` (maps `useSpendableBalance` to the primitive), `heldTokenLines`, `selectedTokenLine`, `tokenAssetKey`, and `checkFunds({ amount, amountValid, asset, spendable, fee, trustLines })`. `checkFunds` returns a `FundsRefusal { reason, pending }` or `undefined`. The sentences and their precedence are moved word for word from SendTab.
- **`src/hooks/useDestinationCheck.ts`** (new): owns `observedNow`, the expiry timer and the `visibilitychange` re-read of the clock. It returns `{ query, info, destinationValid, checkedAt, ok, stale, pending }` with the same definitions SendTab had.
- **`src/components/wallet/ReadingValue.tsx`** (new): the readout `<dd>` for one `ReadState<string>`. A figure renders as a figure, `pending` as the ellipsis, and `failed` and `not-activated` as "Unavailable". The Unavailable classes now live in one place.
- **SendTab** consumes all four. It goes from 807 lines (at the retro) and 904 (at baseline) to 731. The confirm intent, the render-time withdrawal of the intent, the preflight report with its `(network, destination, asset)` stamp, and `doSend` stay where they were, unchanged.

## Boundaries & Constraints

**Always:**
- The split preserves behaviour. Every existing Send test passes without edits; the existing test files only gain appended blocks (`git diff origin/dev -- 'src/**/__tests__/**'` shows zero removed lines).
- Money stays as strings. `checkFunds` uses `amountPlusFeeFits` and `compareDecimalStrings` from `money.ts`, and formatting happens only in `ReadingValue`'s `format` and the refusal sentences, as before.
- Every non-`ok` state fails closed. `checkFunds` treats anything that is not `ok` as a refusal, and `heldTokenLines` offers nothing unless the read is `ok`.
- The rules from `spec-retro-5-send-guards-fail-closed.md` stay as they were. The intent is withdrawn during render when `!canSend`, `confirmOpen` is pinned to `checkedAt`, and the preflight report is stamped with `(network, destination, asset)` and retires on the stamp.

**Never:**
- No new behaviour. Nothing new is refused, no new read is made, and no new copy is added.
- `lib/` imports nothing from `hooks/`. `spendableReadState` takes the hook's shape structurally (AD-1, checked by `check-layering`).
- The destination check does not use `ReadState`. A2 lists "the destination triad" among the hand-built states, but that triad carries `stale` (a check that succeeded and then aged out), which the four-state primitive deliberately leaves out. So `useDestinationCheck` keeps its own `ok`/`stale`/`pending`, and a failed check is still `query.isError`.
- No other screen changes. BalancesTab and `Readout.tsx` still hand-build their "Unavailable" rows (A2 names `ScaleMark.unavailable`). Bringing them onto the primitive is the next step for the primitive, on another screen, and is out of scope here.

## I/O & Edge-Case Matrix

| Input state | Before (baseline 434d69f) | After |
|---|---|---|
| Fee read in error with a value kept from an earlier success | Row says "Unavailable"; XRP amount refused with "could not be read"; dialog says "could not be read" | Same (`readStateOf` → `failed`) |
| Fee read in flight | Row shows "…"; refusal says "still being read", amount field not painted invalid | Same (`pending`) |
| Spendable `loading` / `not-activated` / `unavailable` | Three different sentences; Spendable row says "Unavailable" for all three | Same. The row stays deliberately collapsed (see Decisions) |
| Spendable failed while fee in flight | The failed sentence wins | Same (`find(!pending) ?? [0]`) |
| Trust lines in error with lines kept from an earlier success | Picker offers only XRP; token refused with "could not be read"; panel shown | Same (`heldTokenLines(failed)` → `[]`) |
| Trust lines OK but the selected line is frozen, zero or gone | "You hold none of this token that can be sent…" | Same |
| Destination answer about a different input / aged out / in error | `ok` false; aged out shows the "out of date" alert; in error shows the failed panel | Same (`useDestinationCheck`) |
| Tab hidden past the window, then visible again | Clock re-read on `visibilitychange`; check goes stale | Same |

## Code Map

- `src/lib/read-state.ts`: the primitive and `readStateOf`.
- `src/lib/xrpl/funds-check.ts`: the funds check and the token-line helpers.
- `src/hooks/useDestinationCheck.ts`: the destination check with its freshness subsystem.
- `src/components/wallet/ReadingValue.tsx`: the readout `<dd>`.
- `src/pages/tabs/SendTab.tsx`: consumes the four modules above.
- Tests: `src/lib/__tests__/read-state.test.ts`, `src/lib/xrpl/__tests__/funds-check.test.ts`, `src/components/wallet/__tests__/reading-value.test.tsx`, and one appended block in `src/pages/tabs/__tests__/send-destination-error.test.tsx` ("the readout rows render from the read state").

## Tasks & Acceptance

- [x] **Primitive.** Given a query in error with data kept from an earlier success, when it is mapped, then it is `failed`. Given no data and no error, it is `pending`. An empty list is `ok`.
- [x] **Funds check, extracted.** Given each spendable, fee and trust-line state, when `checkFunds` runs, then it returns the sentence SendTab returned at baseline, with the same `pending` flag and the same precedence (a failure outranks a read in flight; the spendable figure is named first between two of the same kind).
- [x] **Destination check, extracted.** Given the existing SendTab suite (destination freshness, stale, visibility, input-match), when run against the extracted hook through the screen, then it passes unchanged.
- [x] **Readouts on the primitive.** Given each state, when the fee row renders, then it shows the figure, "…" or "Unavailable". The Spendable row says "Unavailable" for every state without a figure, as at baseline. This is pinned so that fixing it later is a deliberate test change.
- [x] **The amount field consumes the primitive** through `checkFunds(...).pending`: a read in flight never paints the field invalid.
- [x] **F6 reconsidered.** Left deferred (see Decisions).

## Decisions (made unattended, for Otavio to check)

1. **The Spendable row still says "Unavailable" while its read is in flight.** The deferred-work entry from spec-5-3 says the row should take the primitive's state; with this split, that is now a one-line change (`state={spendableState}`). It was not made, because it changes what the operator sees, and this unit is behaviour-preserving. A test pins the current wording, so the fix will flip one assertion on purpose (mutation-checked: passing `spendableState` straight through fails that test).
2. **F6 (the post-unlock probe re-checks only the destination) stays deferred.** Widening it means re-reading spendable, fee and trust lines after the unlock and refusing on the result. That is new reads plus a new refusal: new behaviour. The split makes it cheap when it is wanted, because `checkFunds` is pure and can be fed fresh `ReadState`s from `fetchQuery` inside `doSend`. The cost of leaving it is one fee (`tecUNFUNDED_PAYMENT`), not funds, as the retro decided.
3. **Five more ledger entries were triaged "defer to item 8"**, and each is a user-visible behaviour change: the `aria-disabled` Review button with a visible reason for each `canSend` term, the XRP fee check on a token send, the offline (`paused`) read state, the Spendable row (Decision 1), and the 320 px wrap of the outcome row. None of them is in this unit. They are re-triaged in `deferred-work.md` under "Re-triaged from: SendTab split (epic 5 retro item 8)". The proposal is a follow-up story, "Send screen behaviour fixes", to run before epic 7 reopens the write path, so closing item 8 does not leave them without an owner.
4. **`paused` was not added to the primitive.** The ledger suggested it would join the primitive, but a fifth state with no renderer and no consumer is dead code, and rendering it is new behaviour. It belongs with the follow-up story.
5. **`readStateOf` tests `data` for truthiness**, as the code it replaced did, so an empty string is `pending`, not `ok`. No current read returns `''`. Any `[]` is `ok`.

## Review Triage Log

Adversarial self-review of the diff. Each line is a finding followed by its verdict.

| # | Finding | Verdict |
|---|---|---|
| 1 | `selectedTokenLine` returns `undefined` for XRP where the old code had `null`; does any consumer test `=== null`? | False. The only uses are `!selectedLine` (SendTab:578) and `checkFunds`, and both are truthiness tests. |
| 2 | `spendableReadState` checks `spendableDrops` before the hook's status. Could a figure from an `unavailable` read get through? | Not a new risk: the baseline also branched on `spendableDrops` alone, and `useSpendableBalance` returns `null` drops on `unavailable` (`useSpendableBalance.ts:64`). A status of `ok` with no figure maps to `failed`, never to a figure (pinned). |
| 3 | `readStateOf` never returns `not-activated`, so `tokenLineReason`'s `not-activated` case cannot be reached | True, harmless. The case keeps the switch exhaustive and gives the right sentence if a caller ever passes one. |
| 4 | The `matchesInput` term in `ok` survives mutation alone, and so does the `matchesInput` term in `expiresAt` | Redundant pair, as at baseline: `fresh` requires `expiresAt !== null`, which requires `matchesInput`. Removing both together fails 2 existing SendTab tests. |
| 5 | Moving the clock into a hook: does `observedNow` still start at mount and only move forward? | Yes. `useState(Date.now)` and `Math.max(prev, …)` were moved verbatim. The timer and visibility mutations each fail existing tests (below). |
| 6 | `useDestinationCheck` imports `./useDestinationInfo` relatively; do the screen tests, which mock `@/hooks/useDestinationInfo`, still reach it? | Yes. Vitest resolves both paths to the same module, and the freshness mutation fails 9 existing SendTab tests. |
| 7 | The SendTab comment on the Spendable row says the collapse is "recorded as deferred" | True: the spec-5-3 entry, and now the re-triage section as well. |

## Verification

**Commands** (on the rebased branch, base `434d69f`): `bun run lint` · `bun run build` · `bun run test` (524 tests, 44 files) · `bun run check:contrast`. All exit 0.

**Mutation checks.** Each mutation was applied, tested, then reverted.

| Mutation | Result |
|---|---|
| `readStateOf`: `!data` checked before `isError` | 10 tests fail |
| `spendableReadState`: `ok` with no figure becomes a figure | 1 fails |
| `checkFunds`: `missing[0]` replaces "a failure outranks a read in flight" | 2 fail |
| `useDestinationCheck`: drop `observedNow < expiresAt` | 9 existing SendTab tests fail |
| `useDestinationCheck`: drop `matchesInput` from `ok` alone / from `expiresAt` alone | survive (redundant pair, triage #4); both together: 2 fail |
| `useDestinationCheck`: the `visibilitychange` handler does nothing | 1 fails |
| `useDestinationCheck`: the expiry timer does nothing | 3 fail |
| `ReadingValue`: `pending` renders "Unavailable" | 2 fail |
| `heldTokenLines`: a frozen line is offered | 2 fail |
| `checkFunds`: token over-balance comparison removed | 2 fail |
| SendTab: Spendable row passes `spendableState` straight through | 1 fails (Decision 1's pin) |

**Browser pass, 2026-10-04.** Playwright Chromium 1148, driven by a standalone script, with a fresh `browser.newContext()` and a CDP virtual authenticator (ctap2, internal, UV, PRF). Vite dev server on :5174, serving this branch's working tree. Testnet, with a throwaway wallet created and funded through the in-app faucet. No existing wallet or profile was touched. Failed and in-flight reads were forced at the WebSocket (`routeWebSocket`: an error reply, or no reply), not in app code. Every screenshot cited below was opened and checked.

| Scenario | Widths / themes | Observed | Met |
|---|---|---|---|
| Both reads OK | 390 light, 1280 dark, 320 dark, 390 dark | Fee 0.00001 XRP, Spendable 99 XRP, Review enabled (`s2-normal-390-light`) | yes |
| Over-balance XRP amount (1000000) | same four | "That's more than your spendable balance (99 XRP) once the network fee is included." shown in the error colour under the field, Review disabled, in all four shots (`s2-over-balance-320-dark`). The field's `aria-invalid` value for this scenario was not captured in the log I read. | yes |
| Destination check ages out after 30 s, then "Check again" | 390 light, 1280 dark | "Destination check is out of date" alert, tag label "(requirement unknown)", Review disabled (`s2-stale-390-light-stale`); after Check again the alert is gone and Review is enabled | yes |
| Fee read forced to fail | four | Row "Unavailable", "could not be read" sentence, field `aria-invalid=true`, fee panel with Try again, Review disabled (`s2-fee-failed-1280-dark`) | yes |
| Fee read held in flight | four | Row "…", "still being read" sentence, field `aria-invalid=false`, Review disabled (`s2-fee-pending-320-dark`) | yes |
| Own account_info held in flight | 390 light, 1280 dark, 390 dark | "Your spendable balance is still being read…", Spendable row "Unavailable" (the collapse kept by Decision 1), field not invalid (`s2-spendable-pending-390-light`) | yes (as at baseline) |
| account_lines forced to fail | 390 light, 1280 dark, 390 dark | "Token balances could not be read" panel, XRP send still enabled (`s2-lines-failed-390-dark`) | yes |
| Real 1 XRP send to genesis | 390 light, 390 dark | Confirm dialog names fee 0.00001 XRP (`s2-send-390-dark-confirm`); outcome Validated, "Payment sent.", Spendable 99 → 97.999988 (`s2-send-390-light-outcome`) | yes |

**Gaps, stated plainly:**
- No real token send. A faucet-fresh account holds no trust line, so the token branch of `checkFunds` was covered only by unit and screen tests, and in the browser only through the failed-read panel.
- The not-activated account state was not exercised in the browser; it is covered by tests only.
- The stale-check scenario ran in two of the four width/theme combinations.
- The pass compares against the behaviour recorded in the earlier send-guards pass and the baseline tests, not against a side-by-side baseline run in the same session.
