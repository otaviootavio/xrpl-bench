---
title: 'Epic 2 — the two sealed boundaries actually hold'
type: 'refactor'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2eba44c'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two modules own dangerous things — `lib/crypto` owns key material,
`lib/xrpl` owns the network — but both boundaries are observed by convention,
not enforced. Two screens call `Wallet.fromSeed` directly. `lib/xrpl/writes.ts`
reaches up into the app store, which is why the send path cannot be tested
without standing up React state. And `lib/xrpl/client.ts` constructs a real
`Client` with no seam, so the two-endpoint failover — the thing that keeps the
wallet readable when an endpoint is down — has never been tested and cannot be.

**Approach:** Give `keystore.ts` the one entry point the screens actually need,
so no page imports `Wallet`. Invert the in-flight dependency so `writes.ts`
reports upward instead of reaching up. Give `client.ts` an injectable client
factory and a reset, then test the failover through it.

## Boundaries & Constraints

**Always:**
- Production behaviour is unchanged in every path. This is a refactor.
- `submitAndClassify` stays the single choke point every write passes, and the
  in-flight flag is still raised before the first network call and cleared in a
  `finally` (FR-48 depends on it: an update must not activate mid-transaction).
- The disabled-master-key pre-flight check keeps running **before** anything is
  written to the vault, on both the onboarding and the settings import paths.
- A plaintext seed stays in a local or a ref. Never React state, a store, a
  query cache, or a log — including in development builds.
- Every query key comes from `lib/xrpl/query-keys.ts`.

**Never:**
- No new runtime dependency, and no change to any user-visible behaviour, copy,
  or visual token.
- Do not move `useAccountLiveUpdates`' subscription into `lib/xrpl`. It is a
  push stream rather than a read; record it as a named exception instead.
- Do not weaken the choke point by letting a caller opt out of in-flight
  reporting per call.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Address from a seed | a valid seed | The account's classic address, derived with no network call | Malformed seed throws, as `Wallet.fromSeed` does today |
| Import with a disabled master key | seed whose account has `lsfDisableMasterKey` | The warning is shown before the wallet is written to the vault | Unchanged |
| Primary endpoint refuses | factory rejects on the primary URL | The backup URL is tried and the read succeeds | N/A |
| Primary endpoint hangs | factory never resolves on the primary | After the 10s timeout the backup is tried | N/A |
| Both endpoints refuse | factory rejects on both | One error naming both URLs, with the last failure preserved as `cause` | Throws |
| Connection reuse | a connected client already cached for that network | The same client is returned; no second connection opened | N/A |
| Cached but disconnected | cached client reports not connected | A fresh connection is made | N/A |
| Write raises the in-flight flag | any payment or trust-line submit | Reporter called `true` before the first network call, `false` in `finally` | `false` still reported when the submit throws |

</frozen-after-approval>

## Code Map

