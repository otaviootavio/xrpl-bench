---
title: 'A Wallet has one Network for life'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: 'a2fecdc0911395d8c50c3e0f4d519361b8176140'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/_bmad-output/specs/spec-one-network-per-wallet/SPEC.md'
warnings: [oversized]
deferred:
  - summary: >-
      A controlled view added by addControlledView on Mainnet is not checked against the lock or checkWalletRequest, and no test pins that.
    evidence: |-
      addControlledView (src/lib/crypto/keystore.ts, about line 1338) calls neither assertLockAllowsNetwork nor checkWalletRequest. This predates story 22.2 and the story's intent says not to touch it. Whether it is a defect depends on whether the validated SetRegularKey flow already enforces the Mainnet floor; read the caller in the control flow to settle it.
    location: >-
      src/lib/crypto/keystore.ts:1338
    severity: low
---

<intent-contract>

## Intent

**Problem:** Configure still has an "Other networks" plate, and `addNetworkView` still adds a second Network to a Seed record. A Wallet can therefore sit on two Networks under one lock, which FR-93 forbids.

**Approach:** Delete `addNetworkView` and the plate. Add one write guard so a record can never hold two plain (non-controlled) views. Keep the Remove "sibling" body only for a controlled account. Controlled views and two-device signing stay as they are.

## Boundaries & Constraints

**Always:** Creation and import write exactly one view, with the Network chosen on quiz step 1. No function changes a view's `network` after creation. The shape stays "Seed record plus views" (AD-47). A controlled view (`addControlledView`) is the only view ever added to a record, and it carries `accountAddress`. Plate order after the change: Name, Checks, Seed, Operating another account, Node, Two-device signing, Remove.

**Never:** Do not touch `addControlledView`, "Operating another account", `TwoDeviceSign`, `checkWalletRequest`, the lock model or the quiz steps. No migration, reset screen or code for an old multi-network record (AD-48); do not rewrite the keystore. Do not touch the chooser, cards, Unlock or the Import sentence (stories 22.3 to 22.5). Do not delete or reword Rename: with one view per record it already acts on one Wallet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create or import | Any Network chosen on step 1 | Record has exactly one view, on that Network | No error |
| Second plain view | A write whose views hold two entries that both lack `accountAddress` | Refused before the store is touched; nothing changes | Throws a plain error |
| Controlled view | Key holder plus one view with `accountAddress` | Allowed, as today | No error |
| Configure screen | Any Wallet | No "Other networks" plate, no "Use on ..." key | n/a |
| Remove a plain Wallet | One view on its Seed record | Body is "sole" (or "last") | n/a |
| Remove with a controlled sibling | Another Wallet on the same Seed record has an `accountAddress` | Body is "sibling" | n/a |

</intent-contract>

## Code Map

