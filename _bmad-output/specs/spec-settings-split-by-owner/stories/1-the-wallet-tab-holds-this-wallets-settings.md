---
title: 'The Wallet tab holds this wallet''s settings'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_revision: 'b1967c22ad664b504775da47e73ca1c33ab10cfa'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The CLAUDE.md planned-work table has no row for Epic 23 (settings split by owner).
    evidence: |-
      Story 23.1 retires the Configure screen, route and header key, but CLAUDE.md lists none of Epic 23. The fix edits an agent-context file, so it is deferred; add the row when Epic 23 completes.
    location: >-
      CLAUDE.md (Planned work table)
    severity: low
---

<intent-contract>

## Intent

**Problem:** A wallet's settings sit on a separate Configure screen behind a header key, while the in-wallet Settings tab shows app-level plates (Remove all wallets, Version) beside them. A user cannot tell whose settings are whose.

**Approach:** Replace the in-wallet Settings tab with a "Wallet" tab that holds the Configure plates. Retire the Configure screen, its route and its header key with no alias. Task screens return to the tab. `AppSettings` stays on `/settings` only (CAP-1; AD-51).

## Boundaries & Constraints

**Always:** The tab list keeps its fixed order; Wallet is sixth. Exactly one `h1` per panel: sr-only on the five ledger tabs, visible "Settings for <name>" with the Network words on the Wallet tab. Plates in one column, in this order: identity, Name, Checks, Seed, Operating another account, Node, Two-device signing, Remove this wallet (last). No jump list. The tab mounts only with the lock open (inside `OpenWallet`). It reads only the store and the existing `lockInfo` query; no new ledger read. Plate behaviour, copy and guards are unchanged. Focus-return stays module state, no secret, never in URL or history state. Nothing styles `:focus`; no `outline-none`; scope and Network in words (NFR-6).

**Never:** No `configure` route, path or alias (`/wallets/:id/configure` parses to the chooser). No Configure key in `AppHeader`. No Remove all, Version or update marker on the Wallet tab. No Address Book work: it stays global, reached only from `/settings` (story 2 moves it). No update marker on the Wallets key (story 3). No change to the chooser, the quiz, or any plate's rules. No in-tab sub-tabs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open the tab | Lock open, user selects Wallet | h1 "Settings for <name>" plus Network words (Mainnet "Real funds", Devnet "Not stable"), then the eight plates in order | Tab selection does not move focus off the tab list |
| Task round trip | Press Edit checks, Let another wallet sign or Two-device signing; press Back | Key reads "Back to Wallet"; Wallet tab shown; focus on the key that opened it | If the launch was blocked, no focus-return lingers |
| Later tab visit | After a round trip, user picks another tab, then Wallet again | Focus is not forced onto the old key | n/a |
| Old URL | `/wallets/a/configure` | Parses to chooser; no alias or redirect | Boot rewrite to `/` unchanged |
| Lock closes | Lock closes while on the tab | Existing Unlock view or chooser behaviour; nothing stays mounted | n/a |
| Scope leak | Wallet tab rendered | No "Remove all wallets", no "Version" | Test fails if present |

</intent-contract>

## Code Map

Earlier stories: none (this is story 1; `stories/` was empty).