- `src/lib/crypto/keystore.ts` -- owns `Wallet`. Already exports `generateAndStoreWallet`, `importAndStoreWallet`, `unlockWalletForSigning`, `revealSeed`. Needs one addition: derive an address from a seed with no storage side effect.
- `src/pages/Onboarding.tsx:2,102` -- imports `Wallet`; `Wallet.fromSeed(seed)` is used **only** to get `.address` for the pre-flight probe at `:103`.
- `src/pages/tabs/SettingsTab.tsx:21,74` -- same pattern, same single use.
- `src/lib/xrpl/writes.ts:4,33,64` -- imports `@/store/app-store`; `setTxInFlight(true)` before autofill, `false` in `finally`. The three exported submitters all route through `submitAndClassify`.
- `src/lib/xrpl/client.ts` -- module-level `Map<NetworkId, Client>`, `new Client(url)` inside the failover loop, `connectWithTimeout` with `CONNECT_TIMEOUT_MS = 10_000`, `disconnectAllClients`.
- `src/lib/xrpl/networks.ts` -- `NETWORKS[network].wsUrl` / `.wsUrlBackup` / `.label`.
- `src/App.tsx` -- where app-level wiring belongs; already holds the `QueryClientProvider`.
- `src/lib/teardown.ts` -- calls `disconnectAllClients`. Must keep working.
- `src/hooks/__tests__/useAppUpdate.test.tsx` -- the existing jsdom + mock pattern to follow.
- `src/lib/crypto/__tests__/vault.test.ts` -- shows how `../db` and `../webauthn` are mocked in this repo.
- Reuse, do not change: `reads.ts`, `money.ts`, `result-codes.ts`, `query-keys.ts`, every hook.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/crypto/keystore.ts` -- export a seed-to-address derivation with no storage side effect -- so a screen can run the pre-flight probe without importing `Wallet`.
- [x] `src/pages/Onboarding.tsx`, `src/pages/tabs/SettingsTab.tsx` -- use it; drop the `Wallet` import -- AD-3.
- [x] `src/lib/xrpl/writes.ts` -- remove the `@/store/app-store` import; report in-flight through a reporter the app installs once, defaulting to a no-op -- AD-1, and it makes the send path testable.
- [x] `src/App.tsx` -- install the store's setter as that reporter at startup -- keeps FR-48 working.
- [x] `src/lib/xrpl/client.ts` -- accept an injectable client factory and expose a reset; default behaviour unchanged -- AD-12.
- [x] `src/lib/xrpl/__tests__/client.test.ts` -- new; cover every failover row in the matrix -- the failover has never been tested.
- [x] `src/lib/xrpl/__tests__/writes.test.ts` -- new; assert the in-flight transitions around a submit, including the throwing path -- proves the choke point still holds after the inversion.
- [x] `src/lib/crypto/__tests__/keystore.test.ts` -- new or extended; cover seed-to-address including a malformed seed.
- [x] `_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-2026-09-12/ARCHITECTURE-SPINE.md` -- record `useAccountLiveUpdates`' subscription as AD-2's one named exception, with its reason -- AD-2 requires an exception to be recorded rather than implied.

**Acceptance Criteria:**

- Given the whole change, when `src/pages` and `src/components` are searched, then no file imports `Wallet` from `xrpl`, and pure offline validators are still importable anywhere.
- Given a search of `src/lib`, when the imports are inspected, then no module under `lib` imports from `src/store`, `src/hooks`, `src/components` or `src/pages`, except `lib/notify.tsx` importing `store/notice-store`.
- Given a payment that throws mid-submit, when the error propagates, then the in-flight flag has still been cleared.
- Given an app update is available and a payment is in flight, when the user tries to apply it, then it is still blocked.
- Given importing a seed whose account has a disabled master key, when the import runs, then the warning appears before the wallet is written to the vault, on both import paths.

## Implementation Notes

- The keystore gained two entry points, not one. `addressFromSeed` serves the
  pre-flight probe on both import paths; `isValidSeed` serves the "Continue"
  validity check on Onboarding's import-seed step, which the Code Map did not
  list. That check asks "is this seed usable", not "what address is this", so
  it gets its own named function rather than a derivation called for its
  throw. Both keep AD-3 intact: neither screen imports `Wallet`.
- The in-flight reporter is installed at **module scope** in `App.tsx`, not in
  an effect: StrictMode double-invokes effects (the reason `useAppUpdate`
  registers its worker at module scope too), and an effect would leave a
  window in which a submit could run before the reporter existed.
- Three resets, each doing one thing: `disconnectAllClients()` (production
  teardown, closes sockets), `resetXrplClients()` (clears the cache only) and
  `resetXrplClientFactory()` (restores the real constructor). Clearing the
  cache deliberately does not restore the factory — otherwise a test that
  resets mid-run and forgets to re-install its fake would construct a real
  `Client` and block on two live endpoints.
- `src/__tests__/tx-in-flight-bridge.test.ts` imports `@/App` for its
  module-scope side effect and asserts a real submit flips the REAL store's
  `txInFlight`. Without it the bridge was one deletable line with nothing
  behind it. Verified by deleting that line: the suite goes red.
- `connectWithTimeout` now clears its timer once the race settles. Not
  user-visible; it stops a resolved connect leaving a 10s timer pending.
- **Acceptance criterion "the warning appears before the wallet is written to
  the vault, on both import paths" is NOT met on the settings path, and was
  not met before this change.** `SettingsTab.handleAddWallet` runs the
  pre-flight *check* before `importAndStoreWallet` (so the frozen "Always"
  constraint holds), but calls `setImportWarning` *after* it. Making the
  warning genuinely block the write needs a confirm step like Onboarding's
  `import-warning` — a user-visible flow change the frozen "Never" list
  forbids in this refactor. Reordering the two statements without a gate
  would be theatre. Left as-is and reported; it wants its own story.
- **Acceptance criterion "no module under `lib` imports from `src/store`,
  `src/hooks`, `src/components` or `src/pages`, except `lib/notify.tsx`
  importing `store/notice-store`" is not fully met**, for a reason outside
  this epic: `src/lib/notify.tsx:2` also type-imports `NoticeTone` from
  `@/components/ui/alert`. Removing `writes.ts`'s store import cleared the
  only edge this spec owns. Reported, not repaired.
- **Superseded.** The note below described commit `885d4ef`, which has since
  been amended into this spec's baseline `2eba44c`. At `2eba44c` the directive
  is present and `bun run lint` exits 0, so the diff correctly contains no lint
  fix. Kept for the record of what was found.
- `bun run lint` was **already red on the then-baseline commit `885d4ef`**
  (verified with `git stash -u`, identical guard output), at
  `src/lib/xrpl/__tests__/query-key-invalidation.test.ts:46` — the deliberate
  retyped-key counterexample was missing the guard's own
  `// check-query-keys-allow` directive. One comment line added so the spec's
  `bun run lint` exit 0 is reachable; that directive is the mechanism
  `scripts/check-query-keys.mjs` documents for exactly this case. Nothing
  else about that test changed.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | The store bridge is one deletable line in `App.tsx:22` with no test behind it; deleting it leaves every suite green while FR-48 silently dies | **high** | Verified: `App.tsx:22` installs at module scope, `writes.test.ts:48` installs its own reporter, `useAppUpdate.test.tsx:59` mocks the store with a hardcoded `txInFlight: false`, and no test imports `@/App`. Before this change the coupling was compile-enforced. | patch |
