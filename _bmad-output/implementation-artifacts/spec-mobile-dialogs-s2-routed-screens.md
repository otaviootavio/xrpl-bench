---
title: 'Mobile dialogs S2: Add wallet, Edit checks, two-device signing and Control wallet become routed screens'
type: 'feature'
created: '2026-10-17'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-mobile-dialogs/SPEC.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-mobile-dialogs-s1-sheet.md'
warnings: [oversized]
deferred:
  - summary: 'Prod host may 404 a first load at /wallets/new (no SPA rewrite recorded in decisions.md 8.7); verify on staging.'
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Add wallet, Edit checks, Sign with two devices and Let another wallet sign are multi-field tasks in confirm-sized dialogs: the primary action sits far below the fold at 320x568 and at 200% text zoom, and the two-device role buttons overflow sideways at 320/375px (issues 1, 2, 10 of SPEC-mobile-dialogs, CAP-2).

**Approach:** Each becomes a routed screen with a Back control and a sticky action footer. Add wallet is `/wallets/new` and renders the same `CreateWalletFlow` onboarding uses; only its exit differs. No router dependency: a small pathname scheme over the History API.

## Boundaries & Constraints

**Always:** no secret in a path, history state or React state (the typed seed/PIN stay in uncontrolled inputs and refs); screens mount only while the target Wallet's lock is open (AD-26); a screen that is writing or backing up a Seed cannot be left by Back (button or browser); no `:focus` styling, no `outline-none`; viewport zoom untouched; desktop layout unchanged otherwise.

**Never:** change signing, key or Check logic; convert dialogs that stay dialogs or sheets; add a router package; do S3-S5 work (coarse-pointer sizing, focus return, outside-tap/Back for remaining overlays, panel-vocabulary swaps).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open a screen | Settings button on an open Wallet | URL becomes the screen's path; tabs replaced by the screen; Back returns to Settings tab | n/a |
| Boot at a screen path, no Wallets | `/wallets/new` with empty vault | Onboarding shows; URL reset to `/` | n/a |
| Unknown or locked Wallet id | `/wallets/x/checks` | Reset to `/` | n/a |
| Back while writing | Edit checks save in flight | Back button disabled; browser Back restores the screen entry | outcome stays visible |
| Work finished | Edit saved / wallet added | Screen leaves to Settings | n/a |

</intent-contract>

## Code Map

- `src/lib/route.ts`, `src/hooks/useRoute.ts` -- pathname parse, History navigation, leave blocker
- `src/components/wallet/TaskScreen.tsx` -- shared screen shell, `ScreenFooter` (sticky, safe-area)
- `src/components/wallet/AddWalletScreen.tsx` -- Add/Import moved out of `SettingsTab`; import-warning sheet moves with it
- `src/components/wallet/EditChecksScreen.tsx` (was `EditChecksDialog.tsx`), `TwoDeviceSign.tsx`, `ControlWalletDialog.tsx` -- dialog shells replaced by `TaskScreen`
- `src/pages/Main.tsx` -- `OpenWallet` renders the routed screen instead of the tabs; controlled tab value survives the screen
- `src/App.tsx` -- `Gate` resets a screen path when no Wallets exist
- `src/pages/tabs/SettingsTab.tsx` -- buttons navigate; edit/control handlers exported to screens
- S1 context: `src/components/ui/dialog.tsx` `SHEET_FOOTER` pattern reused for `ScreenFooter`

## Tasks & Acceptance

**Execution:**
- [x] route lib/hook, `TaskScreen`, tests for parse/navigate/block
- [x] four screens + Main/Gate/Settings wiring
- [x] rewrite the dialog tests as screen tests, keeping each invariant
- [x] two-device role buttons wrap (`h-auto whitespace-normal`)
- [x] record verification

**Acceptance Criteria:**
- Given 320x568 or 200% root font-size, when a screen opens, then its primary action is visible without scrolling the page and nothing overflows horizontally at 320 and 375px.
- Given onboarding and `/wallets/new`, when each shows the create flow, then both render `CreateWalletFlow`.
- Given a write in flight, when the user presses Back, then the screen stays.

## Spec Change Log

## Review Triage Log

No separate review pass was run in this build; the browser pass above found and fixed the 200% overflow in Add wallet.

## Design Notes

Pathname, not hash: the spec names `/wallets/new`. Whether the static host serves `index.html` for a first load of a deep path is unverified (decisions.md 8.7 leaves the host's rewrite rules unknown); a boot at such a path that 404s loses nothing, and one that boots falls back to the shell. Recorded as a deferred check.

## Verification

**Commands:** `bun run lint`, `bun run build`, `bun run test` (96 files, 1350 tests), `bun run check:contrast` -- all passed.

**Browser pass** (Playwright Chromium, dev server, imported Testnet wallet; root `font-size: 200%` for text zoom; screenshots opened):

| Surface | Sizes | Result |
|---|---|---|
| Add wallet (Generate and Import) | 320x568, 375x667, 320x568 at 200% | Met after two fixes found here: the Generate/Import row and the Node fieldset (`fieldset` min-width, long wss URL) overflowed at 200%; now no element past the screen edge. Import's Add is in the sticky footer, in view |
| Edit checks | same | Save and Cancel in the sticky footer, in view at every size; Save label wraps instead of spilling at 200% |
| Sign with two devices | same | No horizontal overflow; role buttons wrap |
| Back / reload | 320x568 | Back returns to the Settings tab; reload at `/wallets/new` booted into the screen in dev |

**Not met / not run:** Let another wallet sign was not opened in the browser (needs a second Testnet wallet); dark mode, real iOS/Android, on-screen keyboard and the camera scanner not run; the prod host's handling of a first load at `/wallets/new` is unverified (decisions.md 8.7), so status stays `in-review`. Known edge: if an edit moves a Wallet to a new lock and the wallet list refresh then fails, the screen resets to Settings and hides the "Saved, but the wallet could not be reopened" line.
