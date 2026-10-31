---
title: 'Rename is a section of Configure'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_revision: '7f0a952f78894f527bb592e5ea6eada453bcdbae'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/DESIGN.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A wallet's name can only be changed from its chooser card. The name belongs with the rest of that wallet's settings on the Configure screen (PRD FR-92, FR-85).

**Approach:** Add a Name plate as the first plate of `ConfigureScreen`. It shows the current name and a Rename key that opens the existing `RenameDialog`. The rule, the keystore write and the copy are reused unchanged. The card's own Rename stays until story 3.

## Boundaries & Constraints

**Always:** Reuse `RenameDialog`, `rename-copy.ts`, `lib/wallet-name.ts` and `keystore.renameWallet`; the rule does not change (AD-41, AD-42). No `rev` bump, no lock prompt, no ledger call. A successful save writes the keystore's returned metas to the store (as `Chooser.saveName` does), so every row of the Seed shows the new name. `others` is the names of every other Seed, one per `seedId`. Focus returns to the Name plate on close (use `ConfigPlate focusId`). Plate vocabulary only; no new token; no `:focus` styling; no `outline-none`; keys wrap at 320px and are 44px on coarse pointers (reuse the `KEY` class).

**Never:** Do not remove or change the chooser card's Rename, Remove or Configure (story 3). Do not touch Remove, Settings, the quiz, the route, or the lock model. Do not store the name anywhere but the Seed record.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid save | Name of 1 to 40 chars, unique ignoring case | `renameWallet` called; store metas replaced; dialog closes; success toast "Wallet renamed."; Name plate and the screen subtitle show the new name | No error expected |
| Refused name | Empty, over 40, or another Seed's name ignoring case | Existing reason text from `RENAME_ERRORS`; `renameWallet` not called | Reason shown as text |
| Keystore refuses | `renameWallet` returns a reason | Dialog stays open with that reason | Reason shown |
| Write fails | `renameWallet` returns `write-failed` | `RENAME_WRITE_FAILED` shown; typed name kept; store unchanged | Alert text |
| Unchanged name | Same name (grandfathered duplicate) | Dialog closes, nothing written | None |
| Cancel | Cancel or Escape | Closes; focus on the Name plate | None |

</intent-contract>

## Code Map

- `src/components/wallet/ConfigureScreen.tsx` -- add `NamePlate` before `ChecksPlate` (line ~205). Reuses `ConfigPlate`, `KEY`, `wallet.label`. Heading has `headingRef`; landing effect unchanged.
- `src/components/wallet/ConfigPlate.tsx` -- `focusId` makes the plate a focus target via `data-configure-plate` and `tabIndex=-1`. Use it for the return target.
- `src/components/wallet/RenameDialog.tsx` -- reuse as is. Props: `target {seedId,name}`, `others`, `onSave` (true | reason | 'write-failed'), `onClose`, `returnFocusTo(seedId)`. Caller closes it on `true`.
- `src/pages/Chooser.tsx` lines 90-105 -- `onRename` and `saveName`: the pattern to mirror (renameWallet, then replace metas for that seed in the store, close, `notify.success('Wallet renamed.')`). Leave in place; if a shared hook is extracted, Chooser may use it, its tests must still pass.
- `src/lib/crypto/keystore.ts` ~729-760 -- `renameWallet(seedId, raw)` returns `{ok:true, metas}` or `{ok:false, reason}`. Read-only.
- `src/lib/wallet-name.ts` -- the one name rule. Read-only.
- `src/store/app-store.ts` -- `wallets`, `setWallets`. `src/components/AppShell.tsx` line 146 mounts `ConfigureScreen key={activeWallet.id}`; the same id stays after a rename, so the screen re-renders with the new label rather than remounting.
- `src/pages/tabs/__tests__/configure-reveal.test.tsx` -- pattern for Configure tests (mounts `ConfigureScreen`, mocks `@/lib/crypto/keystore` as a partial factory). The other `configure-*.test.tsx` files mock keystore the same way without `renameWallet`; the new code must only touch `renameWallet` on save, never at import or render, so they keep passing.
- `src/pages/__tests__/chooser.test.tsx` lines ~400-500 -- existing rename tests (keep green; use as the model for the new ones).

## Tasks & Acceptance

**Execution:**
- `src/components/wallet/ConfigureScreen.tsx` -- add `NamePlate` (title "Name", `focusId` `name`): shows `wallet.label` and a "Rename" key (`aria-label` `Rename ${label}`, `data-configure-key` unset) opening `RenameDialog`; compute `others` from `useAppStore` wallets, one label per other `seedId`; `onSave` calls `renameWallet`, then updates the store and closes on success, toasts "Wallet renamed."; `returnFocusTo` returns the plate (`[data-configure-plate="name"]`). Render it first, above `ChecksPlate` -- FR-92 order.
- `src/pages/tabs/__tests__/configure-rename.test.tsx` -- new tests for each I/O row, using the real `validateWalletName` (not mocked): refused names never call `renameWallet`; a duplicate differing only by case is refused (fails if the unique rule is removed); failure keeps the typed name; the plate is the first section; focus lands on the Name plate after close and cancel.
- `src/pages/__tests__/chooser.test.tsx` -- no change expected; run it to prove the card's Rename still works.