| 2 | `submitIssuedPayment` has no test, and the `expired` and `failed` branches are uncovered, while the suite opens by asserting every write passes the choke point | **medium** | Confirmed by reading the new `writes.test.ts`: two of three exported writes covered. The fake client already returns a ledger index low enough to drive the expiry branch. | patch |
| 3 | `MAX_FEE_XRP` is not asserted — the fake `autofill` discards its options argument, so a fee-cap regression stays green | **medium** | Confirmed. The cap exists to stop a fee spike turning a small payment into an expensive one, so it is worth pinning. | patch |
| 4 | "returns the cached client without opening a second connection" proves it only for sequential calls | **medium** | Confirmed by reading the test. Several queries fire at mount, so the concurrent case is the real one — and it is not what the test name claims. | patch |
| 5 | `resetXrplClients()` also restores the default factory, so a test that clears mid-run and forgets to re-install a fake constructs a real `Client` | **medium** | Confirmed by reading `client.ts`. Two live endpoints at 10s each is a 20s hang in a unit suite. | patch |
| 6 | `addressFromSeed(...)` is called for its throw and the address discarded, as a validity check | **medium** | Confirmed at the Onboarding "Continue" site. The call says "derive an address" and means "is this seed valid" — the shared derivation makes the mismatch a shared one. | patch |
| 7 | `keystore.test.ts` asserts `generated.seed!.startsWith('sEd')` — a property of `Wallet.generate`, not of the unit under test | **low** | Confirmed. Direct correction, so not rejected. | patch |
| 8 | The in-flight signal is a boolean, so two overlapping writes let the first `finally` clear the flag while the second is still in flight | **medium** | Real, and reachable: the flag is deliberately global because Radix unmounts inactive tabs, so a send and a trust-line change can overlap. **Pre-existing** — `git show 2eba44c:src/lib/xrpl/writes.ts` uses the same boolean. Not caused by this story. | defer |
| 9 | Discarded clients are never disconnected, and a connect abandoned at the 10s timeout can still open a socket nobody owns | **medium** | Confirmed by reading the failover loop. Pre-existing; this change added the `clearTimeout` but not socket cleanup. | defer |
| 10 | `getXrplClient` has no in-flight deduplication, so concurrent callers each construct and connect a client | **medium** | Confirmed. Pre-existing shape; the new test simply does not cover it. | defer |
| 11 | Neither import path trims the seed input, so a pasted trailing newline reads as malformed | **low** | Confirmed at both call sites. Pre-existing behaviour. | defer |
| 12 | The two import paths disagree: Onboarding gates on the disabled-master-key warning, Settings writes first and warns after; they also handle a malformed seed differently | **medium** | Confirmed, and already reported by the implementer as an unmet acceptance criterion. Pre-existing; fixing it is a user-visible flow change this spec forbids. | defer |
| 13 | A reporter that throws inside the `finally` would replace the submit outcome | **low** | Real in principle. The installed reporter is a zustand setter, which does not throw, and the fix is a guard rather than a direct correction. | reject |
| 14 | `setXrplClientFactory` and `setTxInFlightReporter` are ordinary exports guarded only by a comment | **low** | True, but the proposed fixes (lint restriction, dev-mode warning) add machinery for a problem with no named victim. | reject |
| 15 | An Implementation Note cites commit `885d4ef` and says lint was red at baseline, but the spec's baseline is `2eba44c`, where the directive is present and lint is green | **low** | Accurate: the note predates the amend that produced `2eba44c`. Its fix edits this build's spec, which triage does not route. Corrected as housekeeping instead. | reject |


## Verification

**Commands:**
- `bun run lint` -- expected: exit 0, including the query-key guard.
- `bun run build` -- expected: exit 0.
- `bun run test` -- expected: exit 0, with the new client, writes and keystore suites passing.
- `bun run check:contrast` -- expected: exit 0, unchanged.
- `grep -rn "from 'xrpl'" src/pages src/components` -- expected: only pure offline validators.