- `src/pages/Main.tsx` -- `PANELS` (line 32) sixth entry is Settings/AppSettings; `OpenWallet` holds `tab` state (line 53) and swaps to `WalletScreens` on task routes (line 55); `showUpdateMarker` and the lamp (lines 44, 60-64, 88) exist only for the Settings tab.
- `src/pages/AppSettings.tsx` -- Address book, `RemoveAllPlate`, Version. Keep content as is; fix the doc comment (lines 13-19) that says the in-wallet tab serves it.
- `src/pages/SettingsScreen.tsx` -- doc comment mentions the in-wallet Settings tab; fix wording only.
- `src/components/wallet/ConfigureScreen.tsx` -- plates `NamePlate`, `ChecksPlate`/`AutoLockRow`, `SeedPlate`, `ControlPlate`, `RemovePlate`, Node and Two-device plates (lines 297-328); landing effect (lines 301-305); `data-configure-key` / `data-configure-plate` hooks the tests use. Source of the new tab.
- `src/components/wallet/ConfigPlate.tsx` -- plate shell; reuse for the identity plate (comment says Configure screen).
- `src/components/wallet/NetworkPlate.tsx` -- Network words and badges, reads store only; reuse beside the heading.
- `src/components/AppShell.tsx` -- imports and mounts `ConfigureScreen` (lines 11, 73-74, 145); `shellRoute`/`shellReachable`/`activeOpen` special-case configure.
- `src/components/AppHeader.tsx` -- Configure key (lines 61-78), `resetConfigureFocusReturn` import, `SlidersHorizontalIcon`, `walletScreenPath`/`navigate` imports.
- `src/pages/WalletScreens.tsx` -- `BACK_LABEL = 'Back to Configure'` (line 14) and its comment (line 33).
- `src/lib/route.ts` -- `Route` union, `SEGMENTS`, `isWalletScreen` list `configure`; remove it everywhere here.
- `src/lib/configure-launch.ts` -- `launchFromConfigure`, `peekConfigureFocusReturn`, `resetConfigureFocusReturn`; used by plates and `TwoDeviceSign.tsx` (line 9, `configureKey` prop).
- `src/hooks/useUpdateMarker.ts` -- doc comment names the in-wallet tab; reword. Not otherwise touched.
- Tests to re-point (not delete): `src/components/__tests__/configure-shell.test.tsx`, `AppHeader.test.tsx`, `AppShell.test.tsx` (lines 93, 166), `chooser-settings.test.tsx` (line 147, the in-wallet marker test), `src/pages/__tests__/app-settings.test.tsx` (lines 115-146), `wallet-screens.test.tsx` (line 49), `src/lib/__tests__/route.test.ts`, `configure-launch.test.ts`, `src/__tests__/locked-no-ledger-request.test.tsx` (mocks AppSettings, line 31), and the plate tests in `src/pages/tabs/__tests__/configure-*.test.tsx` and `pin-dialog.test.tsx` that mount `ConfigureScreen`.
- Read-only: `teardown.ts`, `app-store.ts`, `address-book.ts`, `SendTab.tsx`, `RemoveAllPlate.tsx`, `RemoveDialog.tsx` (stories 2 and 3).

## Tasks & Acceptance

**Execution:**
- `src/pages/tabs/WalletTab.tsx` -- `git mv` `ConfigureScreen.tsx` here as `WalletTab` (plates stay in the file). Replace the "Configure wallet" heading with the visible h1 "Settings for <name>" plus `NetworkPlate`; add the identity plate first (legends Name, Network in words, Address in full via `AddressDisplay`; the wallet header shows no address, so it is repeated here); retitle the Remove plate "Remove this wallet" (key text and aria-label unchanged). Landing: on mount focus the remembered key only if a return is pending; never focus the heading on a plain tab selection. -- one home for the wallet's settings
- `src/lib/configure-launch.ts` -- keep the module contract; make the pending return apply once per round trip (clear it after the Wallet tab has used it, tolerant of a dev double mount), and drop `resetConfigureFocusReturn` with the header key (AD-45); update comments to the Wallet tab. -- stops a stale key stealing focus later
- `src/pages/Main.tsx` -- sixth `PANELS` entry `{ value: 'wallet', label: 'Wallet', Panel: WalletTab }`, own visible h1 (skip the sr-only h1 for it); remove `AppSettings` import, `showUpdateMarker`, the lamp and `useUpdateMarker`/`Lamp` imports. -- the Settings tab is gone
- `src/components/AppShell.tsx` -- drop the `ConfigureScreen` import and branch; `shellRoute` is `route.screen === 'wallet'`; remove now-unused `activeOpen`. -- no Configure screen
- `src/components/AppHeader.tsx` -- delete the Configure key and its imports. -- AD-45
- `src/lib/route.ts` -- remove `configure` from `Route`, `SEGMENTS`, `isWalletScreen`; `parseRoute('/wallets/a/configure')` returns chooser. -- no alias
- `src/pages/WalletScreens.tsx` -- `BACK_LABEL = 'Back to Wallet'`; fix comment. -- AC
- `src/components/wallet/TwoDeviceSign.tsx`, `ConfigPlate.tsx`, `AppSettings.tsx`, `SettingsScreen.tsx`, `useUpdateMarker.ts` -- comment-only wording updates to Wallet tab. -- no stale claims
- Tests (list in Code Map) -- re-point to `WalletTab`, the Wallet tab and Back to Wallet; add: tab order with Wallet sixth and no Settings tab; plate order; h1 text and Network words per network; Wallet tab has no "Remove all wallets" or "Version"; no Configure key in the header; `configure` path parses to chooser; focus returns to the opener key after Back and is not forced after a later tab switch; a source check that `Main` no longer imports `AppSettings`. -- keeps coverage
- `docs/decisions.md`, `docs/glossary.md`, `docs/agents/keys-and-secrets.md` -- update live wording that names the Configure screen or key; leave sprint and story records alone. -- docs match code

