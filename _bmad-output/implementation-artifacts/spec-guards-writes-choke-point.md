---
title: 'Guards that stop the fee-cap defect class returning (epic 7 retro items 20, 21, 22)'
type: 'chore'
created: '2026-10-04'
status: 'done'
baseline_commit: '02f7276acb414a3cb09da70ef2f0376477d5ef14'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The 0.01 XRP fee cap never worked for a month for three reasons that nothing enforced (epic 7 retro F1/F8/A3/A5/P3). First, AD-9's single write choke point was observed but not enforced. Second, an `as any` on an xrpl.js call hid an argument mismatch from `tsc`. Third, the test meant to pin the cap asserted what a fake recorded rather than what the SDK signed.

**Approach:** Add a `scripts/check-write-choke-point.mjs` source-scan guard, run by `bun run lint` with fixture tests. Turn on oxlint's `typescript/no-explicit-any` for non-test files under `src/lib/xrpl`, and type out every remaining `any` there without changing runtime behaviour. Record the "assert the SDK's output" rule as anti-pattern §11 in `docs/agents/`, and fix the cheap test violations.

## Boundaries & Constraints

**Always:** The guard follows the shape of `check-explorer-links.mjs`. That means `node:` builtins only, an exported scan function, a `runningAsScript` realpath check, a one-line allow directive, a `check:` script in `package.json`, and a header that lists what the guard cannot see. Narrowing of `err` stays structural (`name`/`message`/`data.error` read off any non-null object). What gets signed, and every classification, stays byte-identical. The `decode(blob).Fee` tests are the evidence for that.

**Never:** No `instanceof XrplError`/`RippledError`. No change to the fee, the cap or `submitAndClassify`'s control flow. No UI change. No new dependency. Nothing is created in `sprint-status.yaml`: the `epic-7-retro-item-20/21/22` keys are absent on this base, so the PR body says so instead.

### Decisions (made unattended, for Otavio to check)

1. **Item 21 is an oxlint override, not a regex guard.** It applies `typescript/no-explicit-any: error` to `src/lib/xrpl/**`, and a later override turns it off for `src/lib/xrpl/__tests__/**`. It is AST-based and also catches `: any` parameters, which defeat `tsc` the same way `as any` does. The cost is that `reads.ts` (9 sites) is typed out too, beyond the 4 in `writes.ts`.
2. **The guard scans non-test files only.** A test ships nothing. The fakes in `writes.test.ts` define `autofill`/`submitAndWait`. `writes.ts` is exempt as a whole.
3. **The guard also catches the raw-RPC bypass:** `command: 'submit' | 'submit_multisigned' | 'sign' | 'sign_for'`. It also catches bracket access (`client['submitAndWait']`), not only `.name`. `Math.sign` is excluded.
4. **The rule lives in one place:** `anti-patterns.md` §11. `verifying-your-work.md` gets a one-line Never bullet that links to it. `ledger-io.md` gets a Never bullet naming the choke point and its guard. `decisions.md` §4 gets the enforced-pattern bullet.
5. **Kept:** the `autofillOptions).toEqual([undefined])` test. It pins our call shape, not the SDK's behaviour, and its comment is reworded so it no longer reads as a cap guard. The UI tests asserting `submitXrpPayment` was called with `{ feeDrops }` are hand-off checks to our own function, not violations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Choke point only | current tree | guard passes, prints owner | N/A |
| Direct write | `client.submitAndWait(blob)` in `src/pages/X.tsx` | violation naming the file and line | lint exits 1 |
| Each name | `.autofill(` `.sign(` `?.submit(` `['submitAndWait']` | each flagged | — |
| Raw RPC | `request({ command: 'submit', tx_blob })` | flagged | — |
| Allowed | `// check-write-choke-point-allow` above the line | that line only is suppressed | — |
| Not flagged | `Math.sign(x)`, a comment saying "autofill", any test file, `writes.ts` | no violation | — |
| `as any` reintroduced | in `writes.ts` or `reads.ts` | oxlint error | lint exits 1 |
| `any` in a test | `src/lib/xrpl/__tests__/*.ts` | allowed | — |

