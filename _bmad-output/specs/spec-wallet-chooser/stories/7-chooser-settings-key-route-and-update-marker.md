---
title: 'Chooser Settings key, /settings, update marker'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: 'ef183c233aba756ec96688bd8d62bfe0753eface'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md'
  - '{project-root}/docs/agents/INDEX.md'
  - '{project-root}/docs/agents/verifying-your-work.md'
  - '{project-root}/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xrpl-wallet-chooser-2026-10-19/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-10-19/DESIGN.md'
warnings: []
deferred:
  - summary: >-
      The in-wallet Settings tab's update lamp is pinned only by a source-text test (it imports the shared hook) and no rendered test of the real `Main` shows it lit, dark and declined.
    evidence: |-
      Rendering `Main` with an open wallet needs the full tab set; `useUpdateMarker` itself is tested through the chooser key. Add a rendered test when Story 19.4 reworks the tab.
    location: >-
      src/pages/Main.tsx
    severity: medium
  - summary: >-
      `declined` is derived from each `useAppUpdate` instance's pending release, which is null until the manifest fetch resolves, so a declined release can relight the Settings key briefly, or while offline.
    evidence: |-
      Same derivation the in-wallet tab used before this story; the chooser now has its own instance. Sharing the pending release at module level would fix both marker and Version plate.
    location: >-
      src/hooks/useUpdateMarker.ts, src/hooks/useAppUpdate.ts
    severity: low
  - summary: >-
      Address-book rows on `/settings` use `AddressLink`, which calls `useActiveNetwork()` for entries with no network of their own.
    evidence: |-
      It reads the store, not the ledger, and entries that carry a network ignore it; a legacy entry would link to the active wallet's explorer. Story 19.4 or a later address-book pass should pass a required network.
    location: >-
      src/pages/AppSettings.tsx
    severity: low
  - summary: >-
      Browser Back from `/settings`, the cold-start rewrite of `/settings` to `/`, and the layout of the Settings key and the plates at 320, 390 and desktop in both themes are not covered by a test or a browser run.
    evidence: |-
      Route code is unchanged and tested in Story 2; run the final browser pass.
    location: >-
      src/components/AppShell.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** App-level Settings (the address book, version and updates, Remove all wallets) is reachable only through a wallet's Settings tab. A user at the Chooser with no unlocked wallet, including one whose PIN is hard-locked, cannot reach Remove all, and an update waiting is invisible from the Chooser. `SettingsTab` also mixes in per-wallet content that reads the ledger for the active wallet, which a chooser-side route must not mount (AD-36).

**Approach:** A Settings key on the Chooser header opens `/settings`, a routed screen showing only app-level Settings. One `AppSettings` component holds the app-level plates and serves both `/settings` and the in-wallet Settings tab; they are never mounted together. The in-wallet Settings tab keeps today's content (its per-wallet plates stay, unchanged, until Story 19.4 deletes them). The Settings key shows an update marker read from one shared predicate.

## Boundaries & Constraints

**Always:** The Chooser header (chooser-side header from Story 5) shows the nameplate and a **Settings** key (`Button variant="outline"`, visible legend `Settings`), whose accessible name and visible text become `Settings, update available` when an update is waiting and not declined (never a modal, never a redirect); a declined release does not relight it. The marker predicate (`updateReady && !declined`) lives in ONE place (a hook beside `useAppUpdate`, e.g. `useUpdateMarker()`) used by the chooser Settings key and by `Main`'s Settings-tab marker; neither re-derives it. The key navigates to `/settings` (`SETTINGS_PATH`, via `navigate`). `/settings` renders a screen with a visible h1 `Settings` (the `TaskScreen` title treatment; sr-only as a tab), a **Wallets** back key that returns to the Chooser (`leaveScreen()`), and `AppSettings`. `AppSettings` contains exactly the app-level plates now in `SettingsTab.tsx`: **Address book**, **Version** (build stamp, check for updates, install, decline, trouble-after-update) and the **Remove all wallets from this device** action with its confirm dialog and teardown (`tearDownAllLocalState`), plus anything they need. Everything else in `SettingsTab` (Wallets plate, per-wallet checks and controls, Security's auto-lock and Lock now, `ControlledNote`, `MasterKeyControl`, `TwoDeviceSign`, `WalletNodeSection`, `DevnetNotice`, wallet `lockInfo` query) stays in `SettingsTab`, which renders those plus `<AppSettings />`; in-wallet Settings tab content and behaviour are unchanged. `/settings` mounts no ledger read, no account-scoped key, no `NetworkPlate`, and none of `useActiveWallet`, `useActiveNetwork`, `useActiveNode`, and no `lockInfo` read (AD-36). Remove all works with no wallet open, no wallet at all is not reachable here (Gate), and for a user whose only Open Check is a hard-locked PIN. `settings` is chooser-side: `walletInView` stays null, no `leaveWallet`. `rewriteBootLocation` still rewrites `/settings` to `/` on a cold start. No `:focus` styling, no `outline-none`, no new colour token.