**Acceptance Criteria:**
- Given the user opens Configure, when it renders, then the first section is Name, in plate styling, above Checks.
- Given a name of 1 to 40 characters unique ignoring case, when Save is pressed, then the Seed record is renamed with no lock prompt and no ledger call, and the plate, the screen subtitle and every other row of that Seed show the new name.
- Given an empty, over-long or duplicate name, when the user tries to save, then the existing reason shows as text and nothing is written.
- Given the write fails, when Save is pressed, then "Could not rename the wallet. Nothing was changed." shows and the typed name stays.
- Given the dialog closes by save, Cancel or Escape, when focus returns, then it is on the Name plate.
- Given the chooser, when a card's Rename is used, then it still works exactly as before.

## Design Notes

A one-field rename is a short confirm, so a dialog is allowed (SPEC Constraints). The plate shows the name so the user sees what they are changing; the Rename key opens the dialog. The subtitle under "Configure wallet" already reads `wallet.label` and updates through the store.

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: tsc and build pass
- `bun run test` -- expected: all pass, including chooser rename tests and every `configure-*` test
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, on a throwaway Devnet or Testnet wallet, never Mainnet: open a wallet, Configure, Rename; check 320, 390 and desktop widths in both themes; confirm focus returns to the Name plate and the chooser shows the new name.

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 15 findings — high 0, medium 0, low 11, false 4, maybe-false 0
- findings:
  - `[low]` `reject` Blind 1: wrong toast when the Seed was removed mid-save — the keystore write did land, so "Wallet renamed." is true; `Chooser.saveName` behaves the same; a fix adds a branch for a state the screen cannot normally reach.
  - `[low]` `reject` Blind 2: rename moves the Seed's rows to the end of `wallets` — the spec mandates the `Chooser.saveName` pattern; the chooser groups by seed and the active wallet is found by id, so nothing visible depends on order; fix would add complexity.
  - `[false]` `reject` Blind 3: rejected `renameWallet` is unhandled — `keystore.renameWallet` wraps its whole body in try/catch and returns `write-failed`, so it never rejects.
  - `[low]` `reject` Blind 4: tests mock the whole keystore — same mock pattern as the other configure tests and the chooser tests; the real `renameWallet` returns `toMetas(written)` as read; test-only, fix adds a new integration harness.
  - `[false]` `reject` Blind 5: plate repeats the subtitle label — the story's Design Notes require the plate to show the name; no harm shown; fix would be a spec edit.
  - `[low]` `reject` Blind 6: docs not updated, two rename paths — the card's Rename stays by the intent until story 3, so that part is false; the strings are recorded in the story and `rename-copy.ts`; the planning `EXPERIENCE.md` is not this story's to edit.
  - `[low]` `reject` Blind 7: smaller gaps — `returnFocusTo` may return null (type allows it) and `ConfigPlate focusId` sets `tabIndex=-1`; `RenameForm.submit` already returns when `busy`; "Rename Savings" contains the visible "Rename"; only the import order is true and it is cosmetic (lint passes).
  - `[low]` `reject` Edge 1: dismissed during an in-flight save still toasts and calls `setRenaming(false)` — the write landed so the toast is accurate; there is one Seed on this screen, so no other dialog can be closed by mistake; fix adds a guard for a very narrow race.
  - `[low]` `reject` Edge 2: Seed removed mid-save gives a success toast — same claim as Blind 1; same reason.
  - `[low]` `patch (fixed)` Edge 3: the removed-mid-save guard has no test — fixed with Verification gap 1: one test added.
  - `[false]` `reject` Edge 4: `others` collision tests too thin — the existing test already has a sibling row of the same Seed; deduping by `seedId` does not change the verdict `validateWalletName` returns, so a per-row regression would not change behaviour; Unicode normalisation belongs to `wallet-name.ts` tests.
  - `[low]` `patch (fixed)` Verification gap 1: nothing asserts a Seed removed during a rename stays removed — verified in `configure-rename.test.tsx`: Seed is always present; deleting the `current.some` guard keeps every test green; fixed: added a test with a deferred `h.rename`, `wallets` set to `[OTHER]` before it resolves, asserting no `s1` rows return.
  - `[low]` `patch (fixed)` Gap other 1: `Chooser.tsx` comment "The one place a label reaches the store" is now wrong — two copies of the save logic exist; fixed: the comment now says a label reaches the store here and in the Configure Name plate and the two must change together (code unchanged, story 3 reworks the card).
  - `[low]` `reject` Gap other 2: dismissal during save still toasts and updates the store — same as Edge 1; matches Chooser.
  - `[false]` `reject` Gap other 3: header comment says "the real name rule" but keystore is mocked — `validateWalletName` is not mocked; only the keystore write is, which the comment says.
