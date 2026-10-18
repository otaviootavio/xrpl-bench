---
title: 'Mobile dialogs S4: focus return, Back closes the overlay, outside tap does not discard work'
type: 'feature'
created: '2026-10-17'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/SPEC.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Focus falls to `<body>` after most dialogs close, hardware Back leaves the app with a dialog open, and a tap on the gutter closes working dialogs and discards typed state (issues 5, 7, 9; CAP-4).

**Approach:** All three live in the shared `Dialog`/`DialogContent` primitive and `src/lib/route.ts`, so no call site changes except an opt-in on pure confirms.

## Boundaries & Constraints

**Always:** the history entry an overlay pushes carries only `{ overlay: true }` (plus the screen flag already present); `onOpenChange(false)` is the only way Back closes, so a busy-guarded dialog refuses Back too; Escape and the buttons still close.

**Never:** put a secret or form data in history state; do S5 work (master-key typed acknowledgement, etc.).

</intent-contract>

## Code Map

- `src/components/ui/dialog.tsx` -- `Dialog` wrapper (opener memory, `pushOverlay` while open); `DialogContent` `onOpenAutoFocus`/`onCloseAutoFocus` and `dismissOnOutsidePress` (default false)
- `src/lib/route.ts` -- `pushOverlay`: one shared history entry, popstate closes the newest overlay, entry re-pushed if refused, popped when the last closes; `leaveScreen` pops the overlay entry too
- Opted in to outside-tap dismissal (nothing typed): Reset device (`Unlock.tsx`), Reveal confirm, Wallet seed, Remove wallet, Remove all (`SettingsTab.tsx`), Close trust line (`TrustLinesTab.tsx`). Blocked: PIN prompt, master key, import warning, Add trust line, Edit limit, Send review.

## Tasks & Acceptance

**Execution:**
- `src/lib/route.ts`, `src/components/ui/dialog.tsx` -- as above
- six confirm `DialogContent`s -- `dismissOnOutsidePress`
- `src/components/ui/__tests__/dialog-overlay.test.tsx`, `src/lib/__tests__/route.test.ts` -- focus return, Back, refusal, entry cleanup, no data in state, leaveScreen with an overlay

**Acceptance Criteria:**
- Given any dialog or sheet opened from a control, when it closes, then focus is on that control.
- Given an overlay open, when Back is pressed, then it closes and the path is unchanged.
- Given a working overlay, when the gutter is tapped, then it stays open with typed text intact; a confirm with nothing typed closes.

## Verification

**Gates:** lint, build, test (98 files, 1361 tests), check:contrast -- all passed.

**Browser pass (Chromium via Playwright, `bun run dev` on 5183, 375x667, touch, mobile, virtual authenticator, one fresh Testnet wallet):** Remove all wallets confirm: Back closed it, path `/`, history length unchanged, focus on "Remove all wallets" button; Cancel button and gutter tap each closed it and returned focus to the button; history state back to null after each. Add trust line sheet: gutter tap left it open with "abc" still in the Issuer field (screenshot /tmp/s4-sheet.png, opened); Back closed it and focus returned to "Add trust line". Not exercised: the other nine overlays individually (shared code path; unit tests cover the primitive), PIN prompt handover, Back with an overlay open on a routed screen in a browser (route unit tests only), real iOS/Android hardware Back (manual check in SPEC), light theme (no visual change). Outside-tap is not unit-testable in jsdom (Radix's pointer event never arrives), so the browser pass is its only evidence.

## Auto Run Result

Status: done
