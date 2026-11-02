---
title: 'Open enters that Wallet'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: '19e6361d3552ad0e93e2d207fece78420a24546d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/_bmad-output/specs/spec-one-network-per-wallet/SPEC.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** After a successful unlock, `Unlock.tsx` sends a Seed that has more than one view back to the chooser (`returnIfSeveralViews`), so the user must press Open a second time. Under FR-93 a card is one Wallet, so that return has no purpose.

**Approach:** Delete the return. Unlock opens the Wallet's lock and stays on `/wallets/<walletId>`, which then renders the open Wallet. Open (from the card) and Configure already carry one `walletId`; pin that with tests.

## Boundaries & Constraints

**Always:** A closed lock asks its own Open Check, then the user is in that Wallet. An open lock is entered directly by the card's Open key (`enterWallet(walletId)`). A controlled Wallet opens through its key-holder's lock (shared `lockId`) and the user lands in the controlled Wallet they chose, not the key-holder. Open Check, lock write and `openLock` calls stay exactly as they are. The chooser makes no ledger read (AD-36).

**Never:** No change to `enterWallet`, `leaveToChooser`, `walletScreenPath`, the card, the keystore, lock model, policy, Configure, or the Import sentence (22.5). No new redirect, no selector after unlock, no entry-view code (`entryWalletId` was already removed in 22.3). No migration code (AD-48). Do not edit the PRD or older specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Closed lock, one Wallet on the Seed | Open, correct PIN | `openLocks[lockId]` set, path stays `/wallets/<id>` | n/a |
| Closed lock, Seed with a controlled Wallet | Open the key-holder or the controlled card, correct PIN | Lock opens; path stays on the chosen Wallet's `/wallets/<id>`; no return to `/` | n/a |
| Lock with no Open Check, several views | Auto-open | Lock opens; path stays; no return to `/` | Failed auto-open still shows "could not be opened" and Retry |
| Open lock | Press Open on its card | `activeWalletId` = that card's `walletId`, path `/wallets/<id>` | n/a |
| Wrong PIN or cancelled | Open Check fails | Stays on Unlock with the existing message | Unchanged |

</intent-contract>

## Code Map

- `src/pages/Unlock.tsx` -- `returnIfSeveralViews` (lines ~19-22) and its two calls (after `openLock(...)` in `handleOpen`, ~87, and in the no-Open-Check auto-open effect, ~116). Delete the function and both calls. Then `leaveToChooser` and the `useAppStore` import may be unused (the component still uses `useAppStore` for `openLock`; remove only `leaveToChooser`). `wallet.seedId` leaves the effect's dependency array (~121); `wallet.seedId` is then unused here. Mounted from `src/pages/Main.tsx` (~91) as `<Unlock key={wallet.id} wallet={wallet} />`, so each Wallet has its own Unlock instance; read-only.
- `src/store/app-store.ts` `enterWallet` (~93) -- sets `activeWalletId` and navigates to `/wallets/<id>`; used by `WalletCard.tsx` (~82) `onClick={() => enterWallet(card.walletId)}`. Read-only; already one `walletId`.
- `src/components/AppHeader.tsx` (~73) and `src/components/wallet/ConfigureScreen.tsx` -- Configure routes use `walletScreenPath('configure', wallet.id)`; already one `walletId`. Read-only.
- `src/store/wallet-groups.ts` -- already has no entry-view logic (removed in 22.3). Read-only; the story's "delete entry-view logic in wallet-groups" is already done.
- `src/pages/__tests__/unlock-wallet.test.tsx` -- `describe('after a successful unlock (FR-82)')` (~158-196): three tests; the first (one view stays) stays; the other two assert the deleted return and must be inverted. Fixture `WALLET`, helper `view(id, network)`, `unlockWithPin`, mocks of `@/lib/crypto/lock`.
- `src/pages/__tests__/chooser.test.tsx` -- chooser tests and its open-card fixtures; add the Open-enters test here.
- `src/__tests__/locked-no-ledger-request.test.tsx` (~127) -- uses `enterWallet('w2')`; read-only evidence that locked entry issues no read.

