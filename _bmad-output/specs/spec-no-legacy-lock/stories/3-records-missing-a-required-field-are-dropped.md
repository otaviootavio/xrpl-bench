---
title: 'Records missing a required field are dropped'
type: 'refactor'
created: '2026-11-02'
status: 'done'
baseline_commit: '7f35e9dbf8730af5861c6a2c38bed091d7202c1e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The saved app state and the vault still guess a value for a wallet record that lacks one (`seedId`, `keyAddress`, `network`, `algorithm`, `seedMethod`, `openCheck`, `signingCheck`, and for a vault record `views`), and a vault record with no lock id reaches the screens as `undefined`. FR-95 says such a record is invalid and not shown.

**Approach:** Delete the guesses. Filter a record that is missing any of those fields, or whose Open Check is not `pin`, `passkey` or `none`, in the two places wallets are read: the saved app state and the vault. The stored record is left as it is; it is only not shown.

## Boundaries & Constraints

**Always:** `'unresolved'` stays a valid `algorithm` value (a Seed whose curve is derived on first decryption); only a missing field is invalid. One validity rule per shape, applied where the data is read, so no screen ever sees a half record. A dropped record is silent (FR-95: not shown). A node that fails validation is still dropped to the built-in Nodes, as today. A record written by any current writer (create, import, passkey-derived, controlled view, edit checks, rename) must pass the rule, or fresh wallets would vanish.

**Never:** Delete or rewrite a dropped record. Add a migration, a version number, a default, or a notice. Touch copy that names no deleted symbol, or tests named legacy (story 4). Change the unlock proof or an Open Check's behaviour. Design the smarter breaking-change handling noted in `deferred-work.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Complete wallet, saved state and vault | All fields present, valid Open Check | Loads and opens exactly as before | N/A |
| Saved-state entry missing any one field | e.g. no `network`, no `signingCheck`, no `lockId` | Not in the list; no guess; nothing thrown | Hydration still succeeds with the rest |
| Vault Seed record missing a field or `views` | e.g. no `lockId`, empty `views` | Not returned by the vault read; no `undefined` lock id reaches a screen | Other wallets unaffected |
| Open Check `either`, missing, or any other value | In a Seed record or a lock record | Seed record: dropped. Lock record: reads as no such lock ("Lock not found.") | Fails closed; wording never says "no authentication" |
| Fresh create or import of each kind | Each current writer | Record passes the rule and shows | N/A |

</frozen-after-approval>

## Code Map

