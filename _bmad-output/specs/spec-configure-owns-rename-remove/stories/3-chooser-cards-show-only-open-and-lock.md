---
title: 'Chooser cards show only Open and Lock'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_revision: 'fc9e6036ec854e61b7963e52d1b3384ff673169c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/DESIGN.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Nothing asserts, or deliberately sets, where focus lands after a confirmed Remove from Configure.
    evidence: |-
      ConfigureScreen's RemovePlate passes `settled: () => {}` (shipped in 21.2); the old chooser test asserted focus on the h1 after removal, and that test went with the card. Three reviewers raised it. Settle by deciding the intended focus target, then add the assertion.
    location: >-
      src/components/wallet/ConfigureScreen.tsx:274
    severity: low
  - summary: >-
      docs/decisions.md and the wallet-chooser specs still describe Configure, Rename and Remove on the chooser card.
    evidence: |-
      docs/decisions.md:470 names the chooser card as a home for these controls; the fix edits agent-context docs, so it is deferred. Settle by re-reading AD-36, AD-43 and AD-46 and the spec-wallet-chooser stories against the shipped chooser.
    location: >-
      docs/decisions.md:470
    severity: low
---

<intent-contract>

## Intent

**Problem:** Each chooser card still carries Configure, Rename and Remove (and a Remove on every network row). Stories 21.1 and 21.2 gave Rename and Remove a home in Configure, so the card copies are now duplicates, and a destructive Remove sits one tap from Open (PRD FR-92).

**Approach:** Delete the three controls, their dialog hosts and the locked-card Remove reason from the chooser. Remove the code only they used. Re-point the card tests to the Configure surface and add a screen test that fails if any of the three controls renders on a card.

## Boundaries & Constraints

**Always:** An open card keeps Open (one per network row), Lock (when `allowsLock`), the lamp, Active legend, addresses, Devnet notice, the no-open-check line and the lock-failed alert. A locked card keeps its name, the Locked lamp word, the existing `Locked.` line, and one Open key; nothing else. `LockedGroup` keeps holding a name and ids only (AD-43). The header Configure key (`AppHeader.tsx`) is the only way in, unchanged. Removal logic stays in `lib/remove-wallet.ts` and the Configure `RemovePlate`; none of its guards change (AD-46). Every rule test (rename and remove) must exist on the Configure surface before its card copy is deleted; delete a card test only if a Configure test covers the same rule, otherwise port it. No new colour token; no `:focus`; no `outline-none`.

**Never:** Do not touch the Configure screen, `RenameDialog`, `RemoveDialog`, `lib/remove-wallet.ts`, `keystore`, Settings, Remove all, the quiz, the route table, or the lock model. Do not add a Configure link anywhere else. Do not reword the `Locked.` line or the lamp.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open card | Seed with open lock, several views | Buttons: per-row Open, then Lock only; no Configure, Rename or Remove | none |
| Open card, no Open Check | `allowsLock` false | Per-row Open only, plus the existing no-lock line | none |
| Locked card | closed lock | Name, Locked lamp word, `Locked.`, one `Open <name>` key; text "Open this wallet to remove it." absent | none |
| Header Configure | inside an open wallet | Key opens `/wallets/:id/configure`; Back returns to the wallet | none |
| Configure, lock closed | `/wallets/:id/configure` with closed lock | Returns to the chooser | as today |

</intent-contract>

## Code Map