**Acceptance Criteria:**
- Given a wallet with its lock open, when the tab list renders, then the tabs are Balances, Send, Receive, History, Tokens, Wallet in that order and no Settings tab exists.
- Given the Wallet tab, when it renders, then its h1 reads "Settings for <name>" with the Network words beside it, followed by the eight plates in the stated order, with no jump list.
- Given the Wallet tab, when it is read, then "Remove all wallets" and "Version" are absent.
- Given the wallet header, when it renders on an open wallet, then there is no Configure key; and `/wallets/:id/configure` parses to the chooser.
- Given Edit checks, Let another wallet sign or Two-device signing opened from the tab, when Back is pressed, then the key reads "Back to Wallet", the Wallet tab shows, and focus is on the opener.
- Given `/settings`, when it renders, then it still holds Address book, Remove all and Version (unchanged until stories 2 and 3).

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 27 findings — high 0, medium 5, low 12, false 10, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Main.tsx "six functions" JSDoc now sits above the WalletPanel JSDoc and attaches to nothing — confirmed in Main.tsx lines 17-37 — patch (fixed): the "six functions" block moved back directly above `PANELS`.
  - `[low]` `[patch]` (blind) "Back to Wallet" lands on Balances after a reload or an unlock on a task route, because `OpenWallet` starts `tab` at `balances` — confirmed (Main.tsx useState('balances')) — patch (fixed): `OpenWallet` now starts `tab` as `wallet` when the route is a task route (`useState(isTaskRoute(route) ? 'wallet' : 'balances')`).
  - `[medium]` `[patch]` (blind) Stale focus-return: the header and card resets were removed, so a task screen left by the Wallets key, Lock or auto-lock leaves the key set and the next Wallet tab visit steals focus onto it — confirmed (configure-launch.ts; only WalletTab mount clears it) — patch (fixed): `OpenWallet` runs `useEffect(() => clearConfigureFocusReturn, [])`, so the key is cleared when the open wallet unmounts.
  - `[false]` `[reject]` (blind) Focus restore can miss because the key renders after an async lockInfo read — every opener key (Edit checks, Let another wallet sign, Two-device) renders synchronously and none depends on the lockInfo query, and the effect runs after commit, so the key is in the DOM at mount.
  - `[false]` `[reject]` (blind) Name and Network shown more than once — the intent contract requires the h1, the identity plate with Network words, and the Name plate; the fix would edit the spec.
  - `[low]` `[patch]` (blind) Plate-count and brittle-order tests — configure-shell test title says "eight plates" but expects nine h2s (AddressDisplay adds "Account"), and configure-rename asserts `titles[2]` under a title saying "first section" — patch (fixed): both titles reworded (nine headings: Account plus eight plates; Name sits after This wallet and Account).
  - `[false]` `[reject]` (blind) Source-text assertions on Main.tsx — the spec's Tasks require "a source check that Main no longer imports AppSettings", and Main.tsx today has no such words, so no bad outcome.
  - `[low]` `[reject]` (blind) Deleted lock-closes tests and no in-wallet update sign — the lamp removal is stated in the intent contract (Never: no update marker until story 3) and the hand-back note; WalletTab mounts only inside `OpenWallet`, so it cannot outlive an open lock by construction; a new test would be added complexity for a rarely met gap.
  - `[low]` `[patch]` (blind) Tests still navigate to and assert `/wallets/a/configure` — confirmed in configure-edit-checks, configure-two-device, configure-auto-lock; they pass only because `Host` ignores the route — patch (fixed): the three tests now use `/wallets/a`, the ignored `renderAt` argument is dropped, and the Configure wording is reworded.
  - `[low]` `[reject]` (blind) Half-finished rename (`launchFromConfigure`, `data-configure-key`, test file names) — the spec's Code Map and Tasks keep these names ("keep the module contract"); no caller will diverge, and a wide rename is more than a direct correction.
  - `[false]` `[reject]` (blind) No migration for the old URL — the intent contract says no alias and no redirect, and `route.test.ts` and `AppShell.test.tsx` cover it.
  - `[low]` `[patch]` (blind) Docs not in the diff — decisions.md and glossary.md were edited, but decisions.md line 474 still says Settings is served "from inside a wallet (the Settings tab)" — patch (fixed): decisions.md now says Settings is served only at `/settings` and the in-wallet tab is the Wallet tab.
  - `[medium]` `[patch]` (edge) Stale focus-return after leaving a task screen by Wallets or Lock — same root cause and same fix as the third blind finding above.
  - `[false]` `[reject]` (edge) No fallback when the focus key is missing at mount — keys are synchronous (see the focus-miss row above); no state shown in which the key is absent.
  - `[false]` `[reject]` (edge) The 0 ms timer clears the return before async plates render — no opener key is async, so nothing renders late.
  - `[false]` `[reject]` (edge) NetworkPlate and IdentityPlate can disagree — `useActiveNetwork()` reads the active wallet's own `network`, and `WalletPanel` passes that same active wallet, so they cannot differ.
  - `[low]` `[reject]` (edge) AddressDisplay's "Account" h2 is a sibling, not nested under "This wallet" — the spec says to show the address via `AddressDisplay`, a shared component with the same h2 on Receive; changing it is more than a direct fix.
  - `[low]` `[patch]` (edge) Tests navigate to the retired `/wallets/a/configure` — same root cause and fix as the retired-path test row above.
  - `[medium]` `[patch]` (gap, pre-verified) The Wallet tab round trip is tested only against a `Host` stand-in and a mocked WalletTab, never real `Main` — patch (fixed): added `src/pages/__tests__/main-wallet-tab-round-trip.test.tsx`: real `Main` and real `WalletTab`; asserts Wallet selected, "Back to Wallet" shown, focus on Edit checks.
  - `[low]` `[patch]` (gap, other) Retargeted tests assert `/wallets/a/configure` after Back — same root cause and fix as the retired-path test row.
  - `[low]` `[patch]` (gap, other) Test titles and docblocks still say "Configure" / "Settings tab" — patch (fixed): titles and docblocks reworded in the same edit as the retired-path tests.
  - `[medium]` `[patch]` (intent) Round-trip tests do not exercise the real shell — same root cause and fix as the real-`Main` test row above.
  - `[low]` `[patch]` (intent) Retired path used as the return location in tests — same root cause and fix as the retired-path test row.
  - `[false]` `[reject]` (intent) Where the other criteria are asserted — a description, not a defect; tab order, scope-leak, header key, and route criteria are asserted at the right surface (app-settings, AppHeader, route, AppShell tests).
  - `[medium]` `[patch]` (intent) Tab selection after a round trip is untested — same root cause and fix as the real-`Main` test row (it asserts Wallet is still selected).
  - `[false]` `[reject]` (intent) useAppUpdate/useUpdateMarker/SettingsScreen in the changed set — the auditor did not inspect them and names no bad outcome; the spec lists comment-only edits to these.
  - `[false]` `[reject]` (intent) NetworkPlate wording and Address Book assertion unchecked — NetworkPlate renders "Real funds" (Mainnet) and "Not stable" (Devnet), configure-shell tests both, and app-settings.test.tsx line 60 asserts the Address book on `/settings`.