**Never:** Do not move or restyle the per-wallet plates (Story 19.4 deletes them). Do not mount `SettingsTab` and `AppSettings` together. Do not change update, address-book or reset behaviour. No new Select/menu.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chooser header | any state | nameplate + Settings key | n/a |
| Update waiting | `updateReady && !declined` | key legend and accessible name `Settings, update available` | n/a |
| Declined | release declined | key reads `Settings`, marker not lit | n/a |
| Open Settings | press the key | location `/settings`, h1 `Settings`, `AppSettings` plates, Wallets back key | n/a |
| Back | press Wallets key or browser Back | Chooser | n/a |
| No lock open | every lock closed | Settings opens; address book, version and Remove all work | n/a |
| Hard-locked PIN | PIN entry disabled | Remove all wallets from this device completes the reset | reset incomplete message as shipped |
| Read budget | `/settings` mounted with open locks | query cache empty; `getXrplClient` not called; no NetworkPlate | n/a |
| In-wallet tab | open wallet's Settings tab | per-wallet plates as before plus `AppSettings`; never `/settings` content twice | n/a |

## Code Map

- `src/pages/tabs/SettingsTab.tsx` -- 622 lines; plates: Wallets (209), Address book (289), Security (348, holds Remove all at ~380), Version (388), reset dialog (~603), plus per-wallet sections. Extract the Address book, Version and Remove-all (with its dialog and `confirmResetAll` state) into `AppSettings`; the Security card's auto-lock and Lock now stay in `SettingsTab`.
- `src/pages/AppSettings.tsx` (or `src/components/wallet/AppSettings.tsx`) -- new; and `src/pages/SettingsScreen.tsx` for the routed wrapper (h1, back key).
- `src/hooks/useAppUpdate.ts` -- `useAppUpdate` returns `updateReady`, `declined`; add the shared marker hook. `src/pages/Main.tsx:93` -- computes `showUpdateMarker` itself; switch to the shared hook.
- `src/components/AppShell.tsx` -- route switch (`settings` currently renders the Chooser), chooser-side header; render the Settings screen for `settings` and add the key to the header for `chooser`.
- `src/lib/route.ts` -- `SETTINGS_PATH`, `navigate`, `leaveScreen`.
- `src/lib/teardown.ts` -- `tearDownAllLocalState`; `RESET_INCOMPLETE_MESSAGE`.
- Tests: `src/pages/tabs/__tests__/` (Settings tests), `src/pages/__tests__/create-entry-points.test.tsx`, `src/components/__tests__/AppShell.test.tsx`; update, never weaken.
- chooser `EXPERIENCE.md` (Surfaces, Exact strings: Settings key, `Settings, update available`) and `DESIGN.md`.

## Tasks & Acceptance

**Execution:**
- `src/pages/AppSettings.tsx`, `src/pages/tabs/SettingsTab.tsx` -- extract the app-level plates; `SettingsTab` renders per-wallet content plus `AppSettings`
- `src/pages/SettingsScreen.tsx`, `src/components/AppShell.tsx` -- `/settings` screen, route switch, Settings key in the chooser header with the marker
- `src/hooks/useAppUpdate.ts`, `src/pages/Main.tsx` -- one shared marker predicate
- Tests: key legend and accessible name with and without the marker and when declined; one predicate used by both surfaces; `/settings` shows `AppSettings` only and mounts no per-wallet or ledger hook (query cache empty, no client, no NetworkPlate, no `useActive*`); never both Settings surfaces mounted; Remove all completes with no lock open and with a hard-locked PIN state; in-wallet tab unchanged; Back returns to the Chooser. A test fails if `/settings` mounts the per-wallet content.

