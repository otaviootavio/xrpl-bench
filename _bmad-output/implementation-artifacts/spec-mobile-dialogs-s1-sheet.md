---
title: 'Mobile dialogs S1: bottom-sheet variant and sticky footer'
type: 'feature'
created: '2026-10-17'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e07fd9a4b012ab745e8be24eac27f642a6b9e1e8'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `DialogContent` is one centred scroll-inside box; on a phone a task dialog's title, close and submit can sit off-screen, the keyboard can hide submit, and the PIN prompt opens over a still-open confirm (issues 3, 8, 11, 12 of `_bmad-output/specs/spec-mobile-dialogs/SPEC.md`, CAP-1).

**Approach:** `dialog.tsx` gains a `sheet` variant (bottom-anchored below `sm`, `dvh`, safe-area, sticky footer with scroll cue). PIN prompt, master-key on/off, import warning, Add trust line, Edit trust line limit and Send review use it; a sheet that starts signing hides while the PIN prompt is open.

## Boundaries & Constraints

**Always:** no `:focus` styling, no `outline-none`; no secret in state; viewport zoom stays enabled; desktop stays a centred dialog.

**Never:** change signing/key/Check logic; convert dialogs that stay dialogs; do S2–S5 work.

</frozen-after-approval>

## Code Map

- `src/components/ui/dialog.tsx` -- variant prop, inner scroll body, SHEET_FOOTER
- `src/hooks/usePrompts.ts` -- `useYieldingPrompts`
- `src/components/wallet/PinPromptDialog.tsx`, `MasterKeyControl.tsx`, `src/pages/tabs/SendTab.tsx`, `TrustLinesTab.tsx`, `SettingsTab.tsx` (import warning) -- sheet call sites
- `index.html` -- `interactive-widget=resizes-content`

## Tasks & Acceptance

**Execution:**
- [x] all files above -- implemented directly (not via subagent)

**Acceptance Criteria:**
- Given 320×568 / 375×667 with keyboard open, when any sheet opens, then title, close and submit are visible without page scroll.
- Given Send review or master-key confirm, when the PIN prompt opens, then only the prompt is open.

## Implementation Notes

Implemented before the spec was written (workflow was skipped past step 2); spec written retroactively.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route / evidence |
|---|---|---|
| Add/Edit trust line sheets sign via plain `usePrompts`, PIN stacks on them (blind, edge, UI) | high | patch: `TrustLinesTab` now uses `useYieldingPrompts`, both sheets gated on `!promptOpen` |
| Yield flag not a count; overlapping prompts reveal sheet early (edge) | low | patch: counter, covered by hook test |
| No test for yield/hide, variant structure, hook (verification-gap, blind) | medium | patch: send-pin test asserts confirm hidden under PIN; `yielding-prompts.test.tsx`; `dialog-sheet.test.tsx`; pin-dialog source test now names the hook per screen |
| Send claims confirm "comes back" after cancel (gap reviewer) | false | Send withdraws the confirm on a cancelled attempt (existing); test and hook comment corrected |
| Sheet unmounts while prompt open, loses state (blind, edge) | false | trust-line, Send and master-key state lives in the parent component, not the dialog content |
| Seed-import dialog (`SettingsTab:340`) not a sheet (UI) | false | assigned to CAP-2 (Add wallet becomes a screen); out of S1 by intent |
| Inputs 13px, buttons <44px, Close 28px (UI) | false | assigned to CAP-3 / S3 by intent |
| `viewport-fit=cover` missing so safe-area is 0 (blind) | false | without `cover` the page already stays inside the safe area; env() is 0 there by design |
| iOS ignores `interactive-widget`; keyboard may cover sheet (blind, UI, edge) | maybe-false (medium if true) | defer: needs real iOS Safari; on the spec's manual-check list |
| Title not sticky after scrolling (edge) | low | rejected: fix adds layout complexity; title and Close/submit visible at scroll 0 |
| Footer not sticky at >=640px / landscape (edge) | false | `sm`+ is the pre-existing centred dialog |
| Footer shadow not in DESIGN.md vocabulary (UI) | low | defer: name it in DESIGN.md when S1 is recorded |
| `className="contents"` form semantics (blind, edge) | false | `display: contents` form keeps Enter-to-submit; accessibility bug affects only the form landmark role, which this form does not use |
| `className` overrides on DialogContent hit the shell (edge) | false | grep: no caller passes `className` to `DialogContent` |
| No decisions.md entry for viewport meta (blind) | low | defer: record with the Verification pass |

