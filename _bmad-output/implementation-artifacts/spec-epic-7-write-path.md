---
title: 'Epic 7 — every write reaches the choke point, and the interlock can count'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '9a2e1e0'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/GAP-REGISTER.md'
---

## Intent

**Problem:** AD-9 says every transaction this app signs goes through
`submitAndClassify` in `lib/xrpl/writes.ts`. That function owns the in-flight
signal that `useAppUpdate` reads as its only interlock (US-5: nothing may apply
an update while a transaction is in flight). Two defects made the rule
unobeyable and the signal untrue:

- **G-16.** `submitAndClassify` was not exported, and its parameter was typed
  `Payment | TrustSet`. A new transaction type (Escrow, Check, Payment Channel,
  `AccountSet`, multi-sign) could not reach it without editing `writes.ts`. A
  write that bypassed it never raised the in-flight signal.
- **G-17.** The signal was a boolean, set true on entry and false in `finally`.
  Two writes can overlap: the flag is global because Radix unmounts inactive
  tabs, so a payment and a trust-line change can both be awaiting validation.
  When that happens, the first write to settle cleared the flag while the
  second was still live, and a waiting service worker could then be activated
  under it.

There is also a third item, **G-26 (refuted)**. The service-worker registry
never clears its `waiting` flag. This is correct: after a failed activation the
worker really is still waiting. But that reason was recorded only in
`GAP-REGISTER.md`, where the next reader of `sw-register-core.ts` would not
find it.

**Approach:** Export the choke point and type it on `SubmittableTransaction`.
Have it hold a module-level depth. The reporter is told `true` only on the 0→1
transition and `false` only on 1→0, so the store's boolean now means "depth
above zero". For 7.3, add a comment at `waiting = true`, plus tests named for
the reason, whose failure messages name AD-15.

## Boundaries & Constraints

**Always:**
- AD-1: `lib` reports upward and never reaches upward. The depth lives in
  `writes.ts`. The reporter's signature (`(inFlight: boolean) => void`), the
  store's `txInFlight: boolean` and the wiring in `App.tsx` do not change.
- The three wrappers (`submitXrpPayment`, `submitIssuedPayment`,
  `submitTrustSet`) do not change, and no caller gains a cast.
- The depth is raised before the first network call. Every path out of the
  choke point lowers it: validated, claimed, failed, expired, thrown, and a
  connect failure.

**Never:**
- No production path resets the depth. Only a write that has settled lowers
  it. The only reset is the test seam (`resetTxInFlightReporter`).
- No behaviour change in 7.3. `waiting` is still never set false.
- Nothing activates an update on its own. `useAppUpdate` is unchanged.
- No fix for the fee-cap finding below. It changes what users pay, and the fix
  belongs in `client.ts`, which is outside this epic (rule 5). It is reported
  instead.
- No UI, copy or token change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected reporter calls | Error handling |
|---|---|---|---|
| One write, any outcome | depth 0 | `true` before connect/autofill, `false` last | Throw is re-raised after `false` |
| A non-Payment/TrustSet type | `AccountSet` via `submitAndClassify` | `true` … `false`; autofill receives the `AccountSet` | — |
| Two writes overlap, first validates | depth 0→1→2→1 | one `true`; no `false` after the first settles; `false` after the second | — |
| Two overlap, first throws | first rejects (not expiry) | still raised; `false` only after the second | Thrown error reaches its caller |
| Two overlap, first expires | validated index past `LastLedgerSequence` | still raised; `false` only after the second | `expired` outcome |
| Both throw, then a third write | depth 2→0, then 0→1→0 | `true,false,true,false`: no stranding | — |
| Releasing the held client throws | `release()` throws in `finally` | depth still lowered (nested `finally`) | Release error propagates |
| Reporter throws on `true` | reporter throws | `finally` still lowers the depth | Write rejects |
| Activation rejects | `updateSW(true)` rejects | `isUpdateWaiting()` stays `true`; `applying` back to false; `updateReady` stays true | Caught in `applyUpdate` |
| Update requested with a write in flight | `txInFlight` true | `updateSW` not called; `blockedReason` set | — |

