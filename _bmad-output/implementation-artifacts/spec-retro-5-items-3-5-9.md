---
title: 'Unactivated history is empty, the destination check refreshes after a send, the invalidation scan becomes a lint gate, and the 5.1/5.2 browser passes'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f0c9bb0'
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/ledger-io.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-retro-2026-09-30.md'
---

## Intent

**Problem:** Epic 5 retro items 3, 5, 6 and 9 (findings F3, F5, P1/P2, A5).

- **F3:** `fetchAccountTx` does not treat `actNotFound` as an empty result, unlike `fetchAccountState` and `fetchAccountLines`. A server that answers an unactivated address that way would make History report "could not be read" for every new wallet, and the incoming-payment watch would retry for ever.
- **F5:** after a validated send, `destinationInfo` is not refreshed, because it is deliberately outside the 5.5 group. A send that activates the destination leaves "Destination not activated" on screen for up to 30 s, and the next send's post-unlock probe is served from that cache.
- **A5:** the 5.5 one-path rule is a vitest scan. The other three guards are `scripts/check-*.mjs` scripts run by `bun run lint`.
- **P1/P2:** stories 5.1 and 5.2 reached `done` with no browser pass.

**Approach:**

- `fetchAccountTx` answers `actNotFound` on the first page with `{ items: [], marker: undefined }`, and rethrows it on a continuation page.
- `query-keys.ts` gains one named helper, `invalidateDestinationCheck(client, network, destination)`. SendTab calls it beside `invalidateAccountScoped` only when the outcome is `validated`.
- The scan moves to `scripts/check-account-invalidation.mjs`, which reads the builder names off the factory's `accountScoped` table as text, fails closed, and is run by `lint`. It has fixture tests and a parity test against the runtime factory.
- Real Playwright passes on Testnet cover 5.1 and 5.2, with failures injected at the websocket rather than in app code.

## Boundaries & Constraints

**Always:**
- A failed read is never shown as an empty one: only `actNotFound`, and only on the first page, becomes empty.
- Each new guard is pinned by a test that fails when the guard is removed (mutation-checked below).
- Keys come from the factory. The guard script imports `node:` builtins only.

**Never:**
- No change to `invalidateAccountScoped`'s membership: `destinationInfo` stays out of the account group.
- No `SendTab.tsx` split (retro item 8).
- No edits to app code to force a failure for the browser pass.
- No repair of drift outside these items.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unactivated account, first page | `account_tx` → `actNotFound`, no marker | `{ items: [], marker: undefined }`; History "No transactions yet"; watch idle | N/A |
| `actNotFound` on a later page | marker set | rejects; History keeps loaded rows and shows "History unavailable" with retry | not swallowed |
| Any other `account_tx` error | `tooBusy`, `actMalformed`, transport | rejects as before | failure panel |
| Validated send | outcome `validated` | account group and every `destinationInfo` entry for `(network, destination)` invalidated; an active check refetches | refetch failure shows "Destination check failed" (fail closed) |
| Claimed / failed / expired send | `claimed`, `failed`, `expired` | account group only; destination check untouched | N/A |
| Thrown submit | exception | unchanged: nothing invalidated (deferred, 5.5) | toast |
| Guard: a key named at a discard call outside the factory | `invalidateQueries({ queryKey: queryKeys.trustLines(...) })` | lint fails, naming file:line | allow directive for a deliberate counterexample |
| Guard: factory table renamed or emptied | no `accountScoped` table, or one with no entries | lint fails ("checking nothing") | N/A |
| Guard: no caller takes the one path | zero `invalidateAccountScoped(` outside the factory | lint fails | N/A |

## Code Map

- `src/lib/xrpl/reads.ts` -- `fetchAccountTx`: `actNotFound` → empty on the first page only.
- `src/lib/xrpl/query-keys.ts` -- adds `invalidateDestinationCheck()` (prefix `['destinationInfo', network, destination]`). Its doc comment now names the lint guard rather than the deleted vitest scan.
- `src/pages/tabs/SendTab.tsx` -- `doSend` invalidates the account group and, on `validated` only, the destination check, both under one `Promise.all`.
- `scripts/check-account-invalidation.mjs` -- new guard. Exports `accountScopedBuilderNames`, `violationsIn`, `checkAccountInvalidation` and `failuresOf`.
- `package.json` -- `lint` runs the guard; adds `check:account-invalidation`.
- `src/lib/xrpl/__tests__/account-invalidation-sites.test.ts` -- deleted; its job is now the guard's.
- Tests:
  - `account-invalidation-guard.test.ts`, `account-tx-not-found.test.ts` (new);
  - `query-key-invalidation.test.ts`, `query-key-wiring.test.tsx`, `send-destination-error.test.tsx` (extended).

## Tasks & Acceptance