- `src/components/wallet/WalletCard.tsx` -- remove `RenameKey`, the `Remove` button in `NetworkRow` (and its `onRemove` prop), the locked card's Rename and `aria-disabled` Remove plus the `REMOVE_LOCKED_REASON` paragraph, the open card's Configure and Rename, the `onRename`/`onRemove` props everywhere, and the imports `configureWallet`, `REMOVE_LOCKED_REASON`. `KEY`, `CardName`, `ActiveLegend`, `OpenCard` Lock block stay.
- `src/pages/Chooser.tsx` -- remove `renaming`/`removing` state, `removedRef`, `onRename`, `saveName`, `onRemove`, `confirmRemove`, both dialogs and their imports (`renameWallet`, `removeBodyFor`, `RemoveDialog`, `RenameDialog`, `openWalletNow`, `confirmRemoveWallet`, `notify`, `setWallets`). Keep lock, announce, Add wallet and focus logic. Fix the header and the comment above `saveName` (it names the Configure copy).
- `src/store/app-store.ts` ~101-114 -- `configureWallet` has no caller after this (the header navigates directly). Delete it and the `resetConfigureFocusReturn` import if nothing else there uses it.
- `src/lib/remove-copy.ts` -- delete `REMOVE_LOCKED_REASON` (only the card used it). `src/components/wallet/remove-copy.ts` is a one-line re-export; leave it.
- `src/components/AppHeader.tsx` ~61-75 -- the header Configure key; read-only. `src/components/__tests__/AppHeader.test.tsx` 52-80 already covers it.
- `src/components/wallet/ConfigureScreen.tsx` (`NamePlate`, `RemovePlate`), `src/lib/remove-wallet.ts` -- the surviving rename and remove paths; read-only.
- `src/pages/__tests__/chooser.test.tsx` -- `describe('the Configure key')` (117-150) is card-only: delete. `a locked card shows ...` (159) asserts `['Open','Rename','Remove']`: change to `['Open']`. `describe('the Rename key and dialog')` (400-580) and `describe('Remove (AD-46)')` (581-903) drive the card; the last test (892) is a source scan to keep, trimmed to the files that remain. Imports and `k.rename/remove/list` mocks go if unused.
- `src/pages/tabs/__tests__/configure-rename.test.tsx`, `configure-remove.test.tsx` -- the Configure tests. `configure-remove.test.tsx` 97 `the chooser card keeps its own Remove key` is now false: invert it into the new card screen test (or delete and put it in chooser.test.tsx).
- `src/components/__tests__/AppShell.test.tsx` ~166 -- closed-lock configure route returns to the chooser (check it covers it).

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/WalletCard.tsx` -- strip the three controls, the row Remove and the reason line, and their props -- CAP-3.
- `src/pages/Chooser.tsx` -- strip the dialog hosts and their handlers -- the card no longer calls them.
- `src/store/app-store.ts`, `src/lib/remove-copy.ts` -- delete `configureWallet` and `REMOVE_LOCKED_REASON` -- dead after the strip; the text must no longer exist.
- `src/pages/__tests__/chooser.test.tsx` -- map each deleted rename and remove test to its Configure counterpart (list in the table below); port any with no counterpart into `configure-rename.test.tsx` or `configure-remove.test.tsx` first; then delete the card ones. Add: (a) screen test, over a mix of open (multi-view), open no-check and locked cards, asserting no button whose name starts `Configure`, `Rename` or `Remove` and no text `Open this wallet to remove it`; (b) locked-card buttons are exactly `['Open']`; (c) open card buttons are only `Open ...` and `Lock ...`.
- `src/pages/tabs/__tests__/configure-remove.test.tsx` -- replace the "card keeps its Remove key" test.
- `src/components/__tests__/AppShell.test.tsx` -- only if no test covers header Configure then Back to the wallet, add one.

**Counterpart check (port if missing):** rename: title/help text, Enter on invalid, unchanged name closes silently, grandfathered duplicate silent, IME Enter, keystore refusal, failed write keeps typed name, Cancel, rule source scan. remove: both guards, three bodies, Cancel/Escape/Back, confirm result, sibling, precache and service worker untouched, last wallet, keystore throws, listWallets fallback, vault unreadable, PIN discard failure, busy double press.

**Acceptance Criteria:**
- Given an open card, when it renders, then its buttons are Open (per row) and Lock only, with no Configure, Rename or Remove.
- Given a locked card, when it renders, then it shows name, Locked and one Open key, and "Open this wallet to remove it." is nowhere in the app.
- Given the user is inside a wallet, when they press the header Configure key, then Configure opens and Back returns to the wallet; no chooser card links to it.
- Given Configure is requested with the lock closed, when the route resolves, then the app returns to the chooser.
- Given any card variant, when the screen test runs, then it fails if a Configure, Rename or Remove control renders.
- Given Configure at 320px and at 200% zoom, when viewed, then nothing clips or scrolls sideways, keys are 44px on coarse pointers and no new colour token is used.

## Spec Change Log

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 10, false 14, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: scope mismatch, diff is story 3 not 21.1 — the spec file and diff are both "Chooser cards show only Open and Lock"; the label was harness text, nothing in the code is mis-scoped.
  - `[low]` `[patch]` Blind: ported rename test titled "needs no lock" asserts nothing about the lock — real, the title overstates; patch (fixed): dropped "; needs no lock" from the test title at configure-rename.test.tsx:173; no other change. Losing Rename on a locked wallet is the intent (locked card keeps only Open), not a defect.
  - `[false]` `[reject]` Blind: many Remove guard tests deleted and not ported — all have Configure counterparts in configure-remove.test.tsx: call-time guard (162), lock closes while open (171), wallets changed (184), keystore throws (195), unreadable vault (207), double press (231), dismissal (243).
  - `[low]` `[defer]` Blind: Remove outcomes (focus after removal, notice order) no longer asserted — re-pick, sibling lock open and notice are asserted (configure-remove:130-144); only post-removal focus is not, and ConfigureScreen's `settled` is a no-op shipped in 21.2. Shares a root cause with the Edge and Verification-gap focus findings.
  - `[false]` `[reject]` Blind: dead code and unused imports — grep finds no `configureWallet` caller in src; `configure-launch.ts` is still used by AppHeader.tsx:72; lint was green; the second `remove-copy` file is the one-line re-export the spec says to leave.
  - `[low]` `[reject]` Blind: "Back returns" test weak, no deep-link or focus assertion — header entry is covered in AppHeader.test.tsx:52-82; deep-link-with-no-history is old behaviour; a stronger test would add scaffolding for no everyday risk.
  - `[low]` `[reject]` Blind: brittle source-grep tests, duplicated outline-none check, broad aria-disabled query — the source scan is required by the spec ("a source scan to keep"); the rest is style with no named harm. The RENAME_ERRORS line pins the shipped copy.
  - `[false]` `[reject]` Blind: no discoverability hint on a locked card — the intent deletes the reason line and keeps `Locked.` plus one Open key; this is the stated design.
  - `[low]` `[defer]` Blind: decisions.md and wallet-chooser specs still describe card-level Configure/Rename/Remove — e.g. docs/decisions.md:470 names the chooser card; the fix edits agent-context docs, so deferred.
  - `[false]` `[reject]` Blind: ConfigureScreen save may bring back a removed Seed — configure-rename.test.tsx:137 "does not bring back a Seed removed while the save was running" covers it.
  - `[false]` `[reject]` Edge: rename Cancel test not ported — configure-rename.test.tsx:161 exercises Cancel in the dismiss list.
  - `[low]` `[patch]` Edge: "needs no lock" title with no lock assertion — same defect as the Blind title finding; fixed by the same title change.
  - `[false]` `[reject]` Edge: locked-card Rename removal leaves no replacement — intended by the spec (locked card: nothing but Open; Rename lives only in Configure, which needs an open lock).
  - `[low]` `[defer]` Edge: focus after removing the last view from Configure may fall to body — same root cause as the Blind focus row; chooser landing effect focuses the heading, so impact is small and unproven.
  - `[low]` `[reject]` Edge: card order after rename untested — configure-rename.test.tsx:72 asserts the renamed rows; re-sorting is not something the Configure path can do; extra assertion not worth it.
  - `[low]` `[defer]` Verification gap: no test of where focus lands after a confirmed removal — pre-verified; but Configure's `settled` is a no-op from 21.2, so a test would need a behaviour decision, which fails the patch conditions. Defer; settle by deciding intended focus target.
  - `[false]` `[reject]` Verification gap: header path may skip `setActiveWalletId` — the header acts on the already-active wallet; AppHeader.test.tsx:52-82 covers the click.
  - `[false]` `[reject]` Other: success-path Active Wallet re-pick not asserted — configure-remove.test.tsx:130 and 144 assert `activeWalletId` after sibling and sole removal.
  - `[low]` `[reject]` Other: source-text assertions add no behaviour protection — required by the spec; same as the brittle-tests row.
  - `[false]` `[reject]` Intent: no test presses the header key — AppHeader.test.tsx:57-58 does.
  - `[false]` `[reject]` Intent: closed-lock redirect untested — AppShell.test.tsx:166 covers `/wallets/b/configure` returning to the chooser.
  - `[false]` `[reject]` Intent: 320px, 200% zoom and 44px targets not exercised — these are the manual browser pass, a later step; the diff changes no Configure layout.
  - `[false]` `[reject]` Intent: Locked word not asserted — chooser.test.tsx:111-115 asserts name, Locked lamp word and `Locked.`.
  - `[false]` `[reject]` Intent: removing `configureWallet` dropped a focus-return reset — AppHeader.tsx:72 calls `resetConfigureFocusReturn()` itself.

## Design Notes

Decision: the `Locked.` line and the lamp word both stay; the story removes controls, not state text, and SPEC CAP-3 forbids only controls and the reason line. Dropping the Remove reason leaves no Remove path on a locked card, which is the point: Configure exists only with the lock open (FR-88).

## Verification

**Commands:**
- `bun run lint` -- expected: clean (no unused imports)
- `bun run build` -- expected: tsc and build pass
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, Testnet or Devnet throwaway wallets, never Mainnet: chooser with one open multi-view Seed, one open no-check Seed and one locked Seed at 320, 390 and desktop in both themes, and 200% zoom; confirm only Open and Lock show; header key opens Configure; Name and Remove plates work there; Back returns to the wallet; no horizontal scroll.

## Auto Run Result

### Summary

The chooser cards no longer carry Configure, Rename or Remove. An open card keeps a per-row Open key and Lock (when the wallet has an open check). A locked card keeps its name, the Locked lamp, the `Locked.` line and one Open key. The dialog hosts, their handlers, the locked-card Remove reason and the dead `configureWallet` helper were deleted. Rename and Remove now live only in Configure, reached from the header key. A screen test fails if any of the three controls reappears on a card.

### Files changed

- `src/components/wallet/WalletCard.tsx`: removed the Configure, Rename and Remove keys, the row Remove, the reason line and their props.
- `src/pages/Chooser.tsx`: removed the rename and remove state, handlers and dialogs.
- `src/store/app-store.ts`: deleted the unused `configureWallet`.
- `src/lib/remove-copy.ts`: deleted `REMOVE_LOCKED_REASON`.
- `src/pages/__tests__/chooser.test.tsx`: dropped the card-only rename and remove tests; added the no-controls screen test and the Open-only and Open-and-Lock button checks.
- `src/pages/tabs/__tests__/configure-rename.test.tsx`: ported rename rule tests that had no Configure counterpart.
- `src/pages/tabs/__tests__/configure-remove.test.tsx`: ported remove rule tests; replaced the "card keeps its Remove key" test.
- `src/components/__tests__/configure-shell.test.tsx`: small addition for the shell.
- `_bmad-output/specs/spec-configure-owns-rename-remove/stories/3-chooser-cards-show-only-open-and-lock.md`: this story file.

### Review findings

24 findings: high 0, medium 0, low 10, false 14, maybe-false 0. Patched: one low (an overstated test title). Deferred: the focus-after-removal gap and the stale docs in `docs/decisions.md` (both recorded in `deferred`). The rest were rejected, each with its reason in the Review Triage Log. Follow-up review is not recommended: no high and no mediums were patched.

### Verification

- Gates passed: lint, build, test (1829 passed in 126 files, 0 failed, 0 skipped), check:contrast.
- Real-browser pass with Playwright on a throwaway Testnet profile. Dev server on port 5203, now stopped. Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/shots-3/ (older shots from earlier passes are in the same folder; new ones are named chooser-*, configure-*, rename-refused-*, remove-*, *zoom200*).
- Chooser: an open card shows only per-row Open then Lock; a no-check card shows Open and the no-lock line; a locked card shows the name, Locked lamp, `Locked.` and one Open key. No Configure, Rename or Remove on any card, and "Open this wallet to remove it." appears nowhere. At 390 the Locked/Open words sit beside the lamp. scrollWidth equals the viewport at 320, 390, 1280 and at 200% zoom.
- Configure: reached from the header key, Name first and Remove last. A duplicate name (ignoring case) is refused, Save stays disabled and nothing is written. A valid rename closes the dialog, returns focus to the Name section and the chooser shows the new name. Remove cancel returns focus to the Remove key. Sibling-view, sole-view and last-wallet removals used the right bodies and outcomes; the last-wallet one named the App PIN, returned to first run with the notice and left localStorage empty. The dialog fits at 320 with Cancel focused. Back from Configure returns to the wallet, and after Lock it does not reopen it. A deep link to Configure went to the chooser (the lock was open, so the closed-lock redirect itself was not isolated; AppShell.test.tsx covers it).
- Themes and zoom: dark and light checked for Configure and the chooser; 320 in both themes for Configure and in light for the chooser.
- Audit: 18/20 (Excellent), no P0 or P1.
- Not verified: the 44px coarse-pointer size (Playwright cannot emulate a coarse pointer). No Mainnet action, funding or signing; the only traffic was read-only testnet balance reads.

### Residual risks

- P3: browser Back from Configure leaves focus on BODY (header-entry behaviour from before this story).
- P3: focus is on BODY after the last wallet is removed (the deferred post-removal focus item).
- P3: "Turn master key off" and "Sign with two devices" are 16px tall on a fine pointer (existing Configure code).
- P3: Open, Lock, Rename, Remove are 32 or 36px on a fine pointer; the 44px size is in the coarse-pointer classes and was not measured.
- P3: `text-[0.9375rem]` on the card name is flagged as off the type ramp; unchanged by this story and probably documented.
- P3: each network row wraps a single Open key in a now-redundant flex div.
- P3: a locked card no longer hints that Configure and Remove need an open wallet (stated design).
- Deferred: `docs/decisions.md` and the wallet-chooser specs still describe card-level Configure, Rename and Remove.
