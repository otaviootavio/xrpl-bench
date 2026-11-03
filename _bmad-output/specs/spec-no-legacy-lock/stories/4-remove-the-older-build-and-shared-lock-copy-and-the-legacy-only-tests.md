---
title: 'Remove the older-build and shared-lock copy and the legacy-only tests'
type: 'refactor'
created: '2026-11-02'
status: 'done'
baseline_commit: '8a21b089c4a81fe76049f26abd9582d06b500561'
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

**Problem:** After stories 1 to 3 the app still tells the user about an "older version" that can no longer open a wallet, a number of comments and test names still talk about legacy locks, migrations and rolled-back builds, and a few fixtures still use `legacy` as a lock id. FR-95 says nothing the user reads mentions an older build, and no test should exist only for the legacy path.

**Approach:** Remove the older-build warning and its helper, reword or delete every comment and test name that describes the removed path, and keep every sentence that is still true today (a controlled Wallet really does share its lock). No behaviour of unlock, Open Checks, Signing Checks or the controlled-Wallet lock changes. Decided 2026-11-02: the saved app state's rollback leftovers go too (the `autoLockMinutes` field that nothing reads, its place in the persisted shape, tests, and every comment about a rolled-back build); the `network` field stays only if something still reads it as a default, with an accurate comment. The Address Book's special handling of old entries (no recorded network, tag not recorded) is NOT in this story; it is recorded in `deferred-work.md`.

## Boundaries & Constraints

