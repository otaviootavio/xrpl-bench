---
title: 'Epic 1 — one factory owns every ledger query key'
type: 'refactor'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3686ace9e2d54519fbd29f68c19b14f2f9a63c8b'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ten TanStack Query key literals are written by hand across hooks and
pages, and four invalidation sites retype what they hope are the same literals.
Nothing checks the two match. A key typed differently at an invalidation site
means the stale entry is never dropped, so after a wallet switch or a completed
send the screen keeps showing the previous value — a wrong balance, which
`PRODUCT.md` names as the worst possible outcome.

**Approach:** One exported factory produces every key. Account-scoped keys take
network and address as arguments so a key cannot be built without them;
network-scoped and device-scoped reads become named functions on the same
factory so each legitimate exception to the wallet-plus-network rule is visible
in one file. A check run by `bun run lint` then rejects any new hand-written key.

## Boundaries & Constraints

**Always:**
- Every key produced must be **byte-identical** to the literal it replaces. This
  is a refactor; no cache entry changes identity, no query refetches that did not
  refetch before.
- `lib/xrpl/query-reads.ts` must keep sharing the exact cache entry that
  `useAccountState` uses — the two agreeing is the reason that module exists.
- Implements AD-4 and AD-6 in the architecture spine.
- The new check uses `node:` builtins only, and does not touch
  `scripts/check-contrast.mjs`, whose CI job has no install step.

**Never:**
- No change to any key's shape, argument order, or element types.
- No change to `staleTime`, `refetchInterval`, `enabled`, or any other query
  option.
- No behaviour a user could observe. This epic ships no feature.
- No new runtime dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Account-scoped key | network `testnet`, address `rAbc…` | `['accountState', 'testnet', 'rAbc…']` — identical to today's literal | N/A |
| Null address | address `null` | Key still builds; the hook's own `enabled: !!address` keeps it from running | N/A |
| Network-scoped key | network `mainnet`, no address | `['serverReserves', 'mainnet']` — no address element appears | N/A |
| Device-scoped key | no network, no address | `['passkeyRegistered']` — unaffected by any wallet or network switch | N/A |
| Destination lookup | network, destination address, asset | `['destinationInfo', network, destination, asset]` — keyed on the *destination*, not the active wallet | N/A |
| Invalidation after send | a validated payment | The four account-scoped entries are invalidated using factory-built keys | N/A |
| Hand-written key added | a new `queryKey: ['foo', x]` literal | `bun run lint` fails, naming file and line | Message points at the factory |

</frozen-after-approval>

## Code Map

**Read sites — ten key literals to replace:**

- `src/hooks/useAccountState.ts:10` -- `['accountState', network, address]`, refetch 15s.
- `src/hooks/useAccountTxHistory.ts:7` -- `['accountTx', network, address]`, `useInfiniteQuery`.
- `src/hooks/useTrustLines.ts:7` -- `['trustLines', network, address]`, refetch 15s.
- `src/hooks/useIncomingPaymentNotifications.ts:28` -- `['incomingPaymentWatch', network, address]`, refetch 30s.
- `src/hooks/useDestinationInfo.ts:30` -- `['destinationInfo', network, destination, asset]`. Address-scoped but to the **destination**, not the active wallet. Needs its own factory function; do not fold it into the account-scoped shape.
- `src/lib/xrpl/query-reads.ts:21` -- `['accountState', network, address]` via `queryClient.fetchQuery`. **Deliberately identical to `useAccountState`'s key**; the file's own comment says the probe and the UI must never disagree. This is the single most important site to route through the factory.
- `src/hooks/useServerReserves.ts:7` -- `['serverReserves', network]`. Network-scoped, no address. Correct as-is.
- `src/hooks/useRecommendedFee.ts:7` -- `['fee', network]`. Network-scoped, no address. Correct as-is.
- `src/pages/Unlock.tsx:30` -- `['passkeyRegistered']`. Device-scoped.
- `src/pages/Unlock.tsx:31` -- `['lockoutState']`. Device-scoped.

**Invalidation sites — ten retyped literals:**

- `src/hooks/useAccountLiveUpdates.ts:28-31` -- invalidates `accountState`, `trustLines`, `accountTx`, `incomingPaymentWatch` inside `invalidateAccountQueries()`.
- `src/pages/tabs/SendTab.tsx:123-125` -- invalidates `accountState`, `accountTx`, `trustLines` after a submit resolves.
- `src/pages/tabs/TrustLinesTab.tsx:58-59` -- invalidates `trustLines`, `accountState`.
- `src/pages/tabs/BalancesTab.tsx:46` -- invalidates `accountState` after a faucet grant.

