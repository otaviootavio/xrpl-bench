---
title: 'XRPL Bench''s settings and the update marker on the Wallets key'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: 'b7b011672ebe11600e507747853448ff77bf0acc'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The chooser's key still reads "Settings", its page is headed "Settings", and the Remove all plate is titled "This device" with no count. Inside a wallet nothing shows that an update waits, because story 1 removed the marker with the old Settings tab.

**Approach:** Rename the chooser key and page to "XRPL Bench", turn the Remove all plate into "All wallets on this device" with the wallet count and the App PIN stated, and put the update marker on the wallet header's Wallets key from the one shared `useUpdateMarker` (CAP-3, CAP-4; AD-45, AD-51).

## Boundaries & Constraints

**Always:** Marker comes only from `useUpdateMarker` (`updateReady && !declined`). The Wallets key's accessible name and visible text read "Wallets, update available", plus the lamp (`aria-hidden`; words carry meaning). The count is a device read of `useAppStore` wallets: no ledger read, no `useActive*`, no lock read (AD-36). Wording follows ASD-STE100, sentences under 21 words. Plate vocabulary from `DESIGN.md`; no new colour token; no `outline-none`; 44px targets on coarse pointers; works at 320px and 200% text. The chooser header's nameplate stays "XRPL Bench" and the key beside it also reads "XRPL Bench" (a button, so tests query by role).

**Never:** No apply-update control inside a wallet (applying stays in `/settings`, with its guard). No marker on the Wallet tab. No per-wallet control and no Address Book on `/settings`. No change to Version and updates content, the confirm dialog's behaviour, `tearDownAllLocalState`, or the chooser cards. Do not touch the dialog's data-loss wording beyond what the plate needs. No new persistence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chooser, no update | route `/` | key reads "XRPL Bench", no lamp | none |
| Chooser, update waits | `updateReady`, not declined | key reads "XRPL Bench, update available" with lamp | none |
| Update declined | `updateReady`, `declined` | neither the chooser key nor the Wallets key is marked | none |
| Inside a wallet, update waits | `/wallets/:id`, open or locked | Wallets key reads "Wallets, update available" with lamp; no Install control; Wallet tab has no marker | none |
| Open settings | click XRPL Bench key | h1 "XRPL Bench settings", intro line, Version and updates, plate "All wallets on this device"; focus on h1; Back key stays "Wallets" | none |
| Plate count | 1 wallet / 3 wallets | "This removes 1 wallet." / "This removes 3 wallets." then "It also removes the App PIN, if you set one." | none |
| Onboarding residue | 0 wallets, PIN residue | plate reads "No wallet is stored here." then the PIN sentence, after the screen's own line | count 0 never reads "removes 0 wallets" |

</intent-contract>

## Code Map