## Tasks & Acceptance

**Execution:**
- `src/pages/Unlock.tsx` -- delete `returnIfSeveralViews`, its two calls, the unused `leaveToChooser` import and the `wallet.seedId` effect dependency; fix the docstring if it mentions the return -- FR-82, AD-43.
- `src/pages/__tests__/unlock-wallet.test.tsx` -- invert the two "returns to the chooser" tests: with two views (and with no Open Check) the path stays `/wallets/w1` after the lock opens (wait for `openLocks.L1`, then a short settle as the one-view test does). Add a controlled-Wallet case: two Wallets sharing `lockId` `L1`, the second with `accountAddress`; render Unlock for the second, unlock, path stays `/wallets/w2`. Rename the describe/test titles to say no return -- I/O matrix rows 1 to 3.
- `src/pages/__tests__/chooser.test.tsx` -- add: pressing `Open <label> on <Network>` on a locked card sets `activeWalletId` to that card's `walletId` and goes to `/wallets/<id>`; same for an open card; for two cards of one Seed (key-holder plus controlled) each Open enters its own card's `walletId` -- I/O matrix row 4.

**Acceptance Criteria:**
- Given a locked Wallet on a Seed with several views, when the user passes its Open Check on the Unlock screen, then its lock opens and the path is still `/wallets/<that id>` (never `/`).
- Given a Wallet whose lock has no Open Check, when Unlock auto-opens it, then the same holds and no return to the chooser happens.
- Given a controlled Wallet and its key-holder on one lock, when the user opens either card, then they land in the Wallet whose card they chose.
- Given an open lock, when the user presses Open on its card, then they enter that Wallet directly with no prompt.
- Given the source, when searched, then `returnIfSeveralViews` appears nowhere in `src`, and the app has no screen that asks for a Network after unlock.
- Given the four gates, when run, then all pass.

## Design Notes