- `src/lib/crypto/keystore.ts` -- `addNetworkView` (line ~1336): delete with its doc comment. `assertLockAllowsNetwork` (~230) stays: `storeWallet` (~244) still uses it. Check `getLockInfo`, `checkWalletRequest`, `getRpId` and any other import that only `addNetworkView` used, so lint stays clean. Creation writes one view at ~264, ~1074, ~1268. `addControlledView` (~1380) is read-only. `removeWalletUnguarded` (~795) removes one view and deletes the Seed record with its last view; update its doc line "another network's view" to say a controlled view.
- `src/lib/crypto/db.ts` -- `putStoredWallet` (~216) and `mutateStoredWallet` (~261, the `put` at ~275) are the only record writes. Add one small `assertOneOwnView(wallet)` called before each put: more than one entry in `views` with no `accountAddress` throws. Legacy records with no `views` pass. The migration (~414) writes one view.
- `src/components/wallet/OtherNetworksPlate.tsx` -- delete the file.
- `src/components/wallet/ConfigureScreen.tsx` -- remove the import (line 12) and the mount (~321). `RemovePlate` (~250) doc says "one network view only": say "one Wallet".
- `src/lib/remove-copy.ts` -- `removeBodyFor` (~18) returns `'sibling'` when any wallet shares the `seedId`. Tighten it: `'sibling'` only when another same-`seedId` Wallet exists and it, or the target, has `address !== keyAddress` (a controlled account). `WalletMeta` has both fields. `REMOVE_SIBLING` text names no Network; keep it. Fix the comment ("another network view"). `src/components/wallet/remove-copy.ts` re-exports it.
- `src/lib/remove-wallet.ts` -- line 48 compares the shown body to a fresh `removeBodyFor`; read-only.
- Tests that call `addNetworkView` and must be deleted or re-pointed (to `addControlledView` with an `accountAddress` where they need a second view): `src/pages/tabs/__tests__/configure-network-views.test.tsx` (delete; its Remove-dialog cases move to `configure-remove.test.tsx` only if not already there), `src/components/__tests__/configure-shell.test.tsx` (`PLATE_ORDER` line 27), `src/lib/crypto/__tests__/edit-checks.test.ts` (~654, ~678), `derived-wallet.test.ts` (~603 to 617), `migration.test.ts` (~259 to 415), `create-stored-wallet.test.ts` (~377), `lock.test.ts` (~432), and the mocks in `create-entry-points.test.tsx`, `configure-edit-checks.test.tsx`, `configure-node.test.tsx`, `configure-auto-lock.test.tsx`, `pin-dialog.test.tsx` (drop the `addNetworkView` mock line).
- Policy cases that `addNetworkView` carried (Mainnet floor, derived-Seed refusal) are covered at creation by `createStoredWallet` and `checkWalletRequest`; do not lose the creation-side tests. Delete cases that tested only the added-view behaviour.
- `src/pages/tabs/__tests__/configure-remove.test.tsx` -- case ~101 and ~120 use a plain sibling; re-point them to a controlled sibling.
- Read-only: `src/lib/control.ts`, `teardown.ts`, `master-key.ts`, `addControlledView` tests.

## Tasks & Acceptance

**Execution:**
- `src/lib/crypto/keystore.ts` -- delete `addNetworkView` and any import left unused -- AD-47, no second code path adds a plain view.
- `src/lib/crypto/db.ts` -- add `assertOneOwnView`, called by `putStoredWallet` and `mutateStoredWallet` before the put -- the write-time guard CAP-1 asks for.
- `src/components/wallet/OtherNetworksPlate.tsx` -- delete -- the section is gone.
- `src/components/wallet/ConfigureScreen.tsx` -- unmount the plate; fix the Remove comment -- FR-61, FR-88.
- `src/lib/remove-copy.ts` -- make the sibling body depend on a controlled account -- FR-85, FR-86.
- `src/lib/crypto/__tests__/` and `src/pages/tabs/__tests__/` -- delete or re-point every test listed in the Code Map; add: (a) `putStoredWallet` and `mutateStoredWallet` each refuse a record with two views that both lack `accountAddress`, and leave the store unchanged; (b) a record with a plain view plus a controlled view is accepted; (c) `createStoredWallet` and `importStoredWallet` each store exactly one view; (d) `removeBodyFor` gives `sibling` only with a controlled account, otherwise `sole` or `last`; (e) `keystore` exports no `addNetworkView`.
- `src/components/__tests__/configure-shell.test.tsx` -- new `PLATE_ORDER` without "Other networks"; assert no "Other networks" text and no button named `/^Use on /`.

**Acceptance Criteria:**
- Given any Wallet's Configure screen, when it renders, then there is no "Other networks" plate and no key to add or switch a Network.
- Given a creation or an import on any Network, when the record is read back, then it holds exactly one view, on the Network chosen on step 1.
- Given a write of a record with two views that both lack `accountAddress`, when it reaches the store, then it throws and the stored record is unchanged.
- Given a Wallet whose Seed record has no controlled view, when Remove is pressed, then the dialog shows the "sole" body (or "last"), never the sibling body.
- Given a Wallet that shares its Seed record with a controlled account, when Remove is pressed, then the dialog shows the sibling body.
- Given the full suite, when it runs, then controlled-account, two-device signing and policy tests still pass and none of them was weakened.

