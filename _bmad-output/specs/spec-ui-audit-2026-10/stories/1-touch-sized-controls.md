---
title: 'Touch-sized buttons, tab triggers and checkbox'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_commit: 'e07fd9a4b012ab745e8be24eac27f642a6b9e1e8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/PRODUCT.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/_bmad-output/specs/spec-ui-audit-2026-10/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Buttons (default 36px, `sm` 32px, `icon` 36px), tab triggers (about 30px) and the 16px checkbox are under 44px, so they are hard to hit on a phone (audit issues 1 and 2, both P1; CAP-1, CAP-2).

**Approach:** Raise the sizes inside the shared primitives, so no call site changes. The checkbox gets its 44px area from its wrapping label.

**Decisions (owner):** The 44px sizes apply only on touch screens, via Tailwind's `pointer-coarse:` variant; desktop keeps today's dense sizes unchanged. The Annunciator's dismiss button (`Annunciator.tsx:56`, hand-made, 20px) is included and also becomes 44px on touch screens. The Annunciator's "+N more" and "Show less" buttons (hand-made, about 16px) are included as well (owner, after the browser pass).

## Boundaries & Constraints

**Always:** Sizing lives in `button.tsx`, `tabs.tsx` and the label markup, not at call sites. Nothing styles `:focus` and `outline-none` stays banned. `bun run check:contrast` and the four gates pass. The `lg` size and the tab detent rule keep working.

**Never:** Touch the uncommitted dialog work on this branch (`dialog.tsx`, `PinPromptDialog.tsx`, `usePrompts.ts`, the tab files already modified). Commit anything. Redesign the controls beyond size and hit area. Add a pseudo-element hit area inside `DialogContent` (its `overflow-hidden` would clip it).

</frozen-after-approval>

## Code Map

- `src/components/ui/button.tsx:75-80` -- size variants; default `h-9`, `sm` `h-8`, `icon` `h-9 w-9`; `lg` `h-11` has no users.
- `src/components/ui/tabs.tsx:48-66` -- trigger has no fixed height (about 30px); the `after:` pseudo is the detent, so use `min-h-11`. Used by `Main.tsx:51-62` (6 tabs, 2x3 below `sm`) and `HistoryTab.tsx:42-47` (3 inline).
- `src/components/ui/checkbox.tsx:9-21` -- `size-4`; leave the box, size the label.
- `src/components/wallet/CreateWalletFlow.tsx:450,474` -- the two `<label className="flex items-center gap-2 text-sm">` wrappers; add `min-h-11`.
- Tight spots to check at 320px and 390px: `AppHeader.tsx:29,57` (lock icon button; header grows about 8px), `SettingsTab.tsx:346-352`, `TwoDeviceSign`, `TrustLineRow`, `BalancesTab` rows.
- `src/components/Annunciator.tsx:56` -- hand-made `size-5` dismiss button, included by owner decision.
- Reuse: Tailwind v4 `pointer-coarse:` (native, no config). Only existing coarse-pointer use is `useAutoLock.ts:25`.
- No existing test asserts button, tab or checkbox size classes.

## Tasks & Acceptance

**Execution:**
- [ ] `src/components/ui/button.tsx` -- add `pointer-coarse:` variants so `default`, `sm` and `icon` are at least 44px tall (icon 44px wide); desktop classes unchanged -- CAP-1
- [ ] `src/components/ui/tabs.tsx` -- add `pointer-coarse:min-h-11` to the trigger -- CAP-1
- [ ] `src/components/Annunciator.tsx` -- dismiss button gets a 44px target on touch screens, keeping its visible 20px look if the panel needs it -- CAP-1
- [ ] `src/components/wallet/CreateWalletFlow.tsx` -- add `pointer-coarse:min-h-11` to both checkbox labels -- CAP-2
- [ ] Reflow fixes only where the browser pass shows overflow in the tight spots above

**Acceptance Criteria:**
- Given a 390px viewport with touch emulation on, when every button, tab trigger and the Annunciator dismiss button are measured, then each is at least 44×44px.
- Given the same viewport with a mouse (no touch emulation), when the same controls are measured, then their sizes equal today's (default 36, `sm` 32, icon 36, tab about 30).
- Given the backup checkbox with touch emulation, when tapped within 22px of its centre, then it toggles, and its label is at least 44px tall.
- Given a 320px viewport, when the header, the nav tabs and Settings are viewed, then nothing overflows or hides a control.
- Given the dialog files already modified on this branch, when the build finishes, then `git diff` on them is unchanged.