The chooser's card Open already calls `enterWallet(card.walletId)`; the Unlock screen then renders because `useWalletIsOpen` is false. Once the lock opens, `Main` re-renders the same route as `OpenWallet`. Removing the return is the whole behaviour change; the rest is tests that pin it. Mainnet is still never entered by default: only its own card's Open reaches `/wallets/<mainnet id>`, and `Main` asks that Wallet's own lock.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite succeed
- `bun run test` -- expected: all green, nothing skipped
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- In a Playwright browser, Testnet and Devnet only (never Mainnet, no funds): create two Wallets with an App PIN, lock both, press Open on the second card, enter the PIN, and confirm you land in that Wallet, not the chooser. Repeat with no Open Check (Devnet). No change to layout, so one pass at 390 wide in one theme is enough.

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 8, false 13, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: `} else setOpenError(...)` in Unlock.tsx sits two spaces too deep after the call was deleted — verified at Unlock.tsx line 108; cosmetic only, direct correction. patch (fixed): re-indented the `else` line in Unlock.tsx to the `if` level.
  - `[false]` `[reject]` Blind: `leaveToChooser` may be dead code — still imported and called in AppHeader.tsx (lines 46, 95) and ConfigureScreen.tsx (271); it is defined in route.ts and the spec forbids changing it.
  - `[false]` `[reject]` Blind: passkey unlock path may still return to the chooser — passkey and PIN share `handleOpen` (one `openLock` call at line 79); the removed call there covered both, and no other `returnIfSeveralViews` exists in src.
  - `[low]` `[reject]` Blind: fixed 50 ms sleeps for absence checks — the spec asks for exactly this ("a short settle as the one-view test does"); the removed redirect ran synchronously after `openLock`, so the old code would fail these tests; a fix adds helpers for a rare risk.
  - `[low]` `[reject]` Blind: controlled-Wallet test asserts only the path — it does pin `/wallets/w2` as the spec asks; extra assertions are not a defect and the fix adds test scaffolding.
  - `[false]` `[reject]` Blind: chooser "no prompt" test does not prove no prompt — the chooser has no prompt to show; Open only sets `activeWalletId` and navigates, which the test asserts; the Gamma then Epsilon sequence is asserted per click.
  - `[false]` `[reject]` Blind: supersession of FR-82 is not recorded — the story's Problem and Design Notes record it, and Design Notes state Mainnet is still never entered by default (only its own card reaches it); the fix would edit specs or docs outside this build.
  - `[low]` `[patch]` Edge: indentation slip in the `else` line — same root cause as the first row; patch (fixed) with it: same re-indent in Unlock.tsx.
  - `[low]` `[reject]` Edge: 50 ms sleep may pass vacuously — same as the Blind sleep row; spec-directed pattern, not worth added complexity.
  - `[low]` `[reject]` Edge: controlled test renders Unlock directly, not through Main — the spec says "render Unlock for the second"; Main keying is read-only and covered elsewhere; fix adds a heavier test.
  - `[false]` `[reject]` Edge: no locked-card Open test — `Open` > "on a locked card selects and enters that Wallet" (chooser.test.tsx ~line 224) already exists and was not added by this diff.
  - `[false]` `[reject]` Edge: docstring still describes the return — the Unlock docstring never mentioned it; the only comment about it sat on the deleted function and went with it.
  - `[false]` `[reject]` Edge: unlock now silently stays on a Mainnet Wallet reached by deep link — that is the intended FR-93 behaviour; the Wallet's own lock is asked and nothing is entered by default, as the spec's Design Notes say.
  - `[low]` `[patch]` Other findings (verification gap): same indentation slip — same root cause; patch (fixed) with it: same re-indent in Unlock.tsx. The gap layer itself reported no gaps.
  - `[false]` `[reject]` Auditor: wallet-groups entry-view logic not deleted in this diff — grep of non-test src finds no `entryWalletId`, entry-view or `returnIfSeveralViews`; the spec states it was removed in 22.3.
  - `[false]` `[reject]` Auditor: chooser Open tests would pass before the change — true, and intended: the spec asks the chooser tests to pin existing behaviour; the Unlock tests are the ones that fail before the change.
  - `[false]` `[reject]` Auditor: closed-lock Open path not tested — the existing locked-card Open test covers the click; the Open Check itself is covered in the Unlock tests.
  - `[low]` `[reject]` Auditor: negative assertions are time-based — same as the sleep rows.
  - `[false]` `[reject]` Auditor: controlled-Wallet modelling not visible — the spec defines it as two Wallets sharing `lockId` with `accountAddress` on the second, which the test does.
  - `[false]` `[reject]` Auditor: Configure not touched — the spec lists Configure as read-only and already carrying one `walletId`.
  - `[false]` `[reject]` Auditor: no evidence of the four gates or browser pass — not a code defect; the gates and manual check run after review.

## Auto Run Result

### Summary

After a successful unlock, the Unlock screen no longer sends the user back to the chooser. The `returnIfSeveralViews` function and its two calls were deleted, so a Wallet that unlocks (by Open Check or by auto-open) stays on `/wallets/<id>` and shows that Wallet. Open from the card and Configure already carried one `walletId`; tests now pin that.

### Files changed

- `src/pages/Unlock.tsx` -- removed `returnIfSeveralViews`, its two calls, the unused `leaveToChooser` use and the `wallet.seedId` effect dependency; re-indented the `else` line.
- `src/pages/__tests__/unlock-wallet.test.tsx` -- inverted the two "returns to the chooser" tests to "stays on the Wallet", and added a controlled-Wallet case on a shared lock.
- `src/pages/__tests__/chooser.test.tsx` -- added tests that Open enters that card's own `walletId` (locked, open, key-holder plus controlled).
- `_bmad-output/specs/spec-one-network-per-wallet/stories/4-open-enters-that-wallet.md` -- this story file.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- story 22.4 marked done.

### Review findings

High 0, medium 0, low 8, false 13, maybe-false 0 (21 total). One low finding (the indentation slip, reported by three reviewers) was patched. The other lows (time-based absence checks, path-only assertion, direct Unlock render) were rejected with reasons; every rejected finding and its reason is in the Review Triage Log above. Nothing deferred.

