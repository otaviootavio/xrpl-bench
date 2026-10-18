---
title: 'Mobile dialogs S3: coarse-pointer sizing (16px text, 44px hit areas, no 11px field labels)'
type: 'feature'
created: '2026-10-17'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/SPEC.md'
  - '{project-root}/DESIGN.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** On phones, 13px inputs and buttons make iOS zoom the page on focus, and close buttons (28px), buttons (32-36px) and radios (13px) are below the 44px touch target; dialog field labels are 11px (issues 4, 6, 13 of SPEC-mobile-dialogs, CAP-3).

**Approach:** Responsive sizing inside the primitives with the Tailwind `pointer-coarse:` variant (`@media (pointer: coarse)`), so call sites do not change. Field labels in dialogs become 12px on every pointer. Viewport zoom is left alone.

## Boundaries & Constraints

**Always:** sizing lives in `input.tsx`, `button.tsx`, `dialog.tsx`, `label.tsx` (and the checkbox/switch/select primitives); fine-pointer (desktop) layout and DESIGN.md heights unchanged; `index.html` viewport meta untouched; no `:focus` styling, no `outline-none`.

**Never:** add `maximum-scale`/`user-scalable`; size at call sites except the two native-radio labels (no radio primitive exists until S5/CAP-7); do S4-S5 work.

</intent-contract>

## Code Map

- `src/components/ui/input.tsx` -- `h-9 text-[0.8125rem]`; add coarse `h-11 text-base`
- `src/components/ui/button.tsx` -- `size` variants; add coarse `min-h-11 text-base` (icon `size-11`)
- `src/components/ui/dialog.tsx` -- Close `size-7`; coarse `size-11`; header `pr-8`; body forces `.panel-legend` to 12px
- `src/components/ui/label.tsx` -- `panel-legend` is 0.6875rem; Label gets `text-xs`
- `src/components/ui/select.tsx`, `checkbox.tsx`, `switch.tsx` -- trigger height / hit area
- `src/components/wallet/check-controls.tsx`, `NetworkChoice.tsx` -- native radio labels; `TwoDeviceSign.tsx`, `QrScanner.tsx` -- textareas
- `index.html:6` -- viewport meta, read-only evidence: no zoom limit

## Tasks & Acceptance

**Execution:**
- `src/components/ui/{input,button,select,label,dialog,checkbox,switch}.tsx` -- coarse-pointer sizes and 12px labels
- radio labels and two textareas -- `pointer-coarse:` min height / text-base
- `src/components/ui/__tests__/coarse-pointer.test.tsx` -- assert the classes on each primitive and that the viewport meta has no zoom limit
- `DESIGN.md` -- record the coarse-pointer rule under Buttons and Inputs
- record browser verification

**Acceptance Criteria:**
- Given a coarse pointer, when an input, textarea, select trigger or button renders, then its computed font-size is >=16px and its height >=44px.
- Given a coarse pointer, when a dialog opens, then Close is >=44px, and checkbox and radio hit areas are >=44px.
- Given any pointer, when a dialog shows a field label, then it computes to 12px, not 11px.
- Given a fine pointer, when the same controls render, then sizes are unchanged.

## Verification

**Commands:**
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` -- expected: all pass

**Browser pass (Chromium via Playwright, built vite preview, 375x667, pointer: coarse emulated by CDP):** onboarding and Create-wallet screens, screenshots /tmp/s3-coarse.png and /tmp/s3-create.png. Buttons compute 16px / 44px; text input 16px / 44px; every radio label row is 44px (native radio stays 13px inside it); field label 12px. Not exercised in the browser: dialog Close (asserted by class in the unit test), checkbox/switch hit areas, textareas, select trigger, real iOS focus zoom (manual check in SPEC).

**Gates:** lint, build, test (97 files, 1354 tests), check:contrast -- all passed.

## Auto Run Result

Status: done