## Code Map

- `src/lib/xrpl/writes.ts`: `submitAndClassify` is exported and typed on
  `SubmittableTransaction`. It uses a module-level `inFlightDepth`, reports
  only on the 0↔1 transitions, and has a nested `finally` so a throwing
  release cannot strand the depth. `resetTxInFlightReporter` also zeroes the
  depth (test seam). The `tx as any` cast on `autofill` was removed, because
  the widened type now matches `autofill`'s generic. The options cast was left
  exactly as it was (see Findings).
- `src/store/app-store.ts`: the doc comment on `txInFlight` now says "any
  write; depth above zero". The comment was the only change.
- `src/lib/sw-register-core.ts`: added a comment at `waiting = true`. It
  explains why the flag is never cleared, and names AD-15, G-26 and the tests
  that pin it. The comment was the only change.
- `src/lib/xrpl/__tests__/writes.test.ts`: one 7.1 test and four 7.2 overlap
  tests, which use a fake client whose `submitAndWait` calls wait until the
  test settles them.
- `src/lib/__tests__/sw-register-core.test.ts`: two 7.3 tests.
- `src/hooks/__tests__/useAppUpdate.test.tsx`: one interlock test (7.2, second
  AC) and one test for the failed activation (7.3). They share a small
  `setupHook` helper so the existing `setup` stays untouched.

## Tasks & Acceptance

**7.1: any transaction type can reach the write choke point**
- Given `writes.ts`, when the story is complete, then `submitAndClassify` is
  exported and its parameter is `SubmittableTransaction`. *Pinned by
  `tsc -b` in `bun run build`. `tsconfig.app.json` includes `src`, so the test
  file is typechecked. Narrowing the type back gives TS2345 on the test's
  `AccountSet`, and un-exporting it gives TS2459.*
- Given the two existing callers, when the type is widened, then they compile
  unchanged and none gains a cast. *The wrappers' diff is empty.*
- Given a transaction type that is neither `Payment` nor `TrustSet`, when it is
  submitted through the exported choke point, then the in-flight signal is
  raised before autofill and cleared last. *Test: "submits an AccountSet
  through the exported choke point and raises the in-flight signal for it".*

**7.2: two overlapping writes cannot clear each other's in-flight signal**
- Given two overlapping submissions, when the first settles, then the signal
  is still raised, and it clears only when the last one settles. *Test: "stays
  raised across the first settlement…". Its failure message names AD-9.*
- Given a submission that throws, or one that returns `expired`, then the
  depth still decrements. *Tests: "…first of two overlapping writes throws…",
  "…expires…", and "does not strand the signal…", which checks that the next
  write is a new 0→1 transition.*
- Given `useAppUpdate`, when `txInFlight` is raised, then `applyUpdate` does
  not activate the worker and `blockedReason` is set. *Test: "does not activate
  the waiting worker, and says why, while txInFlight is raised".*

**7.3: a failed update activation keeps telling the truth about what is waiting**
- Given an `applyUpdate` whose activation rejects, then `isUpdateWaiting()`
  stays true, and a subscriber that arrives afterwards is still told a worker
  is waiting. *Tests in `sw-register-core.test.ts`, named for the reason, with
  failure messages that name AD-15.*
- Given activation fails in the hook, then `applying` returns to false **and**
  `updateReady` stays true, both in one test. *Test: "makes the control
  available again AND keeps the prompt showing…".*
- Given a future `setWaiting(false)` on failure, then the tests fail with
  AD-15 in the message. *Mutation-checked, see below.*

## Decisions (made unattended, for Otavio to check)

None of these is visible to a user.

1. **The depth lives in `writes.ts`, and the reporter and store stay boolean.**
   AD-9 says the choke point holds the depth. Keeping the store boolean means
   `useAppUpdate`, `App.tsx` and the store's shape are unchanged, and the
   boolean's meaning is now "depth above zero".
2. **`resetTxInFlightReporter` (test seam) also zeroes the depth.** Without
   this, a write one test left hanging would hide the next test's 0→1
   transition. No production path calls it.