### Verification performed

- Gates passed: lint, build (`tsc -b`), test (1831 passed in 126 files, none skipped), check:contrast.
- Browser pass: I ran the dev server on port 5224 (now stopped) and used Playwright in a fresh profile. I made two local wallets: "My Wallet" on Testnet with an App PIN, and "Dev" on Devnet with no Open Check. Nothing was funded, signed or submitted, and I never used Mainnet. Wallet creation was the 7-step quiz and worked. Results against the story 22.4 criteria:
  1. Locked card, Open, correct PIN: the lock opened and the path stayed on `/wallets/<that id>`, showing Balances, with no return to the chooser.
  2. No Open Check (Dev): pressing Open auto-opened it and stayed on `/wallets/<Dev id>`.
  3. Open lock: pressing Open on the card entered that wallet directly with no prompt, and Configure from the in-wallet header used the same walletId (`/wallets/<id>/configure`).
  4. A wrong PIN stayed on Unlock and showed "Incorrect PIN. 7 tries remaining." in the notice area.
  5. The grep for `returnIfSeveralViews` in `src` finds nothing, and no network selector appears after unlock.
  The controlled-Wallet case cannot be reached in the browser without an account, so only the unit tests cover it.
- Widths 320, 390 and 1280, dark and light, and 200% zoom (640 wide): no horizontal scroll, nothing clipped, sticky footer not a problem. Focus after Open landed on `<main>`, and the chooser heading received focus after Lock. The story has no Back or Next flow, so a lost answer after Back is not applicable. State is not carried by colour alone: the Open/Locked/Active labels and the Network text are words. Screenshots are in /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/c4ce42c4-8ea1-4e40-a6c7-c1d935b46f31/scratchpad/e22/shots-4/. Not all six width/theme combinations were screenshotted: 320 dark and light, 390 dark, 1280 light and 200% zoom dark have screenshots, while 390 light and 1280 dark were only checked for overflow, not saved.
- Audit score: 17/20 (Good). Story 22.4 changes no markup, styling or copy in Unlock.tsx; it only removes the post-unlock redirect. The issues below were already there. Read from the diff and the file; the app and detector were not run.

### Non-blocking P2/P3 issues (pre-existing)

- P2, `src/pages/Unlock.tsx:153-155`: the backoff message is a `role="alert"` whose text changes every second, so a screen reader may re-announce it constantly. Announce once with `role="status"` and keep the countdown out of the live region.
- P2, `src/pages/Unlock.tsx:77-80` and `104-108`: after a successful unlock the page swaps straight to the open Wallet and nothing moves focus; the PIN field that held it disappears. More noticeable now that the user stays in the Wallet. Move focus to the Wallet's heading or main region on entry.
- P3, Unlock PIN field: Enter does not unlock; only the button does. Not touched by this story.
- P3, Unlock and chooser: Wallets back button (115x36), PIN field and Unlock button (36px high), chooser Open/Lock (53x32) are under 44px. App-wide button size.
- P3, after Open from the chooser, `document.activeElement` is `<main id=main-content>`, not the PIN field. Route-change focus convention.
- P3, `Unlock.tsx:166`: "Checking this wallet's lock…" reserves no height, so the card jumps when the form loads.
- P3, `Unlock.tsx:203-205`: the reset ghost button sits in the same card as the unlock actions; add spacing or a divider and check the 44px target.
- P3, `Unlock.tsx:215`: the build-stamp link opens a new tab with only the short SHA as text; add visually hidden text such as "(opens source)".
- P3, `Unlock.tsx:146-154`: alert text uses `text-text-destructive` with words, so meaning is not by colour alone; confirm the token with check:contrast in both finishes.

### Residual risks

- The controlled-Wallet case is covered by unit tests only, not a real browser.
- Absence-of-redirect tests use a short fixed settle (50 ms); a very slow redirect could pass vacuously.
- followup_review_recommended is false: no high and no medium findings were patched.