## Design Notes

The guard sits in `db.ts` because it is the single place every record write passes, so no later code path can skip it. A record written by an old build with two plain views is not handled (AD-48); it would throw on a later edit, which is acceptable because the owner removes such wallets first. The sibling body is now derived from `address !== keyAddress`, the same fact `hasView` and `toMetas` already use to tell a controlled account from a key holder.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors, no unused imports
- `bun run build` -- expected: `tsc -b` and Vite succeed
- `bun run test` -- expected: all green, with no test skipped to pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- In a Playwright browser on Testnet only (never Mainnet, no real funds): create a Wallet, open Configure, and confirm there is no "Other networks" plate and the plates run Name, Checks, Seed, Operating another account, Node, Two-device signing, Remove. Check 320px and desktop, light and dark. Press Remove and confirm the "sole" or "last" body.

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 25 findings — high 0, medium 2, low 9, false 14, maybe-false 0
- findings:
  - `[medium]` `[reject]` Blind 1: a record already holding two plain views throws on rename, node, checks, auto-lock — real for old data, but the intent contract says "no migration, reset screen or code for an old multi-network record (AD-48)" and the I/O row says a two-plain-view write throws; rejected as excluded by the intent. The owner can still remove the Wallet, which leaves one plain view.
  - `[false]` `[reject]` Blind 2: throw inside the open IDB transaction — nothing has been put when `assertOneOwnView` throws, so the transaction commits empty and the record is unchanged; `done` already has a no-op catch at the top of `mutateStoredWallet`.
  - `[false]` `[reject]` Blind 3: `removeBodyFor` misreads records without `keyAddress` or with an unknown id — `toMetas` always sets `keyAddress` (keystore.ts:88) and `seedId`; with an unknown id no wallet has an undefined `seedId`, so `others` is empty and the `target as WalletMeta` cast is never evaluated.
  - `[low]` `[reject]` Blind 4: no tests for unknown id, missing `keyAddress` or a legacy two-plain-view Seed reading "sole" — the cases are unreachable or the intent's accepted behaviour (AD-48); adding tests is not a correction of a defect.
  - `[low]` `[reject]` Blind 5: deleted coverage — the deleted derived-Seed Mainnet tests exercised `addNetworkView` only; the creation-side ones (derived-wallet.test.ts, b-cdn.net, passkey-only, Mainnet) remain, as the spec asked. Mainnet missing from the one-view create test is a thin test gap, unlikely to hide a defect since the write path is the same for all Networks.
  - `[false]` `[reject]` Blind 6: dead code in keystore.ts — `getRpId`, `checkWalletRequest`, `getLockInfo`, `findSeedRecord`, `assertLockAllowsNetwork` and `viewsOf` all still have other callers, and `bun run lint` passes clean. `other-networks` and `use-on-mainnet` are referenced nowhere in src; `data-configure-plate` is still used by Name.
  - `[low]` `[reject]` Blind 7: docs and comments not swept — remaining mentions are in older specs and story records, which are history; the code comments were updated. Not worth a change here.
  - `[low]` `[reject]` Blind 8: generic error message and loose `/one network/` match — the message and "throws a plain error" are what the intent specifies; the test also checks the store is unchanged. A two-controlled-views test would be extra, not a correction.
  - `[false]` `[reject]` Edge 1: `controlled(undefined)` TypeError — only evaluated when `others.length > 0`, which needs a wallet with an undefined `seedId`; none exists.
  - `[false]` `[reject]` Edge 2: undefined `keyAddress` read as controlled — `keyAddress` is a required string always set by `toMetas`.
  - `[false]` `[reject]` Edge 3: empty `accountAddress` counts as plain — the guard uses `!v.accountAddress`, so an empty string is plain, which is the strict direction; a second plain view is still caught.
  - `[false]` `[reject]` Edge 4: transaction left open on throw — same as Blind 2; no write was issued, so nothing is left pending.
  - `[false]` `[reject]` Edge 5: deleted derived Mainnet tests — they covered `addNetworkView`; creation-side tests remain (derived-wallet.test.ts lines 411 to 471).
  - `[low]` `[reject]` Edge 6: no migrated-record test for one view — migration writes one view and is untouched; the story forbids changing it. Test-only wish.
  - `[low]` `[reject]` Edge 7: create test covers testnet and devnet only, import testnet only — same as Blind 5; thin but the code path is Network-agnostic.
  - `[medium]` `[reject]` Gap 1: no test for a legacy two-plain-view record on rename, node, remove — same root as Blind 1; AD-48 and the intent contract exclude handling it, so a test asserting an outcome for it would contradict the intent. Filed disposition (patch or defer) not followed for that reason.
  - `[false]` `[reject]` Gap other 1: `removeBodyFor` on metas lacking `keyAddress` — as Blind 3, every meta path sets it; the new test builds metas the same way.
  - `[false]` `[reject]` Gap other 2: `'addNetworkView' in keystore` is not behavioural — spec task (e) asks for exactly this check, and the guard tests carry the behaviour.
  - `[low]` `[defer]` Gap other 3: a Mainnet controlled view has no lock or policy check or test — pre-existing, in code the story must not touch; severity low, unverified whether the caller already enforces it. Deferred in frontmatter.
  - `[false]` `[reject]` Intent 1: absence of "Other networks" only inferred — configure-shell.test.tsx now asserts the new `PLATE_ORDER`, `queryByText('Other networks')` null and no `/^Use on /` button.
  - `[false]` `[reject]` Intent 2: guard not driven through create and import — create-stored-wallet.test.ts asserts one view through `createStoredWallet`, and import-stored-wallet.test.ts asserts `rec.views` through `importStoredWallet`.
  - `[low]` `[reject]` Intent 3: sibling versus sole shown only at function level — `configure-remove.test.tsx` re-points the dialog cases to a controlled sibling; a further rendered case for a plain pair is cheap but not a defect.
  - `[false]` `[reject]` Intent 4: no test that no function changes a view's Network — the only view mutators left are `addControlledView` (appends) and `setWalletNode` (`views.map` returns the view with only `node` changed); none writes `network`.
  - `[low]` `[reject]` Intent 5: "controlled" decided by `address !== keyAddress` in `removeBodyFor` but by `accountAddress` in the guard — the spec prescribes this exact test and the two are the same fact in `toMetas`; no named caller would diverge.
  - `[false]` `[reject]` Intent 6: no browser pass artifact — not a code defect; the spec's Manual checks are run at verification, after review.