- `src/components/AppShell.tsx` -- `SettingsKey` (line ~42) reads `useUpdateMarker`; rename text and name to "XRPL Bench" / "XRPL Bench, update available"; `ChooserHeader` nameplate span stays. Focus on `settings-heading` after the key stays (line ~100).
- `src/pages/SettingsScreen.tsx` -- h1 `settings-heading` "Settings" becomes "XRPL Bench settings"; add the intro paragraph; Back key "Wallets" unchanged. Comments say "Settings key"; update.
- `src/components/wallet/RemoveAllPlate.tsx` -- card title "This device" becomes "All wallets on this device"; add count text from `useAppStore((s) => s.wallets.length)`; keep button text "Remove all wallets from this device", dialog, `handleFullReset` unchanged. Takes `children` (Onboarding line).
- `src/pages/AppSettings.tsx` -- renders `<RemoveAllPlate />` then Version card; no wallet reads; keep. Doc comment names "Settings"; update wording only.
- `src/pages/Onboarding.tsx` -- lines ~208-214 pass a children line to `RemoveAllPlate` when `pinResidue`; wallets length is 0 there; check the combined text reads right.
- `src/components/AppHeader.tsx` -- Wallets key (lines ~38-49): add `useUpdateMarker`, text "Wallets, update available" and `<Lamp tone="caution">` (as `SettingsKey` does); `aria-describedby` reason and `blocked` logic unchanged. Renders for locked wallets too.
- `src/hooks/useUpdateMarker.ts` -- the shared predicate; update the doc comment to name both readers. Do not re-derive.
- `src/pages/Main.tsx` -- already has no marker and no `AppSettings` import (story 1); read-only. Story text "Main.tsx currently marks the Settings tab" is stale.
- `src/components/ui/lamp.tsx` -- `Lamp` with `tone="caution"`, reuse.
- Tests to update or add: `src/components/__tests__/chooser-settings.test.tsx` (key names lines ~95-126, h1 "Settings" at ~120 and ~163, Remove all block ~182), `src/components/__tests__/AppShell.test.tsx` (h1 "Settings" at ~147), `src/components/__tests__/AppHeader.test.tsx` (mocks `idb-keyval`; add marker cases; mock `useAppUpdate`), `src/pages/__tests__/app-settings.test.tsx` (no per-wallet control, Wallet tab no marker, lines ~44-143), plus Onboarding tests (`src/pages/__tests__/unlock-hard-lock-reset.test.tsx`, `seed-import-screens.test.tsx`) where they match "This device".

## Tasks & Acceptance

**Execution:**
- `src/hooks/useUpdateMarker.ts` -- doc comment: read by the chooser's XRPL Bench key and the wallet header's Wallets key -- one predicate.
- `src/components/AppHeader.tsx` -- mark the Wallets key from `useUpdateMarker` -- CAP-4.
- `src/components/AppShell.tsx` -- rename the chooser key and its marked name -- CAP-3.
- `src/pages/SettingsScreen.tsx` -- new h1 and intro line "These settings are for the whole app. Each wallet's own settings are inside that wallet." -- CAP-3.
- `src/components/wallet/RemoveAllPlate.tsx` -- new title, count sentence (singular, plural, zero) and App PIN sentence above the key -- CAP-3.
- `src/pages/AppSettings.tsx`, `src/pages/Onboarding.tsx` -- comment and copy check only; edit the Onboarding line only if it duplicates the new sentences.
- Tests above -- update names; add: marker on Wallets key (open and locked wallet), not marked when declined, no Install control inside a wallet, Wallet tab has no marker, `/settings` renders no Address Book and no per-wallet control, plate count 0/1/N with no ledger request, Onboarding plate wording.
- `docs/decisions.md`, `docs/glossary.md` -- record the rename and the marker's new home where they still say "Settings key".

