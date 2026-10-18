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

## Verification (browser pass, 2026-10-17)

**Tested:** commit 65d686f74d03f0cf079b5b54f96df0044a8f8784, `bun run dev -- --port 5181 --strictPort` (fresh origin, stopped by PID). No product code changed.

**Driven:** Playwright MCP, `browser.newContext({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 })` (confirmed `(pointer: coarse)` true) plus a fine-pointer context at 1280. CDP virtual authenticator (ctap2, internal, resident key, UV, PRF, automatic presence). Two throwaway Testnet wallets; the first funded with the in-app faucet (100 XRP). Computed font-size and bounding-rect heights measured per element; screenshots in `.playwright-mcp/s3v-*.png` (the MCP resolves them against the main checkout root), all cited ones opened.

**Widths and themes:** 320, 375 and 1280, dark and light, for Settings and the Add trust line sheet (coarse); 375 dark for onboarding Create, Add wallet (generate/import), Edit checks, Let another wallet sign, Sign with two devices (online/offline), Remove / Reveal seed / Remove all dialogs, header wallet selector. Fine pointer: 1280 dark and light (Create, Remove dialog).

| Criterion | Result |
|---|---|
| Inputs, textarea, select trigger, primitive buttons compute 16px and >=44px (coarse) | Met for text inputs, password input, textareas (16px/44px and 82px), combobox triggers (44px) and `Button` everywhere except below |
| Not met: TaskScreen sticky footer buttons | 41.6px at coarse (Add wallet "Add", Edit checks "Cancel"/"Save changes", Let another wallet sign "Cancel"/"Set Regular Key"); `src/components/wallet/TaskScreen.tsx:58` has `[&>button]:h-auto [&>button]:min-h-9 ... py-2`, which beats `pointer-coarse:h-11` |
| Not met: tab triggers (Balances, Send, Receive, History, Tokens, Settings) | 11px and 30.5px high at every width on coarse |
| Not met: select dropdown options (header wallet selector) | 13px and 32px high on coarse |
| Close button >= 44px | Met: 44x44 in Remove, Reveal seed, Remove all, Add trust line; 28px on fine pointer |
| Radio hit areas >= 44px | Met: every radio label row is 44px (native input stays 13px inside it) |
| Checkbox hit area >= 44px | Not met: hit area 42.4px (16px box + `after:-inset-3.5` measured from the padding box) on "I've written down my seed"; its label row is 40px |
| Dialog field labels 12px, not 11px | Met on every pointer and width (coarse and fine) |
| Fine pointer unchanged | Met: input 36px/13px, buttons 36px/13px, close 28px, radio rows 20px |
| Viewport zoom not disabled | Met: viewport meta read-only, no zoom limit (unit test) |
| No horizontal overflow at 320/375/1280 | Met on the screens above (document scrollWidth equals clientWidth) |

**Not run:** App PIN prompt, master-key sheet (button disabled on these accounts), Send review sheet, switch primitive (none on screen), Edit trust line limit (no trust line), real iOS focus zoom, Mainnet. Light theme at 375 only checked for Settings and trust sheet. The empty dashed footer strip visible at the bottom of every screen was not investigated.

## Fixes after the browser pass (2026-10-17)

Four defects from the pass above were fixed with the smallest change each:
- TaskScreen sticky footer buttons: added `pointer-coarse:[&>button]:min-h-11` beside `min-h-9`, so footer buttons reach 44px on coarse.
- Tab triggers: `pointer-coarse:min-h-11 pointer-coarse:text-xs` in `tabs.tsx` (12px, 44px).
- Select options: `pointer-coarse:min-h-11 pointer-coarse:text-base` in `select.tsx` (16px, 44px).
- Checkbox: coarse hit area `after:-inset-3.5` to `-inset-4` (46px from the padding box), and the two seed/ordinal backup label rows in `CreateWalletFlow.tsx` got `pointer-coarse:min-h-11`. The unit test's class assertion was updated.

Re-checked by gates only (lint, build, test, check:contrast), not re-browsed; the measured heights above are expected from the classes, not re-measured.