## Design Notes

Hand-back note for story 3: after this story `Main.tsx` has no update marker, and no marker shows inside a wallet until story 3 puts it on the Wallets key. Story 3's text "Main.tsx currently marks the Settings tab" is then stale. Say so in the hand-back, with the interim: the Address Book is reached only from `/settings`.

Focus: a tab selection must keep focus on the tab list (arrow-key navigation), so the old "else focus the heading" landing is dropped; the h1 stays an ordinary heading.

## Verification

**Commands:**
- `bun run lint` -- expected: clean
- `bun run build` -- expected: `tsc -b` and Vite pass
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Playwright MCP only, Devnet or Testnet only, nothing on Mainnet: tab order, h1 and Network words, a task round trip with focus, at 320, 390 and desktop widths, both themes, 200% zoom; no horizontal scroll; 44px keys on coarse pointers.

## Auto Run Result

### Summary

The in-wallet Settings tab is now a "Wallet" tab, sixth in the tab list. It holds this wallet's settings plates, formerly on the Configure screen: identity, Name, Checks, Seed, Operating another account, Node, Two-device signing, and Remove this wallet last. Its h1 reads "Settings for <name>" with the Network words beside it. The Configure screen, its route and its header key are gone with no alias, so `/wallets/:id/configure` now loads the chooser. Task screens (Edit checks, Let another wallet sign, Sign with two devices) show "Back to Wallet" and return to the tab with focus on the opener key. Remove all wallets, Version and the update marker stay on `/settings` only.

### Files changed