**Reuse, do not change:**

- `src/lib/xrpl/networks.ts` -- `NetworkId`, the type every key's network element uses.
- `src/store/app-store.ts` -- `useActiveWallet`, `network`. AD-6's source of truth; the factory takes these as arguments and must not import the store.
- `src/lib/xrpl/reads.ts` -- every `queryFn`. Untouched.
- `.oxlintrc.json` -- plugins `react`, `typescript`, `oxc`. oxlint carries no user-defined-rule mechanism, so the Story 1.4 check is a standalone script, not a lint rule.
- `package.json` -- `lint` is `oxlint --deny-warnings --report-unused-disable-directives`. The check is appended to this script.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/xrpl/query-keys.ts` -- new module exporting `queryKeys`, with account-scoped, destination-scoped, network-scoped and device-scoped functions; each named so its scope is readable at the call site, and each carrying a short comment where the scope is an exception to the wallet-plus-network rule -- one place to change a key shape, and one place an audit can read.
- [x] `src/lib/xrpl/__tests__/query-keys.test.ts` -- new; assert every function returns exactly the literal it replaced, covering each row of the I/O matrix -- this test is what proves the refactor changed no cache identity.
- [x] `src/hooks/useAccountState.ts`, `useAccountTxHistory.ts`, `useTrustLines.ts`, `useIncomingPaymentNotifications.ts`, `useDestinationInfo.ts` -- replace each key literal with a factory call -- Story 1.1.
- [x] `src/lib/xrpl/query-reads.ts` -- replace the literal with the same account-scoped factory call `useAccountState` uses -- makes the shared cache entry guaranteed rather than commented.
- [x] `src/hooks/useAccountLiveUpdates.ts` -- rebuild the four keys in `invalidateAccountQueries()` from the factory -- Story 1.2.
- [x] `src/pages/tabs/SendTab.tsx`, `TrustLinesTab.tsx`, `BalancesTab.tsx` -- rebuild each invalidation key from the factory -- Story 1.2.
- [x] `src/hooks/useServerReserves.ts`, `useRecommendedFee.ts` -- move to named network-scoped factory functions -- Story 1.3.
- [x] `src/pages/Unlock.tsx` -- move both keys to named device-scoped factory functions -- Story 1.3.
- [x] `scripts/check-query-keys.mjs` -- new; `node:` builtins only. Scan `src/` for an array literal passed to `queryKey:` or to `invalidateQueries`/`fetchQuery`/`removeQueries`, and exit non-zero naming file and line -- Story 1.4, the part that stops this decaying.
- [x] `package.json` -- append the check to the `lint` script -- runs in CI with no new command to remember.

**Acceptance Criteria:**

- Given the app on Testnet with two wallets configured, when the operator switches the active wallet, then every figure on screen belongs to the newly active wallet and none of the previous wallet's data remains.
- Given a validated XRP payment, when the transaction resolves, then balance, spendable and history refresh with no manual reload.
- Given a created trust line, when the transaction validates, then the trust-line list and the owner-reserve figure both refresh.
- Given an import of a seed whose master key is disabled, when the pre-flight probe runs, then it reads the same cache entry the Balances screen reads, and the two never show different account state.
- Given a developer adds a `queryKey` array literal anywhere under `src/`, when `bun run lint` runs, then it fails and names the file, the line, and the factory to use instead.
- Given the whole change, when `git diff` is reviewed, then no query option other than `queryKey` has been modified.

## Implementation Notes

**Factory shape.** `src/lib/xrpl/query-keys.ts` exports one `queryKeys` object:
four account-scoped functions, one destination-scoped, two network-scoped, two
device-scoped. Every non-account scope carries a comment stating why it is an
exception to the wallet-plus-network rule, so an audit reads them in one file.

**`recommendedFee()` returns `['fee', network]`.** The function name and the
literal deliberately disagree: the name is readable at the call site, the
literal is the key this cache entry has always had. Renaming it would change
cache identity, which this refactor forbids.

**`query-reads.ts` now calls the same `queryKeys.accountState` as
`useAccountState`.** The shared cache entry between the disabled-master-key
pre-flight probe and the Balances screen was previously guaranteed only by a
comment. It is now structural.

**`staleTime` asymmetry left alone.** `query-reads.ts` passes `staleTime:
15_000` where `useAccountState` uses `refetchInterval: 15_000`. Pre-existing,
out of scope, untouched.

**The guard exempts `__tests__` trees.** Discovered during verification: the
guard's own tests must contain the literals it rejects, so policing test files
made the check untestable. The rule exists to keep the runtime cache coherent,
and a test file is not a call site any balance passes through. Cost: a test that
hand-writes a key can drift from the factory — that breaks the test, not the
user. The exemption is itself asserted in `query-key-guard.test.ts`, including
that a non-test file beside a test tree is still caught.

**The guard was made importable.** `scanForHandWrittenKeys(dir, root)` is
exported and the CLI block runs only when the file is the process entry point.
Without this the guard could not be tested at all, and a check nobody tests is
a check that can silently stop matching.

**Two matrix rows had no covering test after the first implementation pass** —
"invalidation after send" and "hand-written key added". Both are now covered:
`query-key-invalidation.test.ts` seeds a real `QueryClient` with factory-built
keys and asserts a retyped key does *not* match, and `query-key-guard.test.ts`
exercises the guard in both directions against a fixture tree.

**Known limitation, recorded not fixed.** The guard matches literals at four
call shapes. A key assigned to a variable first (`const k = [...]` then
`invalidateQueries({ queryKey: k })`) passes. Broadening beyond the shapes the
spec names would be scope creep.

**Verification.** All four gates green. 68 tests across 12 files, up from 56
across 10 at baseline. The guard was proven to bite by appending a literal to
`src/hooks/useTrustLines.ts` — exit 1, naming file and line — then reverting.
`git diff` filtered for lines touching neither `queryKey` nor `query-keys`
shows no change to any other query option.

**Not done.** The spec's manual check — two wallets on Testnet, switch, confirm
no stale figure — was not performed; no browser session was available. Every
key is byte-identical by unit test and no query option changed, so there is no
behaviour difference for that check to catch, but it remains unperformed.

**Review round 1 — eleven patches applied, both `high` findings verified closed.**

- The invalidation test's negative assertions were vacuous: `find()` returns
  `undefined` for an absent entry, so `?? false` made `.toBe(false)` pass no
  matter what. Now asserts the entry exists, then reads `state.isInvalidated`.
  Re-verified by deleting a seed — the test fails, as it must.
- Nothing bound a hook to its own factory function. Swapping
  `queryKeys.trustLines` for `queryKeys.accountTx` in `useTrustLines.ts` passed
  every gate. `src/hooks/__tests__/query-key-wiring.test.tsx` now asserts each
  account-scoped hook lands on its own key; re-verified — the swap now fails.
  That file also carries the genuine shared-entry assertion that
  `query-keys.test.ts` only claimed to make.
- The guard missed positional-key APIs entirely, including `setQueryData` — the
  API this change's own test seeds with. Nine more call shapes are now matched.
- The blanket `__tests__` exemption was wrong: it missed colocated `*.test.ts`
  files, which vitest does run, and contradicted the spec's own criterion that a
  literal anywhere under `src/` must fail. Replaced by a
  `// check-query-keys-allow` directive suppressing the next line only.
  Re-verified: a `__tests__` tree and a colocated test are both policed, and the
  directive suppresses exactly one line.
