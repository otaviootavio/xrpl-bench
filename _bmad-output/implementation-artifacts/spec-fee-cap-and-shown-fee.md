---
title: 'A real fee cap on every write, and Send pays the fee it shows'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
baseline_commit: 'c0b65e5f5e6caa6761ee2015e97c7b20e68046c2'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `writes.ts` passes `{ maxFeeXRP: '0.01' }` as `client.autofill`'s second argument, which in xrpl.js 5.1.0 is `signersCount` (verified in `node_modules/xrpl/dist/npm/client/index.js:195` and `sugar/autofill.js:191-235`: `{} > 0` is false, so it is ignored), leaving xrpl.js's default 2 XRP as the only ceiling on any write. Separately, Send's confirm dialog states `fee`'s `open_ledger_fee` (e.g. 10 drops) while autofill computes its own fee with `feeCushion` 1.2 (12 drops), so the dialog states a figure that is not the one charged.

**Approach:** Enforce the cap explicitly in the write choke point — after autofill, before signing, refuse unless `Fee` is a canonical positive drops string no larger than 10 000 drops (0.01 XRP), compared with `BigInt`. Make Send pin the fee: the figure the dialog shows is set as `tx.Fee` before autofill (which then leaves it alone), and the same figure is what the affordability check already uses.

## Boundaries & Constraints

**Always:** Money stays strings/`BigInt`; no `Number()` on a fee. The cap check lives in `submitAndClassify`, so every write (Payment, TrustSet, any future type) passes it; it throws inside the existing `try` so the in-flight depth is still lowered. The refusal message is a full sentence saying nothing was signed or submitted. A fee read above the cap refuses on the Send form with a visible reason (fail closed), for XRP and token sends alike. When Send has no fee figure (token send with the fee read pending/failed), the dialog states the cap as an upper bound.

**Never:** No re-read or refetch of the fee after the unlock (that would make the paid figure differ from the shown one). No `maxFeeXRP` on the `Client` constructor (it would silently clamp a spike fee below what the network wants instead of refusing). No cushion applied to the shown figure. No change to the fee query key, reserve reads, or History.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pinned fee | `submitXrpPayment(..., { feeDrops: '10' })` | tx reaching autofill has `Fee: '10'`; signed and submitted with 10 | N/A |
| At cap | autofilled `Fee: '10000'` | signed and submitted | N/A |
| Above cap | autofilled `Fee: '10001'` (any write) | rejects; `submitAndWait` never called; `in-flight:false` still reported | `FeeAboveCapError`, message names the fee and the cap |
| Malformed fee | `Fee` missing, `'0'`, `'12.5'`, `'abc'`, `'012'` | rejects before signing | same error family, fail closed |
| Fee read above cap | Send, fee read `'20000'` | form refuses with a reason naming the cap; Review disabled | N/A |
| Token send, no fee figure | fee read failed, token amount valid | dialog: fee "could not be read; it will not exceed 0.01 XRP"; autofill computes fee, cap enforced | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/xrpl/writes.ts` -- `submitAndClassify` (choke point; line with `autofill(tx, { maxFeeXRP } as any)`), `MAX_FEE_XRP`, `submitXrpPayment`, `submitIssuedPayment`, `submitTrustSet`. Keep `submitAndClassify`'s signature generic (G-16).
- `src/lib/xrpl/money.ts` -- `isPositiveDrops` (canonical `^\d+$` + `> 0n`; also need no leading zero), `formatXrp`. Home for `MAX_FEE_DROPS` and `feeWithinCap`.
- `src/lib/xrpl/funds-check.ts` -- `checkFunds`; add the above-cap refusal before the asset branch.
- `src/pages/tabs/SendTab.tsx` -- `doSend` passes `feeState.value` (render closure) as `feeDrops` when `feeState.status === 'ok'`; dialog fee sentence (~line 716); catch toasts `err.message`.
- `src/lib/xrpl/reads.ts:122` `fetchRecommendedFeeDrops` -- unchanged figure (uncushioned `open_ledger_fee`).
- `src/lib/xrpl/__tests__/writes.test.ts` -- fake `autofill` overwrites `Fee`; make it keep a preset `Fee` like xrpl.js; replace the "caps the fee autofill may attach" test (asserted only the recorded argument).
- `src/lib/xrpl/__tests__/funds-check.test.ts`, `src/pages/tabs/__tests__/send-address-book.test.tsx` -- add cases.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add resolution notes to the fee-cap entry and the 10→12 entry (line ~136).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/xrpl/money.ts` -- add `MAX_FEE_DROPS = '10000'` and `feeWithinCap(fee: unknown): boolean` (canonical positive drops, no leading zero, `BigInt <= cap`) -- one definition shared by lib and UI.
- [x] `src/lib/xrpl/writes.ts` -- drop the bogus autofill argument; after autofill check `feeWithinCap(prepared.Fee)` else throw `FeeAboveCapError`; add optional `feeDrops` to both payment helpers that sets `Fee` -- the real cap and the pin.
- [x] `src/lib/xrpl/funds-check.ts` -- refuse when `fee.status === 'ok'` and not within cap -- the form says it before the dialog.
- [x] `src/pages/tabs/SendTab.tsx` -- pass the shown fee; dialog bound wording -- shown equals paid.
- [x] tests (writes, funds-check, send) -- cover the matrix; the above-cap test must fail if the check is removed.
- [x] `deferred-work.md` -- resolution notes.