- `src/components/wallet/ConfigureScreen.tsx` renamed to `src/pages/tabs/WalletTab.tsx`: the Configure plates, now the Wallet tab content with the visible h1.
- `src/pages/Main.tsx`: tab list now ends with Wallet; the Settings tab and its update lamp are removed.
- `src/pages/WalletScreens.tsx`: task screens return to the Wallet tab; back label is "Back to Wallet".
- `src/lib/route.ts`: the configure route is retired.
- `src/lib/configure-launch.ts`: focus-return module state serves the Wallet tab.
- `src/components/AppHeader.tsx`: Configure key removed.
- `src/components/AppShell.tsx`: shell updated for the retired route and key.
- `src/components/wallet/ConfigPlate.tsx`, `src/components/wallet/TwoDeviceSign.tsx`, `src/hooks/useAppUpdate.ts`, `src/hooks/useUpdateMarker.ts`, `src/pages/AppSettings.tsx`, `src/pages/SettingsScreen.tsx`: comments and wiring updated to the new structure.
- `docs/decisions.md`, `docs/glossary.md`: record the decision and the Wallet tab term.
- Tests: new `src/pages/__tests__/main-wallet-tab-round-trip.test.tsx`; updated route, configure-launch, AppHeader, AppShell, chooser-settings, configure-shell, app-settings, wallet-screens, locked-no-ledger-request and the `src/pages/tabs/__tests__/configure-*.test.tsx` and `pin-dialog.test.tsx` suites.

### Review findings

Counts: high 0, medium 5, low 12, false 10, maybe-false 0. Mediums and lows were patched or deferred as recorded in the Review Triage Log above; every rejected finding and its reason is in that log. Followup review recommended because five mediums were patched.

### Verification

- Gates passed: lint, build (with tsc -b), test (1833 passed in 127 files, 0 failed, 0 skipped), check:contrast.
- Browser pass: dev server on port 5231, fresh Playwright profile. Created a local Testnet wallet with no authentication, then a Devnet wallet with an App PIN, locked it and unlocked it again. Nothing was funded, signed or submitted; Mainnet was never touched. Every acceptance criterion for 23.1 visible in the browser passes:
  - Tab order: Balances, Send, Receive, History, Tokens, Wallet; no Settings tab.
  - Heading: h1 "Settings for <name>" with Network words ("Devnet / Not stable", plain "Testnet").
  - Plates in the specified order, no jump list.
  - "Remove all wallets" and "Version" absent.
  - No Configure key in the header.
  - `/wallets/:id/configure` loads the chooser at `/`.
  - Locked wallet shows no tabs; the Wallet tab appears only after unlock.
  - Task round trips show "Back to Wallet" and return with focus on the opener key, checked at 390 and 320. After switching to Balances and back, focus stays on the Wallet tab.
  - Layout at 320, 390, 1280 and 200% zoom: no horizontal scroll, no clipped or overlapping plate controls, in both finishes.
- Screenshots: /tmp/claude-1000/-home-otavio-xxx-xrpl-wallet/c4ce42c4-8ea1-4e40-a6c7-c1d935b46f31/scratchpad/e23/shots-1/ (also in .playwright-mcp/, which is gitignored).
- UI audit score 16/20; no P0 or P1.

### Not tested

- The 44px touch-target rule on a coarse pointer.
- The 390 dark finish beyond one early shot.
- 200% zoom in dark.
- The Review step of the quiz.

### Residual risks (non-blocking P2/P3)

- P2: at 200% zoom (about 315 CSS px) the six tabs share one row and labels crowd ("RECEIVEHISTORY"); at real 320 and 390 widths they wrap to two rows of three. Likely pre-existing.
- P2: tab label says "Wallet" while the h1 says "Settings for <name>"; a long name wraps because the heading has no truncation.
- P2: size sm buttons (Edit checks 94x32, Rename 68x32, Remove 67x32, tabs 114x31, Copy address 36x18) and the fixed-width auto-lock select measure under 44px; coarse-pointer behaviour unconfirmed.
- P2: the identifier "configure" survives in the focus-return key (data-configure-key, configureKey, launchFromConfigure) while the label says "Back to Wallet"; the round-trip test covers focus, but a future reader may be confused.
- P3: the in-tab update lamp was removed (CAP-1); confirm the shell marker is visible on every open-wallet screen.
- P3: Remove-all aria-describedby wiring: verify no dangling `wallets-key-reason` reference remains in AppHeader.
- P3: focus starts on BODY when Edit checks opens (only return focus is specified).
- P3: wallet name appears three times and Network twice at the top of the tab, as the spec requires.
- P3: an empty dashed box (about 60 px) sits under the scroll area and reads as a stray control.
- Deferred: CLAUDE.md planned-work table has no Epic 23 row; add when Epic 23 completes.
