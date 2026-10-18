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

## Verification: independent browser pass (2026-10-17)

**Build under test:** commit 1082b44 (the stamp in the app footer read 1082b44), `bun run dev -- --port 5182 --strictPort` from this worktree, fresh origin. Product code not touched.

**How driven:** Playwright MCP (Chromium, mouse pointer, not touch emulation), CDP virtual authenticator (ctap2, internal, resident key, UV, PRF, automatic presence). Three throwaway Testnet wallets, all funded from the in-app faucet: "My Wallet" and "Second" (Passkey, Standard signing), "Third" (Signing Check App PIN only, PIN set in the Add wallet screen). A Regular Key was set on Second (signed by My Wallet) so the master-key sheet could be opened; a USD trust line (issuer My Wallet) was created for Edit limit and Close. Back was driven with `history.back()`, outside tap with a mouse click at (4,4), the overlay's history entry read from `history.state` and `navigation.currentEntry.index`. Import warning forced by switching the browser context offline so the pre-import check returns `unchecked`; a throwaway generated seed was used.

**Widths and themes:** all 12 overlays at 375x667 (default scheme). Remove all wallets and Add trust line additionally at 320x568 and 1280x800 in light and dark. Screenshots under `/home/otavio/xxx/xrpl-wallet/.playwright-mcp/` (`s4-*.png`), each opened before citing: masterkey, walletseed, addtrust, editlimit, sendreview, closetrust, reset, importwarn, pin (375); removeall and addtrust at 320 and 1280, light and dark.

Surfaces, 12 in code (the spec says 11): Reset device, Import warning, App PIN prompt, Reveal confirm, Wallet seed, Remove wallet, Remove all, Master key (off), Add trust line, Edit limit, Close trust line, Send review.

**CAP-4 criteria**

1. Closing returns focus to the opener: NOT MET. Met for Reset, Reveal confirm, Remove, Remove all, Master key, Add trust line, Edit limit, Close trust line, Send review (Back, Escape, X, Cancel). Not met: (a) Wallet seed, which opens from the Reveal confirm: on any close focus lands on `<body>`, not "Reveal seed" (the remembered opener is the "Show my seed" button inside the confirm, which has unmounted); (b) Import warning: focus lands on `<body>`, not "Add" (the Add button is disabled while the check runs, so the opener is recorded as nothing). After a successful Send with App PIN, focus is also on `<body>` (the form was reset; not counted as a defect). App PIN prompt: focus not verifiable (see 2).
2. Back closes the open overlay and the path is unchanged: NOT MET for one surface. Met for 10 overlays (path unchanged, history entry popped, `history.state` back to null), for the Import warning on the routed `/wallets/new` screen (stays on the screen), and for a routed screen with no overlay (Let another wallet sign returns to Settings). Not met: the App PIN prompt opened from Send review. Back, and also the PIN prompt's own Cancel button, leave the app (page went to `about:blank`; reproduced three times). The console trace shows two `history.back()` calls from the `pushOverlay` release timer (`route.ts`) after the prompt closes, one more than the single entry it pushed. Escape on the PIN prompt was not run separately.
3. Outside tap spares a working overlay and typed text: MET. Add trust line (issuer and currency kept), Edit limit (1234 kept), Send review (destination and amount kept), Import warning, Master key, App PIN prompt (typed digits kept) all stayed open. Confirms with nothing typed closed on outside tap: Reset, Reveal confirm, Wallet seed, Remove, Remove all, Close trust line, each with focus on the opener except Wallet seed. Same result at 320, 375, 1280, both themes (Remove all, Add trust line).

Observation, not a criterion: after an outside tap on a kept-open sheet, `document.activeElement` is `<body>` (focus not pulled back into the sheet).

**Not run:** touch/coarse-pointer emulation; 390px (375 used); light/dark and 320/1280 for the ten overlays not listed above; Master key "turn on" variant; PIN prompt focus return and a successful PIN-prompt Escape; Back on a routed screen with an overlay other than the Import warning; Mainnet; real iOS/Android hardware Back; executing any destructive confirm.

## Verification: fixes after the browser pass (2026-10-17)

Fixed, and re-checked by the gates only (lint, build, test, check:contrast). NOT re-browsed.

- PIN prompt Back/Cancel leaving the app: `pushOverlay`'s release check (`src/lib/route.ts`) could run twice in one tick when a sheet and its PIN prompt released together, calling `history.back()` twice for one entry. It is now one check per tick. This is a reasoned fix: the double release was inferred from the console trace, not reproduced.
- Wallet seed dialog and Import warning sheet focus return: `DialogContent` takes `returnFocusTo`, preferred over the remembered opener. Settings points it at the Reveal seed button (`data-reveal-seed`), AddWalletScreen at the Add button by ref.
- Outside tap on a kept-open dialog: focus held before the tap is restored if it fell to body.
- Not investigated: the 320px light-theme horizontal scrollbar behind Remove all (unconfirmed, outside S4).