## Verification

**Commands:** `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` -- all passed.

**Browser pass** (tree under test: HEAD e07fd9a plus uncommitted S1 changes; Playwright Chromium driven by `browser_run_code_unsafe`, CDP virtual authenticator ctap2/internal/UV/PRF, dev server on port 5177, fresh Testnet wallet "My Wallet" with Open Check and Signing Check = App PIN, funded from the in-app faucet; screenshots in `.playwright-mcp/`, opened and read):

| Surface | Sizes / themes | Result |
|---|---|---|
| Send review sheet | 320×568, 320×300, 375×667, 375×360 × light, dark (measured); screenshots opened: 320×568 light, 320×300 dark | Met: title, close and "Confirm and send" inside the viewport at every size; sheet bottom-anchored; no horizontal overflow; scroll cue visible when the body overflows (320×300) |
| PIN prompt over Send | 320×568, 320×300, 375×667 (measured); screenshots opened: 320×568 light, 320×300 dark | Met: exactly one `[role=dialog]` open, "Confirm and send" absent while it is up; title, close and Continue in view; after Cancel nothing is left open |
| Add trust line sheet | 320×568, 320×300, 375×667, 1280×800 (measured); screenshots opened: 320×300 dark, 1280×800 light | Met: submit in view at 320×300; desktop is the centred dialog |

**Not met / not run:** a real on-screen keyboard (emulated by shrinking the viewport height, which is what `interactive-widget=resizes-content` produces on Android Chrome; iOS Safari unverified, deferred); master-key sheet, Edit trust line limit and import-warning sheet were not opened in the browser; only one wallet was used; light and dark were not run for every surface at every size. Status therefore stays `in-review`.

### Batched browser pass (2026-10-18)

**Tree and commit:** worktree `mobile-dialogs-s2-s5`, HEAD c5bcd54 (`bun run dev -- --port 5190 --strictPort`, fresh origin, stopped afterwards by PID).
**Driven by:** Playwright MCP Chromium with a CDP virtual authenticator (ctap2, internal, UV, PRF, presence simulation); two throwaway Testnet wallets (Alpha funded from the in-app faucet, Beta unfunded; Beta also given a Mainnet *view* only, never funded); `emulateMedia` for light/dark; coarse pointer by CDP `Emulation.setTouchEmulationEnabled` (`pointer: coarse` true) with measurements and DOM clicks only; 200% text zoom emulated as `html { font-size: 200% }` at a 320 px viewport (not browser zoom). Widths 320, 375, 1280. Screenshots in `.playwright-mcp/` (uncommitted), each opened before being cited.
**Not run for any spec:** real touch input (pointer events were DOM-dispatched), real browser zoom, a real device.

Criteria for this spec:

- Add trust line sheet at 375: bottom sheet, 375 px wide, fields and Create trust line in view, no overflow. MET.
- Browser Back with the sheet open closes it and stays in the app (URL unchanged); Escape also closes; focus returns to the "Add trust line" opener both ways. MET.
- Coarse pointer: sheet inputs, Create trust line and Close all 44 px high. MET.
- Master-key sheet (Alpha given a Regular Key, Testnet): opens as a sheet at 320, alert plate shows the Regular Key, Turn master key off / Cancel in view, no overflow (only the Close icon's inner span flagged, 28 px, not a defect), no typed-phrase field on Testnet (Mainnet phrase not exercised). Back closes it and focus returns to "Turn master key off". MET. Not confirmed (nothing was turned off).
- Edit trust line limit sheet: NOT RUN (no trust line was created; Beta cannot afford one and none was set up on Alpha).
- Import warning sheet: NOT RUN (no seed with a master-key warning available).