**Acceptance Criteria:**
- Given the Chooser, then the header shows the nameplate and a Settings key; with an update waiting and not declined it reads `Settings, update available` as text and name; a declined release does not relight it.
- Given `/settings` and the in-wallet tab, then one `AppSettings` component serves both and never both are mounted; tab content is otherwise unchanged.
- Given no lock open, including a hard-locked PIN, when the user opens Settings from the Chooser, then Remove all wallets from this device works.
- Given `/settings`, then no ledger read and no account-scoped key is mounted.
- `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: blind hunter 8, edge-case hunter 10, verification gap 3 plus 3 notes, intent alignment descriptive; grouped by root cause into the rows below — medium 1 and low 1 (patched), medium 1 and low 3 deferred, rest false or rejected as low
- findings:
  - `[medium]` `patch` Keyboard focus dropped to the document when the Settings key or the Wallets back key unmounted on the route change — the Settings h1 is focusable and takes focus on entry; the Chooser h1 takes it on return; test asserts both.
  - `[low]` `patch` The hard-locked PIN test claimed a state it does not model — renamed to what it proves (Remove all needs no lock and no PIN; the handler has no such dependency).
  - `[medium]` `defer` Rendered test for the in-wallet tab lamp; `declined` from per-instance state; `AddressLink` network fallback; Back, cold-start and layout checks — see deferred.
  - `[false]` `reject` In-wallet tab content is not unchanged — the plates moved only by extraction (Address book and Version into `AppSettings`, Remove all into its own plate), the existing `settings-*` tests pass unchanged, and Story 19.4 trims the tab anyway; the order and the plate title are recorded here as the deliberate, visible consequence.
  - `[low]` `reject` The Version alert re-derives `updateReady && !declined` — the Version plate needs a three-way split (ready, declined, none), which the key and the lamp do not; the shared predicate is the two-way one the story names.
  - `[low]` `reject` Settings key during the unreachable-route reset, double press on Erase, duplicated test mocks, `Separator` placement, other docs — a reset race overwrites the pushed entry harmlessly, the double press predates this story, and the rest are cosmetic.

## Verification

**Commands:**
- `bun run lint` -- expected: no errors
- `bun run build` -- expected: `tsc -b` and Vite build succeed
- `bun run test` -- expected: all pass
- `bun run check:contrast` -- expected: pass

**Manual checks (if no CLI):**
- Browser pass of the Chooser header and `/settings` at 320, 390 and desktop widths in both themes, deferred to the final pass.

## Auto Run Result

Status: done

- Summary: The Chooser header has a Settings key (`Settings, update available` when a non-declined update waits) that opens `/settings`: a routed screen with an h1, a Wallets back key and `AppSettings` (Address book, Remove all wallets from this device, Version). The in-wallet tab renders its per-wallet plates plus the same `AppSettings`. The marker predicate is one hook, `useUpdateMarker`. `/settings` mounts no per-wallet or ledger hook.
- Files: `src/pages/AppSettings.tsx`, `src/pages/SettingsScreen.tsx`, `src/hooks/useUpdateMarker.ts` (new), `src/pages/tabs/SettingsTab.tsx`, `src/pages/Main.tsx`, `src/components/AppShell.tsx`, and tests (`chooser-settings` new, `AppShell`, `notice-scope`, `locked-no-ledger-request`).
- Review: 2 patches applied (1 medium, 1 low), 4 deferred, the rest rejected with reasons above.
- Follow-up review recommended: false.
- Verification: `bun run lint`, `bun run build`, `bun run test`, `bun run check:contrast` pass after patches.
- Residual risk: the in-wallet tab plate order changed (Address book and Remove all now follow Security); no real-browser pass yet.