3. **The `tx as any` cast on `autofill` was dropped. The `{ maxFeeXRP } as any`
   cast was left alone on purpose,** because removing it would mean fixing the
   finding below inside this epic.
4. **The release of the held client is nested in its own `try/finally`.** A
   throw from `release()` (which `abandon` already makes very unlikely) cannot
   strand the depth above zero. A stranded depth would refuse every update for
   the rest of the session. That fails safe, but it would still be wrong.

## Findings reported, not fixed (rule 5)

- **The fee cap on writes has no effect. Severity: high, because it is money.**
  `writes.ts` calls `client.autofill(tx, { maxFeeXRP: '0.01' } as any)`, but
  xrpl.js 5.1.0's signature is
  `autofill(transaction, signersCount?, sponsorSignersCount?)`. The options
  object lands in `signersCount`, where it is ignored because `{} > 0` is
  false. The cap autofill applies is `client.maxFeeXRP`, which is a
  **constructor** option. `client.ts:38` builds `new Client(url)` without it,
  so the real cap is xrpl.js's default `'2'` XRP, not 0.01. The existing test
  "caps the fee autofill may attach" only checks that the fake recorded the
  argument, so it passes either way. Multi-sign would also need a real
  `signersCount` there. Recorded in `deferred-work.md`.
- Out of scope and left as found: `deferred-work.md` already holds an entry
  saying the `catch` in SendTab `doSend` and TrustLinesTab `submit` only shows
  a toast ("proposed for epic 7"). Stories 7.1–7.3 do not cover it.

## Verification

- All four gates are green on `origin/dev` `9a2e1e0` plus this change:
  `bun run lint` (exit 0, and every custom guard passes), `bun run build`
  (includes `tsc -b`), `bun run test` (44 files, 534 tests), and
  `bun run check:contrast`.
- **Mutation check.** I applied each mutation on its own and restored the file
  afterwards:

  | Mutation | Result |
  |---|---|
  | Report `false` on every settle (the old boolean) | 4 overlap tests red |
  | Report `true` on every entry | 4 overlap tests red |
  | Remove the decrement | 14 tests red |
  | Narrow the parameter back to `Payment \| TrustSet` | `tsc -b` TS2345 (build red) |
  | Un-export `submitAndClassify` | `tsc -b` TS2459 and the 7.1 test red |
  | Remove `txInFlight` from `applyUpdate`'s guard | interlock test red |
  | Remove `setApplying(false)` from the catch | 7.3 hook test red |
  | Add `setUpdateReady(false)` to the catch | 7.3 hook test red, message names AD-15 |
  | Wrap activation in the registry to set `waiting = false` on failure | both 7.3 core tests red, messages name AD-15 |

- **No browser pass.** Step 6 applies to UI changes, and this change has none:
  no component, copy or token changed. The runtime change is the depth
  arithmetic in `submitAndClassify`, and every path through it is covered by
  the unit tests above, which use the AD-12 client factory seam.
- **Gaps:**
  - The overlap was not reproduced in a real browser. Doing that needs two real
    Testnet writes awaiting validation at the same time, plus a waiting service
    worker, and neither can be arranged from the UI deterministically.
  - A write whose `submitAndWait` never settles keeps the depth above zero.
    This is the same as the boolean it replaces. xrpl.js ends the wait at
    `LastLedgerSequence`, so in practice it is bounded by about 20 ledgers.

## Review triage

| Finding | Disposition |
|---|---|
| A throwing `release()` in `finally` could skip the decrement | **Fixed.** Nested `try/finally`. |
| A throwing reporter on `true` between the increment and `try` | **Fixed by placement.** The increment is the last statement before `try` and cannot throw, and the report is inside the `try`. |
| A test that leaves a write hanging strands the depth for later tests | **Fixed.** The test seam zeroes the depth. |
| Re-entrancy: a reporter that starts another write synchronously | **Accepted.** The reporter is a zustand `set`, so this cannot happen. The depth would stay consistent anyway, because increments and decrements are paired. |
| The fee cap is not in effect | **Reported, not fixed.** See Findings. |