**Acceptance Criteria:**
- Given the chooser, when it renders, then the key is named "XRPL Bench" and, with an update waiting and not declined, "XRPL Bench, update available" with the lamp.
- Given the user opens that key, when `/settings` renders, then the h1 reads "XRPL Bench settings", the intro line follows, and focus lands on the h1.
- Given the XRPL Bench settings, when they render, then they hold Version and updates and one plate "All wallets on this device" with the key "Remove all wallets from this device", the wallet count and the App PIN sentence, and a test fails if an Address Book or a per-wallet control renders.
- Given an update waiting and not declined, when the user is inside a wallet (open or locked), then the Wallets key reads "Wallets, update available" with the lamp, no control applies the update, and the Wallet tab carries no marker.
- Given a declined release, when either surface renders, then neither key is marked.
- Given first-run Onboarding with App PIN residue and no wallet, when the plate renders, then it reads correctly with "No wallet is stored here." and the Remove all key still works.
- Given 320px width, 200% text and a coarse pointer, when the keys and plate render, then nothing scrolls sideways and targets are at least 44px.

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 25 findings — high 0, medium 3, low 14, false 8, maybe-false 0
- findings:
  - Blind hunter
    - `[low]` `[patch (fixed)]` Stale test title "reads \"Settings, update available\"" in chooser-settings.test.tsx while it asserts "XRPL Bench, update available" — title is wrong; rename it (shares a root cause with the same finding from the edge hunter, gap reviewer and auditor). **Fix applied:** fixed: title renamed to 'reads "XRPL Bench, update available" as text and name when an update waits'.
    - `[low]` `[reject]` Comments and identifiers (`SettingsKey`, `SETTINGS_PATH`, `settings-heading`) only partly renamed — the route and ids are deliberately unchanged and the comments that name the key were updated; no named harm, and renaming identifiers is more than a direct correction.
    - `[low]` `[patch (fixed)]` `getAllByText('XRPL Bench').length > 0` passes with the nameplate missing, because the key also matches — real test weakness; assert the count is 2 (nameplate plus key) in AppShell.test.tsx (lines 145, 198) and chooser-settings.test.tsx (line 98). **Fix applied:** fixed: assertions now use toHaveLength(2) (nameplate plus key) in AppShell.test.tsx (two places) and chooser-settings.test.tsx.
    - `[low]` `[reject]` No test for a marked and blocked Wallets key, or the marker where the header is hidden — in AppHeader.tsx the name comes from `marked` and `aria-describedby` from `blocked`, two independent lines; a hidden header needs no marker. Unlikely to regress.
    - `[low]` `[reject]` Chooser key and nameplate both read "XRPL Bench"; no "settings" in the key; two controls "XRPL Bench" and "Wallets" — the spec's Always section fixes this wording; the fix would edit the spec.
    - `[low]` `[reject]` Plate does not mention address books or passkey keys, no zero-wallet test at /settings, count not live — the dialog already names the address book and the spec limits the plate to count and App PIN; zero is covered by the Onboarding test; the count is a `useAppStore` selector, so it updates live.
    - `[false]` `[reject]` Docs not updated — `docs/decisions.md` and `docs/glossary.md` both carry the rename and the marker move in the working tree; the story file is the spec itself.
    - `[false]` `[reject]` Lamp may not be aria-hidden and contrast not checked — `ui/lamp.tsx` always sets `aria-hidden="true"`, and the lamp reuses the existing `text-text-warning` token (no new colour).
    - `[medium]` `[patch (fixed)]` Wallets key at 320px or 200% text — `Button` base has `whitespace-nowrap` and fixed height, and the marked label "Wallets, update available" cannot wrap, so it can scroll sideways (the AC requires none); give the key the same classes as `SettingsKey`. **Fix applied:** fixed: Wallets key given 'h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11' in AppHeader.tsx.
  - Edge case hunter
    - `[medium]` `[patch (fixed)]` Same layout defect on AppHeader.tsx lines 48-50 — add `h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11` to the Wallets key className. **Fix applied:** fixed: Wallets key given 'h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11' in AppHeader.tsx.
    - `[low]` `[reject]` Marked and blocked untested — same as the blind hunter's finding; the two attributes are independent.
    - `[low]` `[reject]` Plate text flips to "No wallet is stored here." during a full erase — `handleFullReset` clears the store, then `window.location.reload()` runs at once; the flip is momentary and a snapshot adds state.
    - `[false]` `[reject]` Other suites reach service worker registration through AppHeader — `useAppUpdate` already registers at module scope on import and the chooser already calls it; the nine affected suites (92 tests) pass.
    - `[low]` `[patch (fixed)]` Stale test title at chooser-settings.test.tsx:172 — same root cause as the first finding. **Fix applied:** fixed: title renamed to 'reads "XRPL Bench, update available" as text and name when an update waits'.
    - `[low]` `[patch (fixed)]` getByText replaced with getAllByText in AppShell.test.tsx:145 — same root cause as the weakened-assertion finding. **Fix applied:** fixed: assertions now use toHaveLength(2) (nameplate plus key) in AppShell.test.tsx (two places) and chooser-settings.test.tsx.
    - `[false]` `[reject]` Lamp is not asserted aria-hidden — `ui/lamp.tsx` forces `aria-hidden="true"`; the claim's bad outcome cannot happen.
  - Verification gap reviewer
    - `[low]` `[patch (fixed)]` Stale test title at chooser-settings.test.tsx:103 — same root cause as the first finding. (The layer found no gaps.) **Fix applied:** fixed: title renamed to 'reads "XRPL Bench, update available" as text and name when an update waits'.
  - Intent alignment auditor
    - `[low]` `[reject]` Wallet tab "no marker" and "no apply control" proven only by a grep of Main.tsx and a header-only role check — Main.tsx has no `useUpdateMarker` or `Lamp`; the spec's test list asks for exactly these checks.
    - `[false]` `[reject]` "Version and updates" wording versus the "Version" heading — the spec says no change to that content; nothing in the diff diverges.
    - `[low]` `[reject]` Per-wallet control check is a name regex — it matches the spec's list; a hypothetical differently named control is not shown to exist.
    - `[false]` `[reject]` Count test covers 1 and 3 only — the claim describes coverage, not a defect; the 0 case is tested in the Onboarding test and no ledger request is asserted.
    - `[false]` `[reject]` Onboarding test checks only wording — that is the spec's stated test; no divergence.
    - `[false]` `[reject]` Declined release tested on both keys — a confirmation, no defect.
    - `[medium]` `[patch (fixed)]` 320px, 200% and 44px untested and the Wallets key has no wrap classes — same root cause as the layout defect; the class fix is the remedy. **Fix applied:** fixed: Wallets key given 'h-auto min-h-8 max-w-full whitespace-normal py-1 pointer-coarse:min-h-11' in AppHeader.tsx.
    - `[low]` `[patch (fixed)]` Stale title; the `/settings` Back key staying "Wallets" is what the spec requires — same root cause as the first finding. **Fix applied:** fixed: title renamed to 'reads "XRPL Bench, update available" as text and name when an update waits'.