- intent auditor: reported readings and divergences, no defects. Pending browser pass, no card-test change, and no cross-surface assertions are outside what the diff claims; the browser pass is the next step.

## Auto Run Result

### Summary

Configure now opens with a Name plate, above Checks. It shows the wallet's name and a Rename key that opens the existing rename dialog. The name rule, the keystore write and the copy are reused unchanged. A save writes the returned metas to the store, shows the "Wallet renamed." toast and returns focus to the Name plate. The chooser card's Rename is untouched (story 3 handles it).

### Files changed

- `src/components/wallet/ConfigureScreen.tsx` -- new `NamePlate` as the first plate, wired to `RenameDialog`, `renameWallet` and the store.
- `src/pages/Chooser.tsx` -- comment only: says the label reaches the store here and in the Configure Name plate, and the two must change together.
- `src/components/__tests__/configure-shell.test.tsx` -- updated for the new first plate.
- `src/pages/tabs/__tests__/configure-rename.test.tsx` -- new, 12 tests covering every row of the I/O matrix, plus the Seed-removed-mid-save case.

### Review findings

15 findings: high 0, medium 0, low 11, false 4, maybe-false 0.
- Patched: 2 (a test for a Seed removed during a rename; the Chooser comment).
- Deferred: 0.
- Rejected: the rest, each with its reason in the Review Triage Log above.
- `followup_review_recommended: false` (no high, fewer than two mediums).

### Verification

- Gates passed: lint, build (with tsc), test, check:contrast. Tests: 1833 passed in 125 files (new configure-rename file: 12 passed).
- Browser pass (Playwright, fresh profile, dev server on port 5201, Testnet only):
  - I created two local Testnet wallets: "My Wallet" with no open check, and "Second" with an App PIN. I locked "Second", and the chooser showed it as Locked. I opened My Wallet, then Configure from the in-wallet header.
  - I did not use Mainnet or fund, sign or submit anything.
  - Name is the first plate, above Checks, in plate styling, with a "Rename My Wallet" key.
  - Checked at 1280 in dark and light, at 320 in dark and light, at 390 in light, and at 200% zoom (640 wide with zoom 2). At 320 and 390, scrollWidth equalled the viewport, so there was no horizontal scroll. At 630 against 640 under zoom 2 there was no horizontal scroll either. The dialog and its buttons were not clipped or overlapping.
  - Rename cases at 320:
    - A duplicate name differing only by case ("SECOND") showed "Another wallet on this device already has that name." Nothing was saved.
    - An empty name showed "Give this wallet a name."
    - A 48-character name showed "Use 40 characters or fewer."
    - Escape and Cancel both returned focus to the Name plate (document.activeElement was the section with data-configure-plate=name).
    - A valid save ("Renamed Wallet") closed the dialog, showed the "Wallet renamed." toast, put focus on the Name plate, and updated the plate and the screen subtitle. After a reload the chooser showed the new name, so it was written to storage.
  - The Rename key is 32px high with a fine pointer. The KEY class carries pointer-coarse:min-h-11 for touch, which I confirmed in the source but could not test, because the browser has no coarse pointer.
  - Not tested: the write-fails case (cannot be triggered from the browser; unit tests cover it), and the chooser card's Rename (covered only by the existing chooser tests).
  - Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/a26dad49-e38b-40b1-b725-b48803fac498/scratchpad/shots-1/. The dev server and the browser are closed.
- Audit score: 19/20 (Excellent). Accessibility 3, Performance 4, Theming 4, Responsive 4, Anti-patterns 4. Read from the diff only; I did not run the app or the detector. No P0 or P1.

### Non-blocking issues (P2/P3)

- P2, `ConfigureScreen.tsx` NamePlate `returnFocusTo`: after the dialog closes, focus goes to the whole Name plate (a non-interactive section with tabIndex -1). The Rename button never unmounts here, so focus should go back to that button. Keyboard and screen-reader users land on a section and have to Tab back to Rename. Fix: return focus to the button with a ref, or leave the default return-to-trigger. Note the story's contract asks for the plate, so this is a spec question.
- P3, Rename dialog Save button: a duplicate or empty name leaves Save disabled with no reason until blur or Enter. Existing `RenameDialog` behaviour, same as the chooser card.
- P3, Name plate after the dialog closes: shows a blue focus outline on the plate. It is the intended programmatic focus target.
- P3, header and NamePlate: the wallet name shows twice in a row (subtitle under the Configure h1, and the Name plate).
- P3, `ConfigureScreen.tsx save()` and `Chooser.tsx saveName`: the write-back is copied into two places, kept in step only by a comment. A shared helper or hook would remove the risk. Story 3 reworks the card.
- P3, NamePlate Rename button: the aria-label "Rename <name>" is longer than the visible "Rename". It starts with the visible text, so voice control works.

### Residual risks

- Touch target size (44px on coarse pointers) is confirmed in source only, not on a touch device.
- The write-fails path is unit-tested only.
- Two copies of the rename write-back exist until story 3.