**Always:** A sentence stays when it is true today. A controlled Wallet opens with the lock of the Wallet that holds its key (FR-93, FR-75), so copy about locks being shared stays where it can appear for that case; the build reads when each one can show and records the answer in the spec. A word that is about the XRP Ledger (the ledger's own "legacy" `delivered_amount`, `Amount` and `unavailable` values in `reads.ts` and `money.ts`) is not about this product and stays. A test of current behaviour is renamed or rewritten, never dropped; a test that only exists for the older-build warning is deleted with it.

**Never:** Change what unlock, an Open Check or a Signing Check does, the controlled-Wallet shared lock, or story 3's validity rules. Add a replacement notice, a version number or a migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit checks: add a Signing Check | Wallet with Signing Check "Nothing is asked" picks App PIN or Passkey only | The screen shows the choice and its PIN or passkey step; no "older version" alert | N/A |
| Two Wallets on one lock | A controlled Wallet and the Wallet that holds its key | The lock-shared notes still appear where they appear today | N/A |
| One Wallet per lock | Any ordinary Wallet | No shared-lock note appears | N/A |
| Search of `src` for older-build wording | After the change | Every remaining hit is true today (the ledger's legacy fields, a still-used mirror with an accurate comment) | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/crypto/policy.ts` (`olderBuildCannotOpen`, ~line 329) and `src/components/wallet/EditChecksScreen.tsx` (alert at ~line 497, `warnOlder` at ~222): delete the helper, the flag and the alert; the PIN and passkey fields they sat beside stay.
- `src/lib/crypto/__tests__/policy.test.ts` (~lines 217-219) and any `edit-checks-screen` or `configure-edit-checks` test that asserts the alert: delete those assertions.
- Comments that talk about older builds: `src/lib/crypto/db.ts` lines ~64 and ~84 ("an older build then finds none", "an older build ignores it"): reword to what is true now (a Signing Check leaves one ciphertext form; the record field is additive).
- Shared-lock copy that must be judged, not assumed: `src/pages/Chooser.tsx` (~lines 65, 83), `src/pages/tabs/WalletTab.tsx` (~line 120). Keep what a controlled Wallet can reach; reword the header "Each one has its own lock" only if it is wrong for that case.
- Fixtures and titles still naming the removed concept (from the story 2 entry in `deferred-work.md`): `settings-address-book.test.tsx`, `settings-full-reset.test.tsx`, `unlock-hard-lock-reset.test.tsx` (`WALLET.lockId`, default `h.info`), `active-network.test.ts` (describe "legacy persisted state is normalised on merge"), plus `remove-wallet-data.test.ts`, `configure-*.test.tsx`, `network-display.test.tsx`, `seed-import-screens.test.tsx` and `payment-amount.test.ts` if their hits are about the removed path (the last one may be about the ledger).
- `src/store/app-store.ts` (~lines 14-26, 207-222): remove the unused persisted `autoLockMinutes` (type, `PERSISTED_DEFAULTS`, `partialize`, `merge`, its tests) and reword the rollback comments; keep `network` only if `useActiveNetwork` still reads it as a default. `address-book.ts` and `SendTab.tsx:176` are not touched (deferred).
- `src/lib/xrpl/reads.ts` and `money.ts`: the ledger's own legacy fields; leave.

## Tasks & Acceptance

**Execution:**
- [x] `policy.ts`, `EditChecksScreen.tsx` and their tests -- delete the older-build helper, flag, alert and its assertions -- CAP-4
- [x] `db.ts` and other comments -- reword every sentence that names an older build, a migration or a legacy lock so it is true today -- CAP-4
- [x] `Chooser.tsx`, `WalletTab.tsx` -- judge each shared-lock sentence against when it can appear; keep or reword; record the decision in this spec -- CAP-4
- [x] Fixtures and test titles -- rename `id: 'legacy'` and legacy-titled cases; delete any test that only covered the removed path -- CAP-4, CAP-5
- [x] `src/store/app-store.ts` and its tests -- remove the unused persisted `autoLockMinutes` and every rollback comment -- CAP-4
- [x] A search of `src` for `legacy`, `migrat`, `older build`, `older version`, `unmigrated`, `rolled-back` and `rollback` -- every remaining hit is judged and kept only where true, listed in Implementation Notes

**Acceptance Criteria:**
- Given the Edit checks screen, when a Signing Check is chosen, then no "older version" alert is shown and the rest of the screen reads and works as before.
- Given a controlled Wallet sharing a lock, when the lock-shared copy applies, then it still appears; given an ordinary Wallet, then none appears.
- Given `src`, when searched for the older-build and legacy-lock wording, then no hit describes the removed path.

## Implementation Notes

- Removed `olderBuildCannotOpen`, `warnOlder`, the alert and the policy test; the screen test now asserts no older-version alert shows.
- Shared-lock copy: the Chooser "Locking X also locked Y: they share one lock." note and WalletTab "This lock is shared by N wallets" only appear when two Wallets share a lock (a controlled Wallet), so both stay. The header "Each one has its own lock" could read false for that case, so it is now "Choose a wallet to open."
- `autoLockMinutes` removed from the persisted shape, defaults, `partialize` and tests. `network` stays: `useActiveNetwork` falls back to it with no active Wallet; comment now says so.
- Fixture lock id `legacy` renamed `lockA`; legacy-titled cases retitled.
- Remaining hits, all kept: `reads.ts`/`money.ts`/`payment-amount.test.ts` (ledger's own legacy fields); `address-book.ts`, `address-book.test.ts`, `send-address-book.test.tsx`, `SendTab.tsx:176`, `migrateAddressBook` and `legacyBlob` (Address Book old-entry handling, deferred); `seed-import-screens.test.tsx` and its `LEGACY_LOCK_ID` guard (asserts the removed path stays removed); app-store comment on `migrate`/`merge` (true: why no version bump).

- Review round 1 patches: the vacuous "the app-store minutes" guard test deleted, a redundant seed line in `teardown.test.ts` removed, the "shared lock" edit test made genuinely shared (`sharedA`, `sharedB` on `lockA`), the `OPEN` fixture renamed `OPEN_LOCK`, `legacyBlob` renamed `blobWithList` and the version-0 test retitled with the present reason, the `getLockInfo` mock restored to the real shape, a test added that a saved blob still carrying `autoLockMinutes` hydrates and drops it on the next save, a positive assertion added to the Edit checks screen test, and the `rev` comment tidied.
- Final search of `src` (non-test) for `legacy`, `older build`, `older version`, `unmigrated`, `rolled-back` and `rollback`: only the XRP Ledger's own legacy fields in `reads.ts` and `money.ts` (true today) and the Address Book's old-entry handling in `address-book.ts` and `SendTab.tsx:176` (deferred on purpose, recorded in `deferred-work.md`). In tests: the same two groups, plus tests that assert the removed names stay gone.


## Spec Change Log

## Review Triage Log

Iteration 0. Layers: blind-hunter (BH), edge-case-hunter (EC), verification-gap (VG), ui-mobile (UI). Verdicts are mine.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | BH, EC | `describe('the app-store minutes')` in `configure-auto-lock.test.tsx` greps for a field that no longer exists | low | Test can only pass; the type system already rejects a read | patch (delete) |
| 2 | BH, EC | `teardown.test.ts` line 85 is a redundant double-quoted seed line | low | `declineUpdateVersion('deadbeef')` on the next line seeds the residue | patch (delete) |
| 3 | EC | `legacyA` variable, and the "shared lock" test is not actually shared | low | `configure-edit-checks.test.tsx`: A on `lockA`, B on `Y` | patch (rename, share the lock) |
| 4 | EC, BH | `OPEN.lockA` is used for locks `X` and `Y` | low | `network-display.test.tsx` lines 81-104 | patch |
| 5 | EC, BH | `legacyBlob` helper and a test title that still give the rollback reason | low | `app-store-normalising.test.ts` lines 48, 96; the spec says no rollback wording | patch |
| 6 | BH | `getLockInfo` mock lost `autoLockMinutes: 5` | low | Differs from the real lock info shape | patch |
| 7 | BH, EC | Nothing tests that an old saved blob with `autoLockMinutes` hydrates | low | Field removal removed its only fixtures; `merge` spreads unknown keys, harmless | patch (one test) |
| 8 | BH | The new negative test pins removed copy and asserts nothing about the choice | low | Matrix row says the choice is shown | patch (add a positive assertion) |
| 9 | BH | `rev` comment ends in a bare "Additive." | low | `db.ts` ~line 83 | patch |
| 10 | BH | Chooser header dropped instead of qualified; `sharedNote` has no lead-in | low | The spec allowed rewording; the note itself ("they share one lock") is self-explanatory; header would still be false for a controlled Wallet | reject |
| 11 | BH | Docs outside `src` may still require the removed alert | false | `grep` of the PRD, `decisions.md`, user stories and spec: the only "older build" text in the PRD is FR-95 itself; the architecture sentence in AD-23 states behaviour, it does not require an alert; story 8's table is a record of a finished story | reject |
| 12 | VG, EC | No test of the kept `sharedNote` for a shared lock | false | `chooser.test.tsx:298` and `:306` assert both messages | reject |
| 13 | EC | Users on a stale installed build get no warning; a rolled-back build loses its auto-lock default | n/a | Intended by FR-95 and Otavio's decision of 2026-11-02 | reject |
| 14 | EC, VG | `mergePersistedAppState` spreads a stale `autoLockMinutes` into live state | low | Nothing reads it, `partialize` no longer writes it; pinned by the test in 7 | reject |
| 15 | BH | Spec file not closed out | n/a | Fix is to edit this spec; filled in at the end | reject |
| 16 | BH | Rename `legacy` to `lockA` is mechanical | low | The id is a neutral lock id; cases are retitled | reject |
| 17 | UI | No UI check applies | none | Diff removes an alert and shortens one line of copy | none |

## Design Notes

Copy is judged by when it can appear, not by its words. "Each one has its own lock" is true for every Wallet except a controlled one that borrows its controller's lock; the sentence is reworded only if the build finds it can be read as false for that case.

## Verification

**Commands (final tree, run by me, not the build agent):**
- `bun run lint` -- clean (oxlint plus the seven repo checks)
- `bun run build` -- `tsc -b` and bundle succeeded
- `bun run test` -- 127 files, 1878 tests passed
- `bun run check:contrast` -- all token pairs pass

**Browser pass (real Chromium through Playwright):**
- Under test: working tree on `8a21b08` plus this story's uncommitted changes, `bun run dev` on port 5431, a clean origin. A throwaway Testnet seed, never Mainnet.
- Flow at 390x844 light: first-run Import with an App PIN, the chooser header now reads "Choose a wallet to open.", open the wallet, Local settings, Edit checks, choose "App PIN only": there is no "older version" alert, the "Your App PIN, for the new check" field and the Save and Cancel buttons show, and the screen has no alerts at all (before this story it showed the older-version alert).
- Layout, measured by element rects: 390x844 light, 375x667 light and dark, and 320x568 dark at normal text: Save, Cancel and the PIN field are inside the scroll area or reachable by scrolling, no horizontal overflow, controls inside their container. At 320x568 with 200% text, light and dark: no overflow, no alert.
- Screenshots opened and checked: 390 light and 320 dark at 200% text.

**Found, not caused by this story (recorded in `deferred-work.md`):** at 320x568 with 200% text the page frame leaves a scroll area of about 199px, and the sticky footer (Save and Cancel stacked, about 190px) is as tall as that area, so Save is never fully on screen. The alert this story removed sat in the scrolling content, so it could only have made this worse.

**Not observed (said plainly):**
- Completing a Signing Check save in the browser in this story (done in story 2's pass); the screen was only brought to the point of choosing it.
- A controlled Wallet sharing a lock, to see the kept shared-lock notes in a browser; they are covered by `chooser.test.tsx` (lines 298 and 306) and the Local settings tests.
- 1280px and coarse-pointer sizes.