## Design Notes

Count wording (resolved from the epic's "states how many wallets go and that the App PIN goes too"): the PIN may not exist, so the sentence is "It also removes the App PIN, if you set one." The count is `wallets.length` from the store, which is local state. Zero is worded apart so Onboarding never says "removes 0 wallets".

The accessible name and visible text of the marked Wallets key are the same string, as the chooser key already does. Keep the `aria-disabled` reason wiring on the Wallets key unchanged.

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: `tsc -b` and Vite pass
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, Devnet or Testnet only, nothing on Mainnet: chooser key and settings page, plate count with 1 and 2 wallets, Onboarding residue plate, marker on both keys (force an update state in a test build or by stubbing the hook), at 320, 390 and desktop widths, both themes, 200% zoom, no horizontal scroll.

## Auto Run Result

### Summary

The chooser key and the `/settings` page are now named "XRPL Bench" (h1 "XRPL Bench settings", with the intro line from the spec). The Remove all plate is titled "All wallets on this device" and states how many wallets it removes (zero is worded apart) and that the App PIN goes too. The update marker moved to the wallet header's Wallets key ("Wallets, update available", with the lamp), for open and locked wallets. Applying an update stays in `/settings`. The Wallet tab has no marker.

### Files changed

- `src/hooks/useUpdateMarker.ts` -- doc comment names both readers of the one predicate.
- `src/hooks/useAppUpdate.ts` -- comment wording follows the rename.
- `src/components/AppHeader.tsx` -- Wallets key reads the marker, shows "Wallets, update available" and the lamp, and wraps on narrow widths.
- `src/components/AppShell.tsx` -- chooser key renamed "XRPL Bench" / "XRPL Bench, update available".
- `src/pages/SettingsScreen.tsx` -- new h1 and intro line.
- `src/components/wallet/RemoveAllPlate.tsx` -- new title, wallet count sentence and App PIN sentence.
- `src/components/__tests__/AppHeader.test.tsx`, `AppShell.test.tsx`, `chooser-settings.test.tsx`, `src/components/wallet/__tests__/network-display.test.tsx`, `src/pages/__tests__/create-entry-points.test.tsx` -- renamed queries; added marker, declined, no-Install, count and Onboarding wording cases.
- `docs/decisions.md`, `docs/glossary.md` -- record the rename and the marker's new home.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- story 23.3 and epic 23 set to done.

### Review findings

25 findings: high 0, medium 3, low 14, false 8, maybe-false 0. All three mediums (the Wallets key could not wrap at 320px or 200% text, found by three reviewers) were patched with one class change, so a follow-up review is recommended. The low findings that were real (a stale test title, weak `getAllByText` assertions) were patched. The rest were rejected with reasons in the Review Triage Log. Nothing is deferred.

### Verification

- Gates passed: lint, build, test (1861 passed in 127 files, 0 failed, 0 skipped), check:contrast.
- Browser pass (Playwright only): dev server on port 5233 in a fresh profile, stopped and closed afterwards. Two Testnet wallets created; nothing on Mainnet. One wallet has no sign-in check, so it cannot be locked; the second got an App PIN and was locked, covering the locked-wallet case. Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/c4ce42c4-8ea1-4e40-a6c7-c1d935b46f31/scratchpad/e23/shots-3/.
  - Chooser and XRPL Bench settings: the key reads "XRPL Bench" and opens /settings with focus on the h1 "XRPL Bench settings". The intro line matches the spec. The page holds Version and one plate "All wallets on this device" ("This removes 2 wallets.", "It also removes the App PIN, if you set one.", then the Remove all key). No Address Book, no per-wallet control. Remove all was not pressed. Back returns to the chooser with focus on the Wallets heading.
  - Wallet tab: headed "Settings for My Wallet" with the Network. It lists Name, the per-wallet Address Book, Checks, Seed, Operating another account, Node, Two-device signing, then Remove this wallet last. No Remove all, no Version. Edit checks, Let another wallet sign and Sign with two devices show "Back to Wallet", and Back returns with focus on the key that opened the screen.
  - Update marker: no dev way to fake an update, so the PWA register module was stubbed with a Playwright route and its needs-refresh callback called; the real marker code ran. Chooser key read "XRPL Bench, update available" with the lamp. Open and locked wallets showed "Wallets, update available" with the lamp. The Wallet tab had no marker and no Install control showed inside a wallet. /settings showed Install update and Not now, with focus on the h1.
  - Layout: widths 320, 390 and 1280, dark and light, and 200% zoom (640 wide): no horizontal scroll, no clipped controls. Marked keys wrap or fit at 320.
- Audit score 17/20 (Good). No P0 or P1.

### Non-blocking audit notes

- P2, Wallets key text wraps in the narrow header when marked; check on a real narrow phone that it does not crowd the Lock key and network plate.
- P2, the marker is on two keys and the lamp is only a caution colour; the text carries the meaning. Lamp is aria-hidden and reuses an existing token; contrast gate passed.
- P2, the `/settings` Back key is still "Wallets" while the chooser key is "XRPL Bench"; the spec fixes this.
- P3, the Version card heading reads "Version" while the criteria say "Version and updates"; the spec says leave content unchanged.
- P3, the Address Book plate sits between Name and Checks on the Wallet tab; intended since the book is per wallet.
- P3, Network is shown three times on the Wallet tab; redundant, no overflow.
- P3, "Turn master key off" and "Sign with two devices" measured 16px tall with a fine pointer; the 44px coarse-pointer rule could not be emulated.
- P3, declined-release and Onboarding residue cases not checked in the browser (need a real release manifest, and a wallet-less device with an App PIN, which needs Remove all). Unit tests cover both.
- P3, with 0 wallets the Remove all key still shows; the count line and PIN line are plain text-sm paragraphs.
- P3, one doc comment line in AppHeader.tsx is over-long.

### Residual risks

- 44px coarse-pointer targets and the narrow-phone header crowding were not verified on a real device.
- Declined-release and Onboarding residue are covered by unit tests only.