## Auto Run Result

### Summary

A Wallet now has one Network for life. `addNetworkView` and the "Other networks" plate are deleted. One write guard (`assertOneOwnView`) means a record can never hold two plain (non-controlled) views. The Remove dialog keeps its "sibling" body only for a controlled account. Configure now lists Name, Checks, Seed, Operating another account, Node, Two-device signing, Remove.

### Files changed

- `src/lib/crypto/keystore.ts`: removed `addNetworkView`.
- `src/lib/crypto/db.ts`: added `assertOneOwnView`, used by `putStoredWallet` and `mutateStoredWallet`.
- `src/lib/remove-copy.ts`: "sibling" body only when a controlled account exists, detected by address differing from key address.
- `src/components/wallet/ConfigureScreen.tsx`: removed the Other networks plate; Remove plate reads "Remove this wallet on <Network> from this device."
- `src/components/wallet/OtherNetworksPlate.tsx`: deleted.
- `src/lib/__tests__/remove-copy.test.ts`: new, covers sole, last and sibling in each direction.
- `src/lib/crypto/__tests__/*.test.ts` (create, derived, edit-checks, import, lock, migration, rename): updated to one view per record.
- `src/components/__tests__/configure-shell.test.tsx`, `src/pages/__tests__/create-entry-points.test.tsx`, `src/pages/tabs/__tests__/configure-{auto-lock,edit-checks,node,remove}.test.tsx`, `pin-dialog.test.tsx`: updated for the new plate order and copy.
- `src/pages/tabs/__tests__/configure-network-views.test.tsx`: deleted with the feature.