## Implementation Notes

## Spec Change Log

- 2026-10-18, owner decision after the browser pass: the frozen decisions gained "+N more" and "Show less" (`Annunciator.tsx`, about 16.5px on touch). Triggering finding: the verifier measured them below 44px, so "every button" was not met. Known-bad state avoided: leaving two undersized buttons next to the enlarged dismiss button. KEEP: the dismiss button's 44px box with the 20px chip, and `pointer-coarse:pt-3` on the row.

## Review Triage Log

| # | Finding (layer) | Verdict | Route | Evidence |
|---|---|---|---|---|
| 1 | Annunciator dismiss: `-m-3` puts the top 4px of the 44px box above the plate (row `pt-2`), clipped in the `overflow-y-auto` list, leaving about 40px (UI, Edge, Blind) | low | patch | Row padding `pt-2` = 8px against a 12px pull; `overflow-y-auto` clips both axes. One class fixes it: `pointer-coarse:pt-3`. |
| 2 | Dismiss hit box overlaps neighbouring text and rows (Blind, Edge) | low | rejected | Horizontal overlap into the text column is 2px (12px pull against a 10px gap); the row gap is 8px and the box ends inside the plate once #1 is fixed. |
| 3 | Focus ring wraps the 44px button, not the 20px chip (Blind, Edge, UI) | low | rejected | DESIGN.md says focus is untouched and the UA ring is the indicator; nothing here styles `:focus`. Cosmetic, and any fix would style focus. |
| 4 | `group-hover` replaces `hover`; sticky hover on touch (Edge) | low | rejected | Same colour change as before, now driven by the button; negligible. |
| 5 | Link-variant buttons would grow on touch (Blind, Edge) | false | rejected | `grep variant="link"` in `src`: no call sites. |
| 6 | Call-site `size-`/`h-` override on `icon` or `sm` is ignored on touch (Edge) | false | rejected | No such overrides exist today. |
| 7 | Fixed `pointer-coarse:h-11` vs `min-h-11`; wrapped text would clip (Blind) | false | rejected | Button base class has `whitespace-nowrap`; a button label cannot wrap. |
| 8 | Tab label centring and detent position inside the taller trigger (Blind, Edge, UI) | maybe-false | rejected | The build pass viewed the 320px touch screenshots and found the layout correct; if wrong it would be cosmetic (low). |
| 9 | Other checkboxes, and a shared `CheckboxField` (Blind) | false | rejected | `grep <Checkbox` finds only the two `CreateWalletFlow.tsx` sites, both fixed. |
| 10 | Label may not span the full row (Edge) | false | rejected | The label is a `flex` block, so it spans its container. |
| 11 | `pointer-coarse` misses hybrid devices and touch on a mouse-primary laptop (Blind, Edge, UI) | false | rejected | Decided by the owner: touch-screens-only via `pointer-coarse:`. |
| 12 | No test for the new behaviour; jsdom cannot evaluate the query (Blind, Verification Gap) | false | rejected | The Verification Gap layer found nothing a unit test could decide; a real-browser check is the recorded Verification step. |
| 13 | Repeated `11`/`size-11`; no shared token (Blind) | low | rejected | Seven Tailwind class edits; a token is more than a direct correction. |
| 14 | DESIGN.md has no touch-target rule (Blind) | medium | defer | A later hand-made control will be built at `h-9` with nothing in DESIGN.md saying otherwise. |
| 15 | Selects, inputs and the hand-made select in `ControlWalletDialog.tsx:194` stay 36px on touch (Blind, build agent) | medium | defer | Pre-existing; the spec says "every button" and CAP-1 names buttons and tab triggers. |
| 16 | Button growth in dense rows (TwoDeviceSign, TrustLineRow, header lock button) was not browser-checked (UI, build agent) | maybe-false | defer | Would be medium if rows overflow at 320px; settle it with a pass that reaches those screens. |
| 17 | Settings "Remove all wallets" button overhangs a 320px viewport by about 1.6px (build agent) | low | defer | Pre-existing, in `SettingsTab.tsx`, an uncommitted file this build must not touch. |
| 18 | Primary-action reachability at 320x568 with the keyboard; fix lives in `dialog.tsx` (UI) | n/a | rejected | Not in this diff; owned by the dialog work already on this branch. |
| 19 | Visible chip is 20px while the box is 44px (Edge claim) | false | rejected | That is the intended design: a 44px target with the 20px look kept. |