**Execution:**
- [x] `reads.ts` + `account-tx-not-found.test.ts` -- item 3.
- [x] `query-keys.ts`, `SendTab.tsx` + tests in three suites -- item 5.
- [x] `scripts/check-account-invalidation.mjs`, `package.json`, guard test; delete the vitest scan -- item 9.
- [x] Testnet browser passes for 5.1 and 5.2; results appended to `spec-5-1-destination-check-guard.md` and `spec-5-2-reserve-read-reported.md` Verification -- item 6.
- [x] `sprint-status.yaml`: action items 3, 5, 6 and 9 → `done`.

**Acceptance Criteria:**
- Given an `account_tx` that rejects with `actNotFound` and no marker, when `fetchAccountTx` runs, then it resolves to an empty page with no marker.
- Given the same error with a marker, or any other error, then it rejects with that error.
- Given a validated send to D on network N, when the send completes, then `invalidateQueries({ queryKey: ['destinationInfo', N, D] })` is called and the account group is still invalidated.
- Given a claimed, failed or expired send, then the destination check is not invalidated.
- Given a cached destination answer younger than the window, when `invalidateDestinationCheck` runs, then the next `fetchDestinationInfoOnce` reads the ledger again (real `QueryClient`).
- Given an account-scoped key named at a discard call outside the factory, when `bun run lint` runs, then it exits non-zero naming the file and line.
- Given the factory's account-scoped table, then the names the script parses equal the names derived from the runtime `queryKeys` by key shape.

## Decisions (made unattended, for Otavio to check)

1. **The destination refresh covers every asset's check for that destination, not one cache entry.** The retro asked for a "single-entry helper". I read that as one named entry point for one destination. The helper invalidates the prefix `['destinationInfo', network, destination]`, so the XRP entry and any token entries for that address all go stale. The reason: an XRP payment that activates an address makes the cached `exists: false` wrong for that address's token entries too. Narrowing it to the exact `(network, destination, asset)` triple is a one-line change if you prefer it.
2. **Only a `validated` outcome refreshes the destination check.** `claimed` (`tec*`), `failed` and `expired` change nothing on the destination's side. A thrown submit still invalidates nothing; that is the existing 5.5 deferred entry, left alone.
3. **F3's symptom did not reproduce today; the change is defensive.** On 2026-10-04, `account_tx` for a freshly generated, never-funded address returned `transactions: []` (success, not `actNotFound`) on all four configured endpoints: `s.altnet.rippletest.net`, `testnet.xrpl-labs.com`, `xrplcluster.com` and `s1.ripple.com`. So History was not, in fact, calling new wallets a failed read on these servers. The change aligns `fetchAccountTx` with the other two reads in case a server does answer `actNotFound`. The retro assumed one would, from the code alone; I did not find a configured endpoint that does. It was demonstrated in the browser by injecting `actNotFound` at the websocket.
4. **`actNotFound` on a continuation page is still a failure.** The account had history one page earlier. Answering empty with no marker would end the list and make it look complete: the failed-shown-as-empty pattern this epic exists to remove.
5. **The guard parses the factory as text and fails closed.** A `node:`-only script cannot import `.ts`. If the `accountScoped` table is renamed or reshaped, lint fails with "checking nothing" instead of passing. A vitest test holds the parsed names equal to the runtime factory's. The guard also fails if nothing outside the factory calls `invalidateAccountScoped(` (a guard over a path nobody takes). It skips test files, as the vitest scan did, and takes a per-line `// check-account-invalidation-allow` like its three siblings.
6. **Failures were forced at the websocket, not with the recipe's temporary switch.** Step 6 of `docs/agents/verifying-your-work.md` (landed in #34 the same day) says to force a failed read "only with a temporary switch" in `reads.ts`. I used `page.routeWebSocket` instead, answering the chosen command, or the chosen command for one account, with a rippled-style error. That way no app code was edited, so nothing had to be reverted and the code under test is exactly the code shipped. It also lets one account's read fail while another's succeeds, which the 5.1 pass needed. I did not edit the doc (rule 5). If you agree, the recipe could name this as an alternative. The captures follow the recipe's authenticator setup, but several were taken after a fixed wait rather than a settled-value wait. Each screenshot was opened and shows a settled state.

**Drift noticed, not repaired (rule 5):**
- The 5.5 entry in `deferred-work.md` still says the rule lives in "a vitest scan".
- `planning-artifacts/implementation-readiness.md` says three guards are machine-enforced; there are now four.
- `spec-5-5-one-invalidation-group.md`'s Code Map names the deleted `account-invalidation-sites.test.ts`.

## Verification

**Commands** (this branch rebased onto `dev` `f0c9bb0`): `bun run lint`, `bun run build`, `bun run test` (415 tests, 33 files) and `bun run check:contrast` all exit 0. `lint` prints `check-account-invalidation: 4 account-scoped builders, discarded only through invalidateAccountScoped() (4 callers).`

**Mutation checks** (each reverted afterwards; tree clean):