### Review findings

Counts: high 0, medium 2, low 9, false 14, maybe-false 0. The two mediums were patched. Every rejected finding and its reason is in the Review Triage Log above. One low is deferred (see frontmatter `deferred`: `addControlledView` is not checked against the lock, which predates this story).

### Verification

Gates passed: lint, build, test (1829 passed in 126 files, 0 failed, 0 skipped), check:contrast.

Browser pass: I ran a dev server on port 5222 in a fresh browser profile. I created a local Testnet wallet with no open check and a local Devnet wallet "Dev One" with an App PIN. I locked Dev One, unlocked it, and opened Configure from the in-wallet header. Nothing touched Mainnet and nothing was funded or signed. I did not run a Devnet import of the same Seed, because that is the 22.1 flow and not part of 22.2.

Every 22.2 criterion that shows in the browser passed. Configure on both wallets lists exactly Name, Checks, Seed, Operating another account, Node, Two-device signing, Remove. The page text has no "Other networks" and no "Use on ..." key. The Remove plate reads "Remove this wallet on Devnet from this device." Each wallet was created with its single Network from quiz step 1, and the Review step showed Network as locked. The last wallet's Remove dialog gave the "last" body. With two wallets on the device, Dev One's dialog gave the "sole" body ("This app will no longer hold the encrypted seed..."). It never showed the sibling body. Focus lands on Cancel when the dialog opens and returns to Remove on Escape. I could not check the sibling body for a controlled account, because that needs a ledger-side controlled account.

Layout checked at 390 dark, 320 light, 1280 dark, and 200% zoom (640 wide) dark. No horizontal overflow in any (scrollWidth equalled clientWidth) and nothing clipped. Screenshots: `/tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/c4ce42c4-8ea1-4e40-a6c7-c1d935b46f31/scratchpad/e22/shots-2/`. The 390 light and 1280 light views were not captured. Quiz Back, Next and Change focus were not tested on this story's screens. The dev server is stopped and no stray files remain in the repo.

Audit score: 19/20 (Excellent; the only visual change is a removal). No P0 or P1.

### Non-blocking P2/P3 issues

- P3, buttons on Configure and chooser (Rename, Edit checks, Reveal seed, Remove, Open, Lock, header Wallets): many are 32px or 36px tall, below 44px. This is the shared button size, not changed by 22.2.
- P3, chooser locked card: shows only name and "Locked", no Network or address. That is story 22.3 scope.
- P3, `src/lib/remove-copy.ts` `removeBodyFor`: "sibling" versus "sole" depends on a derived test (address !== keyAddress) to detect a controlled account. If a Wallet's address ever equals its key address while a controlled sibling exists, the dialog would wrongly say "sole". The new remove-copy tests cover each direction.
- P3, `ConfigureScreen.tsx`: the Other networks plate is gone and no `other-networks` focus id remains in `src`. Remaining mentions are in `docs/decisions.md` (historical); it may need a note that FR-61 is superseded.
- P3, `src/lib/crypto/db.ts` `assertOneOwnView`: throws "A wallet can only be on one network." If it ever fires, the raw message could reach a toast. Callers should handle it like other keystore errors.
- P3, `ConfigureScreen.tsx` `RemovePlate`: a user holding a controlled-account view of the same Seed gets the "sibling" body; confirm the dialog text still names that consequence. No accessibility, theming, responsive or performance regressions: no new markup, tokens, colours or focus styles.

### Residual risks

- The sibling Remove body for a controlled account was not seen in a browser (needs a ledger-side controlled account); only unit tests cover it.
- Old multi-network records are not migrated (AD-48); the write guard would throw on them.
- `docs/decisions.md` has not been annotated that FR-61 is superseded.