**Acceptance Criteria:**
- Given the fee read says N drops and the operator confirms an XRP or token send, when it is submitted, then the signed transaction's `Fee` is exactly N.
- Given the cap check is deleted from `submitAndClassify`, when the test suite runs, then the above-cap test fails.

## Design Notes

Pinning the uncushioned `open_ledger_fee` means that under rising load a send may queue or expire (already reported as `expired`, no fee consumed) rather than pay more than shown. It never charges more than the dialog stated.

## Verification

**Commands:**
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` -- all green.

**Manual checks:**
- Testnet on port 5177, fresh isolated browser context, new wallet: dialog fee, History's Fee field, and balance delta (amount + fee) agree exactly; screenshots opened.

**Results (2026-10-04, tree of commit `2f8d360` on base `c0b65e5`, after the review patches):**
- Gates: lint, build, test (606/606), check:contrast all green.
- Mutation: with the cap check deleted from `submitAndClassify`, 9 tests fail (implementation pass).
- Browser pass: Playwright Chromium (headless, fresh context, CDP virtual authenticator), dev server on port 5177, new throwaway Testnet wallet funded by the in-app faucet (100 XRP), 1 XRP sent to a faucet-funded address. All met:
  - Confirm dialog: "plus a network fee of 0.00001 XRP" (1280 light, 390 dark, 320 light; nothing clipped).
  - Submitted blob decoded from the WebSocket `submit` frame: `Fee: "10"`.
  - History row 058695AB…09562B: Fee 0.00001 XRP, Success.
  - Balance 100 → 98.99999 XRP, exactly amount + 10 drops.
  - Second run: dialog held open 25 s; the fee was polled twice in that time, the dialog stayed up with Confirm enabled (`readStateOf` keeps `ok` over a background refetch), and the send then signed `Fee: "10"`.
  - Accepted, not fixed: a fee refetch that fails (after one retry) withdraws the dialog until the next poll succeeds — fail closed.
- Gaps: no real token send; no naturally occurring above-cap or pending fee in the browser (unit/component tests only); History and balance captured at 1280 only; the "not re-read after unlock" component test was not mutation-checked.

## Decisions (made unattended, for Otavio to check)

1. Cap enforced as an explicit refusal after autofill, not via `Client({ maxFeeXRP })` — refusing beats silently clamping to an underpaying fee.
2. Shown fee is pinned (set as `tx.Fee`), not re-read at submit — the paid figure is literally the confirmed one; a stale low fee can only fail/expire, never overcharge.
3. No cushion: Send pays `open_ledger_fee` as read (10 drops, not 12) — user pays less; trade-off in Design Notes.
4. Cap stays 0.01 XRP (10 000 drops), the value the code already intended.
5. A fee read above the cap refuses on the form for both XRP and token sends.
6. When Send has no fee figure (token send), the dialog states the 0.01 XRP upper bound instead of a figure.
7. Kept as one spec (cap and shown fee share the write path and the same constant); scope gate "Keep".
8. (review) The fee read is polled every 10 s, so the pinned figure is recent and an above-cap refusal clears by itself.
9. (review) An `expired` send invalidates the fee read, so a retry does not pin the figure that just failed to get in.
10. (review) xrpl.js's special-cost types (AccountDelete, AMMCreate, VaultCreate; fee = owner reserve) are refused by the choke point — nothing builds them today; a future feature must decide.
11. (review) Trust lines still shows no fee and checks none before its confirm (the cap holds at the choke point) — deferred to the ledger, as is a page-level test of the refusal toast.
12. (review) Rejected: a fresh fee re-read inside `submitAndClassify` to catch a pinned fee below the network minimum (bounded by LastLedgerSequence, reported `expired`), and a test for an above-cap refetch while the dialog is open (covered by the existing guard withdrawal).

## Implementation Notes

- Gates green on the worktree (baseline c0b65e5 + this diff, uncommitted): lint, build, test 605/605, check:contrast.
- Mutation check: with the `feeWithinCap` line removed from `submitAndClassify`, 9 tests in `writes.test.ts` fail (above cap, pinned above cap, every write type, six malformed-fee cases); restored afterwards.
- Added beyond the matrix: `isCanonicalPositiveDrops` in `money.ts` (digits, no leading zero), shared by `feeWithinCap`, the `FeeAboveCapError` message and the funds-check refusal, so a malformed fee such as `'012'` is never stated as a figure. `FeeAboveCapError` has two sentences: one naming the fee and the cap, one for a fee that cannot be confirmed; both say nothing was signed or submitted and no fee was spent.
- Dialog with no fee figure: pending says "still being read; it will not exceed 0.01 XRP", failed says "could not be read; it will not exceed 0.01 XRP".
- `checkFunds` checks the cap before the asset branch, so an above-cap fee outranks a missing spendable figure. A fee read that is `ok` but not canonical also refuses there, still naming the cap.
- Special-cost types (AccountDelete, AMMCreate, VaultCreate; fee = owner reserve) are now refused by the choke point. Nothing in `src/` builds one today.
- `TrustLinesTab` already toasts `err.message`, so the refusal sentence reaches the operator there as well as on Send.
- Token-send dialog/pin tests went into `send-destination-error.test.tsx`, whose harness can pick a token. `send-address-book.test.tsx` mocks the asset picker away. The XRP pin and above-cap form refusal are in `send-address-book.test.tsx`.
- Ledger: both deferred-work entries gained a `resolution:` key. No other entry uses that key.
- Browser pass (Playwright Chromium, fresh `browser.newContext()` with CDP virtual authenticator, dev server on 5177, Testnet, new wallet funded by the in-app faucet, 1280 px light theme): 5 XRP to rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh. Dialog said "plus a network fee of 0.00001 XRP". Spendable went from 99 to 93.99999 (delta 5.00001 = amount + 10 drops). History's Fee field for C8C0535E…3BE4F6 said 0.00001 XRP. All three agree, and screenshots (scratchpad `01-dialog.png`, `02-sent.png`, `03-history.png`) were opened. Not covered in the browser: a real token send, the above-cap refusal (needs a forced fee read), other widths and the dark theme. These are covered by unit tests only.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | edge + blind | Pinned fee can be minutes old: `useRecommendedFee` has no `refetchInterval` and `refetchOnWindowFocus` is off app-wide | medium | Confirmed (`App.tsx` defaults; `SendTab.tsx` comment "The hook has no refetchInterval"). Caused by pinning. patch: `refetchInterval: 10_000` |
| 2 | edge + blind | After `expired`, retry pins the same cached fee | low | Real within the cache window; one-line invalidation of `queryKeys.recommendedFee` on `expired`. patch |
| 3 | edge | Above-cap / malformed refusal says "until it falls / read again" but nothing re-reads | medium | Same root cause as #1 (no polling); fixed by the same patch |
| 4 | edge | Pinned fee below the network minimum leaves "Sending…" up until LastLedgerSequence passes | low | Bounded by LastLedgerSequence and reported `expired`, the accepted trade-off; with #1 the figure is ≤10 s old. Rejected: unlikely, fix adds a second read and a new error path |
| 5 | blind | Trust lines: no shown fee, no pre-dialog cap check, cushioned fee | low | Real but pre-existing (Trust lines never stated a fee); cap holds at the choke point. defer |
| 6 | blind | Decisions not recorded in `docs/decisions.md`; `bugfix-sprints.md` M2 reads as done the old way | medium | Confirmed (no §14; M2 at line 104). Next reader of M2 would believe the cap was in effect. patch |
| 7 | blind | Cap formatted two ways (`formatXrp` vs `dropsToXrpString + ' XRP'`) | low | Confirmed; direct correction. patch |
| 8 | blind + verif | No page test for `FeeAboveCapError` reaching the toast | low | Catch blocks pre-existing and pass `err.message`; defer |
| 9 | blind | No test for the fee refetching above cap while the dialog is open | low | Covered by the existing `!canSend → setConfirmingFor(null)` withdrawal, already tested for other guard closures. Rejected |
| 10 | blind | Malformed-fee funds-check test runs token only and asserts text both branches share | low | Confirmed; test-only correction. patch |
| 11 | blind | No real-network check recorded for shown = paid | low | Addressed by the Testnet browser pass in Verification, not by code |
| 12 | verif | No test that the fee is not re-read after the unlock | medium (gap) | Pre-verified gap. patch |
| 13 | verif | Pending-fee dialog cap suffix and no-pin not tested | low (gap) | Pre-verified gap. patch |
