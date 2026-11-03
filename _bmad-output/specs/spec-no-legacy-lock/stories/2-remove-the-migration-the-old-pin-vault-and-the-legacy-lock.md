---
title: 'Remove the migration, the old PIN vault and the legacy lock'
type: 'refactor'
created: '2026-11-02'
status: 'done'
baseline_commit: '8a3efb525a210ea27548bbcaa02a2953470ad45b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-passkey-signing-2026-10-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Since story 1 nothing creates a legacy-lock Wallet, yet `LEGACY_LOCK_ID`, `migrateLegacyVault`, the old App-PIN vault setup (`setUpVaultAuth`), the legacy wrappers on the `vault` record and the `either` Open Check remain in the unlock and signing code, and 34 test files carry legacy fixtures.

**Approach:** Delete them outright (FR-95, AD-52). Every Wallet has its own lock; the App PIN is proved from its own verifier; an Open Check is `pin`, `passkey` or `none`. Decided 2026-11-02: `sealSeedUnderSigningCheck` (no app caller, reads the legacy vault passkey) is deleted too, and its test uses move onto `editChecks` or direct fixtures. Decided: this stays one story.

## Boundaries & Constraints

**Always:** An unlock is still proven by decrypting known ciphertext (a Passkey-Derived Seed by address match); no secret enters state, store, URL or storage. One App PIN, one failure count, proved only from `pinVerifier`. A controlled Wallet keeps opening with the lock of the Wallet that holds its key (FR-93). A test of current behaviour that used a legacy fixture is rewritten onto a current one, never dropped; a test that exists only for deleted code is deleted with it. A reference that names a deleted symbol is removed in this story wherever it sits.

**Never:** Touch the app-store fallbacks for `seedId`, `keyAddress`, `network`, `algorithm`, `openCheck`, `signingCheck` or `seedMethod` (story 3); only the `lockId ?? LEGACY_LOCK_ID` line goes here, as it names the constant (a record with no string `lockId` is filtered out). Remove copy that names no deleted symbol (story 4). Add a migration, a reset screen or a default in their place. Bump the IndexedDB version.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open a PIN Wallet / a passkey Wallet | Own lock, correct credential | Opens as before | Wrong PIN counts on the shared counter; cancelled prompt never counts |
| Repass for Reveal or a Signing Check | PIN or passkey Open Check | Same prompt and result as before | `locked-out` and `unsupported` as before |
| Create the first Wallet with a PIN | Empty vault | App PIN written with its verifier; no legacy record | N/A |
| Remove the last Wallet | One Wallet | App PIN, count, every lock and session discarded | Failure reported as today |
| Auto-lock minutes edit | Own lock | Written to that lock's record | Unknown lock throws "Lock not found." |

</frozen-after-approval>

## Code Map

