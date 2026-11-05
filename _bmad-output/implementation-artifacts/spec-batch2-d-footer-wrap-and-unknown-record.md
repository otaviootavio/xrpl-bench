---
title: 'Batch 2 D: dialog footer labels wrap at 200% text; record the unknown outcome'
type: 'bugfix'
created: '2026-11-05'
baseline_revision: 'ba57d913046ac4e4c8a1894ef9516ff824a052fc'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/DESIGN.md']
warnings: ['multiple-goals']
deferred: []
---

<intent-contract>

## Intent

**Problem:** At 320px with 200% text, a dialog footer button's label does not wrap (`whitespace-nowrap` in the shared Button), so "Create trust line" is cut off, the sheet body scrolls sideways (scrollWidth 376 vs 303) and the close X overlaps the title. Separately, `docs/decisions.md` does not record the write path's `unknown` outcome added in PR #63, nor the sheet's scroll padding.

**Approach:** Let buttons in a dialog footer wrap their label and grow in height, the same treatment `ScreenFooter` already gives its buttons (`h-auto`, `min-h-9` / `min-h-11` on coarse pointers, `whitespace-normal`, `py-2`). Add a short decision entry for the `unknown` outcome and one line for the sheet scroll padding.

## Boundaries & Constraints

**Always:** Touch targets stay at least 44px on coarse pointers. A footer button's label is never clipped and never makes its container scroll sideways. Nothing styles `:focus`; no `outline-none`. `check:contrast` stays green.

**Never:** Changing the Button component's defaults for buttons outside dialog footers. Changing button wording. Rewriting earlier decisions entries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 320px, 200% text, Add trust line | sheet open | "Create trust line" wraps onto two lines inside the footer; no horizontal scroll in the sheet body; close X clear of the title | — |
| 320px, 100% text | any sheet or dialog footer | Unchanged look: single-line labels at the same height | — |
| Desktop | dialog footer | Unchanged | — |

</intent-contract>

## Code Map

- `src/components/ui/dialog.tsx` -- `DialogFooter` and its `SHEET_FOOTER` class string; `DialogHeader` has `pr-8 pointer-coarse:pr-12` to clear the close X. The dialog body (`data-slot="dialog-body"`) carries `scroll-pb-24` for sheets (added in PR #63).
- `src/components/ui/button.tsx` -- base classes include `whitespace-nowrap`; sizes set fixed heights. Do not change defaults here.
- `src/components/wallet/TaskScreen.tsx` -- `ScreenFooter` already applies `[&>button]:h-auto [&>button]:min-h-9 pointer-coarse:[&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:py-2`: the pattern to reuse.
- `docs/decisions.md` -- section 5.5 records the `claimed` (`tec`) outcome; section 14 is the fee cap; the last section is 15. Add the new entry as section 16.
- Tests: `src/components/ui/__tests__/` (if a dialog test exists) or a new small render test asserting the footer's button classes.

## Tasks & Acceptance

**Execution:**
- `src/components/ui/dialog.tsx` -- give `DialogFooter`'s direct button children the `ScreenFooter` wrap treatment at every width.
- `docs/decisions.md` -- add "## 16." recording: the `unknown` write outcome (a validated answer with no readable result: shown as "Outcome unknown" with the hash, a warning never an error, reads refreshed, never resubmitted; Regular Key, master key and two-device map it to unconfirmed), the History `'unknown'` result marker ("Result not read"), and the sheet body's bottom scroll padding (WCAG 2.4.11).
- A render test that a `DialogFooter` button carries the wrap classes.

**Acceptance Criteria:**
- Given the Add trust line sheet at 320px with 200% text, when it renders, then the Create label is fully visible (wrapped) and the sheet body's scrollWidth equals its clientWidth.
- Given the repo after the change, when the four gates run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 21 findings — high 0, medium 3, low 14, false 1, maybe-false 3
- findings:
  - `[low]` `[defer]` (intent) The 320px/200% outcomes are not exercised by any test — jsdom does no layout; checked by the browser pass, recorded in Verification.
  - `[maybe-false]` `[defer]` (intent) Close X overlap gets no fix of its own — settled by the browser pass (it is expected to go with the sideways scroll).
  - `[low]` `[defer]` (intent) "Unchanged at 100%" rests on a claim — grouped with the height finding below; browser pass measures it.
  - `[low]` `[reject]` (intent) The decisions entry is longer than "one line" — a fuller record is harmless and was split per the blind finding.
  - `[low]` `[defer]` (intent) 44px coarse target checked only by class — browser pass measures it.
  - `[low]` `[defer]` (verification-gap) Footer wrap checked only by class names — the repo verifies layout by browser pass; done before merge.
  - `[low]` `[patch]` (verification-gap) §16 words the wrap as sheet-only — moved to §17 with its real scope.
  - `[low]` `[patch]` (edge-case) `[&>button]` misses `asChild` keys — selector is now `[&>[data-slot=button]]`.
  - `[low]` `[reject]` (edge-case) `lg`/`sm`/`icon` keys in a footer — none exist; `min-h` keeps the 36/44px floor for any future one.
  - `[medium]` `[patch]` (edge-case) Keys grow ~1.5px at 100% text (`py-2` + line-height) — now `py-1.5`, so `min-h-9` / `min-h-11` govern a one-line key.
  - `[maybe-false]` `[defer]` (blind) Taller wrapped footer may exceed `scroll-pb-24` at 200% text — browser pass measures a focused field against the footer.
  - `[medium]` `[patch]` (blind) Wrapped labels left-aligned — `text-center` added on footer keys.
  - `[medium]` `[patch]` (blind) Keys not unchanged at 100% text — duplicate of the edge-case height row, patched there.
  - `[low]` `[reject]` (blind) `lg` key shrinks — duplicate of the edge-case size row.
  - `[low]` `[reject]` (blind) Class string copied from `ScreenFooter`, not shared — sharing would change the task-screen footers (py and text-center) outside this spec; left as two strings on purpose.
  - `[low]` `[patch]` (blind) Only `<button>` children covered — duplicate of the selector row, patched there.
  - `[low]` `[patch]` (blind) Test checks class names only and only the sheet variant — now renders the app's `Button` and covers the plain dialog too; layout itself is the browser pass.
  - `[maybe-false]` `[defer]` (blind) §16/§17 claim layout results not yet checked — §17 now says the browser pass checks them; the pass runs before merge.
  - `[low]` `[reject]` (blind) Close X overlap not targeted — duplicate of the intent row.
  - `[low]` `[patch]` (blind) §16 mixed two decisions — split into §16 (unknown outcome) and §17 (dialog footers).
  - `[false]` `[reject]` (blind) Entry says the wrap is sheet-only — duplicate of the verification-gap row, already patched.

## Verification

**Commands:**
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` -- expected: all pass.

**Manual checks (browser pass, run separately):**
- Add trust line sheet at 320x568 with root font-size 200%, light and dark: label wrapped, no sideways scroll, close X clear of the title.
- Send confirm, Trust lines edit and close, and one other sheet at 320px 100%: footers look as before.