</frozen-after-approval>

## Code Map

- `scripts/check-explorer-links.mjs` -- the template to mirror (walk, lineOf, allowedLines, isTestFile, runningAsScript).
- `src/lib/__tests__/explorer-link-guard.test.ts` -- the template for the fixture test (mkdtemp tree, `// @ts-expect-error` import of the `.mjs`).
- `package.json:14` -- the `lint` `&&` chain, plus the `check:*` scripts.
- `.oxlintrc.json` -- add `overrides` (verified: oxlint 1.80 applies them, and later entries win).
- `src/lib/xrpl/writes.ts:125,129,134,161` -- `prepared.LastLedgerSequence` is typed on `BaseTransaction`. `meta` narrows to `TransactionMetadata`. `err` becomes `unknown`, and `isExpiry` reads `name`/`message` structurally.
- `src/lib/xrpl/reads.ts:35,99,181` -- `catch (err: any)` reading `err?.data?.error`. Lines 194/202/209 read `account_tx` entries through `tx_json ?? tx` and `hash`, where xrpl.js types v2 only. Line 226 is `fetchTx`'s `res.result`. Line 264 is `paymentAmountOf(tx: any)`. Line 179 holds a redundant `marker as never` (`marker?: unknown` in xrpl.js). Use a local loose read-only view type, not casts to `any`.
- `src/lib/xrpl/__tests__/writes.test.ts:173-201` -- the issued-payment test asserts the fake's `autofilled` Amount/DestinationTag: also assert `decode(blob)`. Nothing pins TrustSet `tfSetNoRipple`, so add a decoded-`Flags` assertion.
- `docs/agents/anti-patterns.md`, `verifying-your-work.md`, `ledger-io.md`, `docs/decisions.md` §4 -- the documentation.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/check-write-choke-point.mjs` -- the new guard (Decisions 2–3), with its cannot-see list -- item 20
- [x] `src/lib/xrpl/__tests__/write-choke-point-guard.test.ts` -- fixture tests for every matrix row -- prove it fails
- [x] `package.json` -- add to the lint chain, plus `check:write-choke-point` -- run by lint
- [x] `.oxlintrc.json` -- the overrides -- item 21
- [x] `src/lib/xrpl/writes.ts`, `src/lib/xrpl/reads.ts` -- remove every `any` -- item 21
- [x] `src/lib/xrpl/__tests__/writes.test.ts` -- assert the decoded blob for Amount/DestinationTag and the NoRipple flag, and reword the call-shape comment -- item 22
- [x] the docs listed in the Code Map -- item 22, Decision 4

**Acceptance Criteria:**
- Given the finished tree, when the four gates run, then all are green.
- Given each new guard, when it is mutated (a write planted outside `writes.ts`, the regex or owner list broken, `as any` restored in `writes.ts`/`reads.ts`), then lint or a fixture test fails. The results are recorded under Verification.

## Implementation Notes

- Implemented directly in this session, not by a dispatched subagent. A fresh subagent in this worktree setup would resolve the spec's relative paths against the main checkout, which the run must not touch.
- New: `scripts/check-write-choke-point.mjs`, `src/lib/xrpl/__tests__/write-choke-point-guard.test.ts` (9 tests, including "passes the real tree"), `src/lib/xrpl/narrow.ts` (`isRecord`, `rippledErrorCode`: the typed replacement for `err?.data?.error` and `err?.name`, kept structural).
- `writes.ts`: the 2 `as any` and 2 `: any` are gone. `prepared.LastLedgerSequence` and `meta.TransactionResult` type-check without a cast. `reads.ts`: 4 `as any` and 4 `: any` are gone, and two redundant `marker as never` casts were removed (`marker?: unknown` in xrpl.js). `account_tx` entries are read through the `ListedEntry`/`ListedTx` views, which xrpl.js's `Transaction` union is assignable to, so `tsc` checks them.
- `writes.test.ts`: the issued-payment test now asserts `decode(blob).Amount`/`DestinationTag`. A new test asserts that the decoded TrustSet `Flags` carries `tfSetNoRipple`, which nothing pinned before. The call-shape test's comment now says it is not the cap guard.
- Docs: `anti-patterns.md` §11 (incident, rule, what each guard cannot see, including the oxlint rule's blind spots: `as never`, `as unknown as T`, `@ts-expect-error`, anything outside `src/lib/xrpl`). One Never bullet each in `verifying-your-work.md` and `ledger-io.md`. A §4 bullet in `decisions.md`.

## Spec Change Log

## Review Triage Log

Three layers ran (blind hunter, edge-case hunter, verification gap); none skipped. No intent_gap or bad_spec, so no loopback (`review_loop_iteration` stays 0). The step-03 work was done inline, so patches were applied directly.

| # | Layer | Finding | Verdict | Route | Evidence / action |
|---|---|---|---|---|---|
| R1 | blind, edge | Raw-RPC regex misses a quoted key (`'command':`, JSON `"command":`) | medium | patch | Reproduced by the edge layer. Regex now accepts a bare or quoted key; fixtures added (M22). |
| R2 | blind | `channel_authorize` (server-side signing with a secret) not covered | low | patch | Added to the command list and the header; fixture added (M23). |
| R3 | blind, edge | Allow directive trailing a code line silently exempts the next line | medium | patch | Reproduced by the edge layer. Directive now counts only alone on its line; test added (M24). Block/JSX forms fail closed, documented. |
| R4 | blind | No unused-directive report for the allow comment | low | reject | Unlikely in practice and the fix adds a new reporting branch. |
| R5 | blind | Test-file definition differs: guard skips colocated `*.test.ts`, oxlint override only `__tests__/` | low | patch | Override now also covers `src/lib/xrpl/**/*.test.{ts,tsx}` (M32). |
| R6 | blind | `as never` / `as unknown as` / `@ts-expect-error` documented but unbanned | medium | defer | A new guard beyond items 20–22; deferred-work entry. |
| R7 | blind, verif | `isExpiry`'s rewritten XrplError branch untested | medium | patch | Pre-verified gap (branch disabled, suite green). Added an `XrplError` expiry test with the ledger not past LLS, asserting no ledger request (M27). |
| R8 | verif, blind | `rippledErrorCode` actNotFound paths in `fetchAccountState`/`fetchAccountLines` untested | medium | patch | Pre-verified gap. Tests added, including string and `null` throws (M28–M30). |
| R9 | verif | Lint wiring and run-as-script entry point not pinned | medium | patch | Pre-verified gap. Copied the sibling guard's two tests (M25, M26). |
| R10 | verif | No test that the oxlint override still matches | low | defer | Filed disposition defer; checked by hand; deferred-work entry. |
| R11 | blind | `paymentAmountOf` keeps `(meta as Record<string, unknown>)` beside the new helper | low | patch | Replaced with `isRecord(meta) ? meta : {}`. |
| R12 | blind | NoRipple test in the in-flight `describe`, and no `LimitAmount` assertion | low | patch | Moved to its own `describe`; asserts decoded `TransactionType`, `LimitAmount` and the flag (M31). |
| R13 | blind | AccountSet test and fee-cap tests assert only what the fake recorded | false | reject | The AccountSet test pins the in-flight signal, not an SDK guard; the fee-cap tests at the cited lines each assert `decode(blob).Fee` beside the fake check. |
| R14 | blind | `anti-patterns.md` §11 and `decisions.md` cite different retro item lists | maybe-false | reject | They record different lessons (testing vs. both rules), and the epic 7 retrospective is not on this base, so F2 cannot be checked. Would only be low. |
| R15 | blind | "AD-9" undefined anywhere in `docs/` | low | patch | `ledger-io.md` and `decisions.md` now link AD-9 in the architecture spine. |
| R16 | edge | Symlink cycle or broken symlink under `src/` crashes the walk | low | reject | No symlinks in `src/`; same walk as the sibling guards; the fix adds a branch. |
| R17 | edge | `meta === null` on an `account_tx` entry throws in `fetchAccountTx` | maybe-false | defer | Pre-existing (identical under `as any`); unverified reachability; deferred-work entry. |
| R18 | edge | `meta` without `TransactionResult` makes `classify(undefined)` throw | maybe-false | defer | Pre-existing; xrpl.js types it required; deferred-work entry. |

## Verification

**Commands:**
- `bun run lint && bun run build && bun run test && bun run check:contrast` -- expected: all exit 0. Result: all exit 0, 622 tests before review; 632 after the review patches.

**Mutation checks** (script: each mutation applied, the check run, the file restored):

| # | Mutation | Check | Result |
|---|---|---|---|
| M0 | `// planted: await client.submitAndWait(blob)` appended to `HistoryTab.tsx` | `bun run lint` | exit 1, guard message |
| M1 | `client.submitAndWait(blob)` in `HistoryTab.tsx` | guard | fails |
| M2 | `request({ command: 'submit' })` in `HistoryTab.tsx` | guard | fails |
| M3 | `w.sign({})` in `useRecommendedFee.ts` | guard | fails |
| M4 | `sign` dropped from the method list | fixture tests | fail |
| M5 | owner changed to `reads.ts` | fixture tests | fail |
| M6 | test files no longer skipped | fixture tests | fail |
| M7 | allow directive ignored | fixture tests | fail |
| M8 | `Math.sign` exclusion dropped | fixture tests | fail |
| M9 | string-key alternative disabled | fixture tests | fail |
| M10 | raw-RPC rule disabled | fixture tests | fail |
| M11 | trailing `\b` dropped | fixture tests | fail |
| M13 | `(prepared as any).LastLedgerSequence` restored in `writes.ts` | lint | fails |
| M14 | the original F1 call `autofill(tx, { maxFeeXRP } as any)` restored | lint | fails |
| M15 | `catch (err: any)` restored in `writes.ts` | lint | fails |
| M16 | `(entry as any).tx_json` restored in `reads.ts` | lint | fails |
| M17 | `as any` added to a `src/lib/xrpl/__tests__` file | lint | passes (as intended) |
| M18 | oxlint overrides in reverse order | lint | fails (order is load-bearing, and correct) |
| M19 | overrides removed + `as any` in `writes.ts` | lint | passes: the override is what catches it |
| M20 | TrustSet `Flags: 0` | `writes.test.ts` | fails |
| M21 | `DestinationTag` dropped from the token payment | `writes.test.ts` | fails |