## Design Notes

A pseudo-element hit area was rejected for the checkbox: the flow renders inside `DialogContent`, which clips overflow. The label already carries the tap, so giving it height is the smaller change.

## Verification

**Commands:**
- `bun run lint` · `bun run build` · `bun run test` · `bun run check:contrast` -- expected: all pass

**Manual checks (if no CLI):**
- Browser pass at 390px with touch emulation, 390px with a mouse, and desktop width: measure the controls, check the nav tabs, `AppHeader`, Settings and the create-wallet checkbox.

**Result, 2026-10-18 (recorded by the build; the verifier's own report is the source):**

- **Under test:** `e07fd9a` plus the uncommitted working tree, after the `pointer-coarse:pt-3` patch. Gates: lint, build, test (94 files, 1330 tests) and `check:contrast` all passed, run by the build after the patch.
- **How driven:** Playwright Chromium against `bun run dev` on port 5176; one touch context (`hasTouch`, `isMobile`, so `pointer: coarse`) and one mouse context; a CDP virtual authenticator for the passkey; a throwaway Testnet wallet. Theme set with `emulateMedia`. Figures are `getBoundingClientRect` and `scrollWidth` readings. Widths: 320, 375, 390 touch and 390, 1280 mouse, both themes. Screenshots opened: `B-390-light-scrolled`, `B-dark-320-top`, `A-dark-320-Settings`, `D-backup-390-touch`, `C-mouse-1280-light`. The A-light and the 375/390 B captures were measured only, not opened.
- **Met:**
  - Touch: every `<Button>` and all six tab triggers are at least 44px tall; icon buttons are 44×44 (the header lock and copy buttons were reached).
  - Annunciator dismiss: 44×44 box, 20×20 chip, and taps 20px off-centre dismiss. In the expanded list the first row's box starts at 642.8 against the scroller's top at 642, so nothing is clipped and the visible height is 44.
  - Mouse: sizes unchanged (default 36, `sm` 32, icon 36×36, tab 30.5, dismiss 20×20).
  - Backup checkbox (Stored-Seed branch): label 44px on touch at 320 and 390; taps 20px beside the box toggle it.
  - 320px touch overflow: none, apart from item 17 below.
- **Not met in the first pass, then fixed and re-checked:** the hand-made "+N more" and "Show less" buttons stayed about 16.5px tall. After the owner added them to the story, both got `pointer-coarse:min-h-11`; the gates passed again (lint, build, test 94 files and 1330 tests, `check:contrast`, all exit 0).
- **Re-check, same day (port 5177, notices pushed through the store on the welcome screen):** touch contexts at 320 and 390, light and dark; mouse at 390 and 1280. "+N more" and "Show less" measure 44px on touch and 16.5px on mouse (unchanged); the 192px list still scrolls and a real tap on "Show less" collapsed it in all 8 runs; dismiss boxes are 44×44 with 20×20 chips on touch, 20×20 on mouse; the first in-scroller dismiss box top is 598.8 against the scroller's 598; no element-level overflow at 320 (container 320/320, scroller 288/288). Screenshots opened: `touch-320-dark-collapsed`, `touch-320-dark-expanded-bottom`, `touch-390-light-collapsed`, `touch-390-light-expanded-bottom`. Not measured: a numeric comparison against the baseline build, a long unbroken message, the Annunciator inside the unlocked shell above the tab bar, real (not pushed) notices.
- **Outside the story, seen in the pass:** selects (the Send asset select, the Settings auto-lock select) are 36px; address and build-stamp links are 20px.
- **Known and deferred:** Settings "Remove all wallets" overhangs 320px by about 2px (triage item 17).
- **Not reached:** the second checkbox label (the Passkey-Derived Seed branch, same class applied in the diff), TwoDeviceSign, TrustLineRow, a funded account, a second wallet and the wallet selector, dismiss inside a real flow (notices were pushed through the store), Send and History beyond their empty layout.
- **Repo state:** `git diff` was byte-identical before and after the pass (sha256 `9aa064d9…f7235`); no temporary hook; dev server stopped.