- `src/store/app-store.ts` -- `normaliseWallets` (lines ~143-169): remove the guess for `seedId`, `keyAddress`, `network`, `algorithm`, `seedMethod`, `openCheck`, `signingCheck`; filter on the validity rule (the `lockId` filter is from story 2); the `persistedNetwork` and `fallback` parameters and their use at line ~231 then go.
- `src/lib/crypto/db.ts` -- `StoredWallet` (lines ~63-92): make `seedMethod`, `algorithm`, `openCheck`, `signingCheck` and `views` required; `LockRecord.openCheck` required; add the one validity function and apply it in `listStoredWallets` (line ~195, the only bulk read of `wallets`). `OpenCheck` union already has no `either`.
- `src/lib/crypto/keystore.ts` -- `toMetas` and `viewsOf` (lines ~69-92): drop the `?? 'unresolved'`, `?? 'stored'`, `?? 'pin'`, `?? 'standard'` and the fallback-network view; `listWallets(fallbackNetwork)` loses its parameter, so six callers lose their argument (`App.tsx:71`, `WalletNodeSection.tsx:31`, `CreateWalletFlow.tsx:496`, `remove-wallet.ts:65`, `WalletScreens.tsx:43`, `keystore.ts:1157`); delete the two "This wallet's record is incomplete" guards (~1139, ~1174), which only caught a record with no views.
- `src/lib/crypto/lock.ts` -- `getLockInfo` (line ~89): drop `record.openCheck ?? 'pin'`; a lock record with a missing or invalid `openCheck` throws "Lock not found.".
- `src/components/wallet/check-words.ts` (`openCheckWords`) and `reveal-copy.ts` (`revealCheckSentence`): make the switch exhaustive over `OpenCheck` (`none` is its own case; no default that reads as "no authentication").
- Tests: `src/store/__tests__/app-store-migration.test.ts` (rename to what it tests, since it tests normalising), `wallet-views.test.ts`, `fixtures.ts`, `lock.test.ts`, `check-words.test.tsx`, and any test that builds a record without all fields (add the fields, do not weaken the rule). One new test per missing field for the saved state and for the vault read.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/crypto/db.ts` -- required fields in the types, the validity function, applied in `listStoredWallets` -- the vault choke point
- [x] `src/store/app-store.ts` -- remove guesses, filter on the rule, drop the unused parameters -- the saved-state choke point
- [x] `src/lib/crypto/keystore.ts`, `lock.ts`, and the six `listWallets(arg)` callers -- remove defaults, the fallback view and the two guards -- no leftover guessing
- [x] `check-words.ts`, `reveal-copy.ts` -- exhaustive switches -- no wrong "no authentication" wording
- [x] Tests -- one per missing field at both levels; fixtures carry all fields; rename `app-store-migration.test.ts`; delete tests that exist only for a removed default -- CAP-3

**Acceptance Criteria:**
- Given a saved-state entry missing any one of the eight fields, when the app loads, then that wallet is absent, nothing is guessed and nothing throws.
- Given a vault Seed record missing a field or `views`, when wallets are listed, then it is absent and no lock id is `undefined` on any screen; the stored record is unchanged.
- Given a freshly created or imported wallet of each kind, when listed, then it appears (the rule does not hide current records).
- Given an Open Check of `either` or none valid, when its words or reveal sentence are asked, then it never reads "no authentication".

## Implementation Notes

- One validity rule per shape, both built from the same four guards exported by `db.ts` (`isOpenCheck`, `isSeedMethod`, `isSeedAlgorithm`, `isSigningCheck`): `isCompleteStoredWallet` (vault Seed record: all fields, allowed values, non-empty `views` whose entries have a `walletId` and a valid `network`) and `isCompleteSavedWallet` (saved list entry, same values, plus `keyAddress`, `seedId` and a valid `network`). `'unresolved'` stays a valid `algorithm`.
- `listStoredWallets` filters through the rule (the one bulk read); `getLockRecord` returns nothing and `listLockRecords` skips a lock record whose `openCheck` is not `pin`, `passkey` or `none`; `getLockInfo` just throws "Lock not found." when there is no record.
- Removed: every `?? 'unresolved' | 'stored' | 'pin' | 'standard'` default (`toMetas`, `normaliseWallets`, `editChecksUnguarded`), the fallback-network view and the `fallbackNetwork` parameter (`listWallets()` takes no argument; six callers updated), the two "record is incomplete" guards, and `wallet.views ?? []` in `assertOneOwnView`.
- `openCheckWords` and `revealCheckSentence` switch exhaustively over `OpenCheck`; `none` is its own case.
- Tests: `app-store-migration.test.ts` renamed `app-store-normalising.test.ts` with one case per missing field and per bad value; vault-read, lock-record, `getLockInfo`, `revealCheckSentence`, removal ("an invalid record counts as absent") and import ("an invalid record is not a duplicate") cases added; tests that only covered a removed default deleted.
- An invalid record counts as absent everywhere the vault list is used: it does not keep a lock or the App PIN alive, and importing its address is not refused as a duplicate. This is deliberate and pinned by tests.
- Not changed: a dropped vault record is never deleted or rewritten. The saved app list is a mirror of the vault, and the app rewrites that mirror without the dropped entries the next time it saves (seen in the browser pass); the vault records are untouched.

## Spec Change Log

## Review Triage Log

Iteration 0. Layers: blind-hunter (BH), edge-case-hunter (EC), verification-gap (VG), ui-mobile (UI). Verdicts are mine. The four layers first died on a usage limit and were resumed, not re-run.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | BH, EC | Rules check a field is a non-empty string, not that it is an allowed value, so `algorithm: 'banana'` or `seedMethod: 'foo'` passes (the old code coerced `seedMethod`); `views` entries are not checked | medium | `isCompleteStoredWallet` and `isCompleteSavedWallet` use `str(...)` for `seedMethod`, `algorithm`, `signingCheck`; `toMetas` reads `views` entries unchecked | patch (shared enum guards in both validators, view entries checked) |
| 2 | BH, EC | Only `getLockInfo` rejects a lock record with a bad `openCheck`; other readers take the raw record | medium | `getLockRecord` and `listLockRecords` in `db.ts` return records unvalidated; `planFor` and `lockStamp` read `record.openCheck` | patch (validate at `getLockRecord` and `listLockRecords`) |
| 3 | VG, BH, EC | Hidden records are invisible to removal, lock cleanup, App PIN discard and the duplicate check; no test pins it | low | `removeWalletUnguarded` counts via `listStoredWallets`; treating an invalid record as absent is the consistent reading of "not shown", and counting it would keep a PIN alive on a device with no visible wallet | patch (tests pin the behaviour; no code change) |
| 4 | EC | `remove-wallet.test.ts` `rec(id, undefined)` now builds a record that is filtered out, so lock-less tests may pass vacuously | low | `rec` helper omits `lockId` when undefined | patch |
| 5 | BH, EC, VG | Saved-state and vault missing-field tables omit `id`, `label`, `address`, `createdAt` | low | `FIELDS` list in `app-store-normalising.test.ts`; vault test lacks `id` | patch |
| 6 | BH, VG | `revealCheckSentence` has no test (acceptance criterion 4, second half) | low | No test file covers it | patch |
| 7 | BH | Comment in `no-app-wide-network-read.test.ts` still says "migration input" | low | Stale after the migration was deleted | patch |
| 8 | BH | Spec `created` date is 2026-11-03; today is 2026-11-02 | n/a | My typo in the spec | fixed by me |
| 9 | BH, EC | New create or import could overwrite a hidden record with the same id | false | Ids are random UUIDs (`crypto.randomUUID()`); a collision with a stored id is not a reachable case | reject |
| 10 | BH, EC | Importing the Seed of a hidden record creates a second record beside it | low | Same decision as 3: an invalid record is absent; the new record is complete | covered by 3 |
| 11 | BH | A record with no `encryptedSeed`, `sealedSeed` or `derived` passes the rule and fails at unlock | low | Not in FR-95's list of fields; fails closed at unlock with an error; pre-existing | reject |
| 12 | BH, EC | `mutateStoredWallet` and single-record reads bypass the filter; `viewsOf(current).map` could throw if views vanished mid-write | low | Ids reaching them come from the filtered list; a throw inside the callback aborts the write (fails closed); needs a corrupt concurrent write | reject |
| 13 | BH, EC | A persisted `activeWalletId` can name a dropped wallet | false | `App.tsx:71-77`: after `listWallets()` the Gate re-picks `stored[0]` when the active id is not in the list; with none listed Onboarding shows | reject |
| 14 | BH | Silent drop leaves a wallet unreachable from the UI | n/a | This is the FR-95 decision ("not shown", no notice), confirmed by Otavio; a smarter way is noted in `deferred-work.md` | reject |
| 15 | BH, EC | Switches return `undefined` at runtime for a bad value; add a `never` guard that throws | low | With 1 and 2, a bad value cannot reach them; a throw in copy code would crash a screen; the type is the guard | reject |
| 16 | EC | `revealCheckSentence(undefined)` | false | `if (!wallet) return ''` is the first line | reject |
| 17 | BH | `app-store.ts` imports a runtime value from `db.ts` | low | It already imported `LEGACY_LOCK_ID` from `db.ts` before this story | reject |
| 18 | BH | `viewsOf` is now an identity function | low | 25 call sites; removing it is churn for no behaviour change | reject |
| 19 | BH | `addControlledView` / `setWalletNode` now say "not found" for an invalid record | low | The record is not listed, so "not found" is what the app shows | reject |
| 20 | EC | `no-app-wide-network-read.test.ts` may fail because `App.tsx` still reads the network | false | The test passes in the full run (126 files, 1863 tests) | reject |
| 21 | BH | Story file lacks Implementation Notes and Triage Log | n/a | Fix is to edit this spec; filled in at the end | reject |
| 22 | UI | No UI check applies; a dropped wallet disappears without an explanation | none | Diff changes no markup; the no-notice rule is decided | none |

## Design Notes

A record is valid when every field is present and `openCheck` is `pin`, `passkey` or `none`. `algorithm: 'unresolved'` is a value, not an absence. Filtering at `listStoredWallets` is enough because every reader of Seed records goes through it; the build agent should confirm no other bulk or single read of the `wallets` store bypasses it.

## Verification

**Commands (final tree, run by me, not the build agent):**
- `bun run lint` -- clean (oxlint plus the seven repo checks)
- `bun run build` -- `tsc -b` and bundle succeeded
- `bun run test` -- 127 files, 1879 tests passed (1836 after story 2)
- `bun run check:contrast` -- all token pairs pass
- After the last three one-line removals of leftover defaults: `tsc -b`, `bun run lint` and the crypto and store tests (24 files, 485 tests) re-run and pass.

**Browser pass (real Chromium through Playwright, virtual authenticator with PRF):**
- Under test: working tree on `7f35e9d` plus this story's uncommitted changes, `bun run dev` on port 5413, a clean origin; no earlier wallet state touched. Two throwaway Testnet seeds, never Mainnet. 390x844 light for the flows.
- Current writers, each through the real screens, each shows in the chooser and is open: first-run Import with an App PIN; Add wallet Import with a passkey Open Check; Add wallet Create with a Passkey-Derived Seed (through the ordinal screen).
- Planted directly in IndexedDB, then reloaded: three broken vault Seed records (one with no `signingCheck`, one with `views: []`, one with `openCheck: 'either'`) and two broken saved-list entries (one with no `network`, one with `signingCheck: 'banana'`). Result: the chooser listed exactly the three good wallets, no broken label appeared, there were no page errors, and all three broken vault records were still in the vault, unchanged. The saved list came back with the two broken entries gone (the app saved its mirror without them).
- After the reload the good wallets still lock and open: the PIN wallet with its PIN and the Passkey-Derived wallet through the authenticator (both reached Balances).
- Layout: chooser with the three cards at 375x667 light and dark and 320x568 dark: no horizontal overflow, Add wallet reachable. Detector `[]` over the changed `.tsx` and copy files. The diff changes no markup; the audit has nothing new to score on these screens.

**Not observed (said plainly):**
- Create a Stored Seed wallet (generate and write down a Seed) and a controlled-account view, in a browser: both write through code paths that the unit tests cover, and a Stored Seed record is made by the same writer family as Import; neither was driven.
- A dropped wallet gets no notice, by decision; no screen explains why a wallet is missing.
- Coarse-pointer sizes and 200% text, which this story does not touch.