- `src/lib/crypto/db.ts` -- delete `LEGACY_LOCK_ID`, `migrateLegacyVault` + `LegacyMigrationInput`, `legacyOpenCheck`, `openCheckOf`; `sessionKeyOf` becomes `session:${id}`; drop the `?? LEGACY_LOCK_ID` in `seedStamp` and `commitWalletEdit`; `deleteLockRecord` loses its legacy refusal; `OpenCheck` = `'pin' | 'passkey' | 'none'`. `VaultMeta` keeps `pinSaltB64`, `pinVerifier`, `failedAttempts`, `lockedUntil`; its legacy fields (`wrappedMasterKeyForPin`, `wrappedMasterKeyForPasskey`, `passkeyCredentialIdB64`, `rpId`) go. Fix the `exclusiveVaultWrite` comment list.
- `src/lib/crypto/lock.ts` -- delete `legacyLockRecord`, `writeLegacyLock`, the legacy branches of `getLockInfo`, `planFor`, `listLocks`, `restoreOpenLocks`, `setAutoLockMinutes`; `provesAppPin`/`withAppPin`/`discardUnusedAppPin`/`discardAppPin` use `pinVerifier` only; drop `either` from `pin`/`passkey` flags.
- `src/lib/crypto/auth.ts` -- delete `setUpVaultAuth` and its helpers; keep `hasPasskeyRegistered` only if a caller remains (it reads the legacy wrapper: check, likely delete) and `wipeVault`, `getLockoutState`, `HKDF_INFO` exports still used.
- `src/lib/crypto/keystore.ts` -- delete `migrateLegacyVault`, `generateAndStoreWallet`, `importAndStoreWallet` (+ unguarded forms); remove `?? LEGACY_LOCK_ID` (lines 85, 537, 811-812, 1469, 1501, 1665) and `legacyLockRecord` at 1615; `repassOpenCheck` and `provesAppPin` callers lose `either`; `setLockAutoLock` loses the "not migrated yet" refusal; delete `sealSeedUnderSigningCheck` (decided).
- `src/lib/crypto/policy.ts:319` -- drop `current.openCheck === 'either' ? 'pin'`.
- `src/App.tsx` (lines 9, 55) -- delete the migration call and import.
- `src/lib/teardown.ts:184` -- `removed.lockId !== LEGACY_LOCK_ID` condition goes.
- `src/store/app-store.ts:156` -- `lockId` fallback only (see Never).
- `src/components/wallet/EditChecksScreen.tsx` (223, 426), `reveal-copy.ts` (12, 22), `check-words.ts` (18) -- remove `lockIsLegacy`, the legacy branch and the `either` case.
- Tests using `sealSeedUnderSigningCheck` as setup (`signing-check`, `control`, `master-key`, `derived-wallet`) move to `editChecks` or direct fixtures. 34 files reference `legacy` (heaviest: `lock.test.ts`, `create-stored-wallet.test.ts`, `migration.test.ts`, `app-store-migration.test.ts`, `vault.test.ts`). A plain string `lockId: 'legacy'` fixture works as any lock id; rewrite those that rely on legacy semantics. Delete `migration.test.ts` and `gate-migration.test.tsx` if they test only the migration.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/crypto/db.ts`, `lock.ts`, `auth.ts`, `keystore.ts`, `policy.ts` -- delete the legacy lock, migration, old vault setup and `either` as mapped -- CAP-2
- [x] `src/App.tsx`, `src/lib/teardown.ts`, `src/store/app-store.ts`, `EditChecksScreen.tsx`, `reveal-copy.ts`, `check-words.ts` -- remove every reference to a deleted symbol -- compiles, no dangling copy
- [x] Tests -- rewrite legacy-fixture tests onto per-wallet locks; delete tests that exist only for deleted code; add one test that the App PIN is proved from the verifier alone and one that `OpenCheck` has no `either` -- CAP-5
- [x] `docs/` and spec -- fix `db.ts` guard comment; nothing else

**Acceptance Criteria:**
- Given the final tree, when `src` is searched for `LEGACY_LOCK_ID`, `migrateLegacyVault`, `setUpVaultAuth`, `legacyLockRecord`, `writeLegacyLock`, `either` as an Open Check and `generateAndStoreWallet`/`importAndStoreWallet`, then nothing matches outside tests that assert their absence.
- Given a PIN Wallet and a passkey Wallet on their own locks, when each is locked, opened, revealed and removed, then behaviour matches the pre-story behaviour, in a real browser.
- Given a wrong PIN, when entered, then the shared counter moves exactly once; given a cancelled passkey prompt, then it does not move.

## Implementation Notes

- Deleted: `LEGACY_LOCK_ID`, `migrateLegacyVault` (db, keystore, startup call), `legacyLockRecord`, `writeLegacyLock`, `legacyOpenCheck`, `setUpVaultAuth` and the rest of the old vault setup in `auth.ts` (now only `wipeVault` and the lockout re-export), `generateAndStoreWallet`, `importAndStoreWallet`, `sealSeedUnderSigningCheck`, `storeWallet` and `assertLockAllowsNetwork` (dead once those went), `PRF_SALT`, `HKDF_INFO` in `derive.ts`, `hasPasskeyRegistered`, the `either` Open Check and `passkeyAvailableForReturningUser`.
- `OpenCheck` is `'pin' | 'passkey' | 'none'`. `VaultMeta` keeps `pinSaltB64`, `pinVerifier`, `failedAttempts`, `lockedUntil`. The App PIN is proved from `pinVerifier` only. `sessionKeyOf` is `session:${id}` for every lock.
- `StoredWallet.lockId` is now required (a deviation the build agent flagged); `app-store` filters a persisted wallet with no string `lockId` (the one app-store line this story owns).
- Tests: new `fixtures.ts` (PIN lock and Seed records, sealed records); `migration.test.ts` renamed `wallet-views.test.ts` with its non-migration cases kept; `gate-migration.test.tsx` deleted; new tests for the verifier-only App PIN, no `either`, a persisted wallet with no lock, unknown lock, and the PIN hard-lock message.
- Review round 1 patches: migration wording removed from `keystore.ts`, `PRF_SALT` deleted and `salt` made required, dead passkey branch removed from `Unlock.tsx`, the `either` comment removed from `policy.ts`, two legacy tests in `remove-wallet-data.test.ts` removed or renamed, `docs/decisions.md` pointer to FR-95.
- Deferred to story 3 and story 4: see `deferred-work.md` (vault-level records with no `lockId` or `views`, unknown `openCheck` values, `id: 'legacy'` fixture names).

## Spec Change Log

## Review Triage Log

Iteration 0. Layers: blind-hunter (BH), edge-case-hunter (EC), verification-gap (VG), ui-mobile (UI). Verdicts are mine.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | BH | `viewsOf` comment and two "not migrated yet. Restart the app" throws still name the migration | medium | `keystore.ts:70-72`, `1139-1141`, `1174-1176`; the migration can no longer run, so the message tells the user to do something that cannot help | patch (reword; guards stay) |
| 2 | BH | `PRF_SALT` still the default salt of `assertPasskeyAndDeriveBits` | medium | `webauthn.ts:6,159`; only test mocks use it; a caller that omits a salt would silently use the legacy lock's constant | patch (delete, make `salt` required) |
| 3 | EC, VG | `Unlock.tsx` passkey branch of the PIN hard-lock message is unreachable | medium | `getLockInfo` sets `pin` and `passkey` exclusively after `either` went; `Unlock.tsx:145-150`, `203` | patch |
| 4 | BH, EC | Hard-lock test lost the "nothing erased, no delete/wipe wording" guard | medium | Rewritten test only asserts absence for a passkey lock; no test asserts the PIN hard-lock message | patch (add test) |
| 5 | VG | `policy.ts:300` comment still names `either` | low | Reference to a deleted symbol | patch |
| 6 | VG | `remove-wallet-data.test.ts` keeps two tests that describe the legacy rule | low | Lines 45 and 78 pass only because `'legacy'` is now an ordinary id | patch |
| 7 | mine | Matrix row "unknown lock throws 'Lock not found.'" has no test | low | No test in `src` asserts that message | patch (add test) |
| 8 | BH, EC | Persisted wallets with no `lockId` vanish silently; vault Seed records with no `lockId` reach `toMetas` as `undefined` | medium | By FR-95 such a record is invalid and not shown; `getLockInfo(undefined)` throws "Lock not found.", so it fails closed. Silent drop and vault-level filtering are story 3's job (CAP-3) | defer (story 3) |
| 9 | BH, EC, UI | Copy defaults for an unknown or stale Open Check (an `either` record, an undefined value) read as "no authentication" | low | Only reachable by a record the removed migration wrote; story 3 drops records with an invalid `openCheck` | defer (story 3) |
| 10 | BH | `getLockInfo` reads an unknown `openCheck` as no credential; `LockRecord.openCheck` still optional | low | Same class as 9 | defer (story 3) |
| 11 | BH | `viewsOf` shows a record with no `views` on Testnet (a fail-open for the Mainnet floor) | medium | Only reachable for a record the removed migration never reached; belongs to invalid-record handling | defer (story 3) |
| 12 | BH, EC | Fixtures and titles still use `id: 'legacy'` as a lock id | low | `settings-address-book`, `settings-full-reset`, `unlock-hard-lock-reset`, `active-network` describe title; nothing asserts on them | defer (story 4) |
| 13 | BH | Docs still name deleted symbols; AD-27 not marked in `docs/decisions.md` | low | AD-27 is already marked superseded in the passkey spine; `decisions.md:1536` names `sealSeedUnderSigningCheck` | patch (one-line pointer, mine) |
| 14 | BH | `editChecksUnguarded` drops an auto-lock change if `lockRecord` is missing | false | `getLockInfo(fromLockId)` runs first in the same function and throws "Lock not found." when there is no record, so `putLock` never sees an undefined record | reject |
| 15 | EC | `repassOpenCheck` blocks a Reveal on a passkey lock on a device with no WebAuthn | false | Same as every passkey lock made by the quiz; only the removed `either` lock had a PIN fallback, which is the intent | reject |
| 16 | BH, EC | Old vault fields stay on disk (`discardUnusedAppPin` spread, `mutateVaultMeta`) and a stale bare `session` key lingers | false | No vault written by an older build exists (no users, FR-95); a vault made by this build never holds them; `discardAppPin` rebuilds from scratch | reject |
| 17 | BH | Guard-list test may pass vacuously | false | `remove-wallet.test.ts:266-285` reads `keystore.ts`, asserts each named wrapper matches `exclusiveVaultWrite(() => ...Unguarded(` and that `db.ts` lists it | reject |
| 18 | EC | `OpenCheck` no-`either` test is compile-time only; verifier-only test never seeds a legacy wrapper | low | The type check runs under `tsc -b` in the build gate; the field no longer exists in `VaultMeta`, so it cannot be seeded | reject |
| 19 | BH | Story file not closed out (tasks, notes, verification) | n/a | The fix is to edit this spec; filled in at the end of the build | reject |
| 20 | UI | Nothing on the UI checklist applies | n/a | Diff only removes copy and branches; no markup added | none |

## Design Notes

`VaultMeta` is two things in one record: the App PIN (salt, verifier, count: current) and the old master-key wrappers (legacy). Only the second goes. `discardAppPin` rebuilds the record from scratch, so it must stay in step with the trimmed type.

## Verification

**Commands (final tree, run by me, not the build agent):**
- `bun run lint` -- clean (oxlint plus the seven repo checks)
- `bun run build` -- `tsc -b` and bundle succeeded
- `bun run test` -- 126 files, 1836 tests passed (1867 before: 32 tests went with deleted code, one added for the matrix row and the review patches)
- `bun run check:contrast` -- all token pairs pass
- `src` search, non-test code: no match for `LEGACY_LOCK_ID`, `migrateLegacyVault`, `setUpVaultAuth`, `legacyLockRecord`, `writeLegacyLock`, `generateAndStoreWallet`, `importAndStoreWallet`, `sealSeedUnderSigningCheck`, `hasPasskeyRegistered`, `'either'`, `PRF_SALT`; test matches are tests asserting absence.

**Browser pass (real Chromium through Playwright, virtual authenticator with PRF attached):**
- Under test: working tree on `8a3efb5` plus this story's uncommitted changes, `bun run dev` on port 5402, a clean origin (no earlier wallet state touched). Two throwaway Testnet seeds, unfunded, never Mainnet. 390x844 light for the flows.
- Created through the real screens: a PIN wallet by first-run Import, and a passkey wallet by Add wallet. IndexedDB then held two separate `lock:<uuid>` records (one with a PIN wrapper, one with a passkey wrapper), a `vault` record with exactly `failedAttempts`, `key`, `pinSaltB64`, `pinVerifier`, sessions keyed `session:<uuid>`, and no `legacy` key and no bare `session` key.
- Lock and open: both wallets locked from the chooser. PIN wallet: a wrong PIN moved the shared counter 0 to 1 once, the right PIN reset it to 0 and opened it. Passkey wallet: its unlock screen offered only "Unlock with passkey" (no PIN field); the virtual authenticator opened it.
- Reveal Seed: the confirm copy named the right check on each ("your passkey will be asked", "your App PIN will be asked"). The passkey wallet's revealed Seed equals the Seed imported for it. The PIN wallet showed "8 tries remaining", then "7 tries remaining" after a wrong PIN, then revealed a Seed equal to the one imported, and the counter returned to 0.
- Edit checks: the screen has no `either` option. Setting an App PIN Signing Check took two PIN entries (the new check's, then the Open Check re-pass); the record became `signingCheck: pin` with a sealed Seed, no plain ciphertext and `rev: 1`; the Open Check lock was untouched. Reveal on that wallet then asked the App PIN and returned the same Seed.
- Remove: removing the PIN wallet deleted its lock record and session and left the passkey wallet and its lock alone. Removing the last wallet left zero wallets, no lock records, no sessions and a `vault` record with only `failedAttempts: 0` and its key; the app returned to Get started.
- Layout: unlock screen at 320x568 dark and 375x667 light and dark: the Unlock button reachable, inside the card, no horizontal overflow. Screenshot of 320 dark opened and checked.

**Not observed (said plainly):**
- A real Send through a Signing Check on a funded account. The faucet was not used; the Reveal path above exercises the same sealed-Seed decrypt, and unit tests cover the Send gate.
- The PIN hard-lock message in a browser (needs 8 wrong tries and the back-off); covered by the new unit test only.
- Switching an Open Check in a browser, a passkey Signing Check, coarse-pointer target sizes, 200% text, and the dark theme of Edit checks and the Reveal dialogs.

**375px and Impeccable audit (On Complete):**
- 375x667 light and dark on the unlock screen: Unlock button reachable, inside the card, no horizontal overflow.
- Audit scoped to the touched surfaces (unlock screen, Edit checks screen, Reveal and check copy), detector `[]` over the six changed UI files, no `outline-none`, `:focus`, inline style or hard-coded colour: **17/20 (Good)** — Accessibility 3, Performance 4, Responsive 3, Theming 4, Implementation Integrity 3. No P0, no P1. The UI part of the diff is 3 insertions and 9 deletions in two files, all removals. Open P2s: coarse-pointer height of the unlock and Edit-checks buttons not measured; the PIN hard-lock copy observed only through its unit test; copy defaults for an unknown Open Check (story 3, in `deferred-work.md`).