Review-patch mutations (each applied alone, the check run, the file restored and compared byte-for-byte):

| # | Mutation | Check | Result |
|---|---|---|---|
| M22 | quoted-key alternative removed from the raw-RPC regex | fixture tests | fail |
| M23 | `channel_authorize` dropped | fixture tests | fail |
| M24 | directive matched anywhere on the line | fixture tests | fail |
| M25 | guard dropped from the `lint` chain | fixture tests | fail |
| M26 | `runningAsScript()` forced false | fixture tests | fail |
| M27 | `isExpiry`'s XrplError branch disabled | `writes.test.ts` | fail |
| M28 | `fetchAccountState` actNotFound branch disabled | `account-tx-not-found.test.ts` | fail |
| M29 | `fetchAccountLines` actNotFound branch disabled | `account-tx-not-found.test.ts` | fail |
| M30 | `rippledErrorCode` reads the wrong field | `account-tx-not-found.test.ts` | fail |
| M31 | TrustSet `Flags: 0` in `writes.ts` | `writes.test.ts` | fail |
| M32 | colocated-test globs removed from the oxlint override | oxlint on `src/lib/xrpl/zz.test.ts` with `as any` | fails (passes with the globs; a non-test `zz.ts` still fails) |

A first mutation run used a backup path that was already a directory, so its restores failed and the mutants stacked. Every mutant was reversed by hand, the guard script and `writes.ts` were diffed against their pre-review copies, and the table above is from a clean rerun.

What users pay is unchanged: the `decode(blob).Fee` tests in "the fee cap on every write, and the pinned fee" pass unmodified.