| Mutation | Result |
|---|---|
| `fetchAccountTx` catch disabled | `account-tx-not-found` first-page test fails |
| `actNotFound` → empty regardless of marker | continuation-page test fails |
| SendTab never calls `invalidateDestinationCheck` | 1 send test fails |
| SendTab calls it on every outcome | 3 send tests fail (claimed/failed/expired) |
| Helper prefix misspelt (`'destinationinfo'`) | 3 tests fail (helper ×2, real-client probe) |
| Guard: `refetchQueries` dropped from the pattern | 1 guard test fails |
| Guard: "built beside" branch never reports | 1 guard test fails |
| Guard: `no-callers` check removed | 1 guard test fails |
| Guard: an empty table passes | 1 guard test fails |
| Guard: table regex broken | 9 guard tests fail (parity, fixtures) |
| A real `invalidateQueries({ queryKey: queryKeys.trustLines(...) })` appended to `TrustLinesTab.tsx` | `node scripts/check-account-invalidation.mjs` exits 1 |

**Browser pass, 2026-10-04.**

How it was driven:
- Playwright Chromium 1148 (`playwright-core` 1.49.1, in the session scratchpad and not in the repo), from a fresh `browser.newContext()` with no profile.
- CDP virtual authenticator, set up as in `verifying-your-work.md`: ctap2, internal, resident key, UV, presence simulation, PRF.
- Vite dev server on port 5174, Testnet. Throwaway wallets only, created in that context; no existing wallet was touched.
- Failures were forced with `page.routeWebSocket`, which answers the chosen request with a rippled-style `{status:'error'}` response instead of forwarding it. No app code was changed. Every forced state is named below.
- Every screenshot listed was opened and judged. Screenshots are in the session scratchpad, not the repo.

Pass 1 ran on this branch's diff over `dev` `3ac02fc`, before epic 8 (#33) changed the connection layer. Items 3 and 5 were re-run on this branch rebased onto `f0c9bb0` (pass 2).

| Item | Exercised | Observed | Met |
|---|---|---|---|
| 3 | New unfunded wallet, History, nothing forced | "No transactions yet" (servers answer `[]`, see Decision 3) | — |
| 3 | `account_tx` forced to `actNotFound` (both reads: History and the watch) | "No transactions yet", no failure panel; in pass 2 too | yes |
| 3 | `account_tx` forced to `tooBusy` | "History unavailable" panel with Try again: a real failure is still reported | yes |
| 5 | Funded wallet, Send 2 XRP to a never-funded address; the form showed "Destination not activated" before | Validated. The destination's `account_info` was re-read 7.9 s after Confirm (6.6 s in pass 2), right after validation, and the warning was gone 0.2–0.4 s later, well inside the 30 s window. Before the change nothing invalidated that entry, and it was ~5 s old, so it would have stayed. | yes |
| 6 | 5.1 and 5.2 passes | See those specs' Verification sections, appended today | see there |

**Gaps, stated:**
- Only one wallet per pass. The two-wallet surfaces were not in scope here.
- 200% zoom was not run; 320 px was.
- Item 5's before/after was not run as an A/B on the same build. An attempt to put the pre-change `SendTab.tsx` back temporarily was refused by the session's permission layer. The claim rests on the read log above: the entry was inside its window, and nothing else invalidates `destinationInfo`.

## Review Triage Log

Self-review of the diff, adversarial (edge cases, fail-closed, failed-vs-empty):

| # | Finding | Disposition |
|---|---|---|
| 1 | `actNotFound` mid-pagination would end History early and look complete | **fixed**: first page only, pinned by a test |
| 2 | `invalidateDestinationCheck` rejecting inside `Promise.all` would reach `catch` and toast "Send failed" over a validated payment | **rejected**: TanStack v5 `invalidateQueries` → `refetchQueries` swallows refetch errors unless `throwOnError`. `invalidateAccountScoped` has the same exposure and was already awaited there. |
| 3 | Refetch of the active destination check fails after a send | **accepted as correct**: the guard closes and "Destination check failed" shows, which is fail closed |
| 4 | A literal key in the helper could drift from `queryKeys.destinationInfo` | **mitigated**: the tests seed entries through the builder; a misspelt prefix fails 3 tests (mutation above) |
| 5 | The guard's text parse could silently find nothing after a factory reformat | **fixed**: `no-builders` fails lint, and the parity test compares with runtime keys |
| 6 | Deleting the vitest scan loses its "four sites call the one path" check | **kept**: moved into the guard test on the real tree, plus the script's own `no-callers` failure |
| 7 | The guard does not flag `setQueryData`, aliasing, or cross-module keys | **accepted**: same documented limits as the vitest scan; story 10.1 |

**Observation, not fixed (outside these items):** on a tag-required destination with no tag entered, the only visible reason the send is held is the field label "Destination tag (required by recipient)" beside a disabled Review button. Nothing marks the tag field invalid, and no sentence says the send is held for it. 5.1's criterion ("blocked with the reason in visible text, as it is today") is met by the label. This is noted in `spec-5-1-destination-check-guard.md`.
