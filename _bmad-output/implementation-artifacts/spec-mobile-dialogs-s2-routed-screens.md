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

### Verification: second browser pass against the CAP-2 criteria (2026-10-17)

**Tested:** commit 3896718 (dev server on `--port 5180 --strictPort`, fresh origin, own browser context). **Driven:** Playwright Chromium via the MCP, CDP virtual authenticator (`ctap2`, internal, resident key, UV, presence simulation, PRF). Throwaway Testnet wallets: one created through the onboarding flow and funded with the in-app faucet ("Funded with 100 test XRP"), a second created through `/wallets/new`. **Widths and themes:** 320x568, 375x667, 1280x800, each in light and dark (`emulateMedia`), plus 320x568 at root `font-size: 200%` in both themes. Screenshots under `.playwright-mcp/` (`s2-*.png`) were opened before being cited here: onboarding, Add wallet (Generate 320 light/dark, 1280 dark; Import 320 at 100% and 200%), Edit checks (320 light, 320 dark 200%, 1280 dark), two-device (320 dark, 320 light 200%), Let another wallet sign (375 dark, 320 light 200%). The rest were measured from the DOM, not looked at.

| Criterion | Result |
|---|---|
| Edit checks: Save and Cancel inside the viewport at every size, no horizontal overflow | Met at all 8 combinations (Save at y 411-448 of 568 at 320; 219-331 at 200%). |
| Two-device: role buttons wrap, no horizontal overflow at 320 and 375 | Met. Both buttons fit inside the panel (x 33-287 at 320, 33-342 at 375), document `scrollWidth` equals `clientWidth`, light and dark. |
| Let another wallet sign: primary action in view, no overflow at 320 and 375 | Met at 100%. Set regular key and Cancel are in the sticky footer. |
| Add wallet, Import: primary action in view | Met. Add sits in the sticky footer at 320 (100% and 200%). |
| Add wallet and onboarding render the same `CreateWalletFlow` | Met by content: the same Label, Network, Node, Seed Method, Signature type, Open Check, Auto-lock and Signing Check fields on both. Onboarding was seen at 375 light only. |
| Add wallet, Generate: primary action within one scroll of the form | **Not met.** `ScreenFooter` is rendered only for Import. In Generate mode the sticky footer holds only the empty status slot and CREATE WALLET sits at the end of the form: 1309px down a 431px scroll area at 320x568 (about 3 screens), 1274px at 375x667, 3629px at 320 and 200%. This is the "~3-screen scroll" CAP-2 names. |
| Let another wallet sign: nothing overflows at 200% text zoom, 320px | **Not met.** The "Wallet that will sign" label and select end at x=287, past the panel's right edge at 273: the select pokes out of the plate (seen in `s2-ctl-320-light-z200.png`). Also at 200%, the Back button (x 65-265) is wider than the panel's content box (64-241) on the two-device and Let another wallet sign screens. It stays inside the panel edge but overlaps the padding. |
| Back and routing | Met. Back is disabled during the seed backup and browser Back left `/wallets/new` on the backup step (history state `{screen:true}` only, no secret). Boot at `/wallets/new` with Wallets present opens the screen; `/wallets/x/checks` resets to `/`. Back while an Edit checks save is in flight was not exercised. |

**Not run:** boot at `/wallets/new` with an empty vault; onboarding at 320, 1280 and dark (no second clean origin was used); Back during an in-flight Edit checks write; submitting Set regular key or Save changes against the ledger; the Let another wallet sign form after a wallet is chosen; real iOS/Android, the on-screen keyboard and the camera scanner; the prod host's first load at `/wallets/new`. Seen but out of this slice: at 320 and 200% the header's wallet selector collapses to a blank box, and the header plus the status slot leave the screen about 300px of 568.

**Status:** stays `in-review` on the two Not met rows.