- `runningAsScript` now realpath-resolves both sides, so a symlinked path can no
  longer make the guard exit 0 silently.
- `AccountScopedKey` constrains the **return type** to a three-element tuple, not
  just the parameters — a params-only constraint would not bite, because a
  builder taking fewer arguments is still assignable.
- `AD-4` / `AD-6` citations removed from shipped source: neither identifier
  resolves anywhere under `docs/`, and this repo's rule is to follow the link.
- `check:query-keys` added beside `check:contrast`; the header's no-install-step
  claim dropped, since unlike `check-contrast.mjs` this runs inside the `lint`
  job, which does install.

Gates after patches: all four green. 76 tests across 13 files, up from 68/12.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | `isStale` helper returns `false` for an absent cache entry, so three negative assertions in `query-key-invalidation.test.ts` pass vacuously | **high** | Verified against a real `QueryClient`: `find()` on a never-seeded key returns `undefined`, so `?? false` yields `false`. Confirmed `state.isInvalidated` is `true` after invalidate and `isStaleByTime(Infinity)` is `false` before. Three of four tests cannot fail. | patch |
| 2 | Choosing the wrong sibling account-scoped factory function passes every gate | **high** | Pre-verified by the verification-gap layer: swapping `queryKeys.trustLines` for `queryKeys.accountTx` in `useTrustLines.ts` left lint, build and all 68 tests green, because the signatures are identical and the guard sees a factory call. No test imports any hook. | patch |
| 3 | Guard misses positional-key APIs (`setQueryData`, `getQueryData`, and family) | **medium** | Ran `scanForHandWrittenKeys` against a fixture: `setQueryData(['accountState',…])` and `getQueryData([…])` are not flagged; only the `queryKey:` line is. `setQueryData` is the API this change's own invalidation test seeds with. No such call sites in non-test `src/` today, so latent. | patch |
| 4 | `__tests__` exemption misses colocated `*.test.ts` and contradicts the spec's own AC ("a literal anywhere under `src/`") | **medium** | Verified: a fixture `b.test.ts` outside a `__tests__` segment is flagged, so a legitimately located test file fails lint with no escape hatch. `vitest.config.ts` includes `src/**/*.test.ts(x)` anywhere. | patch |
| 5 | `runningAsScript` fails open — a symlinked path makes the guard exit 0 silently | **low** | Real: `argv[1]` is not realpath-resolved. Unlikely in this repo, but the fix is a direct correction rather than added complexity, so not rejected. | patch |
| 6 | Account-scoped builders share a signature by convention only; a new one omitting `address` passes everything | **medium** | Confirmed by reading `query-keys.ts:23-32` — the grouping is a section comment. AD-6 is described, not checked. | patch |
| 7 | `query-keys.ts` header says "ten invalidation sites"; there are four sites holding ten literals | **low** | Counted: `useAccountLiveUpdates` 4, `SendTab` 3, `TrustLinesTab` 2, `BalancesTab` 1. Direct correction. | patch |
| 8 | "pins the entry shared by the Balances screen and the pre-flight probe" is byte-identical to the first assertion in the file and imports neither module | **medium** | Verified at `query-keys.test.ts:46-53` — the assertion duplicates line 12 exactly. The test's name claims a property it does not exercise, in the most load-bearing place in the change. | patch |
| 9 | Source comments cite `AD-4` / `AD-6`, which resolve nowhere under `docs/` | **medium** | `grep -rn "AD-4\|AD-6" docs/` returns nothing; the IDs exist only in `_bmad-output/planning-artifacts/`. The repo's own instruction is to follow the link, and this link goes nowhere. | patch |
| 10 | Invalidation test header describes `SendTab`'s path but asserts `incomingPaymentWatch`, which `SendTab` does not invalidate | **low** | Verified at the file header and against `SendTab.tsx:123-125`. Direct correction. | patch |
| 11 | No `check:query-keys` script beside `check:contrast`; the "no install step" property is claimed but unused | **low** | Confirmed: `package.json` has only `check:contrast`. The guard runs solely inside `lint`, behind `bun install`. Convention mismatch. | patch |
| 12 | A key bound to a variable first (`const k = [...]`) evades the guard | **medium**, unverified as reachable | Real hole, confirmed by fixture. Already recorded as a known limitation in Implementation Notes. Closing it needs dataflow analysis, which is beyond a text scan. | defer |
| 13 | The four invalidation sites invalidate four different subsets of the account-scoped keys, with nothing checking them against each other | **medium** | Real, and confirmed by reading all four sites. Pre-existing: the subsets differed before this change too. Not caused by this story. | defer |
| 14 | `docs/agents/ledger-io.md:12` still tells agents to hand-write wallet and network into every key, with no mention of the factory or the gate | **medium** | Verified the line exists and is now behind the code. Fix edits an agent-context file. | defer |
| 15 | The guard scans `src/` only, so a literal in `scripts/` or `vite.config.ts` is unpoliced despite the header's wording | **low** | True, but no query key exists outside `src/` and none plausibly would. Header wording is corrected under #4. | reject — no named harm |
| 16 | Plain-text matching means a JSDoc example showing the banned form fails the gate | **low** | True. Resolved by the escape-hatch directive added under #4; no separate fix needed. | reject — subsumed by #4 |


## Verification

**Commands:**
- `bun run lint` -- expected: exit 0, including the new key check.
- `bun run build` -- expected: exit 0; carries the typecheck.
- `bun run test` -- expected: exit 0; the new `query-keys.test.ts` passes alongside the existing suites.
- `bun run check:contrast` -- expected: exit 0, unchanged — no token or colour is touched.
- `git diff --stat` -- expected: no file outside the Code Map's listed paths.

**Manual checks:**
- With two wallets configured on Testnet, switch between them and confirm balance, trust lines and history all follow the switch with no stale figure — the defect this epic exists to prevent, and the one no unit test can prove.
